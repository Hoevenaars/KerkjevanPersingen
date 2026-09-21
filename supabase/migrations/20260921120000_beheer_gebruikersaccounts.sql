-- Echte beheeraccounts: status, functie, last_active, planning-module
-- en een profielrij zodra Auth een user aanmaakt.
-- Bestaande rechtenniveaus en Super Admin-bescherming blijven leidend.

do $$ begin
  create type public.account_status as enum ('invited', 'active', 'disabled');
exception when duplicate_object then null;
end $$;

alter table public.profielen
  add column if not exists status public.account_status;

alter table public.profielen
  add column if not exists functie text;

alter table public.profielen
  add column if not exists last_active_at timestamptz;

update public.profielen
set status = case
  when actief then 'active'::public.account_status
  else 'invited'::public.account_status
end
where status is null;

alter table public.profielen
  alter column status set default 'invited';

alter table public.profielen
  alter column status set not null;

alter table public.profielen
  drop constraint if exists profielen_functie_bekend;

alter table public.profielen
  add constraint profielen_functie_bekend
  check (functie is null or functie in ('operationeel', 'finance', 'planning'));

create index if not exists profielen_status_idx on public.profielen (status);
create index if not exists profielen_last_active_idx on public.profielen (last_active_at desc);

insert into public.modules (sleutel, naam, volgorde) values
  ('planning', 'Planning', 5)
on conflict (sleutel) do nothing;

update public.modules set volgorde = 6 where sleutel = 'relaties' and volgorde < 6;
update public.modules set volgorde = 7 where sleutel = 'finance';
update public.modules set volgorde = 8 where sleutel = 'vrienden';
update public.modules set volgorde = 9 where sleutel = 'nieuwsbrief';
update public.modules set volgorde = 10 where sleutel = 'templates';
update public.modules set volgorde = 11 where sleutel = 'gebruikers';
update public.modules set volgorde = 12 where sleutel = 'instellingen';

create or replace function app.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select p.is_super_admin
      from public.profielen p
      where p.id = (select auth.uid())
        and p.status = 'active'
    ),
    false
  );
$$;

create or replace function app.heeft_recht(p_module text, p_min text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    app.is_super_admin()
    or exists (
      select 1
      from public.gebruikersrechten g
      join public.profielen p on p.id = g.profiel_id
      where g.profiel_id = (select auth.uid())
        and p.status = 'active'
        and g.module_sleutel = p_module
        and (
          (p_min = 'lezen' and g.niveau in ('lezen', 'schrijven'))
          or (p_min = 'schrijven' and g.niveau = 'schrijven')
        )
    );
$$;

create or replace function app.sync_profiel_actief()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.actief := (new.status = 'active');
  return new;
end;
$$;

drop trigger if exists profielen_sync_actief on public.profielen;
create trigger profielen_sync_actief
  before insert or update of status
  on public.profielen
  for each row execute function app.sync_profiel_actief();

create or replace function app.maak_profiel_voor_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_naam text;
  v_functie text;
begin
  v_naam := nullif(trim(coalesce(new.raw_user_meta_data->>'naam', '')), '');
  if v_naam is null then
    v_naam := split_part(coalesce(new.email, 'gebruiker'), '@', 1);
  end if;
  v_functie := nullif(trim(coalesce(new.raw_user_meta_data->>'functie', '')), '');
  if v_functie is not null and v_functie not in ('operationeel', 'finance', 'planning') then
    v_functie := null;
  end if;

  insert into public.profielen (id, email, naam, functie, status, is_super_admin, actief)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    v_naam,
    v_functie,
    'invited',
    false,
    false
  )
  on conflict (id) do update
    set email = excluded.email
    where public.profielen.email is distinct from excluded.email;
  return new;
end;
$$;

drop trigger if exists auth_user_maak_profiel on auth.users;
create trigger auth_user_maak_profiel
  after insert on auth.users
  for each row execute function app.maak_profiel_voor_auth_user();

-- Gewone gebruikers mogen zichzelf geen Super Admin maken (insert + update).
create or replace function app.bescherm_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.is_super_admin = true and not app.is_super_admin() then
    raise exception 'Alleen Super Admin mag Super Admin-rechten toekennen';
  end if;
  if tg_op = 'UPDATE'
     and new.is_super_admin is distinct from old.is_super_admin
     and not app.is_super_admin() then
    raise exception 'Alleen Super Admin mag Super Admin-rechten wijzigen';
  end if;
  return new;
end;
$$;

drop trigger if exists profielen_bescherm_super_admin on public.profielen;
create trigger profielen_bescherm_super_admin
  before insert or update on public.profielen
  for each row execute function app.bescherm_super_admin();
