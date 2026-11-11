-- Rob de Valk (8 en 9 mei 2027) stond op de publieke agenda met de
-- placeholdertekst, terwijl de activiteit niet gepubliceerd is.
-- Zichtbaarheid 'publiek' is de poort van de site. Die gaat terug naar
-- verborgen. De definitieve boeking blijft de verhuurkalender blokkeren.
--
-- Een winterstop is één tegel per aaneengesloten seizoen. Losse weekenden
-- en de seizoensblokkade vallen samen zolang de gaten hooguit 21 dagen zijn.
-- Een volgend winterseizoen krijgt vanzelf een nieuwe tegel.

with gekozen as (
  update public.publieke_activiteiten p
  set zichtbaarheid = 'verborgen',
      lokale_override = coalesce(p.lokale_override, '{}'::jsonb) || jsonb_build_object('publicatiestatus', 'verborgen')
  where p.gepubliceerd = false
    and p.zichtbaarheid = 'publiek'
    and p.publicatie_trigger = 'zodra_content_compleet'
    and p.start_datum = date '2027-05-08'
    and p.eind_datum = date '2027-05-09'
    and p.titel ilike '%rob de valk%'
    and coalesce(p.levenscyclus, 'actief') <> 'geannuleerd'
    and exists (
      select 1
      from public.boekingen b
      where b.id = p.boeking_id
        and b.status = 'definitief'
        and b.start_datum = date '2027-05-08'
        and b.eind_datum = date '2027-05-09'
    )
  returning p.id
)
insert into public.auditlog (actor_type, actor_naam, onderwerp_type, onderwerp_id, actie, van, naar, reden)
select
  'systeem',
  'agenda',
  'activiteit',
  gekozen.id::text,
  'publicatiestatus',
  'publiek',
  'verborgen',
  'Nog niet gepubliceerd. De agenda toonde de naam met een placeholder.'
from gekozen;

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
  with winters as (
    select start_datum, eind_datum
    from public.interne_activiteiten
    where blokkeert_verhuurkalender
      and lower(btrim(titel)) = 'winterstop'
  ),
  ordered as (
    select
      start_datum,
      eind_datum,
      max(eind_datum) over (
        order by start_datum, eind_datum
        rows between unbounded preceding and 1 preceding
      ) as vorig_eind
    from winters
  ),
  gemarkeerd as (
    select
      start_datum,
      eind_datum,
      case
        when vorig_eind is null or start_datum > vorig_eind + 21 then 1
        else 0
      end as nieuw
    from ordered
  ),
  gegroepeerd as (
    select
      start_datum,
      eind_datum,
      sum(nieuw) over (order by start_datum, eind_datum) as groep
    from gemarkeerd
  ),
  seizoenen as (
    select min(start_datum) as start_datum, max(eind_datum) as eind_datum
    from gegroepeerd
    group by groep
    having max(eind_datum) >= (timezone('Europe/Amsterdam', now()))::date
  )
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
      and (
        p.gepubliceerd
        or p.publicatie_trigger = 'direct'
        or p.publicatie_trigger::text like 'uiterlijk_%'
        or (
          p.publicatie_trigger = 'zodra_content_compleet'
          and nullif(btrim(coalesce(p.korte_omschrijving, p.volledige_omschrijving, p.omschrijving, '')), '') is not null
        )
      )
    union all
    select
      p.id,
      null,
      'Bezet',
      p.start_datum,
      p.eind_datum,
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
      p.levenscyclus
    from public.publieke_activiteiten p
    left join public.boekingen b on b.id = p.boeking_id
    where p.zichtbaarheid = 'bezet'
      and coalesce(p.levenscyclus, 'actief') <> 'geannuleerd'
      and (b.id is null or b.status not in ('geannuleerd', 'afgewezen'))
      and p.eind_datum >= (timezone('Europe/Amsterdam', now()))::date
    union all
    select
      - (to_char(s.start_datum, 'YYYYMMDD'))::bigint,
      null,
      'Winterstop',
      s.start_datum,
      s.eind_datum,
      'In deze periode krijgt het kerkje de rust en aandacht die nodig zijn voor onderhoud en behoud. Vanaf het voorjaar openen de deuren weer voor nieuwe exposities, ontmoetingen en bijzondere momenten.',
      'In deze periode krijgt het kerkje de rust en aandacht die nodig zijn voor onderhoud en behoud. Vanaf het voorjaar openen de deuren weer voor nieuwe exposities, ontmoetingen en bijzondere momenten.',
      'In deze periode krijgt het kerkje de rust en aandacht die nodig zijn voor onderhoud en behoud. Vanaf het voorjaar openen de deuren weer voor nieuwe exposities, ontmoetingen en bijzondere momenten.',
      '/foto/nieuwe-vlag.jpg',
      'Het kerkje van Persingen',
      '[]'::jsonb,
      null,
      null,
      'direct',
      'publiek',
      'niet_vereist',
      null,
      'winterstop',
      'actief'
    from seizoenen s
  ) as agenda
  order by agenda.start_datum, agenda.id
$$;

grant execute on function public.publieke_agenda() to anon, authenticated, service_role;
