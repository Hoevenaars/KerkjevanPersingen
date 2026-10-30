-- Bronregistratie voor de historische huuroverzichten 2026–2029.
-- Eén generieke auditrij per Excel-bronregel. Geen tweede reserveringsmodel.
-- Bestaande boekingen, relaties, betalingen en blokkades blijven de domeindata.

create table if not exists public.import_bronregels (
  id bigint generated always as identity primary key,
  migration_source text not null,
  source_fingerprint text not null,
  source_file text not null,
  source_year integer not null,
  source_row integer not null,
  source_sheet text,
  row_type text,
  uitkomst text not null,
  doel_tabel text,
  doel_id bigint,
  waarschuwingen jsonb not null default '[]'::jsonb,
  conflicten jsonb not null default '[]'::jsonb,
  veld_aanvullingen jsonb not null default '[]'::jsonb,
  payload jsonb not null,
  batch_id text,
  aangemaakt_op timestamptz not null default now(),
  bijgewerkt_op timestamptz not null default now(),
  constraint import_bronregels_herkomst_uniek unique (migration_source, source_fingerprint)
);

create index if not exists import_bronregels_jaar_idx
  on public.import_bronregels (source_year, source_row);

create index if not exists import_bronregels_doel_idx
  on public.import_bronregels (doel_tabel, doel_id);

comment on table public.import_bronregels is
  'Herleidbaarheid van geïmporteerde bronregels. payload bewaart de ruwe Excel-waarden. uitkomst beschrijft de importbeslissing en overschrijft geen domeindata.';

alter table public.import_bronregels enable row level security;

revoke all on table public.import_bronregels from public, anon;
grant select on table public.import_bronregels to authenticated;
grant select, insert, update, delete on table public.import_bronregels to service_role;

grant usage, select on sequence public.import_bronregels_id_seq to service_role;

do $$ begin
  create policy import_bronregels_select on public.import_bronregels
    for select to authenticated
    using ((select app.heeft_recht('boekingen', 'lezen')));
exception when duplicate_object or duplicate_table then null;
end $$;
