-- Bezetting 2027–2029: één bron voor kalender, vrije weekenden en aanvraag.
-- Een geannuleerde boeking maakt een overlappende actieve boeking niet vrij.
-- Een bezette periode wordt vóór het opslaan geweigerd. Faalt de check, dan wordt niets opgeslagen.

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
    and coalesce(a.levenscyclus, 'actief') <> 'geannuleerd'
    and a.start_datum is not null
    and a.eind_datum is not null
    and not exists (
      select 1 from public.boekingen b
      where b.status in ('optie', 'definitief', 'migratie_vastgelegd', 'optie_verlopen')
        and b.start_datum <= a.eind_datum
        and b.eind_datum >= a.start_datum
    )
  union all
  select s.datum_start, s.datum_eind, coalesce(s.soort, '')
  from public.sanity_bridge_agenda s
  where s.actief
    and s.blokkeert
    and coalesce(s.levenscyclus, 'actief') <> 'geannuleerd'
    and s.datum_start is not null
    and s.datum_eind is not null
$$;

revoke all on function public.publieke_bezetting() from public;
grant execute on function public.publieke_bezetting() to anon, authenticated, service_role;

create or replace function public.is_periode_beschikbaar(p_start date, p_eind date)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_eind date;
begin
  if p_start is null then
    return false;
  end if;
  v_eind := coalesce(p_eind, p_start);
  if v_eind < p_start then
    return false;
  end if;
  return not exists (
    select 1
    from public.publieke_bezetting() as bezet
    where bezet.start_datum <= v_eind
      and bezet.eind_datum >= p_start
  );
exception
  when others then
    return false;
end;
$$;

revoke all on function public.is_periode_beschikbaar(date, date) from public;
grant execute on function public.is_periode_beschikbaar(date, date) to anon, authenticated, service_role;

drop view if exists public.v_publieke_bezetting;
create view public.v_publieke_bezetting
with (security_invoker = true) as
select distinct dagen.dag
from (
  select generate_series(bezet.start_datum, bezet.eind_datum, interval '1 day')::date as dag
  from public.publieke_bezetting() as bezet
  where bezet.start_datum is not null
    and bezet.eind_datum is not null
    and bezet.eind_datum >= bezet.start_datum
) as dagen;

revoke all on public.v_publieke_bezetting from public, anon;
grant select on public.v_publieke_bezetting to authenticated;

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
  v_beschikbaar boolean;
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
  if p_eind is not null and p_eind < p_start then
    return jsonb_build_object('ok', false, 'fout', 'De einddatum ligt vóór de startdatum.');
  end if;
  if not exists (select 1 from public.verhuurtypen where sleutel = p_verhuurtype) then
    return jsonb_build_object('ok', false, 'fout', 'Onbekend verhuurtype.');
  end if;

  begin
    v_beschikbaar := public.is_periode_beschikbaar(p_start, coalesce(p_eind, p_start));
  exception
    when others then
      return jsonb_build_object('ok', false, 'fout', 'De beschikbaarheid kon niet worden gecontroleerd. De aanvraag is niet opgeslagen.');
  end;
  if v_beschikbaar is distinct from true then
    return jsonb_build_object('ok', false, 'fout', 'Deze periode is niet beschikbaar.');
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

-- Afke van Halen hoort volgens de genormaliseerde bron én de raw-regel actief te zijn.
-- De delta van 01-10-2026 zette haar op geannuleerd en voegde Rob Pluijm toe.
-- Rob staat niet in de huidige bron. Zijn rij blijft bestaan, maar blokkeert niet meer.
update public.boekingen
set status = 'migratie_vastgelegd',
    interne_titel = 'Maart 6/7, 2027',
    interne_notities = case
      when coalesce(interne_notities, '') like '%[bezetting-reconciliatie]%' then interne_notities
      else concat_ws(E'\n', nullif(interne_notities, ''), '[bezetting-reconciliatie] Bronrij 16 is actief. De annulering uit de delta van 01-10-2026 is teruggedraaid.')
    end,
    bijgewerkt_op = now()
where id = 60
  and migration_external_id = 'BKG-2027-016'
  and huurder_email_snapshot = 'info@afkevanhalen.nl'
  and start_datum = date '2027-03-06'
  and eind_datum = date '2027-03-07';

update public.boekingen
set status = 'geannuleerd',
    interne_notities = case
      when coalesce(interne_notities, '') like '%[bezetting-reconciliatie]%' then interne_notities
      else concat_ws(E'\n', nullif(interne_notities, ''), '[bezetting-reconciliatie] Niet aanwezig in bezetting_2027. Blokkeert de kalender niet. Rij niet verwijderd.')
    end,
    bijgewerkt_op = now()
where migration_external_id = '01-10-2026:2027-03-06:rob-pluijm-ivm-carola-bouchoms'
  and start_datum = date '2027-03-06'
  and eind_datum = date '2027-03-07'
  and status = 'migratie_vastgelegd';

-- Lege bronweekenden die een latere delta alsnog had gevuld.
update public.boekingen
set status = 'geannuleerd',
    interne_notities = case
      when coalesce(interne_notities, '') like '%[bezetting-reconciliatie]%' then interne_notities
      else concat_ws(E'\n', nullif(interne_notities, ''), '[bezetting-reconciliatie] Bronweekend is vrij. Rij niet verwijderd.')
    end,
    bijgewerkt_op = now()
where status = 'migratie_vastgelegd'
  and migration_external_id in (
    '01-10-2026:2028-08-12:karen-brouwer',
    '01-10-2026:2028-09-02:frank-biemans-icm-denny-baggen',
    '01-10-2026:2029-08-25:rein-van-vucht-icm-mieke-koenen'
  );

-- Schaduwbezetting die een geannuleerde of vrije periode zelfstandig dichthield.
update public.activiteit_bron
set levenscyclus = 'geannuleerd',
    geannuleerd_op = coalesce(geannuleerd_op, now()),
    geannuleerd_door = coalesce(geannuleerd_door, 'bezetting-reconciliatie'),
    annuleringsreden = coalesce(annuleringsreden, 'Bronperiode is geannuleerd of vrij. Deze schaduw blokkeert de verhuurkalender niet meer.')
where levenscyclus is distinct from 'geannuleerd'
  and (
    (id = 16 and start_datum = date '2027-07-31' and eind_datum = date '2027-08-01')
    or (id = 20 and start_datum = date '2028-08-12' and eind_datum = date '2028-08-13')
    or (id = 24 and start_datum = date '2028-09-02' and eind_datum = date '2028-09-03')
  );

update public.publieke_activiteiten
set levenscyclus = 'geannuleerd',
    geannuleerd_op = coalesce(geannuleerd_op, now()),
    geannuleerd_door = coalesce(geannuleerd_door, 'bezetting-reconciliatie'),
    annuleringsreden = coalesce(annuleringsreden, 'Huur 31 juli 2027 is geannuleerd. De expositie bezet de kalender niet meer.')
where id = 6
  and boeking_id is null
  and start_datum = date '2027-07-31'
  and eind_datum = date '2027-08-01'
  and levenscyclus is distinct from 'geannuleerd';

insert into public.boekingen (
  status, interne_titel, start_datum, eind_datum,
  huurder_relatie_id, huurder_naam_snapshot, huurder_email_snapshot, huurder_telefoon_snapshot,
  interne_notities, migration_source, migration_external_id, migration_source_file, migration_source_row, migration_batch_id
)
select
  'migratie_vastgelegd',
  bron.titel,
  bron.start_datum,
  bron.eind_datum,
  bron.relatie_id,
  bron.naam,
  bron.email,
  bron.telefoon,
  bron.notitie,
  'bezetting_reconciliatie',
  bron.external_id,
  bron.bestand,
  bron.bronrij,
  'bezetting-reconciliatie-2027-2029'
from (
  values
    ('BKG-RECON-2027-019', 'Maart 27/28/29 pasen', date '2027-03-27', date '2027-03-29', null::bigint, 'Kunstenaars Collectief KADK t.a.v. Peter de Vries', 'peter@kadk.nl', '64233119', 'contr verz 28-12-2024', 'bezetting_2027_genormaliseerd.csv', '19'),
    ('BKG-RECON-2027-024', 'April 24/25', date '2027-04-24', date '2027-04-25', null::bigint, 'Ellen vd Wal icm Jolanthe Krepel', 'ellenvanderwa;2@gmail.com', '641548030', 'contr verz 21-12-2024', 'bezetting_2027_genormaliseerd.csv', '24'),
    ('BKG-RECON-2027-037', 'Juni 25.', date '2027-06-25', date '2027-06-25', null::bigint, 'huwelijk Roos Hilstra', 'rchilstra@gmai.com', '634797031', 'contr verz 19-08-2026', 'bezetting_2027_genormaliseerd.csv', '37'),
    ('BKG-RECON-2027-053', 'September 4/5', date '2027-09-04', date '2027-09-05', 87::bigint, 'icm Gaby Haerkens enEllen v d Wal', 'a.p.hofsteede@gmail.com', '615591860', 'contr verz 30 -09-2024', 'bezetting_2027_genormaliseerd.csv', '53'),
    ('BKG-RECON-2027-066', 'November 13/14', date '2027-11-13', date '2027-11-14', 97::bigint, 'Wil Westerweel', 'wilwesterweelfotografie@gmail.com', '637469218', 'contr verz 30-09-2025', 'bezetting_2027_genormaliseerd.csv', '66'),
    ('BKG-RECON-2027-070', 'December 4/5', date '2027-12-04', date '2027-12-05', 99::bigint, 'Jacqueline Tiemens', 'jacqtiemens@gmail.com', '643960007', 'contr verz 01-03-2026', 'bezetting_2027_genormaliseerd.csv', '70'),
    ('BKG-RECON-2028-015', 'Maart 11/12', date '2028-03-11', date '2028-03-12', null::bigint, 'Leon Swinkels', 'leon,swinkels@kpnmail.nl', '646310670', 'contr verz 13-08-2026', 'bezetting_2028_genormaliseerd.csv', '15'),
    ('BKG-RECON-2028-042', 'Juli 29/30', date '2028-07-29', date '2028-07-30', null::bigint, 'Trinette Korver', 'ateliertrinette@reneskorver.nl', '612244320', 'contr verz 13-08-2026', 'bezetting_2028_genormaliseerd.csv', '42'),
    ('BKG-RECON-2028-053', 'September 23/24', date '2028-09-23', date '2028-09-24', null::bigint, 'Maartje Gruter', 'maartje gruter @gmail.com', '629116123', 'contr ver 13-05-2026', 'bezetting_2028_genormaliseerd.csv', '53'),
    ('BKG-RECON-2028-054', 'September 30/oktober 1', date '2028-09-30', date '2028-10-01', 121::bigint, 'Tiny Zijlstra icm Doreen Bour', 'tinyzijlstra@delta.nl', '623594389', 'cobtr verz 01--09-2026', 'bezetting_2028_genormaliseerd.csv', '54')
) as bron(external_id, titel, start_datum, eind_datum, relatie_id, naam, email, telefoon, notitie, bestand, bronrij)
where not exists (
  select 1
  from public.boekingen bestaand
  where bestaand.migration_source = 'bezetting_reconciliatie'
    and bestaand.migration_external_id = bron.external_id
)
and not exists (
  select 1
  from public.boekingen bestaand
  where bestaand.status in ('optie', 'definitief', 'migratie_vastgelegd', 'optie_verlopen')
    and bestaand.start_datum <= bron.eind_datum
    and bestaand.eind_datum >= bron.start_datum
    and (
      (bron.relatie_id is not null and bestaand.huurder_relatie_id = bron.relatie_id)
      or lower(coalesce(bestaand.huurder_email_snapshot, '')) = lower(bron.email)
      or bestaand.huurder_naam_snapshot = bron.naam
    )
);
