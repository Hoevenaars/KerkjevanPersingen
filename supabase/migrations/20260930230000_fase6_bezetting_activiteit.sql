-- Beschikbaarheid leest publieke en bezette Sanity-activiteiten mee
-- wanneer geen boeking die periode al dekt. Er worden geen boekingen gemaakt.

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
  where a.zichtbaarheid in ('publiek', 'bezet')
    and a.start_datum is not null
    and a.eind_datum is not null
    and not exists (
      select 1 from public.boekingen b
      where b.status in ('optie', 'definitief', 'migratie_vastgelegd', 'optie_verlopen')
        and b.start_datum <= a.eind_datum
        and b.eind_datum >= a.start_datum
    )
$$;

revoke all on function public.publieke_bezetting() from public;
grant execute on function public.publieke_bezetting() to anon, authenticated, service_role;

-- Publieke agenda zonder Sanity. Alleen zichtbaarheid=publiek; toonVanaf blijft in de applicatie.
create or replace function public.publieke_agenda()
returns table (
  id bigint,
  slug text,
  titel text,
  start_datum date,
  eind_datum date,
  omschrijving text,
  foto_pad text,
  foto_alt text,
  publicatie_trigger text,
  zichtbaarheid text,
  inhoud_status text,
  soort text
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
    p.foto_pad,
    p.foto_alt,
    p.publicatie_trigger::text,
    p.zichtbaarheid,
    p.inhoud_status::text,
    coalesce(b.verhuurtype_sleutel, a.soort, 'expositie')
  from public.publieke_activiteiten p
  left join public.boekingen b on b.id = p.boeking_id
  left join public.activiteit_bron a on a.legacy_id = p.legacy_id
  where p.zichtbaarheid = 'publiek'
    and p.eind_datum >= (timezone('Europe/Amsterdam', now()))::date
    and p.publicatie_trigger is distinct from 'niet_publiceren'
  order by p.start_datum
$$;

revoke all on function public.publieke_agenda() from public;
grant execute on function public.publieke_agenda() to anon, authenticated, service_role;
