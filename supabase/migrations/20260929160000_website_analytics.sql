-- First-party pageviews voor de publieke website.
-- Geen visitor-id, geen IP, geen user-agent, geen foreign keys naar klantdata.
-- Schrijven gebeurt server-side met de service role. Lezen alleen met analytics-recht.

create table if not exists public.page_views (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  path text not null,
  page_key text not null,
  locale text not null,
  device_type text not null,
  referrer_host text,
  constraint page_views_path_check check (
    char_length(path) between 1 and 300
    and path ~ '^/[a-z0-9/_-]*$'
    and path !~ '\.\.'
    and path !~ '//'
  ),
  constraint page_views_page_key_check check (
    char_length(page_key) between 1 and 80
    and page_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint page_views_locale_check check (locale in ('nl')),
  constraint page_views_device_type_check check (
    device_type in ('desktop', 'mobile', 'tablet', 'unknown')
  ),
  constraint page_views_referrer_host_check check (
    referrer_host is null
    or (
      char_length(referrer_host) between 1 and 253
      and referrer_host = lower(referrer_host)
      and referrer_host ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$'
    )
  )
);

comment on table public.page_views is
  'Pageviews van de publieke site. Geen bezoeker-id, IP of user-agent, en geen koppeling met dossiers.';

create index if not exists page_views_created_at_idx on public.page_views (created_at desc);
create index if not exists page_views_page_key_idx on public.page_views (page_key);
create index if not exists page_views_locale_idx on public.page_views (locale);
create index if not exists page_views_device_type_idx on public.page_views (device_type);
create index if not exists page_views_referrer_host_idx on public.page_views (referrer_host);

insert into public.modules (sleutel, naam, volgorde) values
  ('analytics', 'Analytics', 13)
on conflict (sleutel) do nothing;

alter table public.page_views enable row level security;

revoke all on table public.page_views from public, anon, authenticated;
grant select on table public.page_views to authenticated;
grant select, insert on table public.page_views to service_role;

do $$
declare
  seq text;
begin
  select pg_get_serial_sequence('public.page_views', 'id') into seq;
  if seq is not null then
    execute format('revoke all on sequence %s from public, anon, authenticated', seq);
    execute format('grant usage, select on sequence %s to service_role', seq);
  end if;
end $$;

create policy page_views_lezen on public.page_views
  for select to authenticated
  using ((select app.heeft_recht('analytics', 'lezen')));
