begin;
alter function public.planpatch_sandbox_access() set schema planpatch_private;
create function public.planpatch_sandbox_access()
returns table (payments_required boolean, monthly boolean, project_credits bigint, project_ids uuid[])
language sql stable security invoker set search_path = '' as $$
  select * from planpatch_private.planpatch_sandbox_access()
$$;
revoke all on function public.planpatch_sandbox_access() from public, anon, authenticated;
grant execute on function public.planpatch_sandbox_access() to authenticated;
commit;
