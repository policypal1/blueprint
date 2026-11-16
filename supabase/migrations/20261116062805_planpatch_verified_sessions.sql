begin;

create schema planpatch_private;
revoke all on schema planpatch_private from public, anon, authenticated;
grant usage on schema planpatch_private to authenticated;

create function planpatch_private.verified_user_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select session.user_id
  from auth.sessions as session
  join auth.users as account on account.id = session.user_id
  where session.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
    and session.user_id = auth.uid()
    and (session.not_after is null or session.not_after > now())
    and account.email_confirmed_at is not null
    and account.deleted_at is null
    and (account.banned_until is null or account.banned_until <= now())
$$;

revoke all on function planpatch_private.verified_user_id() from public, anon, authenticated;
grant execute on function planpatch_private.verified_user_id() to authenticated;

alter policy projects_select_own on public.projects
  using ((select planpatch_private.verified_user_id()) = user_id);
alter policy projects_insert_own on public.projects
  with check ((select planpatch_private.verified_user_id()) = user_id);
alter policy projects_update_own on public.projects
  using ((select planpatch_private.verified_user_id()) = user_id)
  with check ((select planpatch_private.verified_user_id()) = user_id);
alter policy projects_delete_own on public.projects
  using ((select planpatch_private.verified_user_id()) = user_id);

alter policy blueprints_select_own on storage.objects
  using (
    bucket_id = 'blueprints'
    and (storage.foldername(name))[1] = (select planpatch_private.verified_user_id())::text
  );
alter policy blueprints_insert_own on storage.objects
  with check (
    bucket_id = 'blueprints'
    and (storage.foldername(name))[1] = (select planpatch_private.verified_user_id())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}\.(png|jpeg|webp)$'
  );
alter policy blueprints_delete_own on storage.objects
  using (
    bucket_id = 'blueprints'
    and (storage.foldername(name))[1] = (select planpatch_private.verified_user_id())::text
  );

commit;
