-- 2 en 3 september 2028 horen bezet te zijn.
-- De reconciliatie van 8 oktober 2026 zette de boeking van Frank Biemans
-- en de activiteit met zichtbaarheid "bezet" op geannuleerd, omdat een ouder
-- bronweekend leeg was. De latere huuroverzicht-delta had die periode juist
-- gevuld, met een betaalde aanbetaling. Daardoor toonde de verhuurkalender
-- een vergeven datum als vrij, terwijl het veld zichtbaarheid op bezet bleef.
-- Hetzelfde gold voor 12 en 13 augustus 2028 (Karen Brouwer).
-- Een expliciete bestuursannulering (lokale_override.annulering) blijft vrij.
-- Een kale levenscyclus "geannuleerd" maakt een nog als bezet gemarkeerde
-- activiteit niet meer beschikbaar.

update public.boekingen
set status = 'migratie_vastgelegd',
    interne_notities = case
      when coalesce(interne_notities, '') like '%[bezetting-herstel]%' then interne_notities
      else concat_ws(E'\n', nullif(interne_notities, ''), '[bezetting-herstel] De periode is vergeven. De annulering uit de bezetting-reconciliatie is teruggedraaid.')
    end,
    bijgewerkt_op = now()
where status = 'geannuleerd'
  and migration_external_id in (
    '01-10-2026:2028-09-02:frank-biemans-icm-denny-baggen',
    '01-10-2026:2028-08-12:karen-brouwer'
  )
  and (start_datum, eind_datum) in (
    (date '2028-09-02', date '2028-09-03'),
    (date '2028-08-12', date '2028-08-13')
  );

update public.activiteit_bron
set levenscyclus = 'actief',
    geannuleerd_op = null,
    geannuleerd_door = null,
    annuleringsreden = null
where geannuleerd_door = 'bezetting-reconciliatie'
  and zichtbaarheid = 'bezet'
  and not (coalesce(lokale_override, '{}'::jsonb) ? 'annulering')
  and levenscyclus is distinct from 'actief'
  and (
    (legacy_source = 'sanity' and legacy_id = 'y3vBdxZBtQ6qbfdUZvDdKx' and start_datum = date '2028-09-02' and eind_datum = date '2028-09-03')
    or (legacy_source = 'sanity' and legacy_id = 'tJLVdtv3P0oH7KV76SBzP5' and start_datum = date '2028-08-12' and eind_datum = date '2028-08-13')
  );

create or replace function public.publieke_bezetting()
returns table (start_datum date, eind_datum date, soort text)
language sql
stable
security definer
set search_path = public
as $$
  select b.start_datum, b.eind_datum, coalesce(b.verhuurtype_sleutel, '')
  from public.boekingen b
  where b.status in ('optie', 'definitief', 'migratie_vastgelegd', 'optie_verlopen')
  union all
  select i.start_datum, i.eind_datum, 'blokkade'
  from public.interne_activiteiten i
  where i.blokkeert_verhuurkalender
  union all
  select a.start_datum, a.eind_datum, coalesce(a.soort, '')
  from public.activiteit_bron a
  where a.start_datum is not null
    and a.eind_datum is not null
    and (
      (
        a.zichtbaarheid = 'bezet'
        and not (coalesce(a.lokale_override, '{}'::jsonb) ? 'annulering')
      )
      or (
        a.zichtbaarheid = 'publiek'
        and coalesce(a.levenscyclus, 'actief') <> 'geannuleerd'
      )
    )
    and not exists (
      select 1 from public.boekingen b
      where b.status in ('optie', 'definitief', 'migratie_vastgelegd', 'optie_verlopen')
        and b.start_datum <= a.eind_datum
        and b.eind_datum >= a.start_datum
    )
  union all
  select s.datum_start, s.datum_eind, coalesce(s.soort, '')
  from public.sanity_bridge_agenda s
  where s.actief
    and s.blokkeert
    and coalesce(s.levenscyclus, 'actief') <> 'geannuleerd'
    and s.datum_start is not null
    and s.datum_eind is not null
$$;

revoke all on function public.publieke_bezetting() from public;
grant execute on function public.publieke_bezetting() to anon, authenticated, service_role;
