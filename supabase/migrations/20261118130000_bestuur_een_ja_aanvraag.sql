-- Bestuursbesluit voor een aanvraag: in EEN transactie een optie vastleggen.
-- Geen nieuwe tabellen, geen mails, geen automatische contractverzending.
-- SECURITY DEFINER is hier bewust nodig: de overlapcontrole moet OOK blokkades
-- zien die voor een bestuurder door andere module-RLS onzichtbaar zijn.
-- De functie geeft uitsluitend een boeking-id terug, en controleert eerst
-- auth.uid() en de bestuursrechten. Geen algemeen recht op app-schema nodig.

create or replace function public.keur_aanvraag_en_reserveer(p_aanvraag_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aanvraag public.aanvragen%rowtype;
  v_boeking_id bigint;
  v_vandaag date := (now() at time zone 'Europe/Amsterdam')::date;
begin
  if auth.uid() is null
     or (select app.heeft_recht('aanvragen', 'schrijven')) is not true
     or (select app.heeft_recht('instellingen', 'schrijven')) is not true then
    raise exception 'Geen recht om deze aanvraag goed te keuren.' using errcode = '42501';
  end if;

  -- Twee gelijktijdige klikken op dezelfde aanvraag worden geserialiseerd.
  select * into v_aanvraag
    from public.aanvragen
   where id = p_aanvraag_id
   for update;
  if not found then
    raise exception 'Aanvraag niet gevonden.' using errcode = 'P0002';
  end if;

  if v_aanvraag.boeking_id is not null then
    if v_aanvraag.status = 'goedgekeurd' then
      return jsonb_build_object('boekingId', v_aanvraag.boeking_id, 'alVerwerkt', true);
    end if;
    raise exception 'Deze aanvraag heeft al een boeking in een andere fase.' using errcode = 'P0001';
  end if;
  if v_aanvraag.status not in ('nieuw', 'in_behandeling') then
    raise exception 'Deze aanvraag kan in deze fase niet worden goedgekeurd.' using errcode = 'P0001';
  end if;
  if v_aanvraag.start_datum is null or v_aanvraag.eind_datum is null
     or v_aanvraag.eind_datum < v_aanvraag.start_datum then
    raise exception 'De aangevraagde periode is onvolledig.' using errcode = 'P0001';
  end if;

  -- Hercontrole IN dezelfde transactie; de exclusion constraint op boekingen
  -- blijft de definitieve bescherming tegen gelijktijdige boekingen.
  if exists (
    select 1 from public.boekingen b
    where b.status::text in ('optie', 'definitief', 'optie_verlopen', 'migratie_vastgelegd')
      and daterange(b.start_datum, b.eind_datum, '[]') && daterange(v_aanvraag.start_datum, v_aanvraag.eind_datum, '[]')
  ) then
    raise exception 'De periode overlapt met een bestaande boeking.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.aanvragen a
    where a.id <> v_aanvraag.id
      and a.status::text in ('nieuw', 'in_behandeling', 'wacht_op_aanvrager', 'goedgekeurd')
      and a.start_datum is not null and a.eind_datum is not null
      and daterange(a.start_datum, a.eind_datum, '[]') && daterange(v_aanvraag.start_datum, v_aanvraag.eind_datum, '[]')
      and not exists (
        select 1 from public.boekingen b
        where b.id = a.boeking_id and b.status::text in ('geannuleerd', 'afgewezen', 'afgerond', 'gearchiveerd')
      )
  ) then
    raise exception 'Er loopt al een andere aanvraag voor deze periode.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.interne_activiteiten i
    where i.blokkeert_verhuurkalender = true
      and daterange(i.start_datum, i.eind_datum, '[]') && daterange(v_aanvraag.start_datum, v_aanvraag.eind_datum, '[]')
  ) then
    raise exception 'Deze periode is intern geblokkeerd.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.activiteit_bron a
    where a.zichtbaarheid::text in ('publiek', 'bezet')
      and coalesce(a.levenscyclus::text, 'actief') <> 'geannuleerd'
      and daterange(a.start_datum, a.eind_datum, '[]') && daterange(v_aanvraag.start_datum, v_aanvraag.eind_datum, '[]')
  ) then
    raise exception 'De periode heeft een blokkerende activiteit.' using errcode = 'P0001';
  end if;

  insert into public.boekingen (
    nummer, status, verhuurtype_sleutel, interne_titel, start_datum, eind_datum,
    huurder_relatie_id, aanvraag_id, huurder_naam_snapshot, huurder_email_snapshot,
    huurder_telefoon_snapshot, huurder_adres_snapshot, aantal_personen, toelichting,
    website, mede_exposanten, optie_aangemaakt_op, optietermijn_dagen, optie_einddatum
  ) values (
    'KVP-' || to_char(v_aanvraag.start_datum, 'YYYYMMDD') || '-' || v_aanvraag.id,
    'optie', v_aanvraag.verhuurtype_sleutel, v_aanvraag.naam,
    v_aanvraag.start_datum, v_aanvraag.eind_datum, v_aanvraag.relatie_id,
    v_aanvraag.id, v_aanvraag.naam, v_aanvraag.email, v_aanvraag.telefoon,
    v_aanvraag.adres, v_aanvraag.aantal_personen, v_aanvraag.toelichting,
    v_aanvraag.website, v_aanvraag.mede_exposanten, v_vandaag, 14, v_vandaag + 14
  ) returning id into v_boeking_id;

  update public.aanvragen
     set status = 'goedgekeurd', boeking_id = v_boeking_id
   where id = p_aanvraag_id;
  if not found then
    raise exception 'De aanvraag kon niet worden bijgewerkt.' using errcode = 'P0001';
  end if;
  return jsonb_build_object('boekingId', v_boeking_id, 'alVerwerkt', false);
end;
$$;

revoke all on function public.keur_aanvraag_en_reserveer(bigint) from public, anon;
grant execute on function public.keur_aanvraag_en_reserveer(bigint) to authenticated;
