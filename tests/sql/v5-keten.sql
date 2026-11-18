-- Ketentest op de lokale database kerkje_v5_migraties.
-- Geen productie, geen mailprovider, geen echte ontvangers.
-- Faalt hard bij een afwijkende status, een tweede factuur of een tweede verzending.

\set ON_ERROR_STOP on

-- Opnieuw draaien ruimt alleen de ketentestregels op.
delete from public.contract_verzendingen
 where boeking_id in (select boeking_id from public.aanvragen where email like 'v5-keten-%@example.com' and boeking_id is not null);
delete from public.facturen
 where boeking_id in (select boeking_id from public.aanvragen where email like 'v5-keten-%@example.com' and boeking_id is not null);
delete from public.betalingen
 where boeking_id in (select boeking_id from public.aanvragen where email like 'v5-keten-%@example.com' and boeking_id is not null);
delete from public.contractversies
 where boeking_id in (select boeking_id from public.aanvragen where email like 'v5-keten-%@example.com' and boeking_id is not null);
update public.aanvragen set boeking_id = null where email like 'v5-keten-%@example.com';
delete from public.boekingen
 where aanvraag_id in (select id from public.aanvragen where email like 'v5-keten-%@example.com');
delete from public.aanvragen where email like 'v5-keten-%@example.com';

update public.profielen
   set status = 'active'
 where id = '11111111-1111-1111-1111-111111111111';

insert into public.gebruikersrechten (profiel_id, module_sleutel, niveau)
values
  ('11111111-1111-1111-1111-111111111111', 'aanvragen', 'schrijven'),
  ('11111111-1111-1111-1111-111111111111', 'instellingen', 'schrijven'),
  ('11111111-1111-1111-1111-111111111111', 'boekingen', 'schrijven')
on conflict (profiel_id, module_sleutel) do update set niveau = 'schrijven';

insert into public.aanvragen (naam, email, telefoon, verhuurtype_sleutel, start_datum, eind_datum, straat, huisnummer, postcode, woonplaats, toelichting)
values
  ('Keten Test', 'v5-keten-ja@example.com', '0600000000', 'expositie', '2098-06-10', '2098-06-12', 'Dorpsstraat', '1', '6641 AA', 'Persingen', 'ketentest ja'),
  ('Keten Nee', 'v5-keten-nee@example.com', '0600000001', 'expositie', '2098-07-01', '2098-07-03', 'Dorpsstraat', '2', '6641 AA', 'Persingen', 'ketentest nee'),
  ('Keten Tarief', 'v5-keten-tarief@example.com', '0600000002', 'expositie', '2098-08-01', '2098-08-03', 'Dorpsstraat', '3', '6641 AA', 'Persingen', 'ketentest zonder tarief'),
  ('Keten Dubbel', 'v5-keten-dubbel@example.com', '0600000003', 'expositie', '2098-09-01', '2098-09-03', 'Dorpsstraat', '4', '6641 AA', 'Persingen', 'ketentest gelijktijdig'),
  ('Keten Overlap A', 'v5-keten-overlap-a@example.com', '0600000004', 'expositie', '2098-10-01', '2098-10-03', 'Dorpsstraat', '5', '6641 AA', 'Persingen', 'ketentest overlap'),
  ('Keten Overlap B', 'v5-keten-overlap-b@example.com', '0600000005', 'expositie', '2098-10-02', '2098-10-04', 'Dorpsstraat', '6', '6641 AA', 'Persingen', 'ketentest overlap');

-- Nee laat de aanvraag afgewezen, zonder boeking en zonder mail.
update public.aanvragen
   set status = 'afgewezen',
       afwijsreden = 'De activiteit past niet binnen de mogelijkheden van het Kerkje van Persingen.'
 where email = 'v5-keten-nee@example.com'
   and status = 'nieuw';

insert into public.auditlog (actor_id, actor_naam, actor_type, onderwerp_type, onderwerp_id, actie, van, naar, reden, dedup_sleutel)
select '11111111-1111-1111-1111-111111111111', 'Keten', 'bestuur', 'aanvraag', id::text, 'afgewezen', 'nieuw', 'afgewezen', afwijsreden, 'aanvraag:' || id || ':afgewezen'
  from public.aanvragen where email = 'v5-keten-nee@example.com'
on conflict (dedup_sleutel) where dedup_sleutel is not null do nothing;

-- Ja legt precies één optie vast.
select public.keur_aanvraag_en_reserveer(id) as ja
  from public.aanvragen where email = 'v5-keten-ja@example.com';

insert into public.auditlog (actor_id, actor_naam, actor_type, onderwerp_type, onderwerp_id, actie, van, naar, dedup_sleutel)
select '11111111-1111-1111-1111-111111111111', 'Keten', 'bestuur', 'aanvraag', id::text, 'goedgekeurd', 'nieuw', 'goedgekeurd', 'aanvraag:' || id || ':goedgekeurd'
  from public.aanvragen where email = 'v5-keten-ja@example.com'
on conflict (dedup_sleutel) where dedup_sleutel is not null do nothing;

-- Tweede Ja op dezelfde aanvraag maakt geen tweede boeking.
select public.keur_aanvraag_en_reserveer(id) as ja_opnieuw
  from public.aanvragen where email = 'v5-keten-ja@example.com';

-- Zonder vast tarief blijft de factuurfunctie dicht.
select public.keur_aanvraag_en_reserveer(id)
  from public.aanvragen where email = 'v5-keten-tarief@example.com';

do $$
declare
  v_id bigint;
begin
  select boeking_id into v_id from public.aanvragen where email = 'v5-keten-tarief@example.com';
  begin
    perform public.factuur_bij_contract(v_id, 1);
    raise exception 'Een boeking zonder contract en tarief kreeg toch een factuur';
  exception when others then
    if sqlerrm not like '%niet goedgekeurd%' and sqlerrm not like '%ontbreekt%' and sqlerrm not like '%onvolledig%' then
      raise;
    end if;
  end;
end $$;

-- Contract met bekende bedragen. De factuur van het moment is de aanbetaling.
do $$
declare
  v_aanvraag bigint;
  v_boeking bigint;
  v_wizard jsonb;
  v_contract jsonb;
  v_betalingen jsonb;
  v_factuur public.facturen;
  v_opnieuw public.facturen;
  v_claim bigint;
begin
  select id, boeking_id into v_aanvraag, v_boeking
    from public.aanvragen where email = 'v5-keten-ja@example.com';

  v_wizard := jsonb_build_object(
    'naam', 'Keten Test',
    'email', 'v5-keten-ja@example.com',
    'telefoon', '0600000000',
    'activiteit', 'Expositie ketentest',
    'straat', 'Dorpsstraat',
    'huisnummer', '1',
    'postcode', '6641 AA',
    'woonplaats', 'Persingen',
    'periodeVan', '2098-06-10',
    'periodeTot', '2098-06-12',
    'huurprijs', '300.00',
    'aanbetaling', '100.00',
    'aanbetalingVerval', '2026-12-01',
    'restVerval', '2098-03-01',
    'tijdVan', '10:00',
    'tijdTot', '17:00',
    'personen', '20'
  );
  v_contract := jsonb_build_object(
    'tekst', 'Dit is de huurovereenkomst voor de ketentest van het Kerkje van Persingen, met voldoende tekst.',
    'voorwaarden_tekst', 'De algemene voorwaarden van het kerkje horen bij deze overeenkomst.',
    'huisregels_tekst', 'De huisregels van het kerkje horen bij deze overeenkomst.',
    'contractnummer', 'KVP-KETEN-2098',
    'vingerafdruk', 'keten-vingerafdruk-2098',
    'opgesteld_op', '2026-11-18',
    'versie', '1',
    'periode_van', '2098-06-10',
    'periode_tot', '2098-06-12',
    'huurprijs_euro', 300,
    'aanbetaling_euro', 100
  );
  v_betalingen := jsonb_build_array(
    jsonb_build_object('soort', 'aanbetaling', 'bedrag', 100, 'verval', '2026-12-01'),
    jsonb_build_object('soort', 'restant', 'bedrag', 200, 'verval', '2098-03-01')
  );

  perform public.bewaar_contract_atomair(v_boeking, v_aanvraag, 0, v_contract, v_wizard, v_betalingen);

  begin
    perform public.factuur_bij_contract(v_boeking, 1);
    raise exception 'Factuur zonder bestuursakkoord';
  exception when others then
    if sqlerrm not like '%niet goedgekeurd%' then raise; end if;
  end;

  update public.contractversies
     set bestuur = 'akkoord'
   where boeking_id = v_boeking and versie = 1;

  if not exists (
    select 1 from public.instellingen
     where sleutel = 'factuur_verhuurder_naam'
       and nullif(btrim(waarde #>> '{}'), '') is not null
  ) then
    begin
      perform public.factuur_bij_contract(v_boeking, 1);
      raise exception 'Factuur zonder fiscale instellingen';
    exception when others then
      if sqlerrm not like '%niet compleet%' then raise; end if;
    end;
  end if;

  insert into public.instellingen (sleutel, groep, waarde, toelichting)
  values
    ('factuur_btw_regime', 'factuur', to_jsonb('vrijgesteld'::text), 'ketentest'),
    ('factuur_btw_toelichting', 'factuur', to_jsonb('Ketentest, geen echte factuur.'::text), 'ketentest'),
    ('factuur_verhuurder_naam', 'factuur', to_jsonb('Kerkje van Persingen ketentest'::text), 'ketentest'),
    ('factuur_verhuurder_adres', 'factuur', to_jsonb('Dorpsstraat 1, Persingen'::text), 'ketentest'),
    ('factuur_kvk', 'factuur', to_jsonb('00000000'::text), 'ketentest')
  on conflict (sleutel) do nothing;

  v_factuur := public.factuur_bij_contract(v_boeking, 1);
  if v_factuur.fase <> 'aanbetaling' or v_factuur.bedrag <> 100 then
    raise exception 'Factuur van het moment is niet de aanbetaling: % %', v_factuur.fase, v_factuur.bedrag;
  end if;
  v_opnieuw := public.factuur_bij_contract(v_boeking, 1);
  if v_opnieuw.id <> v_factuur.id or v_opnieuw.factuurnummer <> v_factuur.factuurnummer then
    raise exception 'Herhaalde verwerking gaf een tweede factuur';
  end if;
  if (select count(*) from public.facturen where boeking_id = v_boeking) <> 1 then
    raise exception 'Meer dan één factuur voor de boeking';
  end if;

  -- Nee op het contractpakket: activiteitsgoedkeuring en optie blijven staan.
  update public.contractversies set bestuur = 'terug' where boeking_id = v_boeking and versie = 1;
  if (select status from public.boekingen where id = v_boeking) <> 'optie' then
    raise exception 'Contract-nee wijzigde de boekingsstatus';
  end if;
  if (select status from public.aanvragen where id = v_aanvraag) <> 'goedgekeurd' then
    raise exception 'Contract-nee trok de activiteitsgoedkeuring in';
  end if;
  update public.contractversies set bestuur = 'akkoord' where boeking_id = v_boeking and versie = 1;

  v_claim := public.claim_contractverzending(
    v_boeking, 1, 'contract', 'keten-onzeker-01', 'v5-keten-ja@example.com', 'v5-keten-ja@example.com'
  );
  begin
    perform public.claim_contractverzending(
      v_boeking, 1, 'contract', 'keten-onzeker-02', 'v5-keten-ja@example.com', 'v5-keten-ja@example.com'
    );
    raise exception 'Onzekere verzending liet een tweede claim toe';
  exception when others then
    if sqlerrm not like '%al een live contractverzending%' then raise; end if;
  end;
  if (select count(*) from public.contract_verzendingen where boeking_id = v_boeking and status = 'verzonden') <> 0 then
    raise exception 'Er is een verzonden mail geregistreerd zonder provider';
  end if;
  if (select count(*) from public.contract_verzendingen where boeking_id = v_boeking and status = 'bezig') <> 1 then
    raise exception 'De onzekere verzending staat niet op bezig';
  end if;
  if (select count(*) from public.facturen where boeking_id = v_boeking) <> 1 then
    raise exception 'De herhaling maakte een extra factuur';
  end if;

  -- Ondertekening en ontvangst van de aanbetaling maken de optie definitief.
  update public.contractversies set ondertekening = 'ontvangen' where boeking_id = v_boeking and versie = 1;
  update public.betalingen set status = 'ontvangen' where boeking_id = v_boeking and soort = 'aanbetaling' and status = 'open';
  update public.boekingen
     set status = 'definitief', optie_einddatum = null, bijgewerkt_op = now()
   where id = v_boeking
     and status = 'optie'
     and exists (
       select 1 from public.aanvragen a
        where a.id = boekingen.aanvraag_id and a.status = 'goedgekeurd'
     )
     and exists (
       select 1 from public.contractversies v
        where v.boeking_id = boekingen.id and v.versie = 1
          and v.ondertekening = 'ontvangen' and v.bestuur = 'akkoord'
     )
     and exists (
       select 1 from public.betalingen p
        where p.boeking_id = boekingen.id and p.soort = 'aanbetaling' and p.status = 'ontvangen'
     );
  if (select status from public.boekingen where id = v_boeking) <> 'definitief' then
    raise exception 'De boeking werd niet definitief';
  end if;

  insert into public.auditlog (actor_id, actor_naam, actor_type, onderwerp_type, onderwerp_id, actie, naar, dedup_sleutel)
  values
    ('11111111-1111-1111-1111-111111111111', 'Keten', 'systeem', 'boeking', v_boeking::text, 'factuur', v_factuur.factuurnummer, 'boeking:' || v_boeking || ':factuur'),
    ('11111111-1111-1111-1111-111111111111', 'Keten', 'systeem', 'boeking', v_boeking::text, 'automatisch_definitief', 'definitief', 'boeking:' || v_boeking || ':definitief')
  on conflict (dedup_sleutel) where dedup_sleutel is not null do nothing;
end $$;
