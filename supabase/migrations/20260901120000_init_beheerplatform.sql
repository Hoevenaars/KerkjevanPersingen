-- Beheerplatform Kerkje van Persingen — initiële schema.
-- Nog niet gekoppeld aan de publieke website. Sanity blijft leidend.
-- Functioneel Ontwerp v1.0.

create extension if not exists btree_gist;

create schema if not exists app;

revoke all on schema app from public, anon, authenticated;
grant usage on schema app to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Hulptypes
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.rechtniveau as enum ('verborgen', 'lezen', 'schrijven');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.aanvraag_status as enum ('nieuw', 'in_behandeling', 'goedgekeurd', 'afgewezen', 'gesloten');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.boeking_status as enum (
    'optie', 'optie_verlopen', 'definitief', 'afgewezen', 'geannuleerd', 'afgerond', 'gearchiveerd',
    'migratie_aanvraag', 'migratie_vastgelegd'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.dagregel as enum ('expositie_weekend', 'doordeweeks', 'elke_dag');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.prijstype as enum ('vast', 'vanaf', 'op_aanvraag');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.publicatie_trigger as enum (
    'zodra_content_compleet', 'uiterlijk_1_maand', 'uiterlijk_2_maanden', 'uiterlijk_3_maanden', 'niet_publiceren'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.verzendwijze as enum ('automatisch', 'concept', 'handmatig');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.nieuwe_ontvanger_actie as enum ('direct_alsnog', 'als_concept', 'niet_meer');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.communicatie_status as enum ('gepland', 'concept', 'wachtrij', 'verzonden', 'fout', 'geannuleerd');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.vriend_frequentie as enum ('wekelijks', 'tweewekelijks', 'maandelijks');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.schrijvende_bron as enum ('sanity', 'beheer');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.document_type as enum ('contract', 'getekend_contract', 'factuur', 'overig');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Kern: gebruikers en rechten
-- ---------------------------------------------------------------------------

create table if not exists public.profielen (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  naam text not null,
  is_super_admin boolean not null default false,
  actief boolean not null default true,
  aangemaakt_op timestamptz not null default now(),
  bijgewerkt_op timestamptz not null default now()
);

create unique index if not exists profielen_email_unique on public.profielen (lower(email));

create table if not exists public.modules (
  sleutel text primary key,
  naam text not null,
  volgorde integer not null
);

create table if not exists public.gebruikersrechten (
  id bigint generated always as identity primary key,
  profiel_id uuid not null references public.profielen (id) on delete cascade,
  module_sleutel text not null references public.modules (sleutel) on delete cascade,
  niveau public.rechtniveau not null default 'verborgen',
  unique (profiel_id, module_sleutel)
);

create index if not exists gebruikersrechten_profiel_id_idx on public.gebruikersrechten (profiel_id);
create index if not exists gebruikersrechten_module_sleutel_idx on public.gebruikersrechten (module_sleutel);

-- ---------------------------------------------------------------------------
-- Configuratie (één bron per bedrijfsregel)
-- ---------------------------------------------------------------------------

create table if not exists public.verhuurtypen (
  sleutel text primary key,
  naam text not null,
  dagregel public.dagregel not null,
  actief boolean not null default true,
  volgorde integer not null default 100
);

create table if not exists public.instellingen (
  sleutel text primary key,
  groep text not null,
  waarde jsonb not null,
  toelichting text,
  bijgewerkt_op timestamptz not null default now()
);

create table if not exists public.tarieven (
  id bigint generated always as identity primary key,
  verhuurtype_sleutel text not null references public.verhuurtypen (sleutel),
  prijstype public.prijstype not null,
  bedrag numeric(10,2),
  geldig_vanaf date not null,
  geldig_tot date,
  toelichting text,
  constraint tarieven_bedrag_passend check (
    (prijstype = 'op_aanvraag' and bedrag is null)
    or (prijstype <> 'op_aanvraag' and bedrag is not null)
  )
);

create unique index if not exists tarieven_type_vanaf_unique
  on public.tarieven (verhuurtype_sleutel, geldig_vanaf);
create index if not exists tarieven_type_vanaf_idx on public.tarieven (verhuurtype_sleutel, geldig_vanaf desc);

create table if not exists public.bronnen (
  datatype text primary key,
  schrijvende_bron public.schrijvende_bron not null default 'sanity',
  toelichting text
);

-- ---------------------------------------------------------------------------
-- Relaties
-- ---------------------------------------------------------------------------

create table if not exists public.relaties (
  id bigint generated always as identity primary key,
  naam text not null,
  email text,
  telefoon text,
  adres text,
  op_reservelijst boolean not null default false,
  notities text,
  legacy_source text,
  legacy_id text,
  aangemaakt_op timestamptz not null default now(),
  bijgewerkt_op timestamptz not null default now()
);

create unique index if not exists relaties_legacy_id_unique on public.relaties (legacy_id) where legacy_id is not null;
create index if not exists relaties_email_idx on public.relaties (lower(email));

create table if not exists public.relatie_rollen (
  relatie_id bigint not null references public.relaties (id) on delete cascade,
  rol text not null,
  primary key (relatie_id, rol)
);

-- ---------------------------------------------------------------------------
-- Aanvragen en boekingen
-- ---------------------------------------------------------------------------

create table if not exists public.aanvragen (
  id bigint generated always as identity primary key,
  status public.aanvraag_status not null default 'nieuw',
  binnengekomen_op timestamptz not null default now(),
  naam text not null,
  email text not null,
  telefoon text,
  adres text,
  verhuurtype_sleutel text references public.verhuurtypen (sleutel),
  start_datum date,
  eind_datum date,
  aantal_personen text,
  toelichting text,
  website text,
  eerder_geexposeerd text,
  mede_exposanten text,
  akkoord_voorwaarden boolean,
  afwijsreden text,
  relatie_id bigint references public.relaties (id),
  boeking_id bigint,
  legacy_source text,
  legacy_id text,
  raw_sanity jsonb
);

create unique index if not exists aanvragen_legacy_id_unique on public.aanvragen (legacy_id) where legacy_id is not null;
create index if not exists aanvragen_status_idx on public.aanvragen (status, binnengekomen_op desc);
create index if not exists aanvragen_relatie_id_idx on public.aanvragen (relatie_id);

create table if not exists public.boekingen (
  id bigint generated always as identity primary key,
  nummer text unique,
  status public.boeking_status not null default 'optie',
  verhuurtype_sleutel text references public.verhuurtypen (sleutel),
  interne_titel text not null,
  start_datum date not null,
  eind_datum date not null,
  huurder_relatie_id bigint references public.relaties (id),
  gastheer_relatie_id bigint references public.relaties (id),
  contactpersoon_relatie_id bigint references public.relaties (id),
  aanvraag_id bigint references public.aanvragen (id),
  huurder_naam_snapshot text,
  huurder_email_snapshot text,
  huurder_telefoon_snapshot text,
  huurder_adres_snapshot text,
  aantal_personen text,
  toelichting text,
  website text,
  eerder_geexposeerd text,
  mede_exposanten text,
  akkoord_voorwaarden boolean,
  tarief_prijstype public.prijstype,
  tarief_bedrag numeric(10,2),
  tarief_geldig_vanaf date,
  tarief_vastgelegd_op date,
  aanbetaling_standaard numeric(10,2),
  aanbetaling_bedrag numeric(10,2),
  aanbetaling_override_reden text,
  aanbetaling_ontvangen boolean not null default false,
  aanbetaling_ontvangen_op timestamptz,
  optie_aangemaakt_op date,
  optietermijn_dagen integer,
  optie_einddatum date,
  interne_notities text,
  legacy_zichtbaarheid text,
  legacy_source text,
  legacy_id text,
  raw_sanity jsonb,
  aangemaakt_op timestamptz not null default now(),
  bijgewerkt_op timestamptz not null default now(),
  constraint boekingen_periode_ok check (eind_datum >= start_datum)
);

create unique index if not exists boekingen_legacy_id_unique on public.boekingen (legacy_id) where legacy_id is not null;
create index if not exists boekingen_status_idx on public.boekingen (status);
create index if not exists boekingen_periode_idx on public.boekingen (start_datum, eind_datum);
create index if not exists boekingen_huurder_relatie_id_idx on public.boekingen (huurder_relatie_id);
create index if not exists boekingen_aanvraag_id_idx on public.boekingen (aanvraag_id);

alter table public.aanvragen
  drop constraint if exists aanvragen_boeking_id_fkey;
alter table public.aanvragen
  add constraint aanvragen_boeking_id_fkey
  foreign key (boeking_id) references public.boekingen (id);

create index if not exists aanvragen_boeking_id_idx on public.aanvragen (boeking_id);

-- Maximaal één actieve optie per overlappende periode (FO §19).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'boekingen_een_actieve_optie'
  ) then
    alter table public.boekingen
      add constraint boekingen_een_actieve_optie
      exclude using gist (
        daterange(start_datum, eind_datum, '[]') with &&
      )
      where (status = 'optie');
  end if;
end $$;

create table if not exists public.boeking_ontvangers (
  id bigint generated always as identity primary key,
  boeking_id bigint not null references public.boekingen (id) on delete cascade,
  relatie_id bigint not null references public.relaties (id),
  rol text not null default 'huurder',
  toegevoegd_op timestamptz not null default now(),
  verwijderd_op timestamptz,
  unique (boeking_id, relatie_id, rol)
);

create index if not exists boeking_ontvangers_boeking_id_idx on public.boeking_ontvangers (boeking_id);
create index if not exists boeking_ontvangers_relatie_id_idx on public.boeking_ontvangers (relatie_id);

-- ---------------------------------------------------------------------------
-- Publieke agenda vs interne blokkades (FO §3)
-- ---------------------------------------------------------------------------

create table if not exists public.publieke_activiteiten (
  id bigint generated always as identity primary key,
  boeking_id bigint references public.boekingen (id),
  titel text,
  slug text unique,
  omschrijving text,
  start_datum date not null,
  eind_datum date not null,
  openingstijden jsonb,
  website text,
  foto_pad text,
  foto_alt text,
  publicatie_trigger public.publicatie_trigger not null default 'zodra_content_compleet',
  gepubliceerd boolean not null default false,
  gepubliceerd_op timestamptz,
  legacy_source text,
  legacy_id text,
  raw_sanity jsonb
);

create index if not exists publieke_activiteiten_boeking_id_idx on public.publieke_activiteiten (boeking_id);
create index if not exists publieke_activiteiten_start_idx on public.publieke_activiteiten (start_datum);

create table if not exists public.interne_activiteiten (
  id bigint generated always as identity primary key,
  titel text not null,
  start_datum date not null,
  eind_datum date not null,
  blokkeert_verhuurkalender boolean not null default false,
  notities text,
  legacy_source text,
  legacy_id text,
  raw_sanity jsonb,
  constraint interne_periode_ok check (eind_datum >= start_datum)
);

create index if not exists interne_activiteiten_periode_idx on public.interne_activiteiten (start_datum, eind_datum);

-- ---------------------------------------------------------------------------
-- Documenten (metadata; bestanden in private storage)
-- ---------------------------------------------------------------------------

create table if not exists public.documenten (
  id bigint generated always as identity primary key,
  boeking_id bigint not null references public.boekingen (id) on delete cascade,
  type public.document_type not null default 'overig',
  bestandsnaam text not null,
  storage_pad text not null,
  mime_type text,
  grootte_bytes integer,
  geupload_door uuid references public.profielen (id),
  geupload_op timestamptz not null default now()
);

create index if not exists documenten_boeking_id_idx on public.documenten (boeking_id);

-- ---------------------------------------------------------------------------
-- Communicatie
-- ---------------------------------------------------------------------------

create table if not exists public.communicatie_templates (
  id bigint generated always as identity primary key,
  sleutel text not null unique,
  naam text not null,
  actief boolean not null default true,
  verhuurtype_sleutel text references public.verhuurtypen (sleutel),
  trigger_soort text not null default 'voor_activiteit',
  termijn_waarde integer,
  termijn_eenheid text,
  ontvanger_rol text not null default 'huurder',
  verzendwijze public.verzendwijze not null default 'concept',
  nieuwe_ontvanger_actie public.nieuwe_ontvanger_actie not null default 'als_concept',
  huidige_versie integer not null default 1
);

create table if not exists public.communicatie_template_versies (
  id bigint generated always as identity primary key,
  template_id bigint not null references public.communicatie_templates (id) on delete cascade,
  versie integer not null,
  onderwerp text not null,
  inhoud text not null,
  vastgelegd_op timestamptz not null default now(),
  unique (template_id, versie)
);

create index if not exists communicatie_template_versies_template_id_idx
  on public.communicatie_template_versies (template_id);

create table if not exists public.communicatie_jobs (
  id bigint generated always as identity primary key,
  boeking_id bigint references public.boekingen (id) on delete cascade,
  template_id bigint not null references public.communicatie_templates (id),
  relatie_id bigint references public.relaties (id),
  gepland_op timestamptz,
  status public.communicatie_status not null default 'gepland',
  pogingen integer not null default 0,
  foutmelding text
);

create index if not exists communicatie_jobs_status_gepland_idx
  on public.communicatie_jobs (status, gepland_op);
create index if not exists communicatie_jobs_boeking_id_idx on public.communicatie_jobs (boeking_id);

create table if not exists public.communicatie_verzendingen (
  id bigint generated always as identity primary key,
  boeking_id bigint references public.boekingen (id),
  template_id bigint references public.communicatie_templates (id),
  relatie_id bigint references public.relaties (id),
  template_versie integer,
  email_op_verzendmoment text,
  gepland_op timestamptz,
  verzonden_op timestamptz,
  status public.communicatie_status not null,
  foutmelding text,
  handmatig boolean not null default false,
  test boolean not null default false,
  gebruiker_id uuid references public.profielen (id)
);

create index if not exists communicatie_verzendingen_sleutel_idx
  on public.communicatie_verzendingen (boeking_id, template_id, relatie_id);

-- Echte verzending is idempotent: dezelfde combinatie mag maar één keer slagen.
create unique index if not exists communicatie_idempotent_idx
  on public.communicatie_verzendingen (boeking_id, template_id, relatie_id)
  where status = 'verzonden' and test = false;

-- ---------------------------------------------------------------------------
-- Vrienden en nieuwsbrief
-- ---------------------------------------------------------------------------

create table if not exists public.vrienden (
  id bigint generated always as identity primary key,
  naam text,
  email text not null,
  actief boolean not null default true,
  frequentie public.vriend_frequentie not null default 'wekelijks',
  uitschrijf_token text not null unique,
  aangemeld_op timestamptz not null default now(),
  legacy_source text,
  legacy_id text
);

create unique index if not exists vrienden_email_unique on public.vrienden (lower(email));
create unique index if not exists vrienden_legacy_id_unique on public.vrienden (legacy_id) where legacy_id is not null;

create table if not exists public.nieuwsbrieven (
  id bigint generated always as identity primary key,
  week_maandag date not null unique,
  kort_nieuws text,
  foto_pad text,
  foto_alt text,
  donatie_update text,
  overgeslagen boolean not null default false,
  verstuurd boolean not null default false,
  verstuurd_op timestamptz,
  legacy_source text,
  legacy_id text
);

create table if not exists public.nieuwsbrief_verzendingen (
  id bigint generated always as identity primary key,
  nieuwsbrief_id bigint not null references public.nieuwsbrieven (id) on delete cascade,
  vriend_id bigint references public.vrienden (id),
  email_op_verzendmoment text,
  test boolean not null default false,
  status public.communicatie_status not null,
  verzonden_op timestamptz,
  foutmelding text
);

create index if not exists nieuwsbrief_verzendingen_nieuwsbrief_id_idx
  on public.nieuwsbrief_verzendingen (nieuwsbrief_id);

-- Testverzendingen tellen niet als unieke live-send.
create unique index if not exists nieuwsbrief_live_uniek
  on public.nieuwsbrief_verzendingen (nieuwsbrief_id, vriend_id)
  where test = false and status = 'verzonden';

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

create table if not exists public.auditlog (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profielen (id),
  actor_naam text,
  onderwerp_type text not null,
  onderwerp_id text,
  actie text not null,
  van text,
  naar text,
  reden text,
  details jsonb,
  op timestamptz not null default now()
);

create index if not exists auditlog_onderwerp_idx on public.auditlog (onderwerp_type, onderwerp_id, op desc);
create index if not exists auditlog_actor_idx on public.auditlog (actor_id, op desc);

-- ---------------------------------------------------------------------------
-- Zoeken (voorbereiding FO §68)
-- ---------------------------------------------------------------------------

alter table public.relaties
  add column if not exists zoek tsvector
  generated always as (
    to_tsvector('simple', coalesce(naam, '') || ' ' || coalesce(email, ''))
  ) stored;

create index if not exists relaties_zoek_idx on public.relaties using gin (zoek);

alter table public.aanvragen
  add column if not exists zoek tsvector
  generated always as (
    to_tsvector('simple', coalesce(naam, '') || ' ' || coalesce(email, '') || ' ' || coalesce(toelichting, ''))
  ) stored;

create index if not exists aanvragen_zoek_idx on public.aanvragen using gin (zoek);

alter table public.boekingen
  add column if not exists zoek tsvector
  generated always as (
    to_tsvector(
      'simple',
      coalesce(interne_titel, '') || ' ' || coalesce(nummer, '') || ' ' || coalesce(huurder_naam_snapshot, '')
    )
  ) stored;

create index if not exists boekingen_zoek_idx on public.boekingen using gin (zoek);

-- ---------------------------------------------------------------------------
-- Rechtenfuncties (private schema, security definer)
-- ---------------------------------------------------------------------------

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
        and p.actief = true
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
        and p.actief = true
        and g.module_sleutel = p_module
        and (
          (p_min = 'lezen' and g.niveau in ('lezen', 'schrijven'))
          or (p_min = 'schrijven' and g.niveau = 'schrijven')
        )
    );
$$;

revoke all on function app.is_super_admin() from public, anon;
revoke all on function app.heeft_recht(text, text) from public, anon;
grant execute on function app.is_super_admin() to authenticated, service_role;
grant execute on function app.heeft_recht(text, text) to authenticated, service_role;

-- Super Admin-vlag mag niet door gewone gebruikers worden aangepast.
create or replace function app.bescherm_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
  before update on public.profielen
  for each row execute function app.bescherm_super_admin();

-- Auditregels zijn niet wijzigbaar voor gewone gebruikers.
create or replace function app.auditlog_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Auditlog is niet wijzigbaar';
end;
$$;

drop trigger if exists auditlog_geen_update on public.auditlog;
create trigger auditlog_geen_update
  before update or delete on public.auditlog
  for each row execute function app.auditlog_immutable();

-- ---------------------------------------------------------------------------
-- Views voor later publiek gebruik — nog geen GRANT aan anon
-- ---------------------------------------------------------------------------

create or replace view public.v_publieke_bezetting
with (security_invoker = true)
as
select d::date as dag
from (
  select generate_series(b.start_datum, b.eind_datum, interval '1 day') as d
  from public.boekingen b
  where b.status = 'definitief'
  union
  select generate_series(i.start_datum, i.eind_datum, interval '1 day') as d
  from public.interne_activiteiten i
  where i.blokkeert_verhuurkalender = true
) dagen;

create or replace view public.v_publieke_agenda
with (security_invoker = true)
as
select
  a.id,
  a.slug,
  a.titel,
  a.omschrijving,
  a.start_datum,
  a.eind_datum,
  a.openingstijden,
  a.website,
  a.foto_pad,
  a.foto_alt
from public.publieke_activiteiten a
where a.gepubliceerd = true;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profielen enable row level security;
alter table public.modules enable row level security;
alter table public.gebruikersrechten enable row level security;
alter table public.verhuurtypen enable row level security;
alter table public.instellingen enable row level security;
alter table public.tarieven enable row level security;
alter table public.bronnen enable row level security;
alter table public.relaties enable row level security;
alter table public.relatie_rollen enable row level security;
alter table public.aanvragen enable row level security;
alter table public.boekingen enable row level security;
alter table public.boeking_ontvangers enable row level security;
alter table public.publieke_activiteiten enable row level security;
alter table public.interne_activiteiten enable row level security;
alter table public.documenten enable row level security;
alter table public.communicatie_templates enable row level security;
alter table public.communicatie_template_versies enable row level security;
alter table public.communicatie_jobs enable row level security;
alter table public.communicatie_verzendingen enable row level security;
alter table public.vrienden enable row level security;
alter table public.nieuwsbrieven enable row level security;
alter table public.nieuwsbrief_verzendingen enable row level security;
alter table public.auditlog enable row level security;

-- Anon krijgt niets: de publieke site leest nog Sanity.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Policies: module-rechten + Super Admin. UPDATE vereist ook SELECT.
create policy profielen_select on public.profielen
  for select to authenticated
  using ((select app.heeft_recht('gebruikers', 'lezen')) or id = (select auth.uid()));
create policy profielen_update on public.profielen
  for update to authenticated
  using ((select app.heeft_recht('gebruikers', 'schrijven')) or id = (select auth.uid()))
  with check ((select app.heeft_recht('gebruikers', 'schrijven')) or id = (select auth.uid()));

create policy modules_select on public.modules
  for select to authenticated using (true);

create policy gebruikersrechten_select on public.gebruikersrechten
  for select to authenticated
  using ((select app.heeft_recht('gebruikers', 'lezen')) or profiel_id = (select auth.uid()));
create policy gebruikersrechten_schrijven on public.gebruikersrechten
  for all to authenticated
  using ((select app.heeft_recht('gebruikers', 'schrijven')))
  with check ((select app.heeft_recht('gebruikers', 'schrijven')));

create policy verhuurtypen_select on public.verhuurtypen
  for select to authenticated using ((select app.heeft_recht('instellingen', 'lezen')) or (select app.heeft_recht('boekingen', 'lezen')) or (select app.heeft_recht('aanvragen', 'lezen')));
create policy verhuurtypen_schrijven on public.verhuurtypen
  for all to authenticated
  using ((select app.heeft_recht('instellingen', 'schrijven')))
  with check ((select app.heeft_recht('instellingen', 'schrijven')));

create policy instellingen_select on public.instellingen
  for select to authenticated using ((select app.heeft_recht('instellingen', 'lezen')));
create policy instellingen_schrijven on public.instellingen
  for all to authenticated
  using ((select app.heeft_recht('instellingen', 'schrijven')))
  with check ((select app.heeft_recht('instellingen', 'schrijven')));

create policy tarieven_select on public.tarieven
  for select to authenticated using ((select app.heeft_recht('finance', 'lezen')));
create policy tarieven_schrijven on public.tarieven
  for all to authenticated
  using ((select app.heeft_recht('finance', 'schrijven')))
  with check ((select app.heeft_recht('finance', 'schrijven')));

create policy bronnen_select on public.bronnen
  for select to authenticated using ((select app.is_super_admin()));
create policy bronnen_schrijven on public.bronnen
  for all to authenticated
  using ((select app.is_super_admin()))
  with check ((select app.is_super_admin()));

create policy relaties_select on public.relaties
  for select to authenticated using ((select app.heeft_recht('relaties', 'lezen')));
create policy relaties_insert on public.relaties
  for insert to authenticated with check ((select app.heeft_recht('relaties', 'schrijven')));
create policy relaties_update on public.relaties
  for update to authenticated
  using ((select app.heeft_recht('relaties', 'schrijven')))
  with check ((select app.heeft_recht('relaties', 'schrijven')));
create policy relaties_delete on public.relaties
  for delete to authenticated using ((select app.is_super_admin()));

create policy relatie_rollen_select on public.relatie_rollen
  for select to authenticated using ((select app.heeft_recht('relaties', 'lezen')));
create policy relatie_rollen_schrijven on public.relatie_rollen
  for all to authenticated
  using ((select app.heeft_recht('relaties', 'schrijven')))
  with check ((select app.heeft_recht('relaties', 'schrijven')));

create policy aanvragen_select on public.aanvragen
  for select to authenticated using ((select app.heeft_recht('aanvragen', 'lezen')));
create policy aanvragen_insert on public.aanvragen
  for insert to authenticated with check ((select app.heeft_recht('aanvragen', 'schrijven')));
create policy aanvragen_update on public.aanvragen
  for update to authenticated
  using ((select app.heeft_recht('aanvragen', 'schrijven')))
  with check ((select app.heeft_recht('aanvragen', 'schrijven')));
create policy aanvragen_delete on public.aanvragen
  for delete to authenticated using ((select app.is_super_admin()));

create policy boekingen_select on public.boekingen
  for select to authenticated using ((select app.heeft_recht('boekingen', 'lezen')));
create policy boekingen_insert on public.boekingen
  for insert to authenticated with check ((select app.heeft_recht('boekingen', 'schrijven')));
create policy boekingen_update on public.boekingen
  for update to authenticated
  using ((select app.heeft_recht('boekingen', 'schrijven')))
  with check ((select app.heeft_recht('boekingen', 'schrijven')));
create policy boekingen_delete on public.boekingen
  for delete to authenticated using ((select app.is_super_admin()));

create policy boeking_ontvangers_select on public.boeking_ontvangers
  for select to authenticated using ((select app.heeft_recht('boekingen', 'lezen')));
create policy boeking_ontvangers_schrijven on public.boeking_ontvangers
  for all to authenticated
  using ((select app.heeft_recht('boekingen', 'schrijven')))
  with check ((select app.heeft_recht('boekingen', 'schrijven')));

create policy publieke_activiteiten_select on public.publieke_activiteiten
  for select to authenticated using ((select app.heeft_recht('agenda', 'lezen')));
create policy publieke_activiteiten_schrijven on public.publieke_activiteiten
  for all to authenticated
  using ((select app.heeft_recht('agenda', 'schrijven')))
  with check ((select app.heeft_recht('agenda', 'schrijven')));

create policy interne_activiteiten_select on public.interne_activiteiten
  for select to authenticated using ((select app.heeft_recht('kalender', 'lezen')));
create policy interne_activiteiten_schrijven on public.interne_activiteiten
  for all to authenticated
  using ((select app.heeft_recht('kalender', 'schrijven')))
  with check ((select app.heeft_recht('kalender', 'schrijven')));

create policy documenten_select on public.documenten
  for select to authenticated using ((select app.heeft_recht('boekingen', 'lezen')));
create policy documenten_schrijven on public.documenten
  for all to authenticated
  using ((select app.heeft_recht('boekingen', 'schrijven')))
  with check ((select app.heeft_recht('boekingen', 'schrijven')));

create policy templates_select on public.communicatie_templates
  for select to authenticated using ((select app.heeft_recht('templates', 'lezen')));
create policy templates_schrijven on public.communicatie_templates
  for all to authenticated
  using ((select app.heeft_recht('templates', 'schrijven')))
  with check ((select app.heeft_recht('templates', 'schrijven')));

create policy template_versies_select on public.communicatie_template_versies
  for select to authenticated using ((select app.heeft_recht('templates', 'lezen')));
create policy template_versies_schrijven on public.communicatie_template_versies
  for all to authenticated
  using ((select app.heeft_recht('templates', 'schrijven')))
  with check ((select app.heeft_recht('templates', 'schrijven')));

create policy jobs_select on public.communicatie_jobs
  for select to authenticated using ((select app.heeft_recht('templates', 'lezen')) or (select app.heeft_recht('boekingen', 'lezen')));
create policy jobs_schrijven on public.communicatie_jobs
  for all to authenticated
  using ((select app.heeft_recht('templates', 'schrijven')) or (select app.heeft_recht('boekingen', 'schrijven')))
  with check ((select app.heeft_recht('templates', 'schrijven')) or (select app.heeft_recht('boekingen', 'schrijven')));

create policy verzendingen_select on public.communicatie_verzendingen
  for select to authenticated using ((select app.heeft_recht('templates', 'lezen')) or (select app.heeft_recht('boekingen', 'lezen')));
create policy verzendingen_insert on public.communicatie_verzendingen
  for insert to authenticated
  with check ((select app.heeft_recht('templates', 'schrijven')) or (select app.heeft_recht('boekingen', 'schrijven')));

create policy vrienden_select on public.vrienden
  for select to authenticated using ((select app.heeft_recht('vrienden', 'lezen')));
create policy vrienden_insert on public.vrienden
  for insert to authenticated with check ((select app.heeft_recht('vrienden', 'schrijven')));
create policy vrienden_update on public.vrienden
  for update to authenticated
  using ((select app.heeft_recht('vrienden', 'schrijven')))
  with check ((select app.heeft_recht('vrienden', 'schrijven')));
create policy vrienden_delete on public.vrienden
  for delete to authenticated using ((select app.is_super_admin()));

create policy nieuwsbrieven_select on public.nieuwsbrieven
  for select to authenticated using ((select app.heeft_recht('nieuwsbrief', 'lezen')));
create policy nieuwsbrieven_insert on public.nieuwsbrieven
  for insert to authenticated with check ((select app.heeft_recht('nieuwsbrief', 'schrijven')));
create policy nieuwsbrieven_update on public.nieuwsbrieven
  for update to authenticated
  using ((select app.heeft_recht('nieuwsbrief', 'schrijven')))
  with check ((select app.heeft_recht('nieuwsbrief', 'schrijven')));
create policy nieuwsbrieven_delete on public.nieuwsbrieven
  for delete to authenticated using ((select app.is_super_admin()));

create policy nieuwsbrief_verzendingen_select on public.nieuwsbrief_verzendingen
  for select to authenticated using ((select app.heeft_recht('nieuwsbrief', 'lezen')));
create policy nieuwsbrief_verzendingen_insert on public.nieuwsbrief_verzendingen
  for insert to authenticated
  with check ((select app.heeft_recht('nieuwsbrief', 'schrijven')));

create policy auditlog_select on public.auditlog
  for select to authenticated using ((select app.is_super_admin()));
create policy auditlog_insert on public.auditlog
  for insert to authenticated
  with check ((select auth.uid()) is not null);

-- ---------------------------------------------------------------------------
-- Seed: modules, verhuurtypen, tarieven, instellingen, bronnen, templates
-- ---------------------------------------------------------------------------

insert into public.modules (sleutel, naam, volgorde) values
  ('dashboard', 'Vandaag', 1),
  ('aanvragen', 'Aanvragen', 2),
  ('boekingen', 'Boekingen', 3),
  ('kalender', 'Kalender', 4),
  ('agenda', 'Agenda', 5),
  ('relaties', 'Relaties', 6),
  ('finance', 'Finance', 7),
  ('vrienden', 'Vrienden', 8),
  ('nieuwsbrief', 'Nieuwsbrief', 9),
  ('templates', 'Templates', 10),
  ('gebruikers', 'Gebruikers', 11),
  ('instellingen', 'Instellingen', 12)
on conflict (sleutel) do nothing;

insert into public.verhuurtypen (sleutel, naam, dagregel, actief, volgorde) values
  ('expositie', 'Expositie', 'expositie_weekend', true, 1),
  ('bruiloft', 'Bruiloft', 'doordeweeks', true, 2),
  ('concert', 'Concert', 'doordeweeks', true, 3),
  ('diverse', 'Diverse bijeenkomst', 'doordeweeks', true, 4)
on conflict (sleutel) do nothing;

insert into public.tarieven (verhuurtype_sleutel, prijstype, bedrag, geldig_vanaf, geldig_tot, toelichting) values
  ('expositie', 'vast', 490, '2020-01-01', '2028-12-31', null),
  ('expositie', 'vast', 525, '2029-01-01', null, null),
  ('bruiloft', 'vast', 550, '2020-01-01', '2028-12-31', null),
  ('bruiloft', 'vast', 590, '2029-01-01', null, null),
  ('concert', 'op_aanvraag', null, '2020-01-01', null, 'Op aanvraag'),
  ('diverse', 'vanaf', 250, '2020-01-01', '2028-12-31', 'vanaf'),
  ('diverse', 'vanaf', 275, '2029-01-01', null, 'vanaf')
on conflict (verhuurtype_sleutel, geldig_vanaf) do nothing;

insert into public.instellingen (sleutel, groep, waarde, toelichting) values
  ('optietermijn_dagen', 'verhuur', '14', 'Standaard geldigheid van een nieuwe optie. Bestaande opties wijzigen niet mee.'),
  ('betaaltermijn_dagen', 'finance', '14', 'Standaard betaaltermijn.'),
  ('aanbetaling_standaard', 'finance', '100', 'Standaard aanbetaling in euro’s, tenzij per type anders.'),
  ('aanbetaling_verplicht_voor_definitief', 'finance', 'true', 'Automatisch definitief na bevestigde aanbetaling.'),
  ('expositie_openingstijden', 'verhuur', '{"van":"11:00","tot":"17:00"}', 'Openingstijden exposities, niet meer hardcoded in mails.'),
  ('tijdzone', 'algemeen', '"Europe/Amsterdam"', 'Alle planning in Nederlandse tijd.'),
  ('max_document_bytes', 'algemeen', '20971520', 'Maximale uploadgrootte documenten (20 MB).')
on conflict (sleutel) do nothing;

insert into public.bronnen (datatype, schrijvende_bron, toelichting) values
  ('aanvragen', 'sanity', 'Websiteformulier en Sanity Studio'),
  ('boekingen', 'sanity', 'Activiteit-document in Sanity'),
  ('publieke_activiteiten', 'sanity', 'Zichtbaarheid publiek op activiteit'),
  ('interne_activiteiten', 'sanity', 'Soort blokkade'),
  ('relaties', 'sanity', 'Persoon-document'),
  ('vrienden', 'sanity', 'Vriend-document'),
  ('nieuwsbrieven', 'sanity', 'Nieuwsbrief-document + cron'),
  ('instellingen', 'sanity', 'Instellingen-document'),
  ('templates', 'sanity', 'Mailteksten in instellingen')
on conflict (datatype) do nothing;

insert into public.communicatie_templates
  (sleutel, naam, trigger_soort, termijn_waarde, termijn_eenheid, ontvanger_rol, verzendwijze)
values
  ('afwijzing', 'Aanvraag afgewezen', 'handmatig', null, null, 'huurder', 'handmatig'),
  ('contract_begeleiding', 'Contract meesturen', 'handmatig', null, null, 'huurder', 'handmatig'),
  ('volgende_stappen', 'Volgende stappen na definitief', 'na_definitief', 0, 'dagen', 'huurder', 'concept'),
  ('aanbetaling_check_paul', 'Aanbetaling-check', 'na_optie', 14, 'dagen', 'finance', 'concept'),
  ('content_verzoek', 'Tekst/foto aanleveren', 'voor_activiteit', 4, 'maanden', 'huurder', 'concept'),
  ('content_ter_beoordeling', 'Content ter beoordeling', 'handmatig', null, null, 'bestuur', 'handmatig'),
  ('praktisch_4w', 'Praktische informatie', 'voor_activiteit', 4, 'weken', 'huurder', 'concept'),
  ('praktisch_gastheer', 'Praktische informatie gastheer', 'voor_activiteit', 4, 'weken', 'gastheer', 'concept'),
  ('herinnering_1d', 'Herinnering 1 dag', 'voor_activiteit', 1, 'dagen', 'huurder', 'concept'),
  ('herinnering_gastheer', 'Herinnering 1 dag gastheer', 'voor_activiteit', 1, 'dagen', 'gastheer', 'concept'),
  ('review_verzoek', 'Google-review na afloop', 'na_activiteit', 1, 'dagen', 'huurder', 'concept'),
  ('reservelijst', 'Vrijgekomen weekend', 'handmatig', null, null, 'reservelijst', 'handmatig'),
  ('optie_verlopen_contractbeheerder', 'Optie verlopen', 'optie_verlopen', 0, 'dagen', 'contractbeheerder', 'automatisch')
on conflict (sleutel) do nothing;

-- ---------------------------------------------------------------------------
-- Storage-buckets (alleen als het storage-schema bestaat)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      ('public-media', 'public-media', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif']::text[]),
      ('media-originals', 'media-originals', false, 31457280, array['image/jpeg','image/png','image/webp','image/heic','image/gif']::text[]),
      ('booking-documents', 'booking-documents', false, 20971520, array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png']::text[])
    on conflict (id) do nothing;

    -- Private buckets: alleen ingelogde gebruikers met boekingen-recht.
    -- Upsert vereist SELECT + INSERT + UPDATE.
    if not exists (select 1 from pg_policies where policyname = 'booking_docs_select') then
      create policy booking_docs_select on storage.objects
        for select to authenticated
        using (bucket_id = 'booking-documents' and (select app.heeft_recht('boekingen', 'lezen')));
      create policy booking_docs_insert on storage.objects
        for insert to authenticated
        with check (bucket_id = 'booking-documents' and (select app.heeft_recht('boekingen', 'schrijven')));
      create policy booking_docs_update on storage.objects
        for update to authenticated
        using (bucket_id = 'booking-documents' and (select app.heeft_recht('boekingen', 'schrijven')))
        with check (bucket_id = 'booking-documents' and (select app.heeft_recht('boekingen', 'schrijven')));
      create policy originals_select on storage.objects
        for select to authenticated
        using (bucket_id = 'media-originals' and ((select app.heeft_recht('agenda', 'lezen')) or (select app.heeft_recht('nieuwsbrief', 'lezen'))));
      create policy originals_insert on storage.objects
        for insert to authenticated
        with check (bucket_id = 'media-originals' and ((select app.heeft_recht('agenda', 'schrijven')) or (select app.heeft_recht('nieuwsbrief', 'schrijven'))));
      create policy originals_update on storage.objects
        for update to authenticated
        using (bucket_id = 'media-originals' and ((select app.heeft_recht('agenda', 'schrijven')) or (select app.heeft_recht('nieuwsbrief', 'schrijven'))))
        with check (bucket_id = 'media-originals' and ((select app.heeft_recht('agenda', 'schrijven')) or (select app.heeft_recht('nieuwsbrief', 'schrijven'))));
    end if;
  end if;
end $$;
