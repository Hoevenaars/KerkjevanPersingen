-- De gereed-regel ontbrak omdat alleen het instellingenformulier hem wegschrijft.
-- Leeg of afwezig blokkeert de checklist niet. De opgeslagen waarde volgt die checklist.
insert into public.instellingen (sleutel, groep, waarde, toelichting)
values (
  'documentenflow_gereed_regel',
  'documentenflow',
  to_jsonb('ondertekend_en_aanbetaling'::text),
  'Boeking wordt definitief volgens de checklist: goedgekeurde aanvraag, ondertekende goedgekeurde contractversie, en de aanbetaling als die vereist is. Een ontbrekende waarde blokkeert die overgang niet.'
)
on conflict (sleutel) do nothing;

-- Alleen opties waarvan de checklist aantoonbaar compleet is.
-- Een overlappende optie of definitieve boeking blijft staan: de bezettingsconstraint laat dat niet toe.
create temporary table _definitief_kandidaten as
with laatste as (
  select distinct on (boeking_id)
    boeking_id,
    ondertekening,
    bestuur,
    bestuur_verplicht
  from public.contractversies
  order by boeking_id, versie desc
),
aanbetaling as (
  select
    boeking_id,
    bool_or(status = 'ontvangen') as ontvangen,
    bool_or(status = 'open') as open
  from public.betalingen
  where soort = 'aanbetaling'
    and status <> 'geannuleerd'
  group by boeking_id
)
select b.id
from public.boekingen b
join public.aanvragen a on a.id = b.aanvraag_id and a.status = 'goedgekeurd'
join laatste v on v.boeking_id = b.id
left join aanbetaling p on p.boeking_id = b.id
where b.status in ('optie', 'optie_verlopen')
  and v.ondertekening = 'ontvangen'
  and (v.bestuur = 'akkoord' or v.bestuur_verplicht is not true)
  and (
    coalesce(b.aanbetaling_bedrag, 0) <= 0
    or (coalesce(p.ontvangen, false) and not coalesce(p.open, false))
    or (p.boeking_id is null and b.aanbetaling_ontvangen)
  )
  and not exists (
    select 1
    from public.boekingen ander
    where ander.id <> b.id
      and ander.status in ('optie', 'definitief')
      and daterange(ander.start_datum, ander.eind_datum, '[]') && daterange(b.start_datum, b.eind_datum, '[]')
  );

update public.boekingen b
set
  status = 'definitief',
  optie_einddatum = null,
  bijgewerkt_op = now()
from _definitief_kandidaten k
where b.id = k.id
  and b.status in ('optie', 'optie_verlopen');

insert into public.auditlog (
  actor_naam,
  actor_type,
  onderwerp_type,
  onderwerp_id,
  actie,
  van,
  naar,
  reden,
  dedup_sleutel
)
select
  'Checklist',
  'systeem',
  'boeking',
  k.id::text,
  'automatisch_definitief',
  'optie',
  'definitief',
  'Checklist compleet: goedgekeurde aanvraag, ondertekende contractversie en aanbetaling. Er is geen mail verstuurd.',
  'boeking:' || k.id || ':automatisch_definitief'
from _definitief_kandidaten k
where not exists (
  select 1
  from public.auditlog bestaand
  where bestaand.dedup_sleutel = 'boeking:' || k.id || ':automatisch_definitief'
);

insert into public.publieke_activiteiten (
  boeking_id,
  titel,
  start_datum,
  eind_datum,
  zichtbaarheid,
  gepubliceerd,
  exposanten,
  legacy_source
)
select
  b.id,
  coalesce(nullif(btrim(b.interne_titel), ''), 'Bezet'),
  b.start_datum,
  b.eind_datum,
  'bezet',
  false,
  nullif(btrim(b.huurder_naam_snapshot), ''),
  'beheer'
from public.boekingen b
join _definitief_kandidaten k on k.id = b.id
where b.status = 'definitief'
  and not exists (
    select 1
    from public.publieke_activiteiten bestaand
    where bestaand.boeking_id = b.id
  );

drop table _definitief_kandidaten;
