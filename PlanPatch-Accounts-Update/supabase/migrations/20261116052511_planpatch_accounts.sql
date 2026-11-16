begin;

create table public.projects (
  id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  drawing jsonb not null check (jsonb_typeof(drawing) = 'object' and not (drawing ? 'background')),
  background_path text,
  revision integer not null check (revision > 0),
  write_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  check (
    background_path is null or background_path ~ (
      '^' || user_id::text || '/' || id::text || '/[0-9a-f]{64}\.(png|jpeg|webp)$'
    )
  )
);

create index projects_recent_by_owner on public.projects (user_id, updated_at desc, id);

create function public.set_planpatch_project_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_planpatch_project_updated_at() from public, anon, authenticated;
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_planpatch_project_updated_at();

alter table public.projects enable row level security;
revoke all on table public.projects from public, anon, authenticated;
grant select, insert, update, delete on table public.projects to authenticated;

create policy projects_select_own on public.projects for select to authenticated
  using ((select auth.uid()) = user_id);
create policy projects_insert_own on public.projects for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy projects_update_own on public.projects for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy projects_delete_own on public.projects for delete to authenticated
  using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blueprints', 'blueprints', false, 26214400, array['image/png', 'image/jpeg', 'image/webp']);

create policy blueprints_select_own on storage.objects for select to authenticated
  using (bucket_id = 'blueprints' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy blueprints_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'blueprints'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}\.(png|jpeg|webp)$'
  );
create policy blueprints_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'blueprints' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
