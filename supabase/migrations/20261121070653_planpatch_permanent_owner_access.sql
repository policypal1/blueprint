begin;

-- This table is server-only: browser roles cannot read or grant owner access.
-- The flag belongs to the account's stable user ID and has no expiry or Stripe dependency.
alter table public.planpatch_accounts add column owner_access boolean not null default false;
comment on column public.planpatch_accounts.owner_access is
  'Permanent complimentary product access. Set only by the operator, never by Stripe or browser roles.';

create or replace function planpatch_private.has_full_editor_access(owner_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select not (payments_required or trials_enabled)
    or exists (select 1 from public.planpatch_accounts a
      where a.user_id = owner_id and a.owner_access and a.deletion_started_at is null)
    or planpatch_private.monthly_access(owner_id)
    or exists (select 1 from planpatch_private.trials t where t.user_id = owner_id and t.expires_at > now())
  from planpatch_private.sandbox_settings where singleton
$$;

-- No new public RPC, table privileges or RLS policies are introduced.
commit;
