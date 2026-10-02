-- De publieke agenda volgt de publicatiestatus.
-- Ontbrekende content verbergt een gepubliceerde activiteit niet.
-- Second Nature (3-4 oktober 2026) hoort bij de verhuur van Monika Loster.

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
    p.publicatie_trigger::text,
    p.zichtbaarheid,
    p.inhoud_status::text,
    p.contentstatus,
    coalesce(b.verhuurtype_sleutel, a.soort, 'expositie'),
    p.levenscyclus
  from public.publieke_activiteiten p
  left join public.boekingen b on b.id = p.boeking_id
  left join public.activiteit_bron a on a.legacy_id = p.legacy_id
  where p.zichtbaarheid = 'publiek'
    and coalesce(p.levenscyclus, 'actief') <> 'geannuleerd'
    and p.eind_datum >= (timezone('Europe/Amsterdam', now()))::date
    and p.publicatie_trigger is distinct from 'niet_publiceren'
  order by p.start_datum
$$;

create or replace function public.publieke_activiteit_op_slug(p_slug text)
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
    p.publicatie_trigger::text,
    p.zichtbaarheid,
    p.inhoud_status::text,
    p.contentstatus,
    coalesce(b.verhuurtype_sleutel, a.soort, 'expositie'),
    p.levenscyclus
  from public.publieke_activiteiten p
  left join public.boekingen b on b.id = p.boeking_id
  left join public.activiteit_bron a on a.legacy_id = p.legacy_id
  where p.slug = p_slug
    and p.zichtbaarheid = 'publiek'
    and coalesce(p.levenscyclus, 'actief') <> 'geannuleerd'
    and p.eind_datum >= (timezone('Europe/Amsterdam', now()))::date
    and p.publicatie_trigger is distinct from 'niet_publiceren'
  order by p.start_datum
$$;

grant execute on function public.publieke_agenda() to anon, authenticated, service_role;
grant execute on function public.publieke_activiteit_op_slug(text) to anon, authenticated, service_role;

insert into public.publieke_activiteiten (
  boeking_id, titel, slug, start_datum, eind_datum,
  omschrijving, korte_omschrijving, volledige_omschrijving,
  exposanten, praktische_informatie, foto_pad, foto_alt,
  zichtbaarheid, gepubliceerd, gepubliceerd_op, publicatie_trigger,
  legacy_source, lokale_override
)
select
  b.id,
  'Second Nature',
  'second-nature',
  b.start_datum,
  b.eind_datum,
  'In de tentoonstelling Second Nature onderzoeken Judith Aardse, Gea van Eck, Monika Loster en Judith Schepers de grens tussen natuur en menselijk ingrijpen.',
  'In de tentoonstelling Second Nature onderzoeken Judith Aardse, Gea van Eck, Monika Loster en Judith Schepers de grens tussen natuur en menselijk ingrijpen.',
  $second$In de tentoonstelling Second Nature onderzoeken Judith Aardse, Gea van Eck, Monika Loster en Judith Schepers de grens tussen natuur en menselijk ingrijpen.

Met tekeningen, textielkunst, sculptuur en fotografie brengen de kunstenaars ieder vanuit hun eigen praktijk een andere benadering van het thema samen. Organische vormen, lichamelijkheid, groei, landschap, structuur en transformatie keren op verschillende manieren terug in de werken.

Second Nature gaat niet alleen over natuur als onderwerp, maar ook over de manier waarop wij haar ervaren, nabootsen, veranderen en opnieuw vormgeven. De tentoonstelling nodigt daarmee uit om opnieuw te kijken naar wat wij als natuurlijk beschouwen en naar onze eigen rol daarin.$second$,
  'Judith Aardse, Gea van Eck, Monika Loster, Judith Schepers',
  'Te bezoeken op zaterdag en zondag, van 11.00 tot 17.00 uur.',
  '/foto/exposities/second-nature.jpg',
  'Expositieposter Second Nature met werk van vier kunstenaars',
  'publiek',
  true,
  now(),
  'zodra_content_compleet',
  'beheer',
  jsonb_build_object('contentvelden', true, 'publicatiestatus', 'publiek')
from public.boekingen b
where b.start_datum = date '2026-10-03'
  and b.eind_datum = date '2026-10-04'
  and b.status = 'migratie_vastgelegd'
  and b.huurder_naam_snapshot = 'Monika Loster'
  and not exists (
    select 1 from public.publieke_activiteiten p
    where p.slug = 'second-nature' or p.boeking_id = b.id
  );
