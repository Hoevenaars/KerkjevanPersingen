-- 26 en 27 december 2026 horen bij de winterstop, maar ontbraken als blokkade.
-- Dit blijft beperkt tot de verhuurkalender. De publieke agenda toont het niet.

insert into public.interne_activiteiten (
  titel,
  start_datum,
  eind_datum,
  blokkeert_verhuurkalender,
  legacy_source,
  legacy_id,
  notities
)
select
  'Winterstop',
  date '2026-12-26',
  date '2026-12-27',
  true,
  'correctie',
  'BLK-2026-kerstweekend',
  'Kerstweekend ontbrak in de winterstop.'
where not exists (
  select 1
  from public.interne_activiteiten bestaand
  where bestaand.blokkeert_verhuurkalender
    and bestaand.start_datum <= date '2026-12-27'
    and bestaand.eind_datum >= date '2026-12-26'
);
