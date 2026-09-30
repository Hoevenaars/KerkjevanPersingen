-- Fase 3A: ontbrekende domeintabellen plus consolidatiekolommen.
-- Geen CSV-import. Bestaande auth- en beheertabellen (profielen, modules,
-- gebruikersrechten, beheer_rollen, beheer_rol_rechten) worden niet
-- gedropt, hernoemd of van policies ontdaan.
-- Enige schrijfactie op een bestaande tabel: modulesleutel analytics,
-- nodig voor page_views. ON CONFLICT DO NOTHING.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Types die de domeintabellen nodig hebben. Bestaande types blijven staan.
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.aanvraag_status as enum (
    'nieuw', 'in_behandeling', 'wacht_op_aanvrager', 'goedgekeurd', 'afgewezen', 'gesloten'
  );
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
  create type public.inhoud_status as enum (
    'niet_vereist', 'niet_gestart', 'gevraagd', 'ingediend', 'wijziging_gevraagd', 'goedgekeurd'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Verhuurtypen: foreign-key-ouder van aanvragen en boekingen.
-- ---------------------------------------------------------------------------

create table if not exists public.verhuurtypen (
  sleutel text primary key,
  naam text not null,
  dagregel public.dagregel not null,
  actief boolean not null default true,
  volgorde integer not null default 100
);

-- ---------------------------------------------------------------------------
-- Relaties. legacy_* blijft Sanity-herkomst. migration_* is de consolidatie.
-- geboortedatum ontbreekt bewust: de app beheert dat veld nergens.
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
  migration_source text,
  migration_external_id text,
  migration_source_file text,
  migration_source_row text,
  migration_batch_id text,
  aangemaakt_op timestamptz not null default now(),
  bijgewerkt_op timestamptz not null default now(),
  constraint relaties_migratie_herkomst_uniek unique (migration_source, migration_external_id)
);

create unique index if not exists relaties_legacy_id_unique
  on public.relaties (legacy_id) where legacy_id is not null;
create index if not exists relaties_email_idx on public.relaties (lower(email));
create index if not exists relaties_migration_external_id_idx
  on public.relaties (migration_external_id) where migration_external_id is not null;

alter table public.relaties
  add column if not exists zoek tsvector
  generated always as (
    to_tsvector('simple', coalesce(naam, '') || ' ' || coalesce(email, ''))
  ) stored;

create index if not exists relaties_zoek_idx on public.relaties using gin (zoek);

create table if not exists public.relatie_rollen (
  relatie_id bigint not null references public.relaties (id) on delete cascade,
  rol text not null,
  migration_source text,
  migration_external_id text,
  migration_source_file text,
  migration_source_row text,
  migration_batch_id text,
  primary key (relatie_id, rol),
  constraint relatie_rollen_migratie_herkomst_uniek unique (migration_source, migration_external_id)
);

create index if not exists relatie_rollen_migration_external_id_idx
  on public.relatie_rollen (migration_external_id) where migration_external_id is not null;

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
  beoordeling_deadline date,
  informatievraag text,
  informatie_ontvangen_op timestamptz,
  legacy_source text,
  legacy_id text,
  raw_sanity jsonb
);

create unique index if not exists aanvragen_legacy_id_unique
  on public.aanvragen (legacy_id) where legacy_id is not null;
create index if not exists aanvragen_status_idx on public.aanvragen (status, binnengekomen_op desc);
create index if not exists aanvragen_relatie_id_idx on public.aanvragen (relatie_id);

alter table public.aanvragen
  add column if not exists zoek tsvector
  generated always as (
    to_tsvector('simple', coalesce(naam, '') || ' ' || coalesce(email, '') || ' ' || coalesce(toelichting, ''))
  ) stored;

create index if not exists aanvragen_zoek_idx on public.aanvragen using gin (zoek);

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
  migration_source text,
  migration_external_id text,
  migration_source_file text,
  migration_source_row text,
  migration_batch_id text,
  aangemaakt_op timestamptz not null default now(),
  bijgewerkt_op timestamptz not null default now(),
  constraint boekingen_periode_ok check (eind_datum >= start_datum),
  constraint boekingen_migratie_herkomst_uniek unique (migration_source, migration_external_id)
);

create unique index if not exists boekingen_legacy_id_unique
  on public.boekingen (legacy_id) where legacy_id is not null;
create index if not exists boekingen_status_idx on public.boekingen (status);
create index if not exists boekingen_periode_idx on public.boekingen (start_datum, eind_datum);
create index if not exists boekingen_huurder_relatie_id_idx on public.boekingen (huurder_relatie_id);
create index if not exists boekingen_aanvraag_id_idx on public.boekingen (aanvraag_id);
create index if not exists boekingen_migration_external_id_idx
  on public.boekingen (migration_external_id) where migration_external_id is not null;

alter table public.boekingen
  add column if not exists zoek tsvector
  generated always as (
    to_tsvector(
      'simple',
      coalesce(interne_titel, '') || ' ' || coalesce(nummer, '') || ' ' || coalesce(huurder_naam_snapshot, '')
    )
  ) stored;

create index if not exists boekingen_zoek_idx on public.boekingen using gin (zoek);

do $$ begin
  alter table public.aanvragen
    add constraint aanvragen_boeking_id_fkey
    foreign key (boeking_id) references public.boekingen (id);
exception when duplicate_object then null;
end $$;

create index if not exists aanvragen_boeking_id_idx on public.aanvragen (boeking_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'boekingen_een_actieve_optie') then
    alter table public.boekingen
      add constraint boekingen_een_actieve_optie
      exclude using gist (daterange(start_datum, eind_datum, '[]') with &&)
      where (status = 'optie');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'boekingen_geen_dubbele_bezetting') then
    alter table public.boekingen
      add constraint boekingen_geen_dubbele_bezetting
      exclude using gist (daterange(start_datum, eind_datum, '[]') with &&)
      where (status in ('optie', 'definitief'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Agenda, blokkades, communicatie, workflow, finance, audit
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
  inhoud_status public.inhoud_status not null default 'niet_gestart',
  praktische_informatie text,
  beoordeling_toelichting text,
  ingediend_op timestamptz,
  goedgekeurd_op timestamptz,
  goedgekeurd_door uuid references public.profielen (id),
  inhoud_versie integer not null default 0,
  legacy_source text,
  legacy_id text,
  raw_sanity jsonb
);

create index if not exists publieke_activiteiten_boeking_id_idx on public.publieke_activiteiten (boeking_id);
create index if not exists publieke_activiteiten_start_idx on public.publieke_activiteiten (start_datum);
create unique index if not exists publieke_activiteiten_boeking_uniek
  on public.publieke_activiteiten (boeking_id) where boeking_id is not null;

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
  migration_source text,
  migration_external_id text,
  migration_source_file text,
  migration_source_row text,
  migration_batch_id text,
  constraint interne_periode_ok check (eind_datum >= start_datum),
  constraint interne_activiteiten_migratie_herkomst_uniek unique (migration_source, migration_external_id)
);

create index if not exists interne_activiteiten_periode_idx
  on public.interne_activiteiten (start_datum, eind_datum);
create unique index if not exists interne_activiteiten_legacy_uniek
  on public.interne_activiteiten (legacy_id) where legacy_id is not null;
create index if not exists interne_activiteiten_migration_external_id_idx
  on public.interne_activiteiten (migration_external_id) where migration_external_id is not null;

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

create table if not exists public.communicatie_jobs (
  id bigint generated always as identity primary key,
  boeking_id bigint references public.boekingen (id) on delete cascade,
  aanvraag_id bigint references public.aanvragen (id) on delete cascade,
  template_id bigint not null references public.communicatie_templates (id),
  relatie_id bigint references public.relaties (id),
  gepland_op timestamptz,
  status public.communicatie_status not null default 'gepland',
  pogingen integer not null default 0,
  foutmelding text,
  dedup_sleutel text,
  template_sleutel text,
  ontvanger_email text,
  onderwerp text,
  modus text,
  laatste_poging_op timestamptz,
  constraint communicatie_jobs_modus_bekend check (
    modus is null or modus in ('automatisch', 'concept', 'handmatig')
  )
);

create index if not exists communicatie_jobs_status_gepland_idx
  on public.communicatie_jobs (status, gepland_op);
create index if not exists communicatie_jobs_boeking_id_idx on public.communicatie_jobs (boeking_id);
create unique index if not exists communicatie_jobs_dedup_uniek
  on public.communicatie_jobs (dedup_sleutel) where dedup_sleutel is not null;

create table if not exists public.communicatie_pogingen (
  id bigint generated always as identity primary key,
  job_id bigint not null references public.communicatie_jobs (id) on delete cascade,
  poging integer not null,
  status public.communicatie_status not null,
  foutmelding text,
  op timestamptz not null default now(),
  unique (job_id, poging)
);

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
create unique index if not exists communicatie_idempotent_idx
  on public.communicatie_verzendingen (boeking_id, template_id, relatie_id)
  where status = 'verzonden' and test = false;

create table if not exists public.workflow_taken (
  id bigint generated always as identity primary key,
  boeking_id bigint references public.boekingen (id) on delete cascade,
  aanvraag_id bigint references public.aanvragen (id) on delete cascade,
  taak_type text not null,
  status text not null default 'open',
  eigenaar_type text not null,
  eigenaar_profiel_id uuid references public.profielen (id),
  deadline date,
  prioriteit integer not null default 50,
  dedup_sleutel text not null,
  toelichting text,
  afgerond_op timestamptz,
  aangemaakt_op timestamptz not null default now(),
  bijgewerkt_op timestamptz not null default now(),
  constraint workflow_taken_status_bekend check (
    status in ('open', 'bezig', 'afgerond', 'geannuleerd', 'geescaleerd')
  ),
  constraint workflow_taken_eigenaar_bekend check (
    eigenaar_type in ('klant', 'bestuur', 'finance', 'planning', 'systeem')
  ),
  constraint workflow_taken_koppeling check (boeking_id is not null or aanvraag_id is not null)
);

create unique index if not exists workflow_taken_dedup_uniek on public.workflow_taken (dedup_sleutel);
create index if not exists workflow_taken_boeking_idx on public.workflow_taken (boeking_id, status);
create index if not exists workflow_taken_aanvraag_idx on public.workflow_taken (aanvraag_id, status);
create index if not exists workflow_taken_deadline_idx on public.workflow_taken (deadline)
  where status in ('open', 'bezig', 'geescaleerd');

create table if not exists public.toegangstokens (
  id bigint generated always as identity primary key,
  boeking_id bigint references public.boekingen (id) on delete cascade,
  aanvraag_id bigint references public.aanvragen (id) on delete cascade,
  doel text not null,
  token_hash text not null,
  verloopt_op timestamptz not null,
  ingetrokken_op timestamptz,
  gebruikt_op timestamptz,
  aangemaakt_op timestamptz not null default now(),
  constraint toegangstokens_doel_bekend check (doel in ('content', 'meer_informatie')),
  constraint toegangstokens_koppeling check (boeking_id is not null or aanvraag_id is not null)
);

create unique index if not exists toegangstokens_hash_uniek on public.toegangstokens (token_hash);
create index if not exists toegangstokens_boeking_idx on public.toegangstokens (boeking_id, doel);

create table if not exists public.betalingen (
  id bigint generated always as identity primary key,
  boeking_id bigint not null references public.boekingen (id) on delete cascade,
  soort text not null,
  bedrag numeric(10,2) not null,
  status text not null,
  vervaldatum date,
  ontvangen_op timestamptz,
  referentie text,
  migration_source text,
  migration_external_id text,
  migration_source_file text,
  migration_source_row text,
  migration_batch_id text,
  aangemaakt_op timestamptz not null default now(),
  constraint betalingen_soort_bekend check (
    soort in ('aanbetaling', 'restant', 'correctie', 'restitutie', 'historisch')
  ),
  constraint betalingen_status_bekend check (status in ('open', 'ontvangen', 'geannuleerd')),
  constraint betalingen_migratie_herkomst_uniek unique (migration_source, migration_external_id)
);

create unique index if not exists betalingen_aanbetaling_uniek
  on public.betalingen (boeking_id) where soort = 'aanbetaling';
create index if not exists betalingen_boeking_idx on public.betalingen (boeking_id, status);
create index if not exists betalingen_migration_external_id_idx
  on public.betalingen (migration_external_id) where migration_external_id is not null;

create table if not exists public.incidenten (
  id bigint generated always as identity primary key,
  boeking_id bigint not null references public.boekingen (id) on delete cascade,
  omschrijving text not null,
  status text not null default 'open',
  gemeld_door uuid references public.profielen (id),
  gemeld_op timestamptz not null default now(),
  gesloten_op timestamptz,
  constraint incidenten_status_bekend check (status in ('open', 'opgevolgd', 'gesloten'))
);

create index if not exists incidenten_boeking_idx on public.incidenten (boeking_id, status);

create table if not exists public.auditlog (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profielen (id),
  actor_naam text,
  actor_type text,
  onderwerp_type text not null,
  onderwerp_id text,
  actie text not null,
  van text,
  naar text,
  reden text,
  details jsonb,
  dedup_sleutel text,
  op timestamptz not null default now()
);

create index if not exists auditlog_onderwerp_idx on public.auditlog (onderwerp_type, onderwerp_id, op desc);
create index if not exists auditlog_actor_idx on public.auditlog (actor_id, op desc);
create unique index if not exists auditlog_dedup_uniek
  on public.auditlog (dedup_sleutel) where dedup_sleutel is not null;

create or replace function app.auditlog_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Auditlog is niet wijzigbaar';
end;
$$;

revoke all on function app.auditlog_immutable() from public, anon, authenticated;

drop trigger if exists auditlog_geen_update on public.auditlog;
create trigger auditlog_geen_update
  before update or delete on public.auditlog
  for each row execute function app.auditlog_immutable();

-- ---------------------------------------------------------------------------
-- Gastbegeleiders per datumslot. bronwaarde x past niet in type.
-- gastheer_relatie_id op boekingen blijft voor precies één gastheer.
-- ---------------------------------------------------------------------------

create table if not exists public.gastbegeleider_toewijzingen (
  id bigint generated always as identity primary key,
  boeking_id bigint not null references public.boekingen (id) on delete cascade,
  relatie_id bigint not null references public.relaties (id),
  datum date not null,
  type text not null,
  migration_source text,
  migration_external_id text,
  migration_source_file text,
  migration_source_row text,
  migration_batch_id text,
  constraint gastbegeleider_type_bekend check (type in ('dienst', 'assist')),
  constraint gastbegeleider_slot_uniek unique (boeking_id, relatie_id, datum, type),
  constraint gastbegeleider_migratie_herkomst_uniek unique (migration_source, migration_external_id)
);

create index if not exists gastbegeleider_boeking_datum_idx
  on public.gastbegeleider_toewijzingen (boeking_id, datum);
create index if not exists gastbegeleider_relatie_idx
  on public.gastbegeleider_toewijzingen (relatie_id);
create index if not exists gastbegeleider_migration_external_id_idx
  on public.gastbegeleider_toewijzingen (migration_external_id)
  where migration_external_id is not null;

comment on table public.gastbegeleider_toewijzingen is
  'Genormaliseerde gastbegeleider per boeking, datum en type (dienst of assist). Bronwaarde x wordt niet opgeslagen.';

-- ---------------------------------------------------------------------------
-- Pageviews. Geen bezoeker-id. Lezen via analytics-recht.
-- ---------------------------------------------------------------------------

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

create index if not exists page_views_created_at_idx on public.page_views (created_at desc);
create index if not exists page_views_page_key_idx on public.page_views (page_key);
create index if not exists page_views_locale_idx on public.page_views (locale);
create index if not exists page_views_device_type_idx on public.page_views (device_type);
create index if not exists page_views_referrer_host_idx on public.page_views (referrer_host);

insert into public.modules (sleutel, naam, volgorde) values
  ('analytics', 'Analytics', 13)
on conflict (sleutel) do nothing;

insert into public.verhuurtypen (sleutel, naam, dagregel, actief, volgorde) values
  ('expositie', 'Expositie', 'expositie_weekend', true, 1),
  ('bruiloft', 'Bruiloft', 'doordeweeks', true, 2),
  ('concert', 'Concert', 'doordeweeks', true, 3),
  ('diverse', 'Diverse bijeenkomst', 'doordeweeks', true, 4)
on conflict (sleutel) do nothing;

-- ---------------------------------------------------------------------------
-- Views. security_invoker zodat RLS van de onderliggende tabellen geldt.
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
where a.gepubliceerd = true
  and a.inhoud_status = 'goedgekeurd';

-- ---------------------------------------------------------------------------
-- RLS en grants alleen op nieuwe tabellen. Anon krijgt niets.
-- ---------------------------------------------------------------------------

alter table public.verhuurtypen enable row level security;
alter table public.relaties enable row level security;
alter table public.relatie_rollen enable row level security;
alter table public.aanvragen enable row level security;
alter table public.boekingen enable row level security;
alter table public.publieke_activiteiten enable row level security;
alter table public.interne_activiteiten enable row level security;
alter table public.communicatie_templates enable row level security;
alter table public.communicatie_jobs enable row level security;
alter table public.communicatie_pogingen enable row level security;
alter table public.communicatie_verzendingen enable row level security;
alter table public.workflow_taken enable row level security;
alter table public.toegangstokens enable row level security;
alter table public.betalingen enable row level security;
alter table public.incidenten enable row level security;
alter table public.auditlog enable row level security;
alter table public.gastbegeleider_toewijzingen enable row level security;
alter table public.page_views enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'verhuurtypen', 'relaties', 'relatie_rollen', 'aanvragen', 'boekingen',
    'publieke_activiteiten', 'interne_activiteiten', 'communicatie_templates',
    'communicatie_jobs', 'communicatie_pogingen', 'communicatie_verzendingen',
    'workflow_taken', 'toegangstokens', 'betalingen', 'incidenten', 'auditlog',
    'gastbegeleider_toewijzingen'
  ]
  loop
    execute format('revoke all on table public.%I from public, anon', tbl);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', tbl);
  end loop;
end $$;

revoke all on table public.page_views from public, anon, authenticated;
grant select on table public.page_views to authenticated;
grant select, insert on table public.page_views to service_role;

do $$
declare
  seq text;
begin
  for seq in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
      and c.relname <> 'page_views_id_seq'
      and c.relname like any (array[
        'relaties_id_seq', 'aanvragen_id_seq', 'boekingen_id_seq',
        'publieke_activiteiten_id_seq', 'interne_activiteiten_id_seq',
        'communicatie_templates_id_seq', 'communicatie_jobs_id_seq',
        'communicatie_pogingen_id_seq', 'communicatie_verzendingen_id_seq',
        'workflow_taken_id_seq', 'toegangstokens_id_seq', 'betalingen_id_seq',
        'incidenten_id_seq', 'auditlog_id_seq', 'gastbegeleider_toewijzingen_id_seq'
      ])
  loop
    execute format('grant usage, select on sequence public.%I to authenticated', seq);
  end loop;
  if exists (select 1 from pg_class where relname = 'page_views_id_seq' and relkind = 'S') then
    execute 'revoke all on sequence public.page_views_id_seq from public, anon, authenticated';
    execute 'grant usage, select on sequence public.page_views_id_seq to service_role';
  end if;
end $$;

revoke all on public.v_publieke_bezetting from public, anon;
revoke all on public.v_publieke_agenda from public, anon;
grant select on public.v_publieke_bezetting to authenticated;
grant select on public.v_publieke_agenda to authenticated;

do $$ begin
  create policy verhuurtypen_select on public.verhuurtypen
    for select to authenticated
    using (
      (select app.heeft_recht('instellingen', 'lezen'))
      or (select app.heeft_recht('boekingen', 'lezen'))
      or (select app.heeft_recht('aanvragen', 'lezen'))
    );
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy verhuurtypen_schrijven on public.verhuurtypen
    for all to authenticated
    using ((select app.heeft_recht('instellingen', 'schrijven')))
    with check ((select app.heeft_recht('instellingen', 'schrijven')));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy relaties_select on public.relaties
    for select to authenticated using ((select app.heeft_recht('relaties', 'lezen')));
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy relaties_insert on public.relaties
    for insert to authenticated with check ((select app.heeft_recht('relaties', 'schrijven')));
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy relaties_update on public.relaties
    for update to authenticated
    using ((select app.heeft_recht('relaties', 'schrijven')))
    with check ((select app.heeft_recht('relaties', 'schrijven')));
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy relaties_delete on public.relaties
    for delete to authenticated using ((select app.is_super_admin()));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy relatie_rollen_select on public.relatie_rollen
    for select to authenticated using ((select app.heeft_recht('relaties', 'lezen')));
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy relatie_rollen_schrijven on public.relatie_rollen
    for all to authenticated
    using ((select app.heeft_recht('relaties', 'schrijven')))
    with check ((select app.heeft_recht('relaties', 'schrijven')));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy aanvragen_select on public.aanvragen
    for select to authenticated using ((select app.heeft_recht('aanvragen', 'lezen')));
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy aanvragen_insert on public.aanvragen
    for insert to authenticated with check ((select app.heeft_recht('aanvragen', 'schrijven')));
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy aanvragen_update on public.aanvragen
    for update to authenticated
    using ((select app.heeft_recht('aanvragen', 'schrijven')))
    with check ((select app.heeft_recht('aanvragen', 'schrijven')));
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy aanvragen_delete on public.aanvragen
    for delete to authenticated using ((select app.is_super_admin()));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy boekingen_select on public.boekingen
    for select to authenticated using ((select app.heeft_recht('boekingen', 'lezen')));
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy boekingen_insert on public.boekingen
    for insert to authenticated with check ((select app.heeft_recht('boekingen', 'schrijven')));
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy boekingen_update on public.boekingen
    for update to authenticated
    using ((select app.heeft_recht('boekingen', 'schrijven')))
    with check ((select app.heeft_recht('boekingen', 'schrijven')));
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy boekingen_delete on public.boekingen
    for delete to authenticated using ((select app.is_super_admin()));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy publieke_activiteiten_select on public.publieke_activiteiten
    for select to authenticated using ((select app.heeft_recht('agenda', 'lezen')));
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy publieke_activiteiten_schrijven on public.publieke_activiteiten
    for all to authenticated
    using ((select app.heeft_recht('agenda', 'schrijven')))
    with check ((select app.heeft_recht('agenda', 'schrijven')));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy interne_activiteiten_select on public.interne_activiteiten
    for select to authenticated using ((select app.heeft_recht('kalender', 'lezen')));
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy interne_activiteiten_schrijven on public.interne_activiteiten
    for all to authenticated
    using ((select app.heeft_recht('kalender', 'schrijven')))
    with check ((select app.heeft_recht('kalender', 'schrijven')));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy templates_select on public.communicatie_templates
    for select to authenticated using ((select app.heeft_recht('templates', 'lezen')));
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy templates_schrijven on public.communicatie_templates
    for all to authenticated
    using ((select app.heeft_recht('templates', 'schrijven')))
    with check ((select app.heeft_recht('templates', 'schrijven')));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy jobs_select on public.communicatie_jobs
    for select to authenticated using (
      (select app.heeft_recht('templates', 'lezen'))
      or (select app.heeft_recht('boekingen', 'lezen'))
    );
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy jobs_schrijven on public.communicatie_jobs
    for all to authenticated
    using (
      (select app.heeft_recht('templates', 'schrijven'))
      or (select app.heeft_recht('boekingen', 'schrijven'))
    )
    with check (
      (select app.heeft_recht('templates', 'schrijven'))
      or (select app.heeft_recht('boekingen', 'schrijven'))
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy pogingen_select on public.communicatie_pogingen
    for select to authenticated using (
      (select app.heeft_recht('templates', 'lezen'))
      or (select app.heeft_recht('boekingen', 'lezen'))
    );
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy pogingen_insert on public.communicatie_pogingen
    for insert to authenticated with check (
      (select app.heeft_recht('templates', 'schrijven'))
      or (select app.heeft_recht('boekingen', 'schrijven'))
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy verzendingen_select on public.communicatie_verzendingen
    for select to authenticated using (
      (select app.heeft_recht('templates', 'lezen'))
      or (select app.heeft_recht('boekingen', 'lezen'))
    );
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy verzendingen_insert on public.communicatie_verzendingen
    for insert to authenticated with check (
      (select app.heeft_recht('templates', 'schrijven'))
      or (select app.heeft_recht('boekingen', 'schrijven'))
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy workflow_taken_select on public.workflow_taken
    for select to authenticated using (
      (select app.heeft_recht('boekingen', 'lezen'))
      or (select app.heeft_recht('aanvragen', 'lezen'))
    );
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy workflow_taken_schrijven on public.workflow_taken
    for all to authenticated
    using (
      (select app.heeft_recht('boekingen', 'schrijven'))
      or (select app.heeft_recht('aanvragen', 'schrijven'))
    )
    with check (
      (select app.heeft_recht('boekingen', 'schrijven'))
      or (select app.heeft_recht('aanvragen', 'schrijven'))
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy toegangstokens_select on public.toegangstokens
    for select to authenticated using ((select app.heeft_recht('boekingen', 'lezen')));
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy toegangstokens_schrijven on public.toegangstokens
    for all to authenticated
    using ((select app.heeft_recht('boekingen', 'schrijven')))
    with check ((select app.heeft_recht('boekingen', 'schrijven')));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy betalingen_select on public.betalingen
    for select to authenticated using ((select app.heeft_recht('finance', 'lezen')));
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy betalingen_schrijven on public.betalingen
    for all to authenticated
    using ((select app.heeft_recht('finance', 'schrijven')))
    with check ((select app.heeft_recht('finance', 'schrijven')));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy incidenten_select on public.incidenten
    for select to authenticated using ((select app.heeft_recht('boekingen', 'lezen')));
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy incidenten_schrijven on public.incidenten
    for all to authenticated
    using ((select app.heeft_recht('boekingen', 'schrijven')))
    with check ((select app.heeft_recht('boekingen', 'schrijven')));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy auditlog_select on public.auditlog
    for select to authenticated using ((select app.is_super_admin()));
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy auditlog_insert on public.auditlog
    for insert to authenticated with check ((select auth.uid()) is not null);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy gastbegeleider_select on public.gastbegeleider_toewijzingen
    for select to authenticated using ((select app.heeft_recht('boekingen', 'lezen')));
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy gastbegeleider_schrijven on public.gastbegeleider_toewijzingen
    for all to authenticated
    using ((select app.heeft_recht('boekingen', 'schrijven')))
    with check ((select app.heeft_recht('boekingen', 'schrijven')));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy page_views_lezen on public.page_views
    for select to authenticated using ((select app.heeft_recht('analytics', 'lezen')));
exception when duplicate_object then null;
end $$;

-- Runtime-RPC pas_continuiteit_mutaties. Alleen service_role.

create or replace function public.pas_continuiteit_mutaties(p_mutaties jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  refs jsonb := '{}'::jsonb;
  velden jsonb;
  new_id bigint;
  v_id bigint;
  v_boeking bigint;
  v_aanvraag bigint;
  v_relatie bigint;
  v_template bigint;
begin
  if p_mutaties is null or jsonb_typeof(p_mutaties) <> 'array' then
    raise exception 'mutaties moeten een json-array zijn';
  end if;

  for item in select value from jsonb_array_elements(p_mutaties)
  loop
    velden := coalesce(item->'velden', '{}'::jsonb);
    new_id := null;

    if item->>'soort' = 'insert_relatie' then
      insert into public.relaties (naam, email, telefoon, adres)
      values (
        velden->>'naam',
        nullif(velden->>'email', ''),
        nullif(velden->>'telefoon', ''),
        nullif(velden->>'adres', '')
      )
      returning id into new_id;
      refs := refs || jsonb_build_object(item->>'ref', new_id);

    elsif item->>'soort' = 'insert_aanvraag' then
      v_relatie := coalesce(
        nullif(velden->>'relatie_id', '')::bigint,
        nullif(refs->>(item->>'relatie_ref'), '')::bigint
      );
      insert into public.aanvragen (
        status, naam, email, telefoon, adres, verhuurtype_sleutel,
        start_datum, eind_datum, aantal_personen, toelichting, website,
        relatie_id, beoordeling_deadline, informatievraag, legacy_source, legacy_id
      ) values (
        coalesce((velden->>'status')::public.aanvraag_status, 'nieuw'),
        velden->>'naam',
        velden->>'email',
        nullif(velden->>'telefoon', ''),
        nullif(velden->>'adres', ''),
        nullif(velden->>'verhuurtype_sleutel', ''),
        nullif(velden->>'start_datum', '')::date,
        nullif(velden->>'eind_datum', '')::date,
        nullif(velden->>'aantal_personen', ''),
        nullif(velden->>'toelichting', ''),
        nullif(velden->>'website', ''),
        v_relatie,
        nullif(velden->>'beoordeling_deadline', '')::date,
        nullif(velden->>'informatievraag', ''),
        nullif(velden->>'legacy_source', ''),
        nullif(velden->>'legacy_id', '')
      )
      returning id into new_id;
      refs := refs || jsonb_build_object(item->>'ref', new_id);

    elsif item->>'soort' = 'update_aanvraag' then
      v_id := coalesce(
        nullif(item->>'id', '')::bigint,
        nullif(refs->>(item->>'ref'), '')::bigint
      );
      update public.aanvragen set
        status = case when velden ? 'status' then (velden->>'status')::public.aanvraag_status else status end,
        afwijsreden = case when velden ? 'afwijsreden' then velden->>'afwijsreden' else afwijsreden end,
        informatievraag = case when velden ? 'informatievraag' then velden->>'informatievraag' else informatievraag end,
        informatie_ontvangen_op = case
          when velden ? 'informatie_ontvangen_op' then nullif(velden->>'informatie_ontvangen_op', '')::timestamptz
          else informatie_ontvangen_op end,
        toelichting = case when velden ? 'toelichting' then velden->>'toelichting' else toelichting end,
        boeking_id = case
          when velden ? 'boeking_id' then nullif(velden->>'boeking_id', '')::bigint
          when item ? 'boeking_ref' then nullif(refs->>(item->>'boeking_ref'), '')::bigint
          else boeking_id end
      where id = v_id;

    elsif item->>'soort' = 'insert_boeking' then
      v_relatie := coalesce(
        nullif(velden->>'huurder_relatie_id', '')::bigint,
        nullif(refs->>(item->>'relatie_ref'), '')::bigint
      );
      v_aanvraag := coalesce(
        nullif(velden->>'aanvraag_id', '')::bigint,
        nullif(refs->>(item->>'aanvraag_ref'), '')::bigint
      );
      insert into public.boekingen (
        nummer, status, verhuurtype_sleutel, interne_titel, start_datum, eind_datum,
        huurder_relatie_id, gastheer_relatie_id, aanvraag_id,
        huurder_naam_snapshot, huurder_email_snapshot, huurder_telefoon_snapshot, huurder_adres_snapshot,
        aantal_personen, toelichting, website,
        tarief_prijstype, tarief_bedrag, tarief_geldig_vanaf, tarief_vastgelegd_op,
        aanbetaling_standaard, aanbetaling_bedrag, aanbetaling_ontvangen,
        optie_aangemaakt_op, optietermijn_dagen, optie_einddatum,
        legacy_source, legacy_id
      ) values (
        nullif(velden->>'nummer', ''),
        coalesce((velden->>'status')::public.boeking_status, 'optie'),
        nullif(velden->>'verhuurtype_sleutel', ''),
        velden->>'interne_titel',
        (velden->>'start_datum')::date,
        (velden->>'eind_datum')::date,
        v_relatie,
        nullif(velden->>'gastheer_relatie_id', '')::bigint,
        v_aanvraag,
        nullif(velden->>'huurder_naam_snapshot', ''),
        nullif(velden->>'huurder_email_snapshot', ''),
        nullif(velden->>'huurder_telefoon_snapshot', ''),
        nullif(velden->>'huurder_adres_snapshot', ''),
        nullif(velden->>'aantal_personen', ''),
        nullif(velden->>'toelichting', ''),
        nullif(velden->>'website', ''),
        nullif(velden->>'tarief_prijstype', '')::public.prijstype,
        nullif(velden->>'tarief_bedrag', '')::numeric,
        nullif(velden->>'tarief_geldig_vanaf', '')::date,
        nullif(velden->>'tarief_vastgelegd_op', '')::date,
        nullif(velden->>'aanbetaling_standaard', '')::numeric,
        nullif(velden->>'aanbetaling_bedrag', '')::numeric,
        coalesce((velden->>'aanbetaling_ontvangen')::boolean, false),
        nullif(velden->>'optie_aangemaakt_op', '')::date,
        nullif(velden->>'optietermijn_dagen', '')::integer,
        nullif(velden->>'optie_einddatum', '')::date,
        nullif(velden->>'legacy_source', ''),
        nullif(velden->>'legacy_id', '')
      )
      returning id into new_id;
      refs := refs || jsonb_build_object(item->>'ref', new_id);

    elsif item->>'soort' = 'update_boeking' then
      v_id := coalesce(nullif(item->>'id', '')::bigint, nullif(refs->>(item->>'ref'), '')::bigint);
      update public.boekingen set
        status = case when velden ? 'status' then (velden->>'status')::public.boeking_status else status end,
        gastheer_relatie_id = case
          when velden ? 'gastheer_relatie_id' then nullif(velden->>'gastheer_relatie_id', '')::bigint
          else gastheer_relatie_id end,
        aanbetaling_ontvangen = case
          when velden ? 'aanbetaling_ontvangen' then (velden->>'aanbetaling_ontvangen')::boolean
          else aanbetaling_ontvangen end,
        aanbetaling_ontvangen_op = case
          when velden ? 'aanbetaling_ontvangen_op' then nullif(velden->>'aanbetaling_ontvangen_op', '')::timestamptz
          else aanbetaling_ontvangen_op end,
        optie_einddatum = case
          when velden ? 'optie_einddatum' then nullif(velden->>'optie_einddatum', '')::date
          else optie_einddatum end,
        optietermijn_dagen = case
          when velden ? 'optietermijn_dagen' then nullif(velden->>'optietermijn_dagen', '')::integer
          else optietermijn_dagen end,
        bijgewerkt_op = now()
      where id = v_id;

    elsif item->>'soort' = 'upsert_publiek' then
      v_boeking := coalesce(
        nullif(velden->>'boeking_id', '')::bigint,
        nullif(refs->>(item->>'boeking_ref'), '')::bigint
      );
      insert into public.publieke_activiteiten (
        boeking_id, titel, slug, omschrijving, start_datum, eind_datum,
        publicatie_trigger, gepubliceerd, gepubliceerd_op, inhoud_status,
        praktische_informatie, beoordeling_toelichting, ingediend_op,
        goedgekeurd_op, goedgekeurd_door, inhoud_versie, foto_pad, foto_alt, legacy_source, legacy_id
      ) values (
        v_boeking,
        nullif(velden->>'titel', ''),
        nullif(velden->>'slug', ''),
        nullif(velden->>'omschrijving', ''),
        (velden->>'start_datum')::date,
        (velden->>'eind_datum')::date,
        coalesce((velden->>'publicatie_trigger')::public.publicatie_trigger, 'zodra_content_compleet'),
        coalesce((velden->>'gepubliceerd')::boolean, false),
        nullif(velden->>'gepubliceerd_op', '')::timestamptz,
        coalesce((velden->>'inhoud_status')::public.inhoud_status, 'niet_gestart'),
        nullif(velden->>'praktische_informatie', ''),
        nullif(velden->>'beoordeling_toelichting', ''),
        nullif(velden->>'ingediend_op', '')::timestamptz,
        nullif(velden->>'goedgekeurd_op', '')::timestamptz,
        nullif(velden->>'goedgekeurd_door', '')::uuid,
        coalesce(nullif(velden->>'inhoud_versie', '')::integer, 0),
        nullif(velden->>'foto_pad', ''),
        nullif(velden->>'foto_alt', ''),
        nullif(velden->>'legacy_source', ''),
        nullif(velden->>'legacy_id', '')
      )
      on conflict (boeking_id) where boeking_id is not null do update set
        titel = coalesce(excluded.titel, public.publieke_activiteiten.titel),
        slug = coalesce(excluded.slug, public.publieke_activiteiten.slug),
        omschrijving = coalesce(excluded.omschrijving, public.publieke_activiteiten.omschrijving),
        publicatie_trigger = excluded.publicatie_trigger,
        gepubliceerd = excluded.gepubliceerd,
        gepubliceerd_op = coalesce(excluded.gepubliceerd_op, public.publieke_activiteiten.gepubliceerd_op),
        inhoud_status = excluded.inhoud_status,
        praktische_informatie = coalesce(excluded.praktische_informatie, public.publieke_activiteiten.praktische_informatie),
        beoordeling_toelichting = coalesce(excluded.beoordeling_toelichting, public.publieke_activiteiten.beoordeling_toelichting),
        ingediend_op = coalesce(excluded.ingediend_op, public.publieke_activiteiten.ingediend_op),
        goedgekeurd_op = coalesce(excluded.goedgekeurd_op, public.publieke_activiteiten.goedgekeurd_op),
        goedgekeurd_door = coalesce(excluded.goedgekeurd_door, public.publieke_activiteiten.goedgekeurd_door),
        inhoud_versie = excluded.inhoud_versie,
        foto_pad = coalesce(excluded.foto_pad, public.publieke_activiteiten.foto_pad),
        foto_alt = coalesce(excluded.foto_alt, public.publieke_activiteiten.foto_alt);

    elsif item->>'soort' = 'upsert_taak' then
      v_boeking := coalesce(nullif(velden->>'boeking_id', '')::bigint, nullif(refs->>(item->>'boeking_ref'), '')::bigint);
      v_aanvraag := coalesce(nullif(velden->>'aanvraag_id', '')::bigint, nullif(refs->>(item->>'aanvraag_ref'), '')::bigint);
      insert into public.workflow_taken (
        boeking_id, aanvraag_id, taak_type, status, eigenaar_type, deadline, prioriteit, dedup_sleutel, toelichting, afgerond_op
      ) values (
        v_boeking,
        v_aanvraag,
        velden->>'taak_type',
        coalesce(velden->>'status', 'open'),
        velden->>'eigenaar_type',
        nullif(velden->>'deadline', '')::date,
        coalesce(nullif(velden->>'prioriteit', '')::integer, 50),
        velden->>'dedup_sleutel',
        nullif(velden->>'toelichting', ''),
        nullif(velden->>'afgerond_op', '')::timestamptz
      )
      on conflict (dedup_sleutel) do update set
        status = excluded.status,
        deadline = excluded.deadline,
        toelichting = coalesce(excluded.toelichting, public.workflow_taken.toelichting),
        afgerond_op = coalesce(excluded.afgerond_op, public.workflow_taken.afgerond_op),
        bijgewerkt_op = now()
      where public.workflow_taken.status is distinct from 'afgerond'
         or excluded.status = 'afgerond';

    elsif item->>'soort' = 'upsert_job' then
      v_boeking := coalesce(nullif(velden->>'boeking_id', '')::bigint, nullif(refs->>(item->>'boeking_ref'), '')::bigint);
      v_aanvraag := coalesce(nullif(velden->>'aanvraag_id', '')::bigint, nullif(refs->>(item->>'aanvraag_ref'), '')::bigint);
      v_template := coalesce(nullif(velden->>'template_id', '')::bigint, nullif(refs->>(item->>'template_ref'), '')::bigint);
      if v_template is null and nullif(velden->>'template_sleutel', '') is not null then
        select id into v_template from public.communicatie_templates where sleutel = velden->>'template_sleutel';
      end if;
      if v_template is null then
        raise exception 'mailtemplate ontbreekt: %', coalesce(velden->>'template_sleutel', '(leeg)');
      end if;
      insert into public.communicatie_jobs (
        boeking_id, aanvraag_id, template_id, relatie_id, gepland_op, status, pogingen, foutmelding,
        dedup_sleutel, template_sleutel, ontvanger_email, onderwerp, modus, laatste_poging_op
      ) values (
        v_boeking,
        v_aanvraag,
        v_template,
        nullif(velden->>'relatie_id', '')::bigint,
        nullif(velden->>'gepland_op', '')::timestamptz,
        coalesce((velden->>'status')::public.communicatie_status, 'gepland'),
        coalesce(nullif(velden->>'pogingen', '')::integer, 0),
        nullif(velden->>'foutmelding', ''),
        velden->>'dedup_sleutel',
        nullif(velden->>'template_sleutel', ''),
        nullif(velden->>'ontvanger_email', ''),
        nullif(velden->>'onderwerp', ''),
        nullif(velden->>'modus', ''),
        nullif(velden->>'laatste_poging_op', '')::timestamptz
      )
      on conflict (dedup_sleutel) where dedup_sleutel is not null do update set
        status = excluded.status,
        pogingen = excluded.pogingen,
        foutmelding = excluded.foutmelding,
        gepland_op = excluded.gepland_op,
        onderwerp = coalesce(excluded.onderwerp, public.communicatie_jobs.onderwerp),
        laatste_poging_op = coalesce(excluded.laatste_poging_op, public.communicatie_jobs.laatste_poging_op)
      where public.communicatie_jobs.status is distinct from 'verzonden'
      returning id into new_id;
      if item ? 'ref' and new_id is not null then
        refs := refs || jsonb_build_object(item->>'ref', new_id);
      end if;

    elsif item->>'soort' = 'insert_audit' then
      insert into public.auditlog (
        actor_id, actor_naam, actor_type, onderwerp_type, onderwerp_id, actie, van, naar, reden, details, dedup_sleutel
      ) values (
        nullif(velden->>'actor_id', '')::uuid,
        nullif(velden->>'actor_naam', ''),
        nullif(velden->>'actor_type', ''),
        velden->>'onderwerp_type',
        velden->>'onderwerp_id',
        velden->>'actie',
        nullif(velden->>'van', ''),
        nullif(velden->>'naar', ''),
        nullif(velden->>'reden', ''),
        velden->'details',
        nullif(velden->>'dedup_sleutel', '')
      )
      on conflict (dedup_sleutel) where dedup_sleutel is not null do nothing;

    elsif item->>'soort' = 'insert_token' then
      v_boeking := coalesce(nullif(velden->>'boeking_id', '')::bigint, nullif(refs->>(item->>'boeking_ref'), '')::bigint);
      v_aanvraag := coalesce(nullif(velden->>'aanvraag_id', '')::bigint, nullif(refs->>(item->>'aanvraag_ref'), '')::bigint);
      insert into public.toegangstokens (boeking_id, aanvraag_id, doel, token_hash, verloopt_op)
      values (
        v_boeking,
        v_aanvraag,
        velden->>'doel',
        velden->>'token_hash',
        (velden->>'verloopt_op')::timestamptz
      )
      on conflict (token_hash) do nothing;

    elsif item->>'soort' = 'update_token' then
      v_id := nullif(item->>'id', '')::bigint;
      update public.toegangstokens set
        ingetrokken_op = case when velden ? 'ingetrokken_op' then nullif(velden->>'ingetrokken_op', '')::timestamptz else ingetrokken_op end,
        gebruikt_op = case when velden ? 'gebruikt_op' then nullif(velden->>'gebruikt_op', '')::timestamptz else gebruikt_op end
      where id = v_id;

    elsif item->>'soort' = 'upsert_betaling' then
      v_boeking := coalesce(nullif(velden->>'boeking_id', '')::bigint, nullif(refs->>(item->>'boeking_ref'), '')::bigint);
      insert into public.betalingen (boeking_id, soort, bedrag, status, vervaldatum, ontvangen_op, referentie)
      values (
        v_boeking,
        velden->>'soort',
        (velden->>'bedrag')::numeric,
        velden->>'status',
        nullif(velden->>'vervaldatum', '')::date,
        nullif(velden->>'ontvangen_op', '')::timestamptz,
        nullif(velden->>'referentie', '')
      )
      on conflict (boeking_id) where soort = 'aanbetaling' do nothing;

    elsif item->>'soort' = 'insert_incident' then
      v_boeking := coalesce(nullif(velden->>'boeking_id', '')::bigint, nullif(refs->>(item->>'boeking_ref'), '')::bigint);
      insert into public.incidenten (boeking_id, omschrijving, status, gemeld_door)
      values (
        v_boeking,
        velden->>'omschrijving',
        coalesce(velden->>'status', 'open'),
        nullif(velden->>'gemeld_door', '')::uuid
      );

    elsif item->>'soort' = 'update_incident' then
      update public.incidenten set
        status = coalesce(velden->>'status', status),
        gesloten_op = case when velden ? 'gesloten_op' then nullif(velden->>'gesloten_op', '')::timestamptz else gesloten_op end
      where id = nullif(item->>'id', '')::bigint;

    elsif item->>'soort' = 'insert_poging' then
      insert into public.communicatie_pogingen (job_id, poging, status, foutmelding)
      values (
        coalesce(nullif(velden->>'job_id', '')::bigint, nullif(refs->>(item->>'job_ref'), '')::bigint),
        (velden->>'poging')::integer,
        (velden->>'status')::public.communicatie_status,
        nullif(velden->>'foutmelding', '')
      )
      on conflict (job_id, poging) do nothing;

    elsif item->>'soort' = 'insert_verzending' then
      insert into public.communicatie_verzendingen (
        boeking_id, template_id, relatie_id, email_op_verzendmoment, gepland_op, verzonden_op,
        status, foutmelding, handmatig, test
      ) values (
        nullif(velden->>'boeking_id', '')::bigint,
        nullif(velden->>'template_id', '')::bigint,
        nullif(velden->>'relatie_id', '')::bigint,
        nullif(velden->>'email_op_verzendmoment', ''),
        nullif(velden->>'gepland_op', '')::timestamptz,
        nullif(velden->>'verzonden_op', '')::timestamptz,
        (velden->>'status')::public.communicatie_status,
        nullif(velden->>'foutmelding', ''),
        coalesce((velden->>'handmatig')::boolean, false),
        coalesce((velden->>'test')::boolean, false)
      );

    elsif item->>'soort' = 'insert_intern' then
      insert into public.interne_activiteiten (
        titel, start_datum, eind_datum, blokkeert_verhuurkalender, notities, legacy_source, legacy_id
      ) values (
        velden->>'titel',
        (velden->>'start_datum')::date,
        (velden->>'eind_datum')::date,
        coalesce((velden->>'blokkeert_verhuurkalender')::boolean, false),
        nullif(velden->>'notities', ''),
        nullif(velden->>'legacy_source', ''),
        nullif(velden->>'legacy_id', '')
      )
      on conflict do nothing;

    else
      raise exception 'onbekende mutatie: %', item->>'soort';
    end if;
  end loop;

  return refs;
end;
$$;

revoke all on function public.pas_continuiteit_mutaties(jsonb) from public, anon, authenticated;
grant execute on function public.pas_continuiteit_mutaties(jsonb) to service_role;
