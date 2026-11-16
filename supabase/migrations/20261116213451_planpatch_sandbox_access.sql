begin;

create table planpatch_private.sandbox_settings (
  singleton boolean primary key check (singleton),
  payments_required boolean not null default false
);
alter table planpatch_private.sandbox_settings enable row level security;
insert into planpatch_private.sandbox_settings (singleton) values (true);

create table planpatch_private.sandbox_holds (intent_id text primary key);
alter table planpatch_private.sandbox_holds enable row level security;

create table planpatch_private.sandbox_grants (
  reference text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('project', 'monthly')),
  intent_id text,
  paid boolean not null,
  valid_until timestamptz,
  project_id uuid,
  observed_at timestamptz not null,
  check (project_id is null or kind = 'project')
);
alter table planpatch_private.sandbox_grants enable row level security;
create index sandbox_grants_owner on planpatch_private.sandbox_grants (user_id, kind) where paid;
create index sandbox_grants_intent on planpatch_private.sandbox_grants (intent_id);

create function planpatch_private.monthly_access(owner_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from planpatch_private.sandbox_grants
    where user_id = owner_id and kind = 'monthly' and paid and valid_until > now()
  )
$$;

create function public.planpatch_sandbox_access()
returns table (payments_required boolean, monthly boolean, project_credits bigint, project_ids uuid[])
language sql stable security definer set search_path = '' as $$
  select settings.payments_required,
    planpatch_private.monthly_access(owner.id),
    (select count(*) from planpatch_private.sandbox_grants
      where user_id = owner.id and kind = 'project' and paid and project_id is null),
    array(select g.project_id from planpatch_private.sandbox_grants as g
      join public.projects as p on p.id = g.project_id and p.user_id = g.user_id
      where g.user_id = owner.id and g.kind = 'project' and g.paid)
  from planpatch_private.sandbox_settings as settings
  cross join (select planpatch_private.project_user_id() as id) as owner
  where owner.id is not null
$$;

create function planpatch_private.can_edit_project(plan_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not settings.payments_required
    or planpatch_private.monthly_access(owner.id)
    or exists (
      select 1 from planpatch_private.sandbox_grants
      where user_id = owner.id and kind = 'project' and paid and project_id = plan_id
    )
  from planpatch_private.sandbox_settings as settings
  cross join (select planpatch_private.project_user_id() as id) as owner
  where owner.id is not null
$$;

create function planpatch_private.claim_project_credit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  grant_reference text;
begin
  if not (select payments_required from planpatch_private.sandbox_settings)
     or planpatch_private.monthly_access(new.user_id)
     or exists (
       select 1 from planpatch_private.sandbox_grants
       where user_id = new.user_id and kind = 'project' and paid and project_id = new.id
     ) then
    return new;
  end if;

  select reference into grant_reference
    from planpatch_private.sandbox_grants
    where user_id = new.user_id and kind = 'project' and paid and project_id is null
    order by observed_at, reference
    limit 1 for update skip locked;
  if grant_reference is null then
    raise exception 'A new project needs an unused project credit or a monthly subscription.'
      using errcode = '42501';
  end if;
  update planpatch_private.sandbox_grants set project_id = new.id where reference = grant_reference;
  return new;
end
$$;

create trigger sandbox_project_credit before insert on public.projects
for each row execute function planpatch_private.claim_project_credit();

alter policy projects_update_own on public.projects
using ((select planpatch_private.project_user_id()) = user_id and planpatch_private.can_edit_project(id))
with check ((select planpatch_private.project_user_id()) = user_id and planpatch_private.can_edit_project(id));

create function public.planpatch_record_sandbox_grant(
  customer text, grant_reference text, grant_kind text, intent text,
  is_paid boolean, access_until timestamptz, snapshot_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
begin
  select user_id into owner_id from public.planpatch_accounts
    where stripe_test_customer_id = customer and deletion_started_at is null;
  if owner_id is null then return; end if;
  is_paid := is_paid and not exists (select 1 from planpatch_private.sandbox_holds where intent_id = intent);

  insert into planpatch_private.sandbox_grants as existing
    (reference, user_id, kind, intent_id, paid, valid_until, observed_at)
    values (grant_reference, owner_id, grant_kind, intent, is_paid, access_until, snapshot_at)
  on conflict (reference) do update set
    paid = excluded.paid,
    intent_id = coalesce(excluded.intent_id, existing.intent_id),
    valid_until = excluded.valid_until,
    observed_at = excluded.observed_at
  where existing.user_id = excluded.user_id and existing.kind = excluded.kind
    and existing.observed_at <= excluded.observed_at;

  -- Start enforcing only after this project has confirmed a paid test checkout.
  if is_paid then
    update planpatch_private.sandbox_settings set payments_required = true where singleton;
  end if;
end
$$;

create function public.planpatch_sandbox_grants_for_intent(intent text)
returns table (reference text, kind text)
language sql stable security definer set search_path = '' as $$
  select g.reference, g.kind from planpatch_private.sandbox_grants as g where g.intent_id = intent
$$;

create function public.planpatch_hold_sandbox_payment(intent text, snapshot_at timestamptz)
returns void language sql security definer set search_path = '' as $$
  insert into planpatch_private.sandbox_holds (intent_id) values (intent) on conflict do nothing;
  update planpatch_private.sandbox_grants set paid = false, observed_at = greatest(observed_at, snapshot_at)
    where intent_id = intent
$$;

revoke all on function planpatch_private.monthly_access(uuid) from public, anon, authenticated;
revoke all on function planpatch_private.can_edit_project(uuid) from public, anon, authenticated;
revoke all on function planpatch_private.claim_project_credit() from public, anon, authenticated;
revoke all on function public.planpatch_sandbox_access() from public, anon, authenticated;
revoke all on function public.planpatch_record_sandbox_grant(text, text, text, text, boolean, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.planpatch_sandbox_grants_for_intent(text) from public, anon, authenticated;
revoke all on function public.planpatch_hold_sandbox_payment(text, timestamptz) from public, anon, authenticated;
grant execute on function planpatch_private.can_edit_project(uuid) to authenticated;
grant execute on function public.planpatch_sandbox_access() to authenticated;
grant execute on function public.planpatch_record_sandbox_grant(text, text, text, text, boolean, timestamptz, timestamptz)
  to service_role;
grant execute on function public.planpatch_sandbox_grants_for_intent(text) to service_role;
grant execute on function public.planpatch_hold_sandbox_payment(text, timestamptz) to service_role;

commit;
