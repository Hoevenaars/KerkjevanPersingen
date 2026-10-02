-- Gerichte publieke leesactie voor /agenda/[slug].
-- Zelfde kolommen en publicatiepoort als publieke_agenda(), beperkt tot één slug.
-- ToonVanaf blijft in de applicatie, net als bij de agendalijst.

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
    and (
      p.contentstatus is null
      or (
        p.contentstatus = 'goedgekeurd'
        and (
          coalesce(b.verhuurtype_sleutel, a.soort, 'expositie') <> 'expositie'
          or (
            nullif(btrim(p.titel), '') is not null
            and nullif(btrim(p.korte_omschrijving), '') is not null
            and nullif(btrim(p.volledige_omschrijving), '') is not null
            and nullif(btrim(p.foto_pad), '') is not null
          )
        )
      )
    )
  order by p.start_datum
$$;

revoke all on function public.publieke_activiteit_op_slug(text) from public;
grant execute on function public.publieke_activiteit_op_slug(text) to anon, authenticated, service_role;
