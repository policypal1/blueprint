begin;

create table public.planpatch_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_test_customer_id text unique,
  deletion_started_at timestamptz
);
alter table public.planpatch_accounts enable row level security;
revoke all on table public.planpatch_accounts from public, anon, authenticated;
grant select, insert, update on table public.planpatch_accounts to service_role;

create function planpatch_private.deletion_pending() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.planpatch_accounts
    where user_id = (select auth.uid()) and deletion_started_at is not null
  )
$$;

create function planpatch_private.project_user_id() returns uuid
language sql stable security invoker set search_path = '' as $$
  select case when not planpatch_private.deletion_pending()
    then planpatch_private.verified_user_id()
  end
$$;

create function public.planpatch_session() returns table (user_id uuid, deleting boolean)
language sql stable security invoker set search_path = '' as $$
  select session.user_id, planpatch_private.deletion_pending()
  from planpatch_private.verified_user_id() as session(user_id)
  where session.user_id is not null
$$;

revoke all on function planpatch_private.deletion_pending() from public, anon, authenticated;
revoke all on function planpatch_private.project_user_id() from public, anon, authenticated;
revoke all on function public.planpatch_session() from public, anon, authenticated;
grant execute on function planpatch_private.deletion_pending() to authenticated;
grant execute on function planpatch_private.project_user_id() to authenticated;
grant execute on function public.planpatch_session() to authenticated;

alter policy projects_select_own on public.projects
  using ((select planpatch_private.project_user_id()) = user_id);
alter policy projects_insert_own on public.projects
  with check ((select planpatch_private.project_user_id()) = user_id);
alter policy projects_update_own on public.projects
  using ((select planpatch_private.project_user_id()) = user_id)
  with check ((select planpatch_private.project_user_id()) = user_id);
alter policy projects_delete_own on public.projects
  using ((select planpatch_private.project_user_id()) = user_id);

alter policy blueprints_select_own on storage.objects
  using (
    bucket_id = 'blueprints'
    and (storage.foldername(name))[1] = (select planpatch_private.project_user_id())::text
  );
alter policy blueprints_insert_own on storage.objects
  with check (
    bucket_id = 'blueprints'
    and (storage.foldername(name))[1] = (select planpatch_private.project_user_id())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}\.(png|jpeg|webp)$'
  );
alter policy blueprints_delete_own on storage.objects
  using (
    bucket_id = 'blueprints'
    and (storage.foldername(name))[1] = (select planpatch_private.project_user_id())::text
  );

commit;
