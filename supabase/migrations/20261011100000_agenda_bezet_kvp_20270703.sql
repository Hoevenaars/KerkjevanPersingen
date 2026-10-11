-- KVP-20270703-BHFX is definitief op 3 en 4 juli 2027, maar had geen
-- agendarecord. De verhuurkalender telde de boeking wel; de agenda niet.
-- Een zichtbaarheid 'bezet' blokkeert de publieke agenda als "Bezet",
-- zonder de naam van de huurder te publiceren.
-- Winterstop blijft alleen op de verhuurkalender.

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
  b.interne_titel,
  b.start_datum,
  b.eind_datum,
  'bezet',
  false,
  b.huurder_naam_snapshot,
  'beheer'
from public.boekingen b
where b.nummer = 'KVP-20270703-BHFX'
  and b.status = 'definitief'
  and b.start_datum = date '2027-07-03'
  and b.eind_datum = date '2027-07-04'
  and not exists (
    select 1
    from public.publieke_activiteiten bestaand
    where bestaand.boeking_id = b.id
  );

create or replace function public.agenda_bezet_voor_definitieve_boeking(p_boeking_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_boeking_id is null then
    return;
  end if;
  if not app.heeft_recht('boekingen', 'schrijven') then
    raise exception 'Geen recht om de agenda te blokkeren.';
  end if;

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
  where b.id = p_boeking_id
    and b.status = 'definitief'
    and not exists (
      select 1
      from public.publieke_activiteiten bestaand
      where bestaand.boeking_id = b.id
    );
end;
$$;

revoke all on function public.agenda_bezet_voor_definitieve_boeking(bigint) from public, anon;
grant execute on function public.agenda_bezet_voor_definitieve_boeking(bigint) to authenticated, service_role;

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
  ) as agenda
  order by agenda.start_datum, agenda.id
$$;

grant execute on function public.publieke_agenda() to anon, authenticated, service_role;
