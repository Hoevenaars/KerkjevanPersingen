-- Eén zoekbron voor Planning en Agenda.
-- Gastbegeleiders, huurder en activiteitstekst komen in dezelfde query mee
-- via joins en één gegroepeerde aggregatie. Geen lookup per rij.
-- Zoektekst bevat alleen herkenbare gegevens: geen uuid, legacy_id of bron:id.

create or replace view public.planning_zoekbron
with (security_invoker = true)
as
select
  'boeking'::text as bron,
  b.id as boeking_id,
  b.nummer,
  b.interne_titel as titel,
  coalesce(b.verhuurtype_sleutel, '') as type,
  b.status::text as status,
  b.start_datum,
  b.eind_datum,
  coalesce(b.huurder_naam_snapshot, huurder.naam, '') as huurder,
  coalesce(b.huurder_email_snapshot, huurder.email, '') as email,
  coalesce(huurder.naam, '') as organisatie,
  coalesce(b.mede_exposanten, '') as deelnemers,
  coalesce(p.exposanten, '') as exposant,
  concat_ws(', ', nullif(gast.naam, ''), nullif(begeleiders.namen, '')) as gastbegeleiders,
  concat_ws(' ', p.korte_omschrijving, p.volledige_omschrijving, p.omschrijving, p.praktische_informatie, b.toelichting) as omschrijving,
  coalesce(b.interne_notities, '') as notitie,
  lower(concat_ws(
    ' ',
    b.interne_titel,
    b.verhuurtype_sleutel,
    b.nummer,
    b.huurder_naam_snapshot,
    huurder.naam,
    b.huurder_email_snapshot,
    huurder.email,
    b.mede_exposanten,
    p.exposanten,
    p.titel,
    p.korte_omschrijving,
    p.volledige_omschrijving,
    p.omschrijving,
    b.toelichting,
    b.interne_notities,
    gast.naam,
    begeleiders.namen
  )) as zoektekst
from public.boekingen b
left join public.relaties huurder on huurder.id = b.huurder_relatie_id
left join public.relaties gast on gast.id = b.gastheer_relatie_id
left join public.publieke_activiteiten p on p.boeking_id = b.id
left join (
  select t.boeking_id, string_agg(distinct r.naam, ', ' order by r.naam) as namen
  from public.gastbegeleider_toewijzingen t
  join public.relaties r on r.id = t.relatie_id
  group by t.boeking_id
) begeleiders on begeleiders.boeking_id = b.id

union all

select
  'activiteit',
  p.boeking_id,
  null::text,
  coalesce(p.titel, ''),
  '',
  coalesce(p.levenscyclus, 'actief'),
  p.start_datum,
  p.eind_datum,
  '',
  '',
  '',
  '',
  coalesce(p.exposanten, ''),
  '',
  concat_ws(' ', p.korte_omschrijving, p.volledige_omschrijving, p.omschrijving, p.praktische_informatie),
  '',
  lower(concat_ws(' ', p.titel, p.exposanten, p.korte_omschrijving, p.volledige_omschrijving, p.omschrijving, p.praktische_informatie))
from public.publieke_activiteiten p
where p.boeking_id is null

union all

select
  'intern',
  null::bigint,
  null::text,
  i.titel,
  'intern',
  case when i.blokkeert_verhuurkalender then 'bezet' else 'intern' end,
  i.start_datum,
  i.eind_datum,
  '',
  '',
  '',
  '',
  '',
  '',
  coalesce(i.notities, ''),
  coalesce(i.notities, ''),
  lower(concat_ws(' ', i.titel, i.notities))
from public.interne_activiteiten i

union all

select
  'sanity',
  null::bigint,
  null::text,
  coalesce(a.titel, a.interne_titel, ''),
  coalesce(a.soort, ''),
  coalesce(a.levenscyclus, 'actief'),
  a.start_datum,
  a.eind_datum,
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  lower(concat_ws(' ', a.titel, a.interne_titel, a.soort))
from public.activiteit_bron a
where a.start_datum is not null
  and a.eind_datum is not null
  and not exists (
    select 1
    from public.publieke_activiteiten p
    where p.legacy_id is not null
      and p.legacy_id = a.legacy_id
  );

revoke all on table public.planning_zoekbron from public, anon;
grant select on table public.planning_zoekbron to authenticated, service_role;

create or replace function public.planning_navigatie(
  p_van date,
  p_tot date,
  p_type text default null,
  p_q text default null
)
returns setof public.planning_zoekbron
language sql
stable
security invoker
set search_path = public
as $$
  with vraag as (
    select
      nullif(btrim(p_q), '') as q,
      lower(btrim(coalesce(p_q, ''))) as normaal,
      case lower(btrim(coalesce(p_q, '')))
        when 'januari' then 1
        when 'februari' then 2
        when 'maart' then 3
        when 'april' then 4
        when 'mei' then 5
        when 'juni' then 6
        when 'juli' then 7
        when 'augustus' then 8
        when 'september' then 9
        when 'oktober' then 10
        when 'november' then 11
        when 'december' then 12
        else null
      end as maand
  )
  select z.*
  from public.planning_zoekbron z
  cross join vraag v
  where (p_van is null or z.eind_datum >= p_van)
    and (p_tot is null or z.start_datum <= p_tot)
    and (
      p_type is null
      or btrim(p_type) = ''
      or p_type = 'alles'
      or z.type = p_type
      or (p_type = 'onbekend' and z.type = '')
    )
    and (
      v.q is null
      or (
        v.normaal !~ '^bron:[0-9]+$'
        and v.normaal !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and v.normaal !~ '^legacy[_:]'
        and (
          (
            v.maand is not null
            and exists (
              select 1
              from generate_series(extract(year from z.start_datum)::int, extract(year from z.eind_datum)::int) as j(jaar)
              where daterange(z.start_datum, z.eind_datum, '[]')
                && daterange(
                  make_date(j.jaar, v.maand, 1),
                  (make_date(j.jaar, v.maand, 1) + interval '1 month - 1 day')::date,
                  '[]'
                )
            )
          )
          or (
            v.maand is null
            and z.zoektekst ilike '%' || replace(replace(v.normaal, '%', ''), '_', '') || '%'
          )
        )
      )
    );
$$;

revoke all on function public.planning_navigatie(date, date, text, text) from public, anon;
grant execute on function public.planning_navigatie(date, date, text, text) to authenticated, service_role;
