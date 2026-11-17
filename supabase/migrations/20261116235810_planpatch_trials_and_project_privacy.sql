begin;

create extension if not exists pgcrypto with schema extensions;

alter table planpatch_private.sandbox_settings
  add column trials_enabled boolean not null default false;

create table planpatch_private.trial_secret (
  singleton boolean primary key check (singleton),
  signing_key bytea not null
);
insert into planpatch_private.trial_secret values (true, extensions.gen_random_bytes(32));

create table planpatch_private.trial_signups (
  user_id uuid primary key,
  network_tag bytea not null,
  expires_at timestamptz not null
);
create index trial_signup_expiry on planpatch_private.trial_signups (expires_at);

create table planpatch_private.trial_claim_limits (
  kind text not null check (kind in ('email', 'network')),
  tag bytea not null,
  blocked_until timestamptz not null,
  primary key (kind, tag)
);
create index trial_limit_expiry on planpatch_private.trial_claim_limits (blocked_until);

create table planpatch_private.trials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  expires_at timestamptz not null,
  terms_version text not null
);

alter table planpatch_private.trial_secret enable row level security;
alter table planpatch_private.trial_signups enable row level security;
alter table planpatch_private.trial_claim_limits enable row level security;
alter table planpatch_private.trials enable row level security;
revoke all on table planpatch_private.trial_secret, planpatch_private.trial_signups,
  planpatch_private.trial_claim_limits, planpatch_private.trials from public, anon, authenticated;

create function planpatch_private.trial_tag(kind text, value text) returns bytea
language sql stable set search_path = '' as $$
  select extensions.hmac(convert_to(kind || ':' || value, 'UTF8'), signing_key, 'sha256')
  from planpatch_private.trial_secret
$$;

create function planpatch_private.purge_expired_trial_tags() returns void
language sql set search_path = '' as $$
  delete from planpatch_private.trial_signups where expires_at <= now();
  delete from planpatch_private.trial_claim_limits where blocked_until <= now();
$$;

-- Called by the Supabase Auth service before creating an email or Google account.
-- The connection address is supplied by Auth, never by user metadata.
create function planpatch_private.record_trial_signup(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  address inet;
  network_key text;
begin
  if not (select trials_enabled from planpatch_private.sandbox_settings where singleton)
    or event #>> '{user,is_anonymous}' = 'true' then return '{}'::jsonb; end if;

  begin
    address := nullif(event #>> '{metadata,ip_address}', '')::inet;
  exception when invalid_text_representation then return '{}'::jsonb;
  end;
  if address is null then return '{}'::jsonb; end if;
  if address <<= inet '::ffff:0:0/96' then
    address := inet '0.0.0.0' + (address - inet '::ffff:0:0');
  end if;
  network_key := case when family(address) = 4 then host(address)
    else network(set_masklen(address, 64))::text end;

  perform planpatch_private.purge_expired_trial_tags();
  insert into planpatch_private.trial_signups (user_id, network_tag, expires_at)
    values ((event #>> '{user,id}')::uuid, planpatch_private.trial_tag('network', network_key),
      now() + interval '7 days')
    on conflict (user_id) do nothing;
  return '{}'::jsonb;
end
$$;

create function planpatch_private.trial_offer() returns boolean
language sql stable security definer set search_path = '' as $$
  select trials_enabled from planpatch_private.sandbox_settings where singleton
$$;
create function public.planpatch_trial_offer() returns boolean
language sql stable security invoker set search_path = '' as $$
  select planpatch_private.trial_offer()
$$;

create function planpatch_private.start_trial(accepted_version text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := planpatch_private.project_user_id();
  verified_email text;
  email_tag bytea;
  signup_tag bytea;
  expiration timestamptz;
  inserted integer;
begin
  if owner_id is null then raise exception 'Verify your email and sign in to start a trial.' using errcode = 'PT401'; end if;
  if accepted_version is distinct from '2026-11-16' then
    raise exception 'Review the current terms before starting your trial.' using errcode = 'PT400';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('planpatch-trial:' || owner_id::text, 0));
  select expires_at into expiration from planpatch_private.trials where user_id = owner_id;
  if found then return expiration; end if;
  if not planpatch_private.trial_offer() then
    raise exception 'Free trials are currently unavailable.' using errcode = 'PT403';
  end if;
  perform planpatch_private.purge_expired_trial_tags();
  select lower(btrim(email)) into verified_email from auth.users where id = owner_id;
  select network_tag into signup_tag from planpatch_private.trial_signups where user_id = owner_id;
  if verified_email is null or verified_email = '' or signup_tag is null then
    raise exception 'This account is not eligible for a free trial.' using errcode = 'PT403';
  end if;
  email_tag := planpatch_private.trial_tag('email', verified_email);

  -- Both limits are committed together with the trial. A conflicting claim rolls back both.
  insert into planpatch_private.trial_claim_limits (kind, tag, blocked_until)
    values ('email', email_tag, now() + interval '90 days'),
      ('network', signup_tag, now() + interval '90 days')
    on conflict (kind, tag) do nothing;
  get diagnostics inserted = row_count;
  if inserted <> 2 then
    raise exception 'A free trial has already been claimed for this email or network.' using errcode = 'PT403';
  end if;

  expiration := now() + interval '72 hours';
  insert into planpatch_private.trials values (owner_id, now(), expiration, accepted_version);
  delete from planpatch_private.trial_signups where user_id = owner_id;
  return expiration;
end
$$;

create function public.planpatch_start_trial(accepted_version text) returns timestamptz
language sql security invoker set search_path = '' as $$
  select planpatch_private.start_trial(accepted_version)
$$;

create function planpatch_private.has_full_editor_access(owner_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select not (payments_required or trials_enabled)
    or planpatch_private.monthly_access(owner_id)
    or exists (select 1 from planpatch_private.trials t where t.user_id = owner_id and t.expires_at > now())
  from planpatch_private.sandbox_settings where singleton
$$;

create or replace function planpatch_private.planpatch_sandbox_access()
returns table (payments_required boolean, monthly boolean, project_credits bigint, project_ids uuid[])
language sql stable security definer set search_path = '' as $$
  select settings.payments_required or settings.trials_enabled,
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

create function planpatch_private.trial_details()
returns table (trial_ends_at timestamptz, monthly_ends_at timestamptz, can_start_trial boolean, locked_project_ids uuid[])
language sql stable security definer set search_path = '' as $$
  select t.expires_at,
    (select max(g.valid_until) from planpatch_private.sandbox_grants g
      where g.user_id = owner.id and g.kind = 'monthly' and paid and g.valid_until > now()),
    planpatch_private.trial_offer() and t.user_id is null
      and exists (select 1 from planpatch_private.trial_signups s where s.user_id = owner.id and s.expires_at > now()),
    array(select g.project_id from planpatch_private.sandbox_grants g
      join public.projects p on p.id = g.project_id and p.user_id = g.user_id
      where g.user_id = owner.id and g.kind = 'project')
  from (select planpatch_private.project_user_id() as id) owner
  left join planpatch_private.trials t on t.user_id = owner.id
  where owner.id is not null
$$;
create function public.planpatch_trial_details()
returns table (trial_ends_at timestamptz, monthly_ends_at timestamptz, can_start_trial boolean, locked_project_ids uuid[])
language sql stable security invoker set search_path = '' as $$
  select * from planpatch_private.trial_details()
$$;

create or replace function planpatch_private.can_edit_project(plan_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select planpatch_private.has_full_editor_access(owner.id)
    or exists (select 1 from planpatch_private.sandbox_grants
      where user_id = owner.id and kind = 'project' and paid and project_id = plan_id)
  from (select planpatch_private.project_user_id() as id) owner
  where owner.id is not null
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
    where user_id = new.user_id and kind = 'project' and paid and project_id is null
    order by observed_at, reference limit 1 for update skip locked;
  if grant_reference is null then
    raise exception 'A new project needs an unused credit, an active trial, or a monthly subscription.' using errcode = '42501';
  end if;
  update planpatch_private.sandbox_grants set project_id = new.id where reference = grant_reference;
  return new;
end
$$;

create index sandbox_grants_project on planpatch_private.sandbox_grants (project_id)
  where project_id is not null;

create function planpatch_private.keep_project_original() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.id is distinct from old.id or new.user_id is distinct from old.user_id
      or new.background_path is distinct from old.background_path)
    and exists (select 1 from planpatch_private.sandbox_grants where project_id = old.id) then
    raise exception 'This project credit is tied to its original blueprint.' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger keep_project_original before update on public.projects
  for each row execute function planpatch_private.keep_project_original();

create function planpatch_private.can_read_blueprint(blueprint_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when split_part(blueprint_name, '/', 2) ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    then planpatch_private.can_edit_project(split_part(blueprint_name, '/', 2)::uuid)
    else false end
$$;

create function planpatch_private.can_delete_blueprint(blueprint_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.projects p
    join planpatch_private.sandbox_grants g on g.project_id = p.id
    where p.background_path = blueprint_name and p.user_id = planpatch_private.project_user_id())
$$;

alter policy projects_select_own on public.projects
  using ((select planpatch_private.project_user_id()) = user_id and planpatch_private.can_edit_project(id));
alter policy blueprints_select_own on storage.objects using (
  bucket_id = 'blueprints' and (storage.foldername(name))[1] = (select planpatch_private.project_user_id())::text
  and planpatch_private.can_read_blueprint(name)
);
alter policy blueprints_delete_own on storage.objects using (
  bucket_id = 'blueprints' and (storage.foldername(name))[1] = (select planpatch_private.project_user_id())::text
  and planpatch_private.can_delete_blueprint(name)
);

revoke all on function planpatch_private.trial_tag(text, text),
  planpatch_private.purge_expired_trial_tags(), planpatch_private.record_trial_signup(jsonb),
  planpatch_private.trial_offer(), public.planpatch_trial_offer(),
  planpatch_private.start_trial(text), public.planpatch_start_trial(text),
  planpatch_private.has_full_editor_access(uuid),
  planpatch_private.trial_details(), public.planpatch_trial_details(),
  planpatch_private.keep_project_original(), planpatch_private.can_read_blueprint(text),
  planpatch_private.can_delete_blueprint(text) from public, anon, authenticated;

grant usage on schema planpatch_private to anon, supabase_auth_admin;
grant execute on function planpatch_private.record_trial_signup(jsonb) to supabase_auth_admin;
grant execute on function planpatch_private.trial_offer(), public.planpatch_trial_offer() to anon, authenticated;
grant execute on function planpatch_private.start_trial(text), public.planpatch_start_trial(text),
  planpatch_private.trial_details(), public.planpatch_trial_details(),
  planpatch_private.can_read_blueprint(text), planpatch_private.can_delete_blueprint(text) to authenticated;

commit;
