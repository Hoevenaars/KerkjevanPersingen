-- V4: maak het opslaan van contract, boeking en betaalregels atomair.
-- Uitsluitend staging totdat integratietests met echte PostgreSQL zijn geslaagd.
-- De bestaande schermen en tabellen blijven behouden. Geen mail of cron actief.

CREATE OR REPLACE FUNCTION public.bewaar_contract_atomair(
  p_boeking_id bigint,
  p_aanvraag_id bigint,
  p_verwachte_versie integer,
  p_contract jsonb,
  p_wizard jsonb,
  p_betalingen jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_boeking public.boekingen%ROWTYPE;
  v_actuele_versie integer;
  v_nieuwe_versie integer;
  v_huur numeric(10,2);
  v_aan numeric(10,2);
  v_totaal numeric(10,2) := 0;
  v_termijn jsonb;
  v_soort text;
  v_bedrag numeric(10,2);
  v_verval date;
  v_open public.betalingen%ROWTYPE;
  v_gewenst jsonb;
  v_gevonden boolean;
  v_aantal integer;
  v_aantal_soort integer;
  v_wizard_huur text;
  v_wizard_aan text;
BEGIN
  -- De RPC werkt als SECURITY DEFINER. Daarom is alleen 'aanvragen schrijven'
  -- onvoldoende om via deze functie boekingen en betalingen te muteren.
  IF auth.uid() IS NULL OR NOT (
    app.heeft_recht('boekingen', 'schrijven') OR
    (app.heeft_recht('aanvragen', 'schrijven') AND app.heeft_recht('instellingen', 'schrijven'))
  ) THEN
    RAISE EXCEPTION 'Geen contractbeheerrecht' USING ERRCODE = '42501';
  END IF;
  IF p_boeking_id IS NULL OR p_boeking_id <= 0 OR p_verwachte_versie IS NULL OR p_verwachte_versie < 0 OR
     p_contract IS NULL OR jsonb_typeof(p_contract) <> 'object' OR
     p_wizard IS NULL OR jsonb_typeof(p_wizard) <> 'object' OR
     p_betalingen IS NULL OR jsonb_typeof(p_betalingen) <> 'array' THEN
    RAISE EXCEPTION 'Ongeldige contractinvoer';
  END IF;
  SELECT * INTO v_boeking FROM public.boekingen WHERE id = p_boeking_id FOR UPDATE;
  IF NOT FOUND OR v_boeking.status NOT IN ('optie','optie_verlopen') THEN
    RAISE EXCEPTION 'Deze boeking kan niet in een nieuwe contractversie worden gezet';
  END IF;
  IF p_aanvraag_id IS NOT NULL AND v_boeking.aanvraag_id IS DISTINCT FROM p_aanvraag_id THEN
    RAISE EXCEPTION 'De aanvraag hoort niet bij deze boeking';
  END IF;
  IF EXISTS (SELECT 1 FROM public.facturen WHERE boeking_id = p_boeking_id) THEN
    RAISE EXCEPTION 'Er bestaat een uitgegeven factuur. Corrigeer eerst via een credit- of correctieproces';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contract_verzendingen WHERE boeking_id = p_boeking_id AND status = 'bezig') THEN
    RAISE EXCEPTION 'Er loopt nog een contractverzending. Wijzig de contractversie nu niet';
  END IF;
  SELECT COALESCE(MAX(versie), 0) INTO v_actuele_versie
    FROM public.contractversies WHERE boeking_id = p_boeking_id;
  IF v_actuele_versie <> p_verwachte_versie THEN
    RAISE EXCEPTION 'De contractversie is intussen veranderd. Vernieuw het dossier';
  END IF;
  v_nieuwe_versie := v_actuele_versie + 1;
  IF length(btrim(COALESCE(p_contract->>'tekst',''))) < 50 OR
     length(btrim(COALESCE(p_contract->>'voorwaarden_tekst',''))) < 30 OR
     length(btrim(COALESCE(p_contract->>'huisregels_tekst',''))) < 30 OR
     COALESCE(p_contract->>'contractnummer', '') = '' OR
     COALESCE(p_contract->>'vingerafdruk', '') = '' OR
     COALESCE(p_contract->>'opgesteld_op', '') = '' OR
     COALESCE(p_contract->>'versie','') <> v_nieuwe_versie::text THEN
    RAISE EXCEPTION 'Contractdocument of versienummer is onvolledig';
  END IF;
  IF COALESCE(p_wizard->>'periodeVan','') <> COALESCE(p_contract->>'periode_van','') OR
     COALESCE(p_wizard->>'periodeTot','') <> COALESCE(p_contract->>'periode_tot','') THEN
    RAISE EXCEPTION 'De huurperiode is inconsistent';
  END IF;
  -- Een contract voor andere dagen dan de door het bestuur beoordeelde
  -- reservering vereist eerst een nieuwe beschikbaarheids- en bestuurscontrole.
  IF p_wizard->>'periodeVan' IS DISTINCT FROM v_boeking.start_datum::text OR
     p_wizard->>'periodeTot' IS DISTINCT FROM v_boeking.eind_datum::text THEN
    RAISE EXCEPTION 'De contractperiode wijkt af van de goedgekeurde reservering';
  END IF;
  IF COALESCE(p_wizard->>'periodeVan','') !~ '^\d{4}-\d{2}-\d{2}$' OR
     COALESCE(p_wizard->>'periodeTot','') !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'Contractdatums zijn ongeldig';
  END IF;
  -- Prijs komt uit gevalideerde velden; controleer elke betaalregel in de transactie opnieuw.
  v_huur := (p_contract->>'huurprijs_euro')::numeric(10,2);
  v_aan := (p_contract->>'aanbetaling_euro')::numeric(10,2);
  IF v_huur IS NULL OR v_huur <= 0 OR v_aan IS NULL OR v_aan < 0 OR v_aan > v_huur OR
     v_huur <> (p_contract->>'huurprijs_euro')::numeric OR
     v_aan <> (p_contract->>'aanbetaling_euro')::numeric THEN
    RAISE EXCEPTION 'Huurprijs of aanbetaling is ongeldig';
  END IF;
  -- De server krijgt zowel contractgegevens als formuliergegevens. Ze moeten
  -- financieel identiek zijn; anders zou de PDF iets anders kunnen vermelden
  -- dan de boeking/betaalregels. Ondersteun dezelfde decimaalnotatie als de wizard.
  v_wizard_huur := regexp_replace(btrim(COALESCE(p_wizard->>'huurprijs','')), '[€[:space:]]', '', 'g');
  v_wizard_aan := regexp_replace(btrim(COALESCE(p_wizard->>'aanbetaling','')), '[€[:space:]]', '', 'g');
  IF position(',' IN v_wizard_huur) > 0 THEN
    v_wizard_huur := replace(replace(v_wizard_huur, '.', ''), ',', '.');
  END IF;
  IF position(',' IN v_wizard_aan) > 0 THEN
    v_wizard_aan := replace(replace(v_wizard_aan, '.', ''), ',', '.');
  END IF;
  IF v_wizard_huur !~ '^[0-9]+(\.[0-9]{1,2})?$' OR
     v_wizard_aan !~ '^[0-9]+(\.[0-9]{1,2})?$' OR
     v_wizard_huur::numeric <> v_huur OR v_wizard_aan::numeric <> v_aan THEN
    RAISE EXCEPTION 'De bedragen van contract en formulier komen niet overeen';
  END IF;
  IF jsonb_array_length(p_betalingen) > 2 THEN RAISE EXCEPTION 'Te veel betalingstermijnen'; END IF;
  IF COALESCE(NULLIF(BTRIM(p_wizard->>'naam'), ''), '') = '' OR
     COALESCE(NULLIF(BTRIM(p_wizard->>'email'), ''), '') = '' OR
     COALESCE(NULLIF(BTRIM(p_wizard->>'activiteit'), ''), '') = '' THEN
    RAISE EXCEPTION 'Verplichte contractgegevens ontbreken';
  END IF;
  FOR v_termijn IN SELECT value FROM jsonb_array_elements(p_betalingen) LOOP
    v_soort := v_termijn->>'soort';
    v_bedrag := (v_termijn->>'bedrag')::numeric(10,2);
    v_verval := (v_termijn->>'verval')::date;
    IF v_soort NOT IN ('aanbetaling','restant') OR v_bedrag IS NULL OR v_bedrag <= 0 OR v_verval IS NULL THEN
      RAISE EXCEPTION 'Ongeldige betaalregel';
    END IF;
    IF (v_soort = 'aanbetaling' AND (v_bedrag <> v_aan OR p_wizard->>'aanbetalingVerval' IS DISTINCT FROM v_verval::text)) OR
       (v_soort = 'restant' AND (v_bedrag <> v_huur - v_aan OR p_wizard->>'restVerval' IS DISTINCT FROM v_verval::text)) THEN
      RAISE EXCEPTION 'Termijn wijkt af van contract';
    END IF;
    v_totaal := v_totaal + v_bedrag;
  END LOOP;
  IF v_totaal <> v_huur THEN RAISE EXCEPTION 'Betaaltermijnen tellen niet op tot de huurprijs'; END IF;
  FOR v_soort IN SELECT unnest(ARRAY['aanbetaling','restant']) LOOP
    SELECT count(*) INTO v_aantal_soort FROM jsonb_array_elements(p_betalingen) e
      WHERE e->>'soort' = v_soort;
    IF v_aantal_soort > 1 OR
       (v_soort='aanbetaling' AND v_aantal_soort <> CASE WHEN v_aan>0 THEN 1 ELSE 0 END) OR
       (v_soort='restant' AND v_aantal_soort <> CASE WHEN v_huur>v_aan THEN 1 ELSE 0 END) THEN
      RAISE EXCEPTION 'Het betaalplan bevat een dubbele of ontbrekende termijn';
    END IF;
  END LOOP;

  -- Lock alle bestaande termijnen. Een al ontvangen bedrag mag niet stilzwijgend worden aangepast.
  PERFORM id FROM public.betalingen WHERE boeking_id = p_boeking_id FOR UPDATE;
  FOR v_soort IN SELECT unnest(ARRAY['aanbetaling','restant']) LOOP
    SELECT count(*) INTO v_aantal FROM public.betalingen
      WHERE boeking_id = p_boeking_id AND soort = v_soort AND status <> 'geannuleerd';
    IF v_aantal > 1 THEN RAISE EXCEPTION 'Dubbele actieve betaalregels'; END IF;
    SELECT value INTO v_gewenst FROM jsonb_array_elements(p_betalingen) WHERE value->>'soort' = v_soort;
    v_gevonden := FOUND;
    SELECT * INTO v_open FROM public.betalingen
      WHERE boeking_id = p_boeking_id AND soort = v_soort AND status <> 'geannuleerd';
    IF v_gevonden THEN
      v_bedrag := (v_gewenst->>'bedrag')::numeric(10,2);
      v_verval := (v_gewenst->>'verval')::date;
      IF FOUND THEN
        IF v_open.status = 'ontvangen' AND (v_open.bedrag <> v_bedrag OR v_open.vervaldatum IS DISTINCT FROM v_verval) THEN
          RAISE EXCEPTION 'Ontvangen betaling mag niet worden aangepast';
        END IF;
        IF v_open.status = 'open' THEN
          UPDATE public.betalingen SET bedrag=v_bedrag, vervaldatum=v_verval WHERE id=v_open.id;
        END IF;
      ELSE
        INSERT INTO public.betalingen (boeking_id,soort,bedrag,status,vervaldatum)
          VALUES (p_boeking_id,v_soort,v_bedrag,'open',v_verval);
      END IF;
    ELSIF FOUND THEN
      IF v_open.status='ontvangen' THEN RAISE EXCEPTION 'Ontvangen betaling ontbreekt in nieuw contract'; END IF;
      UPDATE public.betalingen SET status='geannuleerd' WHERE id=v_open.id;
    END IF;
  END LOOP;

  -- Contract, boeking en betaalregels committen samen, of allemaal niet.
  INSERT INTO public.contractversies (
    boeking_id,versie,contractnummer,opgesteld_op,tekst,voorwaarden_tekst,huisregels_tekst,
    plattegrond_tekst,vingerafdruk,afspraken,bestuur_verplicht,bestuur,ondertekening,checks
  ) VALUES (
    p_boeking_id,v_nieuwe_versie,p_contract->>'contractnummer',(p_contract->>'opgesteld_op')::date,
    p_contract->>'tekst',p_contract->>'voorwaarden_tekst',p_contract->>'huisregels_tekst',
    COALESCE(p_contract->>'plattegrond_tekst',''),p_contract->>'vingerafdruk',
    jsonb_build_object('wizard',p_wizard,'tijdVan',p_wizard->>'tijdVan','tijdTot',p_wizard->>'tijdTot',
      'opbouw',p_wizard->>'opbouw','afbouw',p_wizard->>'afbouw','contactpersoon',p_wizard->>'contactpersoon'),
    true,'open','open','{}'::jsonb
  );
  UPDATE public.boekingen SET
    tarief_bedrag=v_huur, aanbetaling_bedrag=v_aan,
    start_datum=(p_wizard->>'periodeVan')::date, eind_datum=(p_wizard->>'periodeTot')::date,
    aantal_personen=NULLIF(BTRIM(p_wizard->>'personen'),''),
    huurder_naam_snapshot=p_wizard->>'naam', huurder_email_snapshot=p_wizard->>'email',
    huurder_telefoon_snapshot=NULLIF(BTRIM(p_wizard->>'telefoon'),''),
    interne_titel=p_wizard->>'activiteit', bijgewerkt_op=now()
    WHERE id=p_boeking_id;
  IF p_aanvraag_id IS NOT NULL THEN
    UPDATE public.aanvragen SET
      naam=p_wizard->>'naam',email=p_wizard->>'email',telefoon=NULLIF(BTRIM(p_wizard->>'telefoon'),''),
      straat=p_wizard->>'straat',huisnummer=p_wizard->>'huisnummer',
      huisnummer_toevoeging=NULLIF(BTRIM(p_wizard->>'toevoeging'),''),
      postcode=p_wizard->>'postcode',woonplaats=p_wizard->>'woonplaats',
      aantal_personen=NULLIF(BTRIM(p_wizard->>'personen'),'')
      WHERE id=p_aanvraag_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bijbehorende aanvraag ontbreekt'; END IF;
  END IF;
  -- Oudere tekencodes laten vervallen, maar historische verzendingen nooit als niet-verzonden herschrijven.
  UPDATE public.contract_tekeningen SET
    verloopt_op=now() - interval '1 second', code_hash=NULL,code_verloopt=NULL,
    geverifieerd_op=NULL,vrijgegeven=false
    WHERE boeking_id=p_boeking_id AND versie<v_nieuwe_versie AND ondertekend_op IS NULL;
  RETURN jsonb_build_object('contractnummer',p_contract->>'contractnummer','versie',v_nieuwe_versie);
END;
$$;

REVOKE ALL ON FUNCTION public.bewaar_contract_atomair(bigint,bigint,integer,jsonb,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bewaar_contract_atomair(bigint,bigint,integer,jsonb,jsonb,jsonb) TO authenticated;
