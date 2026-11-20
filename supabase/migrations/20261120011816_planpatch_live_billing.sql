begin;

-- The server controls mode. A sandbox payment never authorizes a live purchase.
alter table planpatch_private.sandbox_settings
  add column billing_live boolean not null default false,
  add column project_price text,
  add column monthly_price text,
  add column portal_configuration text;
alter table planpatch_private.sandbox_grants add column livemode boolean not null default false;
alter table planpatch_private.sandbox_holds add column livemode boolean not null default false;
alter table planpatch_private.sandbox_holds drop constraint sandbox_holds_pkey;
alter table planpatch_private.sandbox_holds add primary key (intent_id, livemode);
create index billing_grants_mode on planpatch_private.sandbox_grants (user_id, livemode, kind) where paid;
grant select, update on planpatch_private.sandbox_settings to service_role;
grant select, insert, update on planpatch_private.sandbox_grants, planpatch_private.sandbox_holds to service_role;

create function public.planpatch_billing_config()
returns table (billing_live boolean, project_price text, monthly_price text, portal_configuration text)
language sql stable security invoker set search_path = '' as $$
  select s.billing_live, s.project_price, s.monthly_price, s.portal_configuration
  from planpatch_private.sandbox_settings s where singleton
$$;
revoke all on function public.planpatch_billing_config() from public, anon, authenticated;
grant execute on function public.planpatch_billing_config() to service_role;

create function planpatch_private.billing_live() returns boolean
language sql stable security invoker set search_path = '' as $$
 select billing_live from planpatch_private.sandbox_settings where singleton
$$;
revoke all on function planpatch_private.billing_live() from public, anon, authenticated;

create table planpatch_private.live_subscription_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  customer_id text not null,
  offer_version text not null,
  offer_text text not null,
  accepted_at timestamptz not null default now(),
  checkout_expires_at timestamptz not null default (now() + interval '2 hours'),
  checkout_id text unique,
  subscription_id text unique,
  invoice_id text,
  paid_at timestamptz,
  first_period_end timestamptz,
  amount_paid_cents bigint,
  retain_until timestamptz not null default (now() + interval '3 years'),
  check ((paid_at is null and invoice_id is null and subscription_id is null and first_period_end is null and amount_paid_cents is null)
      or (paid_at is not null and invoice_id is not null and subscription_id is not null and first_period_end is not null and amount_paid_cents is not null))
);
create index live_subscription_consents_user on planpatch_private.live_subscription_consents(user_id, accepted_at desc);
alter table planpatch_private.live_subscription_consents enable row level security;
revoke all on planpatch_private.live_subscription_consents from public, anon, authenticated;
grant usage on schema planpatch_private to service_role;
grant select, insert, update, delete on planpatch_private.live_subscription_consents to service_role;

-- Serialize attempts for the same account. Multiple tabs and retries reuse a Stripe session.
create function public.planpatch_reserve_live_subscription(
  owner_id uuid, customer text, accepted_version text, disclosure text
) returns table (id uuid, checkout_id text, expires_at bigint)
language plpgsql security invoker set search_path = '' as $$
declare
  reserved planpatch_private.live_subscription_consents%rowtype;
begin
  delete from planpatch_private.live_subscription_consents where retain_until < now();
  perform 1 from public.planpatch_accounts a
    where a.user_id = owner_id and a.stripe_customer_id = customer and a.deletion_started_at is null
    for update;
  if not found then raise exception 'Billing account unavailable.'; end if;
  select c.* into reserved from planpatch_private.live_subscription_consents c
    where c.user_id = owner_id and c.checkout_expires_at > now()
      and (c.checkout_id is not null or c.checkout_expires_at > now() + interval '35 minutes')
    order by c.accepted_at desc limit 1;
  if not found then
    insert into planpatch_private.live_subscription_consents (user_id, customer_id, offer_version, offer_text)
    values (owner_id, customer, accepted_version, disclosure) returning * into reserved;
  elsif reserved.customer_id <> customer or reserved.offer_version <> accepted_version
        or reserved.offer_text <> disclosure then
    raise exception 'A checkout with different terms is still open.';
  end if;
  return query select reserved.id, reserved.checkout_id, extract(epoch from reserved.checkout_expires_at)::bigint;
end
$$;

create function public.planpatch_bind_live_checkout(owner_id uuid, consent_id uuid, checkout text)
returns boolean language sql security invoker set search_path = '' as $$
  with bound as (
    update planpatch_private.live_subscription_consents c set checkout_id = checkout
    from public.planpatch_accounts a
    where c.id = consent_id and c.user_id = owner_id and (c.checkout_id = checkout
        or (c.checkout_id is null and c.checkout_expires_at > now() + interval '35 minutes'))
      and a.user_id = c.user_id and a.stripe_customer_id = c.customer_id and a.deletion_started_at is null
    returning c.id
  ) select exists(select 1 from bound)
$$;

-- Only a verified settled live invoice can reach this RPC. Keep the first confirmation immutable.
create function public.planpatch_confirm_live_subscription(consent_id uuid, customer text, subscription text,
  invoice text, paid_on timestamptz, period_end timestamptz, amount_cents bigint)
returns boolean language sql security invoker set search_path = '' as $$
  with completed as (
    update planpatch_private.live_subscription_consents c
       set subscription_id = subscription, invoice_id = invoice, paid_at = paid_on,
           first_period_end = period_end, amount_paid_cents = amount_cents
      from public.planpatch_accounts a
     where c.id = consent_id and c.customer_id = customer and c.checkout_id is not null
       and a.user_id = c.user_id and a.stripe_customer_id = customer and a.deletion_started_at is null
       and c.paid_at is null
    returning c.id
  )
  select exists(select 1 from completed) or exists(
    select 1 from planpatch_private.live_subscription_consents c
    where c.id = consent_id and c.customer_id = customer and c.subscription_id = subscription)
$$;

create function public.planpatch_live_subscription_confirmation(owner_id uuid)
returns table(offer_version text, offer_text text, accepted_at timestamptz, invoice_id text,
              paid_at timestamptz, first_period_end timestamptz, amount_paid_cents bigint)
language sql stable security invoker set search_path = '' as $$
  select c.offer_version, c.offer_text, c.accepted_at, c.invoice_id, c.paid_at, c.first_period_end, c.amount_paid_cents
    from planpatch_private.live_subscription_consents c
    where c.user_id = owner_id and c.paid_at is not null order by c.paid_at desc limit 1
$$;

revoke all on function public.planpatch_reserve_live_subscription(uuid,text,text,text),
  public.planpatch_bind_live_checkout(uuid,uuid,text),
  public.planpatch_confirm_live_subscription(uuid,text,text,text,timestamptz,timestamptz,bigint),
  public.planpatch_live_subscription_confirmation(uuid) from public, anon, authenticated;
grant execute on function public.planpatch_reserve_live_subscription(uuid,text,text,text),
  public.planpatch_bind_live_checkout(uuid,uuid,text),
  public.planpatch_confirm_live_subscription(uuid,text,text,text,timestamptz,timestamptz,bigint),
  public.planpatch_live_subscription_confirmation(uuid) to service_role;
create or replace function public.planpatch_record_sandbox_grant(
  customer text, grant_reference text, grant_kind text, intent text,
  is_paid boolean, access_until timestamptz, snapshot_at timestamptz
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid;
begin
  select user_id into owner_id from public.planpatch_accounts
    where stripe_test_customer_id = customer and deletion_started_at is null;
  if owner_id is null then return; end if;
  is_paid := is_paid and not exists (select 1 from planpatch_private.sandbox_holds where intent_id = intent and not livemode);

  insert into planpatch_private.sandbox_grants as existing
    (reference, user_id, kind, intent_id, paid, valid_until, observed_at)
    values (grant_reference, owner_id, grant_kind, intent, is_paid, access_until, snapshot_at)
  on conflict (reference) do update set
    paid = excluded.paid,
    intent_id = coalesce(excluded.intent_id, existing.intent_id),
    valid_until = excluded.valid_until,
    observed_at = excluded.observed_at
  where existing.user_id = excluded.user_id and existing.kind = excluded.kind and not existing.livemode
    and existing.observed_at <= excluded.observed_at;

  -- Start enforcing only after this project has confirmed a paid test checkout.
  if is_paid then
    update planpatch_private.sandbox_settings set payments_required = true where singleton;
  end if;
end
$$;

create or replace function public.planpatch_sandbox_grants_for_intent(intent text)
returns table (reference text, kind text)
language sql stable security invoker set search_path = '' as $$
  select g.reference, g.kind from planpatch_private.sandbox_grants as g where g.intent_id = intent and not g.livemode
$$;

create or replace function public.planpatch_hold_sandbox_payment(intent text, snapshot_at timestamptz)
returns void language sql security invoker set search_path = '' as $$
  insert into planpatch_private.sandbox_holds (intent_id) values (intent) on conflict do nothing;
  update planpatch_private.sandbox_grants set paid = false, observed_at = greatest(observed_at, snapshot_at)
    where intent_id = intent and not livemode
$$;

create or replace function public.planpatch_record_live_grant(
  customer text, grant_reference text, grant_kind text, intent text,
  is_paid boolean, access_until timestamptz, snapshot_at timestamptz
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid;
begin
  select user_id into owner_id from public.planpatch_accounts
    where stripe_customer_id = customer and deletion_started_at is null;
  if owner_id is null then return; end if;
  is_paid := is_paid and not exists (select 1 from planpatch_private.sandbox_holds where intent_id = intent and livemode);

  insert into planpatch_private.sandbox_grants as existing
    (reference, user_id, kind, intent_id, paid, valid_until, observed_at, livemode)
    values (grant_reference, owner_id, grant_kind, intent, is_paid, access_until, snapshot_at, true)
  on conflict (reference) do update set
    paid = excluded.paid,
    intent_id = coalesce(excluded.intent_id, existing.intent_id),
    valid_until = excluded.valid_until,
    observed_at = excluded.observed_at
  where existing.user_id = excluded.user_id and existing.kind = excluded.kind and existing.livemode
    and existing.observed_at <= excluded.observed_at;

  -- Confirmed live payments keep payment access enforced.
  if is_paid then
    update planpatch_private.sandbox_settings set payments_required = true where singleton;
  end if;
end
$$;

create or replace function public.planpatch_live_grants_for_intent(intent text)
returns table (reference text, kind text)
language sql stable security invoker set search_path = '' as $$
  select g.reference, g.kind from planpatch_private.sandbox_grants as g where g.intent_id = intent and g.livemode
$$;

create or replace function public.planpatch_hold_live_payment(intent text, snapshot_at timestamptz)
returns void language sql security invoker set search_path = '' as $$
  insert into planpatch_private.sandbox_holds (intent_id, livemode) values (intent, true) on conflict do nothing;
  update planpatch_private.sandbox_grants set paid = false, observed_at = greatest(observed_at, snapshot_at)
    where intent_id = intent and livemode
$$;


create or replace function planpatch_private.monthly_access(owner_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from planpatch_private.sandbox_grants
    where user_id = owner_id and kind = 'monthly' and paid and valid_until > now()
      and livemode = planpatch_private.billing_live())
$$;

create or replace function planpatch_private.planpatch_sandbox_access()
returns table (payments_required boolean, monthly boolean, project_credits bigint, project_ids uuid[])
language sql stable security definer set search_path = '' as $$
  select settings.payments_required or settings.trials_enabled,
    planpatch_private.monthly_access(owner.id),
    (select count(*) from planpatch_private.sandbox_grants
      where user_id = owner.id and kind = 'project' and paid and project_id is null and livemode = settings.billing_live),
    array(select g.project_id from planpatch_private.sandbox_grants g
      join public.projects p on p.id = g.project_id and p.user_id = g.user_id
      where g.user_id = owner.id and g.kind = 'project' and g.paid and g.livemode = settings.billing_live)
  from planpatch_private.sandbox_settings settings
  cross join (select planpatch_private.project_user_id() as id) owner
  where owner.id is not null
$$;

create or replace function planpatch_private.can_edit_project(plan_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select planpatch_private.has_full_editor_access(owner.id)
    or exists (select 1 from planpatch_private.sandbox_grants
      where user_id = owner.id and kind = 'project' and paid and project_id = plan_id
        and livemode = planpatch_private.billing_live())
  from (select planpatch_private.project_user_id() as id) owner where owner.id is not null
$$;
create or replace function planpatch_private.claim_project_credit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  grant_reference text;
begin
  -- A used ID remains reserved even after deletion. The duplicate error also
  -- preserves the existing write-ID recovery path for retried inserts.
  if exists (select 1 from planpatch_private.sandbox_grants where project_id = new.id) then
    raise exception 'This project already used a credit.' using errcode = '23505';
  end if;
  if planpatch_private.has_full_editor_access(new.user_id) then return new; end if;

  if new.background_path is null
    or not starts_with(new.background_path, new.user_id::text || '/' || new.id::text || '/')
    or not exists (select 1 from storage.objects where bucket_id = 'blueprints' and name = new.background_path) then
    raise exception 'Upload the original blueprint before using a project credit.' using errcode = '42501';
  end if;

  select reference into grant_reference from planpatch_private.sandbox_grants
    where user_id = new.user_id and kind = 'project' and paid and project_id is null and livemode = planpatch_private.billing_live()
    order by observed_at, reference limit 1 for update skip locked;
  if grant_reference is null then
    raise exception 'A new project needs an unused credit, an active trial, or a monthly subscription.' using errcode = '42501';
  end if;
  update planpatch_private.sandbox_grants set project_id = new.id where reference = grant_reference;
  return new;
end
$$;

create or replace function planpatch_private.trial_details()
returns table (trial_ends_at timestamptz, monthly_ends_at timestamptz, can_start_trial boolean, locked_project_ids uuid[])
language sql stable security definer set search_path = '' as $$
  select t.expires_at,
    (select max(g.valid_until) from planpatch_private.sandbox_grants g
      where g.user_id = owner.id and g.kind = 'monthly' and paid and g.valid_until > now() and g.livemode = planpatch_private.billing_live()),
    (planpatch_private.trial_offer() or planpatch_private.is_trial_check_email(owner.email))
      and t.user_id is null and exists (
        select 1 from planpatch_private.trial_signups s where s.user_id = owner.id and s.expires_at > now()
      ),
    array(select g.project_id from planpatch_private.sandbox_grants g
      join public.projects p on p.id = g.project_id and p.user_id = g.user_id
      where g.user_id = owner.id and g.kind = 'project')
  from auth.users owner
  left join planpatch_private.trials t on t.user_id = owner.id
  where owner.id = (select planpatch_private.project_user_id())
$$;


-- Extend evidence retention through three years after the latest billing activity.
create function planpatch_private.retain_live_billing_evidence() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.livemode then
    update planpatch_private.live_subscription_consents
      set retain_until = greatest(retain_until, now() + interval '3 years', coalesce(new.valid_until, now()) + interval '3 years')
      where customer_id = (select stripe_customer_id from public.planpatch_accounts where user_id = new.user_id);
  end if;
  return new;
end
$$;
revoke all on function planpatch_private.retain_live_billing_evidence() from public, anon, authenticated;
create trigger retain_live_billing_evidence after insert or update on planpatch_private.sandbox_grants
for each row execute function planpatch_private.retain_live_billing_evidence();

revoke all on function public.planpatch_record_live_grant(text,text,text,text,boolean,timestamptz,timestamptz),
 public.planpatch_live_grants_for_intent(text), public.planpatch_hold_live_payment(text,timestamptz) from public,anon,authenticated;
grant execute on function public.planpatch_record_live_grant(text,text,text,text,boolean,timestamptz,timestamptz),
 public.planpatch_live_grants_for_intent(text), public.planpatch_hold_live_payment(text,timestamptz) to service_role;
commit;
