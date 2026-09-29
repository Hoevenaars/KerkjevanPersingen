-- RLS en constraints voor page_views. Draait na de migraties, als postgres.

insert into public.page_views (path, page_key, locale, device_type, referrer_host)
values ('/verhuur', 'verhuur', 'nl', 'desktop', 'google.com');

do $$
begin
  begin
    insert into public.page_views (path, page_key, locale, device_type)
    values ('/verhuur', 'verhuur', 'en', 'desktop');
    raise exception 'locale en werd geaccepteerd';
  exception when check_violation then null;
  end;

  begin
    insert into public.page_views (path, page_key, locale, device_type)
    values ('/verhuur', 'verhuur', 'nl', 'phone');
    raise exception 'device phone werd geaccepteerd';
  exception when check_violation then null;
  end;

  begin
    insert into public.page_views (path, page_key, locale, device_type, referrer_host)
    values ('/verhuur', 'verhuur', 'nl', 'desktop', 'https://evil.test/geheim');
    raise exception 'volledige referrer-url werd geaccepteerd';
  exception when check_violation then null;
  end;
end $$;

insert into auth.users (id, email)
values ('11111111-1111-4111-8111-111111111111', 'analytics@example.test');

alter table public.profielen disable trigger profielen_bescherm_super_admin;
update public.profielen
set is_super_admin = true,
    status = 'active',
    actief = true
where id = '11111111-1111-4111-8111-111111111111';
alter table public.profielen enable trigger profielen_bescherm_super_admin;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;

set role authenticated;
do $$
declare
  n int;
begin
  select count(*) into n from public.page_views;
  if n <> 1 then
    raise exception 'super admin zag % pageviews, verwacht 1', n;
  end if;

  begin
    insert into public.page_views (path, page_key, locale, device_type)
    values ('/contact', 'contact', 'nl', 'mobile');
    raise exception 'authenticated kon page_views schrijven';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.page_views;
    raise exception 'authenticated kon page_views verwijderen';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

update public.profielen
set is_super_admin = false
where id = '11111111-1111-4111-8111-111111111111';

set role authenticated;
do $$
declare
  n int;
begin
  select count(*) into n from public.page_views;
  if n <> 0 then
    raise exception 'gebruiker zonder analytics-recht las % rijen', n;
  end if;
end $$;
reset role;

insert into public.gebruikersrechten (profiel_id, module_sleutel, niveau)
values ('11111111-1111-4111-8111-111111111111', 'analytics', 'lezen');

set role authenticated;
do $$
declare
  n int;
begin
  select count(*) into n from public.page_views;
  if n <> 1 then
    raise exception 'analytics-lezen zag % pageviews, verwacht 1', n;
  end if;
end $$;
reset role;

set role anon;
do $$
begin
  begin
    perform count(*) from public.page_views;
    raise exception 'anon kon page_views lezen';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$ select null::uuid $$;
