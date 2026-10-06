-- 7 en 8 november 2026 is de expositie van Modelschildergroep ten Haltert
-- (Hans Peters en Ineke Christiaans). In Sanity staat die publiek, maar de
-- geïmporteerde bron was nog verborgen als testrecord. Daardoor bleef het
-- weekend via verhuur boekbaar en ontbrak de activiteit op de agenda.

update public.activiteit_bron
set
  zichtbaarheid = 'publiek',
  soort = 'expositie',
  titel = 'Expositie Hans Peters icm Ineke Christiaans',
  interne_titel = 'Expositie van Modelschildergroep ten Haltert',
  start_datum = date '2026-11-07',
  eind_datum = date '2026-11-08',
  op_publieke_agenda = true
where legacy_source = 'sanity'
  and legacy_id = 'tK6YSvZ1UTtMScmpBoQ6pf'
  and coalesce(levenscyclus, 'actief') <> 'geannuleerd';

insert into public.publieke_activiteiten (
  titel,
  slug,
  start_datum,
  eind_datum,
  zichtbaarheid,
  gepubliceerd,
  gepubliceerd_op,
  publicatie_trigger,
  exposanten,
  legacy_source,
  legacy_id,
  contentstatus
)
select
  'Expositie Hans Peters icm Ineke Christiaans',
  'expositie-hans-peters-icm-ineke-christiaans',
  date '2026-11-07',
  date '2026-11-08',
  'publiek',
  true,
  now(),
  'direct',
  'Hans Peters en Ineke Christiaans',
  'sanity',
  'tK6YSvZ1UTtMScmpBoQ6pf',
  'niet_aangeleverd'
where not exists (
  select 1
  from public.publieke_activiteiten bestaand
  where bestaand.legacy_id = 'tK6YSvZ1UTtMScmpBoQ6pf'
);

update public.publieke_activiteiten
set
  titel = 'Expositie Hans Peters icm Ineke Christiaans',
  slug = coalesce(nullif(btrim(slug), ''), 'expositie-hans-peters-icm-ineke-christiaans'),
  start_datum = date '2026-11-07',
  eind_datum = date '2026-11-08',
  zichtbaarheid = 'publiek',
  gepubliceerd = true,
  publicatie_trigger = 'direct',
  exposanten = coalesce(nullif(btrim(exposanten), ''), 'Hans Peters en Ineke Christiaans'),
  contentstatus = coalesce(contentstatus, 'niet_aangeleverd'),
  levenscyclus = 'actief'
where legacy_source = 'sanity'
  and legacy_id = 'tK6YSvZ1UTtMScmpBoQ6pf'
  and coalesce(levenscyclus, 'actief') <> 'geannuleerd';
