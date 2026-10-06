-- 26 en 27 december 2026 horen bij de winterstop, maar ontbraken als blokkade.
-- De overige winterstopweekenden blokkeerden de verhuurkalender wel, en stonden
-- niet als bezet op de publieke agenda.

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

create or replace function public.publieke_agenda()
returns table (
  id bigint,
  slug text,
  titel text,
  start_datum date,
  eind_datum date,
  omschrijving text,
  korte_omschrijving text,
  volledige_omschrijving text,
  foto_pad text,
  foto_alt text,
  aanvullende_afbeeldingen jsonb,
  exposanten text,
  praktische_informatie text,
  publicatie_trigger text,
  zichtbaarheid text,
  inhoud_status text,
  contentstatus text,
  soort text,
  levenscyclus text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    agenda.id,
    agenda.slug,
    agenda.titel,
    agenda.start_datum,
    agenda.eind_datum,
    agenda.omschrijving,
    agenda.korte_omschrijving,
    agenda.volledige_omschrijving,
    agenda.foto_pad,
    agenda.foto_alt,
    agenda.aanvullende_afbeeldingen,
    agenda.exposanten,
    agenda.praktische_informatie,
    agenda.publicatie_trigger,
    agenda.zichtbaarheid,
    agenda.inhoud_status,
    agenda.contentstatus,
    agenda.soort,
    agenda.levenscyclus
  from (
    select
      p.id,
      p.slug,
      p.titel,
      p.start_datum,
      p.eind_datum,
      p.omschrijving,
      p.korte_omschrijving,
      p.volledige_omschrijving,
      p.foto_pad,
      p.foto_alt,
      p.aanvullende_afbeeldingen,
      p.exposanten,
      p.praktische_informatie,
      p.publicatie_trigger::text as publicatie_trigger,
      p.zichtbaarheid,
      p.inhoud_status::text as inhoud_status,
      p.contentstatus,
      coalesce(b.verhuurtype_sleutel, a.soort, 'expositie') as soort,
      p.levenscyclus
    from public.publieke_activiteiten p
    left join public.boekingen b on b.id = p.boeking_id
    left join public.activiteit_bron a on a.legacy_id = p.legacy_id
    where p.zichtbaarheid = 'publiek'
      and coalesce(p.levenscyclus, 'actief') <> 'geannuleerd'
      and (b.id is null or b.status not in ('geannuleerd', 'afgewezen'))
      and p.eind_datum >= (timezone('Europe/Amsterdam', now()))::date
      and p.publicatie_trigger is distinct from 'niet_publiceren'
    union all
    select
      -i.id,
      null,
      'Bezet',
      i.start_datum,
      i.eind_datum,
      'Dit weekend is bezet.',
      null,
      null,
      null,
      null,
      '[]'::jsonb,
      null,
      null,
      'direct',
      'publiek',
      'niet_vereist',
      null,
      'blokkade',
      'actief'
    from public.interne_activiteiten i
    where i.blokkeert_verhuurkalender
      and i.eind_datum >= (timezone('Europe/Amsterdam', now()))::date
  ) as agenda
  order by agenda.start_datum, agenda.id
$$;

grant execute on function public.publieke_agenda() to anon, authenticated, service_role;
