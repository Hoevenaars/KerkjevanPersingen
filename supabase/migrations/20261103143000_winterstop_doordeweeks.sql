-- De winterstop stond alleen op zaterdag en zondag, omdat het huuroverzicht
-- per weekend is bijgehouden. De dagen ertussen bleven daardoor vrij op de
-- verhuurkalender en in beheer. Elk aaneengesloten seizoen blokkeert nu van
-- de eerste winterstopdag tot en met de laatste, ook doordeweeks.
--
-- 23/24 en 30/31 december 2028 stonden in het overzicht van 2028 als
-- "winterstop" zonder leesbare datum (rijen 69 en 70, direct na 16/17
-- december) en zijn nooit als blokkade opgeslagen. Die weekenden horen bij
-- het seizoen dat doorloopt tot en met 18 februari 2029.

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
  seizoen.start_datum,
  seizoen.eind_datum,
  true,
  'correctie',
  seizoen.legacy_id,
  'Winterstop blokkeert de hele periode, ook doordeweekse dagen.'
from (
  values
    ('BLK-winterstop-seizoen-2026-12-19'::text, date '2026-12-19', date '2027-02-14'),
    ('BLK-winterstop-seizoen-2027-12-18', date '2027-12-18', date '2028-02-13'),
    ('BLK-winterstop-seizoen-2028-12-23', date '2028-12-23', date '2029-02-18'),
    ('BLK-winterstop-seizoen-2029-12-15', date '2029-12-15', date '2029-12-30')
) as seizoen(legacy_id, start_datum, eind_datum)
where not exists (
  select 1
  from public.interne_activiteiten bestaand
  where bestaand.legacy_id = seizoen.legacy_id
     or (
       bestaand.blokkeert_verhuurkalender
       and bestaand.start_datum <= seizoen.start_datum
       and bestaand.eind_datum >= seizoen.eind_datum
     )
);
