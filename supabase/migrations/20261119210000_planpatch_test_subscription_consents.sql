begin;

-- Test-mode records follow the life of the account. Only the service role can access them.
create table planpatch_private.test_subscription_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
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
  check ((paid_at is null and invoice_id is null and subscription_id is null and first_period_end is null and amount_paid_cents is null)
      or (paid_at is not null and invoice_id is not null and subscription_id is not null and first_period_end is not null and amount_paid_cents is not null))
);
create index test_subscription_consents_user on planpatch_private.test_subscription_consents(user_id, accepted_at desc);
alter table planpatch_private.test_subscription_consents enable row level security;
revoke all on planpatch_private.test_subscription_consents from public, anon, authenticated;
grant usage on schema planpatch_private to service_role;
grant select, insert, update on planpatch_private.test_subscription_consents to service_role;

-- Serialize attempts for the same account. Multiple tabs and retries reuse a Stripe session.
create function public.planpatch_reserve_test_subscription(
  owner_id uuid, customer text, accepted_version text, disclosure text
) returns table (id uuid, checkout_id text, expires_at bigint)
language plpgsql security invoker set search_path = '' as $$
declare
  reserved planpatch_private.test_subscription_consents%rowtype;
begin
  perform 1 from public.planpatch_accounts a
    where a.user_id = owner_id and a.stripe_test_customer_id = customer and a.deletion_started_at is null
    for update;
  if not found then raise exception 'Billing account unavailable.'; end if;
  select c.* into reserved from planpatch_private.test_subscription_consents c
    where c.user_id = owner_id and c.checkout_expires_at > now()
      and (c.checkout_id is not null or c.checkout_expires_at > now() + interval '35 minutes')
    order by c.accepted_at desc limit 1;
  if not found then
    insert into planpatch_private.test_subscription_consents (user_id, customer_id, offer_version, offer_text)
    values (owner_id, customer, accepted_version, disclosure) returning * into reserved;
  elsif reserved.customer_id <> customer or reserved.offer_version <> accepted_version
        or reserved.offer_text <> disclosure then
    raise exception 'A checkout with different terms is still open.';
  end if;
  return query select reserved.id, reserved.checkout_id, extract(epoch from reserved.checkout_expires_at)::bigint;
end
$$;

create function public.planpatch_bind_test_checkout(owner_id uuid, consent_id uuid, checkout text)
returns boolean language sql security invoker set search_path = '' as $$
  with bound as (
    update planpatch_private.test_subscription_consents c set checkout_id = checkout
    from public.planpatch_accounts a
    where c.id = consent_id and c.user_id = owner_id and (c.checkout_id = checkout
        or (c.checkout_id is null and c.checkout_expires_at > now() + interval '35 minutes'))
      and a.user_id = c.user_id and a.stripe_test_customer_id = c.customer_id and a.deletion_started_at is null
    returning c.id
  ) select exists(select 1 from bound)
$$;

-- Only a verified settled sandbox invoice can reach this RPC. Keep the first confirmation immutable.
create function public.planpatch_confirm_test_subscription(consent_id uuid, customer text, subscription text,
  invoice text, paid_on timestamptz, period_end timestamptz, amount_cents bigint)
returns boolean language sql security invoker set search_path = '' as $$
  with completed as (
    update planpatch_private.test_subscription_consents c
       set subscription_id = subscription, invoice_id = invoice, paid_at = paid_on,
           first_period_end = period_end, amount_paid_cents = amount_cents
      from public.planpatch_accounts a
     where c.id = consent_id and c.customer_id = customer and c.checkout_id is not null
       and a.user_id = c.user_id and a.stripe_test_customer_id = customer and a.deletion_started_at is null
       and c.paid_at is null
    returning c.id
  )
  select exists(select 1 from completed) or exists(
    select 1 from planpatch_private.test_subscription_consents c
    where c.id = consent_id and c.customer_id = customer and c.subscription_id = subscription)
$$;

create function public.planpatch_test_subscription_confirmation(owner_id uuid)
returns table(offer_version text, offer_text text, accepted_at timestamptz, invoice_id text,
              paid_at timestamptz, first_period_end timestamptz, amount_paid_cents bigint)
language sql stable security invoker set search_path = '' as $$
  select c.offer_version, c.offer_text, c.accepted_at, c.invoice_id, c.paid_at, c.first_period_end, c.amount_paid_cents
    from planpatch_private.test_subscription_consents c
    where c.user_id = owner_id and c.paid_at is not null order by c.paid_at desc limit 1
$$;

revoke all on function public.planpatch_reserve_test_subscription(uuid,text,text,text),
  public.planpatch_bind_test_checkout(uuid,uuid,text),
  public.planpatch_confirm_test_subscription(uuid,text,text,text,timestamptz,timestamptz,bigint),
  public.planpatch_test_subscription_confirmation(uuid) from public, anon, authenticated;
grant execute on function public.planpatch_reserve_test_subscription(uuid,text,text,text),
  public.planpatch_bind_test_checkout(uuid,uuid,text),
  public.planpatch_confirm_test_subscription(uuid,text,text,text,timestamptz,timestamptz,bigint),
  public.planpatch_test_subscription_confirmation(uuid) to service_role;
commit;
