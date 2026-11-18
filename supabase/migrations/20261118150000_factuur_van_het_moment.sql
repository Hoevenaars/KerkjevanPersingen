-- Geen mutaties aan bestaande boekingen of betalingen. Geen mailautomatisering activeren.
-- Facturen zijn bevroren momentopnamen van precies een bestaande betaaltermijn.
-- Voer eerst uit op staging. Fiscale instellingen worden NIET automatisch ingevuld.
CREATE TABLE IF NOT EXISTS public.facturen (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  boeking_id bigint NOT NULL REFERENCES public.boekingen(id) ON DELETE RESTRICT,
  contract_versie integer NOT NULL,
  betaling_id bigint NOT NULL UNIQUE REFERENCES public.betalingen(id) ON DELETE RESTRICT,
  fase text NOT NULL CHECK (fase IN ('aanbetaling','restant')),
  factuurnummer text NOT NULL UNIQUE,
  factuurdatum date NOT NULL,
  vervaldatum date NOT NULL,
  bedrag numeric(10,2) NOT NULL CHECK (bedrag > 0),
  exclusief_btw numeric(10,2) NOT NULL CHECK (exclusief_btw >= 0),
  btw_bedrag numeric(10,2) NOT NULL CHECK (btw_bedrag >= 0),
  btw_regime text NOT NULL CHECK (btw_regime IN ('belast_9','belast_21','vrijgesteld','geen_btw')),
  btw_nummer text NOT NULL DEFAULT '',
  btw_toelichting text NOT NULL DEFAULT '',
  verhuurder_naam text NOT NULL,
  verhuurder_adres text NOT NULL,
  verhuurder_kvk text NOT NULL,
  verhuurder_iban text NOT NULL,
  huurder_naam text NOT NULL,
  huurder_adres text NOT NULL,
  omschrijving text NOT NULL,
  contractnummer text NOT NULL,
  boekingsnummer text NOT NULL DEFAULT '',
  periode_van date NOT NULL,
  periode_tot date NOT NULL,
  pdf_pad text,
  pdf_sha256 text,
  verzonden_op timestamptz,
  provider_bericht_id text,
  aangemaakt_op timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (boeking_id, contract_versie) REFERENCES public.contractversies (boeking_id, versie) ON DELETE RESTRICT,
  CHECK (bedrag = exclusief_btw + btw_bedrag),
  CHECK (periode_tot >= periode_van),
  CHECK (factuurnummer ~ '^KVPF-[0-9]{4}-[0-9]{6}$')
);

CREATE INDEX IF NOT EXISTS facturen_boeking_idx ON public.facturen (boeking_id, factuurdatum);
ALTER TABLE public.facturen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS facturen_dossier_lezen ON public.facturen;
CREATE POLICY facturen_dossier_lezen ON public.facturen FOR SELECT TO authenticated
  USING (app.heeft_recht('boekingen','lezen') OR app.heeft_recht('aanvragen','lezen') OR app.heeft_recht('finance','lezen'));
REVOKE ALL ON public.facturen FROM anon, authenticated;
GRANT SELECT ON public.facturen TO authenticated;

-- Het factuurnummer wordt pas bij bestuursakkoord uitgegeven en blijft behouden
-- als de mailprovider later een storing heeft. Een proefmail geeft geen nummer uit.
CREATE OR REPLACE FUNCTION public.factuur_bij_contract(p_boeking_id bigint, p_versie integer)
RETURNS public.facturen
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_boeking public.boekingen%ROWTYPE;
  v_contract public.contractversies%ROWTYPE;
  v_betaling public.betalingen%ROWTYPE;
  v_bestaand public.facturen%ROWTYPE;
  v_aantal_aan integer;
  v_aantal_rest integer;
  v_regime text;
  v_btw_id text;
  v_btw_toelichting text;
  v_verkoper_naam text;
  v_verkoper_adres text;
  v_verkoper_kvk text;
  v_iban text;
  v_huurder_naam text;
  v_huurder_adres text;
  v_tarief numeric(10,2);
  v_aan numeric(10,2);
  v_bedrag numeric(10,2);
  v_exclusief numeric(10,2);
  v_btw numeric(10,2);
  v_jaar integer;
  v_volg integer;
  v_nummer text;
  v_wizard jsonb;
  v_huur_str text;
  v_aan_str text;
BEGIN
  IF auth.uid() IS NULL OR NOT app.heeft_recht('instellingen','schrijven') OR
     NOT (app.heeft_recht('boekingen','schrijven') OR app.heeft_recht('aanvragen','schrijven')) THEN
    RAISE EXCEPTION 'Geen recht om een factuur te genereren' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_boeking FROM public.boekingen WHERE id = p_boeking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Boeking ontbreekt'; END IF;
  IF v_boeking.status NOT IN ('optie','definitief') THEN
    RAISE EXCEPTION 'Voor deze boekingsstatus mag geen factuur worden uitgegeven';
  END IF;
  SELECT * INTO v_contract FROM public.contractversies
   WHERE boeking_id = p_boeking_id AND versie = p_versie FOR SHARE;
  IF NOT FOUND OR (v_contract.bestuur_verplicht AND v_contract.bestuur <> 'akkoord') OR v_contract.bestuur = 'terug' THEN
    RAISE EXCEPTION 'Het bestuur heeft deze contractversie niet goedgekeurd';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contractversies WHERE boeking_id = p_boeking_id AND versie > p_versie) THEN
    RAISE EXCEPTION 'Een nieuwere contractversie bestaat';
  END IF;
  v_tarief := v_boeking.tarief_bedrag;
  v_aan := v_boeking.aanbetaling_bedrag;
  IF v_tarief IS NULL OR v_tarief <= 0 OR v_aan IS NULL OR v_aan < 0 OR v_aan > v_tarief THEN
    RAISE EXCEPTION 'Het betaalschema of huurbedrag is onvolledig';
  END IF;
  -- Bewaakte fiscale waarheid: geen factuur bij een aangepast boekingsbedrag
  -- waarvoor de goedgekeurde contractversie niet opnieuw is vastgesteld.
  v_wizard := v_contract.afspraken -> 'wizard';
  IF v_wizard IS NULL OR jsonb_typeof(v_wizard) <> 'object' THEN
    RAISE EXCEPTION 'De bevroren contractgegevens ontbreken; stel een nieuwe contractversie op';
  END IF;
  v_huur_str := replace(replace(btrim(coalesce(v_wizard->>'huurprijs','')), '€',''), ' ','');
  v_aan_str := replace(replace(btrim(coalesce(v_wizard->>'aanbetaling','')), '€',''), ' ','');
  IF position(',' in v_huur_str) > 0 THEN v_huur_str := replace(replace(v_huur_str, '.',''), ',', '.'); END IF;
  IF position(',' in v_aan_str) > 0 THEN v_aan_str := replace(replace(v_aan_str, '.',''), ',', '.'); END IF;
  IF v_huur_str !~ '^[0-9]+(\.[0-9]{1,2})?$' OR
     v_aan_str !~ '^[0-9]+(\.[0-9]{1,2})?$' OR
     v_huur_str::numeric <> v_tarief OR v_aan_str::numeric <> v_aan OR
     v_wizard->>'periodeVan' IS DISTINCT FROM v_boeking.start_datum::text OR
     v_wizard->>'periodeTot' IS DISTINCT FROM v_boeking.eind_datum::text THEN
    RAISE EXCEPTION 'Boekingsbedragen of periode wijken af van het goedgekeurde contract';
  END IF;
  SELECT count(*) FILTER (WHERE soort = 'aanbetaling'), count(*) FILTER (WHERE soort = 'restant')
    INTO v_aantal_aan, v_aantal_rest
    FROM public.betalingen WHERE boeking_id = p_boeking_id AND status <> 'geannuleerd' AND soort IN ('aanbetaling','restant');
  IF v_aantal_aan <> (CASE WHEN v_aan > 0 THEN 1 ELSE 0 END) OR
     v_aantal_rest <> (CASE WHEN v_tarief > v_aan THEN 1 ELSE 0 END) THEN
    RAISE EXCEPTION 'Betaalregels zijn dubbel of incompleet';
  END IF;
  IF v_aan > 0 THEN
    SELECT * INTO v_betaling FROM public.betalingen
     WHERE boeking_id = p_boeking_id AND soort = 'aanbetaling' AND status <> 'geannuleerd' FOR UPDATE;
    v_bedrag := v_aan;
    IF EXISTS (SELECT 1 FROM public.betalingen
      WHERE boeking_id = p_boeking_id AND soort = 'restant' AND status <> 'geannuleerd' AND vervaldatum <= (now() AT TIME ZONE 'Europe/Amsterdam')::date) THEN
      RAISE EXCEPTION 'Aanbetaling en restant zijn tegelijk opeisbaar; corrigeer eerst het betaalschema';
    END IF;
  ELSE
    SELECT * INTO v_betaling FROM public.betalingen
     WHERE boeking_id = p_boeking_id AND soort = 'restant' AND status <> 'geannuleerd' FOR UPDATE;
    v_bedrag := v_tarief;
  END IF;
  IF NOT FOUND OR v_betaling.bedrag IS DISTINCT FROM v_bedrag OR v_betaling.vervaldatum IS NULL OR
     v_betaling.status NOT IN ('open','ontvangen') THEN
    RAISE EXCEPTION 'Betaalregel sluit niet aan op de contractafspraken';
  END IF;
  IF (v_betaling.soort = 'aanbetaling' AND v_wizard->>'aanbetalingVerval' IS DISTINCT FROM v_betaling.vervaldatum::text) OR
     (v_betaling.soort = 'restant' AND v_wizard->>'restVerval' IS DISTINCT FROM v_betaling.vervaldatum::text) THEN
    RAISE EXCEPTION 'De betalingstermijn wijkt af van het vastgelegde contract';
  END IF;
  -- Eerder uitgegeven facturen blijven exact hetzelfde, ook bij een retry.
  SELECT * INTO v_bestaand FROM public.facturen WHERE betaling_id = v_betaling.id;
  IF FOUND THEN
    IF v_bestaand.boeking_id <> p_boeking_id OR v_bestaand.contract_versie <> p_versie OR
       v_bestaand.bedrag <> v_bedrag OR v_bestaand.vervaldatum <> v_betaling.vervaldatum THEN
      RAISE EXCEPTION 'Eerdere factuur wijkt af; controleer correctie of creditnota';
    END IF;
    RETURN v_bestaand;
  END IF;

  SELECT waarde #>> '{}' INTO v_regime FROM public.instellingen WHERE sleutel = 'factuur_btw_regime';
  SELECT waarde #>> '{}' INTO v_btw_id FROM public.instellingen WHERE sleutel = 'factuur_btw_nummer';
  SELECT waarde #>> '{}' INTO v_btw_toelichting FROM public.instellingen WHERE sleutel = 'factuur_btw_toelichting';
  SELECT waarde #>> '{}' INTO v_verkoper_naam FROM public.instellingen WHERE sleutel = 'factuur_verhuurder_naam';
  SELECT waarde #>> '{}' INTO v_verkoper_adres FROM public.instellingen WHERE sleutel = 'factuur_verhuurder_adres';
  SELECT waarde #>> '{}' INTO v_verkoper_kvk FROM public.instellingen WHERE sleutel = 'factuur_kvk';
  SELECT waarde #>> '{}' INTO v_iban FROM public.instellingen WHERE sleutel = 'documentenflow_iban';
  IF v_regime NOT IN ('belast_9','belast_21','vrijgesteld','geen_btw') OR v_regime IS NULL OR
     nullif(btrim(coalesce(v_verkoper_naam,'')),'') IS NULL OR nullif(btrim(coalesce(v_verkoper_adres,'')),'') IS NULL OR
     nullif(btrim(coalesce(v_verkoper_kvk,'')),'') IS NULL OR nullif(btrim(coalesce(v_iban,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Factuurinstellingen zijn niet compleet; geen factuur uitgegeven';
  END IF;
  IF (v_regime LIKE 'belast_%' AND nullif(btrim(coalesce(v_btw_id,'')),'') IS NULL) OR
     (v_regime NOT LIKE 'belast_%' AND nullif(btrim(coalesce(v_btw_toelichting,'')),'') IS NULL) THEN
    RAISE EXCEPTION 'Btw-behandeling is niet voldoende onderbouwd';
  END IF;
  -- Huurdergegevens van het bevroren contract gebruiken; latere profiel-
  -- of adreswijzigingen mogen een verzonden factuur niet ongemerkt aanpassen.
  v_huurder_naam := nullif(btrim(v_wizard->>'naam'),'');
  IF nullif(btrim(coalesce(v_wizard->>'straat','')),'') IS NULL OR
     nullif(btrim(coalesce(v_wizard->>'huisnummer','')),'') IS NULL OR
     nullif(btrim(coalesce(v_wizard->>'postcode','')),'') IS NULL OR
     nullif(btrim(coalesce(v_wizard->>'woonplaats','')),'') IS NULL THEN
    RAISE EXCEPTION 'Het factuuradres van de bevroren contractversie is niet compleet';
  END IF;
  v_huurder_adres := concat_ws(' ', v_wizard->>'straat', v_wizard->>'huisnummer',
    nullif(btrim(coalesce(v_wizard->>'toevoeging','')),''), v_wizard->>'postcode', v_wizard->>'woonplaats');
  IF nullif(btrim(coalesce(v_huurder_naam,'')),'') IS NULL OR nullif(btrim(coalesce(v_huurder_adres,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Naam of adres van de huurder ontbreekt';
  END IF;
  IF v_regime = 'belast_21' THEN v_exclusief := round(v_bedrag / 1.21, 2);
  ELSIF v_regime = 'belast_9' THEN v_exclusief := round(v_bedrag / 1.09, 2);
  ELSE v_exclusief := v_bedrag;
  END IF;
  v_btw := v_bedrag - v_exclusief;
  v_jaar := extract(year from now() AT TIME ZONE 'Europe/Amsterdam')::integer;
  -- Serialize per year; do not issue a new number on a provider retry.
  PERFORM pg_advisory_xact_lock(hashtext('kerkje_facturen'), v_jaar);
  SELECT coalesce(max(right(factuurnummer, 6)::integer), 0) + 1 INTO v_volg
    FROM public.facturen WHERE factuurnummer LIKE 'KVPF-' || v_jaar::text || '-%';
  IF v_volg > 999999 THEN RAISE EXCEPTION 'Factuurnummerreeks is vol'; END IF;
  v_nummer := format('KVPF-%s-%s', v_jaar, lpad(v_volg::text, 6, '0'));
  INSERT INTO public.facturen (
    boeking_id, contract_versie, betaling_id, fase, factuurnummer, factuurdatum, vervaldatum,
    bedrag, exclusief_btw, btw_bedrag, btw_regime, btw_nummer, btw_toelichting,
    verhuurder_naam, verhuurder_adres, verhuurder_kvk, verhuurder_iban,
    huurder_naam, huurder_adres, omschrijving, contractnummer, boekingsnummer, periode_van, periode_tot
  ) VALUES (
    p_boeking_id, p_versie, v_betaling.id, v_betaling.soort, v_nummer,
    (now() AT TIME ZONE 'Europe/Amsterdam')::date, v_betaling.vervaldatum,
    v_bedrag, v_exclusief, v_btw, v_regime, coalesce(v_btw_id,''), coalesce(v_btw_toelichting,''),
    v_verkoper_naam, v_verkoper_adres, v_verkoper_kvk, v_iban,
    v_huurder_naam, v_huurder_adres, 'Verhuur Kerkje van Persingen - ' || v_boeking.interne_titel,
    v_contract.contractnummer, coalesce(v_boeking.nummer,''), v_boeking.start_datum, v_boeking.eind_datum
  ) RETURNING * INTO v_bestaand;
  RETURN v_bestaand;
END;
$$;
REVOKE ALL ON FUNCTION public.factuur_bij_contract(bigint, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.factuur_bij_contract(bigint, integer) TO authenticated;

-- Alleen de reeds geverifieerde provider-acceptatie mag de verzendstatus bijwerken.
CREATE OR REPLACE FUNCTION public.factuur_markeer_verzonden(p_factuur_id bigint, p_bericht_id text, p_pdf_pad text, p_pdf_sha256 text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_bestaand public.facturen%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT app.heeft_recht('instellingen','schrijven') THEN
    RAISE EXCEPTION 'Geen recht' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(coalesce(p_bericht_id,'')),'') IS NULL OR nullif(btrim(coalesce(p_pdf_pad,'')),'') IS NULL OR
     p_pdf_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Verzendbewijs of documentcontrole ontbreekt';
  END IF;
  SELECT * INTO v_bestaand FROM public.facturen WHERE id = p_factuur_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factuur ontbreekt'; END IF;
  -- Een willekeurig bericht-ID is geen bewijs van verzending. Het bericht
  -- moet al geaccepteerd zijn in het bestaande contractverzendregister.
  IF NOT EXISTS (
    SELECT 1 FROM public.contract_verzendingen z
    WHERE z.boeking_id = v_bestaand.boeking_id
      AND z.versie = v_bestaand.contract_versie
      AND z.status = 'verzonden'
      AND z.bericht_id = p_bericht_id
      AND z.soort IN ('contract','herhaling')
  ) THEN
    RAISE EXCEPTION 'Geen geverifieerde contractverzending voor deze factuur';
  END IF;
  IF v_bestaand.provider_bericht_id IS NOT NULL THEN
    IF v_bestaand.provider_bericht_id <> p_bericht_id OR v_bestaand.pdf_sha256 <> p_pdf_sha256 THEN
      RAISE EXCEPTION 'Er bestaat een andere verzending of PDF voor deze factuur';
    END IF;
    RETURN;
  END IF;
  UPDATE public.facturen SET verzonden_op = now(), provider_bericht_id = p_bericht_id,
    pdf_pad = p_pdf_pad, pdf_sha256 = p_pdf_sha256 WHERE id = p_factuur_id;
END;
$$;
REVOKE ALL ON FUNCTION public.factuur_markeer_verzonden(bigint, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.factuur_markeer_verzonden(bigint, text, text, text) TO authenticated;
