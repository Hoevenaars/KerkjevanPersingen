-- Winterstop blijft een blokkade op de verhuurkalender.
-- Die hoort niet als "Bezet" op de publieke agenda.

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
    and (b.id is null or b.status not in ('geannuleerd', 'afgewezen'))
    and p.eind_datum >= (timezone('Europe/Amsterdam', now()))::date
    and p.publicatie_trigger is distinct from 'niet_publiceren'
  order by p.start_datum
$$;

grant execute on function public.publieke_agenda() to anon, authenticated, service_role;
