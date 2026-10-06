-- Een geannuleerde boeking haalt de gekoppelde expositie van de publieke agenda.
-- Annuleren van de activiteit annuleert de boeking, zodat de periode niet bezet blijft.
-- Geen mail en geen nieuwe communicatiejob.

create or replace function app.boeking_annulering_naar_activiteit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'geannuleerd' or old.status is not distinct from 'geannuleerd' then
    return new;
  end if;

  update public.publieke_activiteiten
  set levenscyclus = 'geannuleerd',
      gepubliceerd = false,
      geannuleerd_op = coalesce(geannuleerd_op, now()),
      annuleringsreden = coalesce(annuleringsreden, 'Boeking geannuleerd.'),
      lokale_override = coalesce(lokale_override, '{}'::jsonb) || jsonb_build_object('annulering', true)
  where boeking_id = new.id
    and levenscyclus is distinct from 'geannuleerd';

  return new;
end;
$$;

create or replace function app.activiteit_annulering_naar_boeking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_van text;
begin
  if new.levenscyclus is distinct from 'geannuleerd'
     or old.levenscyclus is not distinct from 'geannuleerd'
     or new.boeking_id is null then
    return new;
  end if;

  select status::text into v_van
  from public.boekingen
  where id = new.boeking_id
    and status not in ('geannuleerd', 'afgerond', 'gearchiveerd');

  if v_van is null then
    return new;
  end if;

  update public.boekingen
  set status = 'geannuleerd',
      bijgewerkt_op = now()
  where id = new.boeking_id
    and status::text = v_van;

  update public.communicatie_jobs
  set status = 'geannuleerd'
  where boeking_id = new.boeking_id
    and status is distinct from 'verzonden'
    and status is distinct from 'geannuleerd';

  insert into public.auditlog (actor_type, actor_naam, onderwerp_type, onderwerp_id, actie, van, naar, reden, dedup_sleutel)
  values (
    'systeem',
    'activiteit geannuleerd',
    'boeking',
    new.boeking_id::text,
    'geannuleerd',
    v_van,
    'geannuleerd',
    new.annuleringsreden,
    'boeking:' || new.boeking_id::text || ':geannuleerd'
  )
  on conflict (dedup_sleutel) where dedup_sleutel is not null do nothing;

  return new;
end;
$$;

revoke all on function app.boeking_annulering_naar_activiteit() from public, anon, authenticated;
revoke all on function app.activiteit_annulering_naar_boeking() from public, anon, authenticated;

drop trigger if exists boeking_annulering_naar_activiteit on public.boekingen;
create trigger boeking_annulering_naar_activiteit
  after update of status on public.boekingen
  for each row
  execute function app.boeking_annulering_naar_activiteit();

drop trigger if exists activiteit_annulering_naar_boeking on public.publieke_activiteiten;
create trigger activiteit_annulering_naar_boeking
  after update of levenscyclus on public.publieke_activiteiten
  for each row
  execute function app.activiteit_annulering_naar_boeking();

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
    and (b.id is null or b.status not in ('geannuleerd', 'afgewezen'))
    and p.eind_datum >= (timezone('Europe/Amsterdam', now()))::date
    and p.publicatie_trigger is distinct from 'niet_publiceren'
  order by p.start_datum
$$;

grant execute on function public.publieke_agenda() to anon, authenticated, service_role;
grant execute on function public.publieke_activiteit_op_slug(text) to anon, authenticated, service_role;

with bijgewerkt as (
  update public.publieke_activiteiten p
  set levenscyclus = 'geannuleerd',
      gepubliceerd = false,
      geannuleerd_op = coalesce(p.geannuleerd_op, now()),
      geannuleerd_door = coalesce(p.geannuleerd_door, a.actor_naam),
      annuleringsreden = coalesce(
        p.annuleringsreden,
        case
          when p.slug = 'marie-jose-lieferink' and p.start_datum = date '2026-10-17'
            then 'Weg afgesloten. Exposant verwacht minder bezoekers.'
          else 'Boeking geannuleerd.'
        end
      ),
      lokale_override = coalesce(p.lokale_override, '{}'::jsonb) || jsonb_build_object('annulering', true)
  from public.boekingen b
  left join lateral (
    select actor_naam
    from public.auditlog
    where dedup_sleutel = 'boeking:' || b.id::text || ':geannuleerd'
    order by op desc
    limit 1
  ) a on true
  where p.boeking_id = b.id
    and b.status = 'geannuleerd'
    and p.levenscyclus is distinct from 'geannuleerd'
  returning p.id, p.annuleringsreden
)
insert into public.auditlog (actor_type, actor_naam, onderwerp_type, onderwerp_id, actie, van, naar, reden, dedup_sleutel)
select
  'systeem',
  'boeking geannuleerd',
  'activiteit',
  'publieke_activiteiten:' || id::text,
  'activiteit_annuleren',
  'actief',
  'geannuleerd',
  annuleringsreden,
  'annuleer:publieke_activiteiten:' || id::text
from bijgewerkt
on conflict (dedup_sleutel) where dedup_sleutel is not null do nothing;
