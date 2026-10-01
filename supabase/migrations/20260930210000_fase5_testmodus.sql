-- Fase 5: testmodus-schrijven en lookup, zonder CONTENT_BRON om te zetten.
-- Geen storage-buckets, geen mailverzending, geen herimport van consolidatie-rijen.

alter type public.publicatie_trigger add value if not exists 'uiterlijk_6_maanden';
alter type public.publicatie_trigger add value if not exists 'uiterlijk_9_maanden';
alter type public.publicatie_trigger add value if not exists 'uiterlijk_12_maanden';

create unique index if not exists publieke_activiteiten_legacy_id_unique
  on public.publieke_activiteiten (legacy_id)
  where legacy_id is not null;

create or replace function public.huidige_template(p_sleutel text)
returns table (template_id bigint, onderwerp text, inhoud text)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, v.onderwerp, v.inhoud
  from public.communicatie_templates t
  join public.communicatie_template_versies v
    on v.template_id = t.id
   and v.versie = t.huidige_versie
  where t.sleutel = p_sleutel
$$;

revoke all on function public.huidige_template(text) from public;
grant execute on function public.huidige_template(text) to anon, authenticated, service_role;

create or replace function public.vul_job_onderwerp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_onderwerp text;
begin
  if new.onderwerp is null or btrim(new.onderwerp) = '' or new.onderwerp = new.template_sleutel then
    select v.onderwerp into v_onderwerp
    from public.communicatie_template_versies v
    join public.communicatie_templates t on t.id = v.template_id
    where t.id = coalesce(new.template_id, (select id from public.communicatie_templates where sleutel = new.template_sleutel))
      and v.versie = t.huidige_versie;
    if v_onderwerp is not null and btrim(v_onderwerp) <> '' then
      new.onderwerp := v_onderwerp;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists communicatie_jobs_vul_onderwerp on public.communicatie_jobs;
create trigger communicatie_jobs_vul_onderwerp
  before insert on public.communicatie_jobs
  for each row
  execute function public.vul_job_onderwerp();

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
$$;

revoke all on function public.publieke_bezetting() from public;
grant execute on function public.publieke_bezetting() to anon, authenticated, service_role;

create or replace function public.bewaar_test_aanvraag(
  p_naam text,
  p_email text,
  p_telefoon text,
  p_adres text,
  p_verhuurtype text,
  p_start date,
  p_eind date,
  p_personen text,
  p_toelichting text,
  p_website text,
  p_eerder text,
  p_mede text,
  p_akkoord boolean,
  p_mailjob boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_relatie bigint;
  v_aantal integer;
  v_template bigint;
  v_job bigint;
begin
  if nullif(btrim(coalesce(p_naam, '')), '') is null then
    return jsonb_build_object('ok', false, 'fout', 'Naam ontbreekt.');
  end if;
  if nullif(btrim(coalesce(p_email, '')), '') is null or position('@' in p_email) = 0 then
    return jsonb_build_object('ok', false, 'fout', 'E-mailadres ontbreekt.');
  end if;
  if p_start is null then
    return jsonb_build_object('ok', false, 'fout', 'Startdatum ontbreekt.');
  end if;
  if not exists (select 1 from public.verhuurtypen where sleutel = p_verhuurtype) then
    return jsonb_build_object('ok', false, 'fout', 'Onbekend verhuurtype.');
  end if;

  select id into v_id
  from public.aanvragen
  where lower(email) = lower(btrim(p_email))
    and start_datum = p_start
    and status <> 'afgewezen'
  order by id
  limit 1;

  if v_id is null then
    select count(*) into v_aantal from public.relaties where lower(email) = lower(btrim(p_email));
    if v_aantal = 1 then
      select id into v_relatie from public.relaties where lower(email) = lower(btrim(p_email));
    end if;

    insert into public.aanvragen (
      status, binnengekomen_op, naam, email, telefoon, adres, verhuurtype_sleutel,
      start_datum, eind_datum, aantal_personen, toelichting, website, eerder_geexposeerd,
      mede_exposanten, akkoord_voorwaarden, relatie_id, beoordeling_deadline
    ) values (
      'nieuw', now(), btrim(p_naam), lower(btrim(p_email)), nullif(btrim(coalesce(p_telefoon, '')), ''),
      nullif(btrim(coalesce(p_adres, '')), ''), p_verhuurtype, p_start, coalesce(p_eind, p_start),
      nullif(btrim(coalesce(p_personen, '')), ''), nullif(btrim(coalesce(p_toelichting, '')), ''),
      nullif(btrim(coalesce(p_website, '')), ''), nullif(btrim(coalesce(p_eerder, '')), ''),
      nullif(btrim(coalesce(p_mede, '')), ''), p_akkoord, v_relatie,
      (current_date + 7)
    )
    returning id into v_id;

    insert into public.auditlog (actor_type, actor_naam, onderwerp_type, onderwerp_id, actie, naar, dedup_sleutel)
    values ('klant', btrim(p_naam), 'aanvraag', v_id::text, 'aangemaakt', 'nieuw', 'test-aanvraag:' || v_id::text);
  end if;

  if p_mailjob then
    select id into v_template from public.communicatie_templates where sleutel = 'booking_request_received';
    if v_template is null then
      return jsonb_build_object('ok', true, 'id', v_id, 'mailjob', 'template_ontbreekt');
    end if;
    insert into public.communicatie_jobs (
      aanvraag_id, template_id, template_sleutel, status, modus, gepland_op, dedup_sleutel, ontvanger_email, onderwerp
    ) values (
      v_id, v_template, 'booking_request_received', 'concept', 'concept', now(),
      'test:aanvraag:' || v_id::text || ':booking_request_received', lower(btrim(p_email)), ''
    )
    on conflict (dedup_sleutel) where dedup_sleutel is not null do nothing
    returning id into v_job;
    return jsonb_build_object('ok', true, 'id', v_id, 'mailjob', 'concept', 'job_id', v_job);
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'mailjob', 'geen');
end;
$$;

revoke all on function public.bewaar_test_aanvraag(text, text, text, text, text, date, date, text, text, text, text, text, boolean, boolean) from public;
grant execute on function public.bewaar_test_aanvraag(text, text, text, text, text, date, date, text, text, text, text, text, boolean, boolean) to anon, authenticated, service_role;
