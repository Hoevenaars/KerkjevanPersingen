-- Uitvoering van een aantoonbaar bestuursmandaat, termijnen en ontvangstbewijs.
-- Geen schakelaars activeren en geen mail versturen in deze migratie.
ALTER TABLE public.contractversies ADD COLUMN IF NOT EXISTS mandaat_aanvraag_versie text;
ALTER TABLE public.boekingen ADD COLUMN IF NOT EXISTS betaling_vereist text
  CHECK (betaling_vereist IN ('aanbetaling','volledig','geen'));
ALTER TABLE public.betalingen ADD COLUMN IF NOT EXISTS ontvangen_bedrag numeric(10,2) NOT NULL DEFAULT 0
  CHECK (ontvangen_bedrag >= 0);
ALTER TABLE public.betalingen ADD COLUMN IF NOT EXISTS factuur_op date;
UPDATE public.betalingen SET ontvangen_bedrag=bedrag WHERE status::text IN ('ontvangen','betaald') AND ontvangen_bedrag=0;
UPDATE public.boekingen SET betaling_vereist=CASE WHEN coalesce(aanbetaling_bedrag,0)>0 THEN 'aanbetaling' ELSE 'volledig' END
 WHERE betaling_vereist IS NULL AND tarief_bedrag>0;

-- De oude bestuurstrigger geldt ook binnen SECURITY DEFINER-functies. Het
-- systeem mag uitsluitend een aantoonbaar reeds genomen Ja uitvoeren.
CREATE OR REPLACE FUNCTION public.contractversie_bewaak_bestuur()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.bestuur IN ('akkoord','terug') AND
     ROW(NEW.bestuur,NEW.bestuur_actor,NEW.bestuur_op) IS DISTINCT FROM
     ROW(OLD.bestuur,OLD.bestuur_actor,OLD.bestuur_op) THEN
    IF (SELECT app.heeft_recht('instellingen','schrijven')) IS NOT TRUE AND (
      NEW.bestuur='akkoord' AND public.verhuur_machine_mag(NEW.boeking_id,NULL) AND
      EXISTS(SELECT 1 FROM public.verhuur_besluiten d WHERE d.boeking_id=NEW.boeking_id
        AND d.aanvraag_versie=NEW.mandaat_aanvraag_versie AND d.besluit='ja' AND d.status='toegewezen')
    ) IS NOT TRUE THEN RAISE EXCEPTION 'Bestuursakkoord vereist bestuursrecht of het huidige vastgelegde Ja'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Inhoudelijke geldigheid is apart van RPC-autorisatie: ook de ondertekenroute
-- moet kunnen controleren welke actuele versie het bestuur heeft goedgekeurd.
CREATE OR REPLACE FUNCTION public.verhuur_contract_mandaat_geldig(p_boeking_id bigint,p_contractversie_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM public.verhuur_besluiten d
    JOIN public.boekingen b ON b.id=d.boeking_id
    JOIN public.contractversies c ON c.boeking_id=b.id AND c.id=p_contractversie_id
    WHERE b.id=p_boeking_id AND b.aanvraag_id=d.aanvraag_id AND d.besluit='ja' AND d.status='toegewezen'
      AND d.aanvraag_versie=public.verhuur_aanvraag_versie(d.aanvraag_id)
      AND c.mandaat_aanvraag_versie=d.aanvraag_versie AND c.bestuur='akkoord'
      AND d.huurprijs_euro=b.tarief_bedrag
      AND NOT EXISTS(SELECT 1 FROM public.contractversies n WHERE n.boeking_id=b.id AND n.versie>c.versie));
$$;
REVOKE ALL ON FUNCTION public.verhuur_contract_mandaat_geldig(bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verhuur_contract_mandaat_geldig(bigint,bigint) TO service_role;

-- De laatste voorwaarde kan ondertekening óf ontvangst zijn. De boekingslock
-- serialiseert beide met annulering; een oude checklist geeft geen schrijfrecht.
CREATE OR REPLACE FUNCTION public.verhuur_promoveer_indien_klaar(p_boeking_id bigint,p_actor_label text DEFAULT 'Verhuurmachine')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE b public.boekingen%ROWTYPE; a public.aanvragen%ROWTYPE; d public.verhuur_besluiten%ROWTYPE;
  c public.contractversies%ROWTYPE; aantal_aan integer; aantal_rest integer; totaal numeric;
  voldaan boolean; actor text; rol text:=auth.role();
BEGIN
  IF (rol='service_role' OR (auth.uid() IS NOT NULL AND
    (app.heeft_recht('finance','schrijven') OR app.heeft_recht('boekingen','schrijven') OR
     (app.heeft_recht('aanvragen','schrijven') AND app.heeft_recht('instellingen','schrijven'))))) IS NOT TRUE THEN
    RAISE EXCEPTION 'Geen recht op automatische checklistverwerking' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.verhuur_besluiten WHERE boeking_id=p_boeking_id) THEN
    RETURN jsonb_build_object('machine',false,'ok',true,'gepromoveerd',false);
  END IF;
  SELECT * INTO b FROM public.boekingen WHERE id=p_boeking_id FOR UPDATE;
  IF NOT FOUND OR b.status::text NOT IN ('optie','definitief') THEN
    RETURN jsonb_build_object('machine',true,'ok',true,'gepromoveerd',false,'melding','De boeking staat niet op een actieve optie.');
  END IF;
  SELECT * INTO a FROM public.aanvragen WHERE id=b.aanvraag_id FOR SHARE;
  SELECT * INTO d FROM public.verhuur_besluiten WHERE aanvraag_id=b.aanvraag_id AND boeking_id=b.id FOR SHARE;
  IF NOT FOUND OR a.boeking_id IS DISTINCT FROM b.id OR a.status::text<>'goedgekeurd' OR
     d.besluit<>'ja' OR d.status<>'toegewezen' OR d.aanvraag_versie IS DISTINCT FROM public.verhuur_aanvraag_versie(a.id) OR
     d.huurprijs_euro IS DISTINCT FROM b.tarief_bedrag OR NOT public.verhuur_machine_in_scope(a.id) OR
     (rol='service_role' AND public.verhuur_machine_mag(b.id,a.id) IS NOT TRUE) THEN
    RETURN jsonb_build_object('machine',true,'ok',false,'gepromoveerd',false,'melding','Het actuele bestuursmandaat moet opnieuw worden beoordeeld. De boeking blijft ongewijzigd.');
  END IF;
  IF b.status::text='definitief' THEN
    RETURN jsonb_build_object('machine',true,'ok',true,'gepromoveerd',false,'melding','Boeking is al definitief.');
  END IF;
  SELECT * INTO c FROM public.contractversies WHERE boeking_id=b.id ORDER BY versie DESC LIMIT 1 FOR SHARE;
  IF NOT FOUND OR public.verhuur_contract_mandaat_geldig(b.id,c.id) IS NOT TRUE OR
     c.ondertekening<>'ontvangen' OR c.ondertekening_nummer IS DISTINCT FROM c.contractnummer OR
     c.ondertekening_versie IS DISTINCT FROM c.versie OR c.ondertekening_op IS NULL OR
     NOT EXISTS(SELECT 1 FROM public.documenten WHERE boeking_id=b.id AND type='getekend_contract'
       AND nullif(btrim(storage_pad),'') IS NOT NULL) THEN
    RETURN jsonb_build_object('machine',true,'ok',true,'gepromoveerd',false,'melding','Wacht op het ondertekenbewijs van de actuele goedgekeurde overeenkomst.');
  END IF;
  PERFORM id FROM public.betalingen WHERE boeking_id=b.id ORDER BY id FOR SHARE;
  SELECT count(*) FILTER(WHERE soort='aanbetaling'),count(*) FILTER(WHERE soort='restant'),sum(bedrag)
    INTO aantal_aan,aantal_rest,totaal FROM public.betalingen WHERE boeking_id=b.id AND status<>'geannuleerd'
      AND soort IN ('aanbetaling','restant');
  -- PL/pgSQL leest THEN van een ongehaakt CASE als het einde van IF. De haakjes houden de voorwaarde intact.
  IF b.tarief_bedrag IS NULL OR b.tarief_bedrag<=0 OR b.aanbetaling_bedrag IS NULL OR b.aanbetaling_bedrag<0 OR
     b.aanbetaling_bedrag>b.tarief_bedrag OR totaal IS DISTINCT FROM b.tarief_bedrag OR
     aantal_aan<>(CASE WHEN b.aanbetaling_bedrag>0 THEN 1 ELSE 0 END) OR
     aantal_rest<>(CASE WHEN b.tarief_bedrag>b.aanbetaling_bedrag THEN 1 ELSE 0 END) THEN
    RETURN jsonb_build_object('machine',true,'ok',false,'gepromoveerd',false,'melding','Betaaltermijnen en goedgekeurde huurprijs sluiten niet aan. Finance moet dit controleren.');
  END IF;
  IF b.betaling_vereist='aanbetaling' AND b.aanbetaling_bedrag>0 THEN
    SELECT coalesce(bool_and(status IN ('ontvangen','betaald') AND bedrag=b.aanbetaling_bedrag AND ontvangen_bedrag>=bedrag),false)
      INTO voldaan FROM public.betalingen WHERE boeking_id=b.id AND soort='aanbetaling' AND status<>'geannuleerd';
  ELSIF b.betaling_vereist='volledig' OR (b.betaling_vereist IS NULL AND b.aanbetaling_bedrag=0) THEN
    SELECT coalesce(bool_and(status IN ('ontvangen','betaald') AND bedrag>0 AND ontvangen_bedrag>=bedrag),false)
      INTO voldaan FROM public.betalingen WHERE boeking_id=b.id AND soort IN ('aanbetaling','restant') AND status<>'geannuleerd';
  ELSE
    RETURN jsonb_build_object('machine',true,'ok',false,'gepromoveerd',false,'melding','De vereiste betaalvoorwaarde is niet eenduidig vastgelegd.');
  END IF;
  IF NOT voldaan THEN
    RETURN jsonb_build_object('machine',true,'ok',true,'gepromoveerd',false,'melding','Wacht op de daadwerkelijk ontvangen vereiste betaling.');
  END IF;
  IF b.start_datum IS NULL OR b.eind_datum IS NULL OR b.eind_datum<b.start_datum OR
     b.start_datum IS DISTINCT FROM a.start_datum OR b.eind_datum IS DISTINCT FROM a.eind_datum OR
     EXISTS(SELECT 1 FROM public.boekingen r WHERE r.id<>b.id AND r.status::text IN ('optie','definitief','optie_verlopen','migratie_vastgelegd')
       AND (r.start_datum IS NULL OR r.eind_datum IS NULL OR (r.start_datum<=b.eind_datum AND r.eind_datum>=b.start_datum))) OR
     EXISTS(SELECT 1 FROM public.interne_activiteiten r WHERE r.blokkeert_verhuurkalender
       AND (r.start_datum IS NULL OR r.eind_datum IS NULL OR (r.start_datum<=b.eind_datum AND r.eind_datum>=b.start_datum))) OR
     EXISTS(SELECT 1 FROM public.activiteit_bron r WHERE
       (r.start_datum IS NULL OR r.eind_datum IS NULL OR (r.start_datum<=b.eind_datum AND r.eind_datum>=b.start_datum)) AND
       ((r.zichtbaarheid::text='publiek' AND coalesce(r.levenscyclus::text,'actief')<>'geannuleerd') OR
        (r.zichtbaarheid::text='bezet' AND NOT(coalesce(r.lokale_override,'{}')?'annulering'))) AND
       NOT(r.start_datum IS NOT NULL AND r.eind_datum IS NOT NULL AND r.start_datum>=b.start_datum AND r.eind_datum<=b.eind_datum AND
         EXISTS(SELECT 1 FROM public.publieke_activiteiten p WHERE p.boeking_id=b.id AND p.legacy_source=r.legacy_source AND p.legacy_id=r.legacy_id))) THEN
    RETURN jsonb_build_object('machine',true,'ok',false,'gepromoveerd',false,'melding','De actuele beschikbaarheid blokkeert het definitief maken.');
  END IF;
  UPDATE public.boekingen SET status='definitief',optie_einddatum=NULL,bijgewerkt_op=now() WHERE id=b.id AND status='optie';
  actor:=CASE WHEN rol='service_role' THEN 'Verhuurmachine: vastgelegd bestuursmandaat' ELSE 'Beheerder '||auth.uid()::text END;
  INSERT INTO public.auditlog(actor_id,actor_type,actor_naam,onderwerp_type,onderwerp_id,actie,van,naar,reden,details,dedup_sleutel)
    VALUES(auth.uid(),CASE WHEN rol='service_role' THEN 'systeem' ELSE 'gebruiker' END,actor,'boeking',b.id::text,
      'automatisch_definitief','optie','definitief','Actuele overeenkomst ondertekend en vereiste huursom aantoonbaar ontvangen.',
      jsonb_build_object('contractversieId',c.id,'aanvraagVersie',d.aanvraag_versie,'betalingVereist',b.betaling_vereist),
      'boeking:'||b.id||':automatisch_definitief') ON CONFLICT DO NOTHING;
  -- De bestaande status-trigger schrijft bevestigings- en agendajobs in dezelfde transactie.
  RETURN jsonb_build_object('machine',true,'ok',true,'gepromoveerd',true,'melding','Boeking is definitief. Bevestiging en agenda worden automatisch afgehandeld.');
END;
$$;
REVOKE ALL ON FUNCTION public.verhuur_promoveer_indien_klaar(bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.verhuur_promoveer_indien_klaar(bigint,text) TO authenticated,service_role;

CREATE TABLE IF NOT EXISTS public.verhuur_betaalontvangsten (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bron text NOT NULL, event_id text NOT NULL, betaling_id bigint NOT NULL REFERENCES public.betalingen(id),
  bedrag numeric(10,2) NOT NULL CHECK (bedrag>0), ontvangen_op timestamptz NOT NULL,
  referentie text NOT NULL DEFAULT '', actor_label text NOT NULL, actor_id uuid DEFAULT auth.uid(), vastgelegd_op timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bron,event_id)
);
ALTER TABLE public.verhuur_betaalontvangsten ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.verhuur_betaalontvangsten FROM anon, authenticated;
GRANT SELECT ON public.verhuur_betaalontvangsten TO authenticated;
CREATE POLICY verhuur_ontvangsten_finance_lezen ON public.verhuur_betaalontvangsten FOR SELECT TO authenticated
  USING (app.heeft_recht('finance','lezen') OR app.heeft_recht('finance','schrijven'));

CREATE TABLE IF NOT EXISTS public.verhuur_factuurverzendingen (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  factuur_id bigint NOT NULL REFERENCES public.facturen(id),
  soort text NOT NULL CHECK (soort IN ('factuur','herinnering_1','herinnering_2')),
  idempotentie text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('bezig','verzonden','geweigerd','onzeker')),
  pogingen integer NOT NULL DEFAULT 1, bericht_id text, pdf_pad text, pdf_sha256 text,
  melding text, aangemaakt_op timestamptz NOT NULL DEFAULT now(), bijgewerkt_op timestamptz NOT NULL DEFAULT now(),
  UNIQUE(factuur_id,soort)
);
ALTER TABLE public.verhuur_factuurverzendingen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.verhuur_factuurverzendingen FROM anon, authenticated;
GRANT SELECT ON public.verhuur_factuurverzendingen TO authenticated;
CREATE POLICY verhuur_factuurverzendingen_finance_lezen ON public.verhuur_factuurverzendingen FOR SELECT TO authenticated
  USING (app.heeft_recht('finance','lezen') OR app.heeft_recht('finance','schrijven'));
GRANT ALL ON public.verhuur_betaalontvangsten,public.verhuur_factuurverzendingen TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.verhuur_betaalontvangsten_id_seq,public.verhuur_factuurverzendingen_id_seq TO service_role;

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
  v_machine boolean := false;
  v_mandaat public.verhuur_besluiten%ROWTYPE;
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
  v_profiel jsonb;
  v_besluitdag date;
  v_eerste date;
  v_rest date;
  v_profiel_aan numeric;
BEGIN
  -- De RPC werkt als SECURITY DEFINER. Daarom is alleen 'aanvragen schrijven'
  -- onvoldoende om via deze functie boekingen en betalingen te muteren.
  IF ((auth.uid() IS NOT NULL AND (
    app.heeft_recht('boekingen', 'schrijven') OR
    (app.heeft_recht('aanvragen', 'schrijven') AND app.heeft_recht('instellingen', 'schrijven'))
  )) OR public.verhuur_machine_mag(p_boeking_id,p_aanvraag_id)) IS NOT TRUE THEN
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
  v_machine := public.verhuur_machine_mag(p_boeking_id,p_aanvraag_id);
  IF v_machine THEN
    SELECT * INTO v_mandaat FROM public.verhuur_besluiten WHERE aanvraag_id=v_boeking.aanvraag_id FOR SHARE;
    IF v_mandaat.huurprijs_euro IS DISTINCT FROM (p_contract->>'huurprijs_euro')::numeric THEN
      RAISE EXCEPTION 'Contractprijs wijkt af van bestuursmandaat';
    END IF;
    v_profiel:=v_mandaat.contract_profiel;
    IF jsonb_typeof(v_profiel) IS DISTINCT FROM 'object' OR
       coalesce(v_profiel->>'tijdVan','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR
       coalesce(v_profiel->>'tijdTot','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR
       v_profiel->>'tijdTot' <= v_profiel->>'tijdVan' OR
       nullif(btrim(v_profiel->>'opbouw'),'') IS NULL OR nullif(btrim(v_profiel->>'afbouw'),'') IS NULL OR
       coalesce(v_profiel->>'betalingBinnenDagen','') !~ '^[0-9]+$' OR
       coalesce(v_profiel->>'restantMaandenVoorStart','') !~ '^[0-9]+$' OR
       jsonb_typeof(v_profiel->'kortVoorStartVolledig') IS DISTINCT FROM 'boolean' OR
       jsonb_typeof(v_profiel->'aanbetalingEuro') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'De goedgekeurde standaardafspraken ontbreken. Laat een concreet concept beoordelen';
    END IF;
    IF (v_profiel->>'betalingBinnenDagen')::integer NOT BETWEEN 1 AND 45 OR
       (v_profiel->>'restantMaandenVoorStart')::integer NOT BETWEEN 1 AND 12 OR
       coalesce((v_profiel->>'restFactuurDagenVoorVerval')::integer,0) NOT BETWEEN 0 AND 90 OR
       p_wizard->>'tijdVan' IS DISTINCT FROM v_profiel->>'tijdVan' OR
       p_wizard->>'tijdTot' IS DISTINCT FROM v_profiel->>'tijdTot' OR
       p_wizard->>'opbouw' IS DISTINCT FROM v_profiel->>'opbouw' OR
       p_wizard->>'afbouw' IS DISTINCT FROM v_profiel->>'afbouw' OR
       coalesce(nullif(p_wizard->>'restFactuurDagenVoorVerval','')::integer,0)
         IS DISTINCT FROM coalesce((v_profiel->>'restFactuurDagenVoorVerval')::integer,0) THEN
      RAISE EXCEPTION 'Contractafspraken wijken af van het goedgekeurde profiel';
    END IF;
    IF coalesce(p_wizard->>'bijzondereAfspraken','') IS DISTINCT FROM
       (CASE WHEN coalesce((v_mandaat.beleid->>'afwijking18Maanden')::boolean,false)
         THEN 'Het bestuur heeft voor deze expositie uitdrukkelijk een uitzondering toegestaan op de termijn van 18 maanden uit de verhuurvoorwaarden. Deze uitzondering geldt uitsluitend voor de deelnemers en periode van deze goedgekeurde aanvraag.'
         ELSE '' END) THEN
      RAISE EXCEPTION 'De contractuele beleidsuitzondering wijkt af van het vastgelegde bestuursbesluit';
    END IF;
    v_besluitdag:=(v_mandaat.vastgelegd_op AT TIME ZONE 'Europe/Amsterdam')::date;
    v_eerste:=v_besluitdag+(v_profiel->>'betalingBinnenDagen')::integer;
    v_rest:=(v_boeking.start_datum-make_interval(months=>(v_profiel->>'restantMaandenVoorStart')::integer))::date;
    v_profiel_aan:=(v_profiel->>'aanbetalingEuro')::numeric;
    IF v_profiel_aan<0 OR v_profiel_aan<>round(v_profiel_aan,2) OR v_profiel_aan>v_mandaat.huurprijs_euro OR
       v_eerste>v_boeking.start_datum OR v_eerste<(now() AT TIME ZONE 'Europe/Amsterdam')::date THEN
      RAISE EXCEPTION 'De goedgekeurde prijs of betalingstermijn kan niet meer automatisch worden uitgevoerd';
    END IF;
    IF v_rest<=v_eerste THEN
      IF (v_profiel->>'kortVoorStartVolledig')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'Voor deze korte boeking is een expliciet betaalplan nodig';
      END IF;
      v_profiel_aan:=0;
      v_rest:=v_eerste;
    ELSIF v_profiel_aan=0 THEN
      RAISE EXCEPTION 'Het factuurmoment bij nul aanbetaling moet expliciet worden vastgesteld';
    END IF;
    IF (p_contract->>'aanbetaling_euro')::numeric IS DISTINCT FROM v_profiel_aan OR
       coalesce(p_wizard->>'aanbetalingVerval','') IS DISTINCT FROM (CASE WHEN v_profiel_aan>0 THEN v_eerste::text ELSE '' END) OR
       coalesce(p_wizard->>'restVerval','') IS DISTINCT FROM (CASE WHEN v_profiel_aan<v_mandaat.huurprijs_euro THEN v_rest::text ELSE '' END) THEN
      RAISE EXCEPTION 'Betaaltermijnen wijken af van de vastgelegde bestuursafspraken';
    END IF;
  END IF;
  IF p_aanvraag_id IS NOT NULL AND v_boeking.aanvraag_id IS DISTINCT FROM p_aanvraag_id THEN
    RAISE EXCEPTION 'De aanvraag hoort niet bij deze boeking';
  END IF;
  IF EXISTS (SELECT 1 FROM public.facturen WHERE boeking_id = p_boeking_id) THEN
    RAISE EXCEPTION 'Er bestaat een uitgegeven factuur. Corrigeer eerst via een credit- of correctieproces';
  END IF;
  IF EXISTS(SELECT 1 FROM public.verhuur_besluiten WHERE boeking_id=p_boeking_id) AND (
    EXISTS(SELECT 1 FROM public.contract_verzendingen WHERE boeking_id=p_boeking_id AND soort IN ('contract','herhaling')
      AND (status IN ('bezig','verzonden') OR bericht_id IS NOT NULL)) OR
    (NOT coalesce(v_machine,false) AND EXISTS(SELECT 1 FROM public.verhuur_proces_jobs WHERE boeking_id=p_boeking_id
      AND taak IN ('contract','financieel') AND status IN ('bezig','onzeker'))) OR
    EXISTS(SELECT 1 FROM public.contractversies WHERE boeking_id=p_boeking_id AND ondertekening='ontvangen') OR
    EXISTS(SELECT 1 FROM public.contract_tekeningen WHERE boeking_id=p_boeking_id AND ondertekend_op IS NOT NULL) OR
    EXISTS(SELECT 1 FROM public.documenten WHERE boeking_id=p_boeking_id AND type='getekend_contract') OR
    v_boeking.aanbetaling_ontvangen OR
    EXISTS(SELECT 1 FROM public.betalingen WHERE boeking_id=p_boeking_id AND (status IN ('ontvangen','betaald') OR ontvangen_bedrag>0)) OR
    EXISTS(SELECT 1 FROM public.verhuur_betaalontvangsten r JOIN public.betalingen p ON p.id=r.betaling_id WHERE p.boeking_id=p_boeking_id)
  ) THEN RAISE EXCEPTION 'Dit machinecontract heeft verzend-, onderteken- of ontvangstbewijs. Eerst expliciete opvolging door Bestuur en Finance'; END IF;
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
       (v_soort='aanbetaling' AND v_aantal_soort <> (CASE WHEN v_aan>0 THEN 1 ELSE 0 END)) OR
       (v_soort='restant' AND v_aantal_soort <> (CASE WHEN v_huur>v_aan THEN 1 ELSE 0 END)) THEN
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
        IF (v_open.status IN ('ontvangen','betaald') OR v_open.ontvangen_bedrag>0) AND
           (v_open.bedrag <> v_bedrag OR v_open.vervaldatum IS DISTINCT FROM v_verval) THEN
          RAISE EXCEPTION 'Ontvangen betaling mag niet worden aangepast';
        END IF;
        IF v_open.status = 'open' AND v_open.ontvangen_bedrag=0 THEN
          UPDATE public.betalingen SET bedrag=v_bedrag, vervaldatum=v_verval WHERE id=v_open.id;
        END IF;
      ELSE
        INSERT INTO public.betalingen (boeking_id,soort,bedrag,status,vervaldatum)
          VALUES (p_boeking_id,v_soort,v_bedrag,'open',v_verval);
      END IF;
    ELSIF FOUND THEN
      IF (v_open.status='ontvangen' OR v_open.ontvangen_bedrag>0) THEN RAISE EXCEPTION 'Ontvangen betaling ontbreekt in nieuw contract'; END IF;
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
      'opbouw',p_wizard->>'opbouw','afbouw',p_wizard->>'afbouw','contactpersoon',p_wizard->>'contactpersoon','bijzondereAfspraken',p_wizard->>'bijzondereAfspraken',
      'restFactuurDagenVoorVerval',coalesce(nullif(p_wizard->>'restFactuurDagenVoorVerval','')::integer,0)),
    true,'open','open','{}'::jsonb
  );
  UPDATE public.boekingen SET
    tarief_bedrag=v_huur, aanbetaling_bedrag=v_aan,
    betaling_vereist=CASE WHEN v_aan>0 THEN 'aanbetaling' ELSE 'volledig' END,
    start_datum=(p_wizard->>'periodeVan')::date, eind_datum=(p_wizard->>'periodeTot')::date,
    aantal_personen=NULLIF(BTRIM(p_wizard->>'personen'),''),
    huurder_naam_snapshot=p_wizard->>'naam', huurder_email_snapshot=p_wizard->>'email',
    huurder_telefoon_snapshot=NULLIF(BTRIM(p_wizard->>'telefoon'),''),
    interne_titel=p_wizard->>'activiteit', bijgewerkt_op=now()
    WHERE id=p_boeking_id;
  IF p_aanvraag_id IS NOT NULL AND NOT v_machine THEN
    UPDATE public.aanvragen SET
      naam=p_wizard->>'naam',email=p_wizard->>'email',telefoon=NULLIF(BTRIM(p_wizard->>'telefoon'),''),
      straat=p_wizard->>'straat',huisnummer=p_wizard->>'huisnummer',
      huisnummer_toevoeging=NULLIF(BTRIM(p_wizard->>'toevoeging'),''),
      postcode=p_wizard->>'postcode',woonplaats=p_wizard->>'woonplaats',
      aantal_personen=NULLIF(BTRIM(p_wizard->>'personen'),'')
      WHERE id=p_aanvraag_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bijbehorende aanvraag ontbreekt'; END IF;
  END IF;
  UPDATE public.betalingen SET factuur_op=CASE WHEN soort='restant' AND v_aan>0
      THEN vervaldatum - greatest(0,least(90,coalesce(nullif(p_wizard->>'restFactuurDagenVoorVerval','')::integer,0)))
      ELSE (now() AT TIME ZONE 'Europe/Amsterdam')::date END
    WHERE boeking_id=p_boeking_id AND status<>'geannuleerd';
  IF v_machine THEN
    UPDATE public.contractversies SET mandaat_aanvraag_versie=v_mandaat.aanvraag_versie,
      bestuur='akkoord', bestuur_actor='Systeem: vastgelegd bestuursmandaat', bestuur_op=now(),
      bestuur_toelichting='Uitvoering van het besluit vastgelegd als ' || v_mandaat.actor_label
      WHERE boeking_id=p_boeking_id AND versie=v_nieuwe_versie;
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
GRANT EXECUTE ON FUNCTION public.bewaar_contract_atomair(bigint,bigint,integer,jsonb,jsonb,jsonb) TO authenticated, service_role;

-- V5 hardening: one live claim at a time and no live claim on stale contract versions.
-- Install on staging only. This never sends mail or creates invoices.
-- It serializes with the V4 contract-save RPC through the booking row lock.
CREATE OR REPLACE FUNCTION public.claim_contractverzending(
  p_boeking_id bigint,
  p_versie integer,
  p_soort text,
  p_idempotentie text,
  p_ontvanger text,
  p_werkelijk text
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_boeking public.boekingen%ROWTYPE;
  v_versie public.contractversies%ROWTYPE;
  v_id bigint;
BEGIN
  IF ((auth.uid() IS NOT NULL AND (
    app.heeft_recht('boekingen','schrijven') OR
    (app.heeft_recht('aanvragen','schrijven') AND app.heeft_recht('instellingen','schrijven'))
  )) OR public.verhuur_machine_mag(p_boeking_id,NULL)) IS NOT TRUE THEN
    RAISE EXCEPTION 'Geen recht op een live contractverzending' USING ERRCODE = '42501';
  END IF;
  IF p_boeking_id IS NULL OR p_boeking_id <= 0 OR p_versie IS NULL OR p_versie <= 0 OR
     p_soort NOT IN ('contract','herhaling') OR
     length(btrim(coalesce(p_idempotentie,''))) < 8 OR length(p_idempotentie) > 200 OR
     length(btrim(coalesce(p_ontvanger,''))) < 3 OR length(btrim(coalesce(p_werkelijk,''))) < 3 THEN
    RAISE EXCEPTION 'Ongeldige of ontbrekende verzendgegevens';
  END IF;

  -- Lock the same booking row as bewaar_contract_atomair, so a concurrent
  -- version change and live send cannot both pass their preconditions.
  SELECT * INTO v_boeking FROM public.boekingen WHERE id = p_boeking_id FOR UPDATE;
  IF NOT FOUND OR v_boeking.status NOT IN ('optie','definitief') THEN
    RAISE EXCEPTION 'De boeking staat niet open voor contractverzending';
  END IF;
  SELECT * INTO v_versie FROM public.contractversies
    WHERE boeking_id = p_boeking_id ORDER BY versie DESC LIMIT 1 FOR SHARE;
  IF NOT FOUND OR v_versie.versie <> p_versie OR
     (v_versie.bestuur_verplicht AND v_versie.bestuur <> 'akkoord') OR
     v_versie.bestuur = 'terug' THEN
    RAISE EXCEPTION 'Contractversie is veranderd of niet goedgekeurd';
  END IF;

  IF auth.role()='service_role' AND NOT public.verhuur_contract_mandaat_geldig(p_boeking_id,v_versie.id)
    THEN RAISE EXCEPTION 'Contract heeft niet het huidige bestuursmandaat'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.contract_verzendingen
      WHERE boeking_id = p_boeking_id AND versie = p_versie
        AND soort IN ('contract','herhaling') AND status = 'bezig'
  ) THEN
    RAISE EXCEPTION 'Er loopt al een live contractverzending; niet opnieuw versturen';
  END IF;
  IF p_soort = 'contract' AND EXISTS (
    SELECT 1 FROM public.contract_verzendingen
      WHERE boeking_id = p_boeking_id AND versie = p_versie
        AND soort IN ('contract','herhaling') AND status = 'verzonden'
  ) THEN
    RAISE EXCEPTION 'De contractversie is al verzonden';
  END IF;
  IF p_soort = 'herhaling' AND NOT EXISTS (
    SELECT 1 FROM public.contract_verzendingen
      WHERE boeking_id = p_boeking_id AND versie = p_versie
        AND soort IN ('contract','herhaling') AND status = 'verzonden'
  ) THEN
    RAISE EXCEPTION 'Er is geen eerdere succesvolle contractverzending om te herhalen';
  END IF;

  INSERT INTO public.contract_verzendingen
    (boeking_id, versie, soort, idempotentie, ontvanger, werkelijk, status)
  VALUES (p_boeking_id, p_versie, p_soort, p_idempotentie,
          p_ontvanger, p_werkelijk, 'bezig')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_contractverzending(bigint,integer,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_contractverzending(bigint,integer,text,text,text,text) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.factuur_voor_termijn(p_boeking_id bigint, p_versie integer, p_betaling_id bigint DEFAULT NULL)
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
  IF ((auth.uid() IS NOT NULL AND app.heeft_recht('instellingen','schrijven') AND
     (app.heeft_recht('boekingen','schrijven') OR app.heeft_recht('aanvragen','schrijven')))
     OR public.verhuur_machine_mag(p_boeking_id,NULL)) IS NOT TRUE THEN
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
  IF auth.role()='service_role' AND NOT public.verhuur_contract_mandaat_geldig(p_boeking_id,v_contract.id)
    THEN RAISE EXCEPTION 'Factuurcontract heeft niet het huidige bestuursmandaat'; END IF;
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
  IF p_betaling_id IS NOT NULL THEN
    SELECT * INTO v_betaling FROM public.betalingen
      WHERE id=p_betaling_id AND boeking_id=p_boeking_id AND status<>'geannuleerd'
        AND soort IN ('aanbetaling','restant') FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Betaaltermijn bestaat niet'; END IF;
    v_bedrag := CASE WHEN v_betaling.soort='aanbetaling' THEN v_aan ELSE v_tarief-v_aan END;
    IF coalesce(v_betaling.factuur_op,v_betaling.vervaldatum) > (now() AT TIME ZONE 'Europe/Amsterdam')::date THEN
      RAISE EXCEPTION 'Het afgesproken factuurmoment is nog niet bereikt';
    END IF;
  ELSIF v_aan > 0 THEN
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
REVOKE ALL ON FUNCTION public.factuur_voor_termijn(bigint, integer, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.factuur_voor_termijn(bigint, integer, bigint) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.factuur_bij_contract(p_boeking_id bigint,p_versie integer)
RETURNS public.facturen LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT public.factuur_voor_termijn(p_boeking_id,p_versie,NULL);
$$;
REVOKE ALL ON FUNCTION public.factuur_bij_contract(bigint,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.factuur_bij_contract(bigint,integer) TO authenticated,service_role;

-- Alleen de reeds geverifieerde provider-acceptatie mag de verzendstatus bijwerken.
CREATE OR REPLACE FUNCTION public.factuur_markeer_verzonden(p_factuur_id bigint, p_bericht_id text, p_pdf_pad text, p_pdf_sha256 text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_bestaand public.facturen%ROWTYPE;
BEGIN
  IF nullif(btrim(coalesce(p_bericht_id,'')),'') IS NULL OR nullif(btrim(coalesce(p_pdf_pad,'')),'') IS NULL OR
     p_pdf_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Verzendbewijs of documentcontrole ontbreekt';
  END IF;
  SELECT * INTO v_bestaand FROM public.facturen WHERE id = p_factuur_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factuur ontbreekt'; END IF;
  IF ((auth.uid() IS NOT NULL AND app.heeft_recht('instellingen','schrijven')) OR
      public.verhuur_machine_mag(v_bestaand.boeking_id,NULL)) IS NOT TRUE THEN
    RAISE EXCEPTION 'Geen recht' USING ERRCODE='42501';
  END IF;

  -- Een willekeurig bericht-ID is geen bewijs van verzending. Het bericht
  -- moet al geaccepteerd zijn in het bestaande contractverzendregister.
  IF NOT EXISTS (
    SELECT 1 FROM public.contract_verzendingen z
    WHERE z.boeking_id = v_bestaand.boeking_id
      AND z.versie = v_bestaand.contract_versie
      AND z.status = 'verzonden'
      AND z.bericht_id = p_bericht_id
      AND z.soort IN ('contract','herhaling')
  ) AND NOT EXISTS (
    SELECT 1 FROM public.verhuur_factuurverzendingen z WHERE z.factuur_id=p_factuur_id
      AND z.soort='factuur' AND z.status='verzonden' AND z.bericht_id=p_bericht_id
      AND z.pdf_pad=p_pdf_pad AND z.pdf_sha256=p_pdf_sha256
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
GRANT EXECUTE ON FUNCTION public.factuur_markeer_verzonden(bigint, text, text, text) TO authenticated, service_role;

-- Een extern event is alleen bruikbaar nadat een afzonderlijke adapter de bron heeft
-- geauthenticeerd en de betaling eenduidig gekoppeld. Dezelfde event-id is immutable.
CREATE OR REPLACE FUNCTION public.verhuur_registreer_ontvangst(
  p_bron text,p_event_id text,p_betaling_id bigint,p_bedrag_cent bigint,
  p_ontvangen_op timestamptz,p_referentie text DEFAULT '',p_actor_label text DEFAULT 'Systeem'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_b public.betalingen%ROWTYPE; v_e public.verhuur_betaalontvangsten%ROWTYPE; v_boeking_id bigint;
  v_status text; v_bedrag numeric(10,2); v_nieuw numeric(10,2);
BEGIN
  IF p_bron !~ '^[a-zA-Z0-9_.:-]{1,80}$' OR length(btrim(coalesce(p_event_id,''))) NOT BETWEEN 1 AND 200 OR
     p_betaling_id IS NULL OR p_bedrag_cent IS NULL OR p_bedrag_cent<=0 OR p_bedrag_cent>9999999999 OR p_ontvangen_op IS NULL OR
     length(coalesce(p_referentie,''))>250 OR p_ontvangen_op>now()+interval '5 minutes' THEN
    RAISE EXCEPTION 'Ongeldig ontvangstbewijs';
  END IF;
  -- Serialiseer dezelfde externe gebeurtenis, ook wanneer twee requests een ander
  -- betaling-id meesturen. Een herhaalde id met gewijzigde inhoud is geen tweede ontvangst.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('verhuur_ontvangst'),pg_catalog.hashtext(p_bron||':'||p_event_id));
  SELECT boeking_id INTO v_boeking_id FROM public.betalingen WHERE id=p_betaling_id;
  PERFORM id FROM public.boekingen WHERE id=v_boeking_id FOR UPDATE;
  SELECT * INTO v_b FROM public.betalingen WHERE id=p_betaling_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Betaaltermijn ontbreekt'; END IF;
  IF ((auth.uid() IS NOT NULL AND (app.heeft_recht('finance','schrijven') OR app.heeft_recht('boekingen','schrijven') OR app.heeft_recht('aanvragen','schrijven')))
      OR public.verhuur_machine_mag(v_b.boeking_id,NULL)) IS NOT TRUE THEN
    RAISE EXCEPTION 'Geen recht om deze ontvangst te boeken' USING ERRCODE='42501';
  END IF;
  v_bedrag:=p_bedrag_cent::numeric/100;
  SELECT * INTO v_e FROM public.verhuur_betaalontvangsten WHERE bron=p_bron AND event_id=p_event_id;
  IF FOUND THEN
    IF v_e.betaling_id<>p_betaling_id OR v_e.bedrag<>v_bedrag OR v_e.ontvangen_op<>p_ontvangen_op OR v_e.referentie<>coalesce(p_referentie,'') THEN
      RAISE EXCEPTION 'Ontvangst-id bestaat met andere gegevens; controle door Finance vereist';
    END IF;
    RETURN jsonb_build_object('boeking_id',v_b.boeking_id,'betaling_id',v_b.id,'dubbel',true,
      'ontvangen_bedrag',v_b.ontvangen_bedrag,'volledig',v_b.ontvangen_bedrag>=v_b.bedrag);
  END IF;
  SELECT status::text INTO v_status FROM public.boekingen WHERE id=v_b.boeking_id FOR UPDATE;
  IF v_status NOT IN ('optie','definitief') OR v_b.status='geannuleerd' THEN
    RAISE EXCEPTION 'Deze ontvangst hoort bij een gesloten of geannuleerd dossier; Finance moet dit afhandelen';
  END IF;
  v_nieuw:=v_b.ontvangen_bedrag+v_bedrag;
  IF v_nieuw>v_b.bedrag THEN RAISE EXCEPTION 'Overbetaling of onjuiste termijn: controle door Finance vereist'; END IF;
  INSERT INTO public.verhuur_betaalontvangsten(bron,event_id,betaling_id,bedrag,ontvangen_op,referentie,actor_label)
    VALUES(p_bron,p_event_id,p_betaling_id,v_bedrag,p_ontvangen_op,coalesce(p_referentie,''),left(coalesce(p_actor_label,'Systeem'),250));
  UPDATE public.betalingen SET ontvangen_bedrag=v_nieuw,
    status=CASE WHEN v_nieuw=bedrag THEN 'ontvangen' ELSE status END,
    ontvangen_op=CASE WHEN v_nieuw=bedrag THEN p_ontvangen_op ELSE ontvangen_op END WHERE id=v_b.id;
  IF v_b.soort='aanbetaling' AND v_nieuw=v_b.bedrag THEN
    UPDATE public.boekingen SET aanbetaling_ontvangen=true,aanbetaling_ontvangen_op=p_ontvangen_op WHERE id=v_b.boeking_id;
  END IF;
  PERFORM public.verhuur_plan_stap(d.aanvraag_id,v_b.boeking_id,'controleer_definitief',
      'ontvangst:'||v_b.id||':'||v_nieuw::text,jsonb_build_object('betaling_id',v_b.id),now())
    FROM public.verhuur_besluiten d WHERE d.boeking_id=v_b.boeking_id AND d.besluit='ja' AND d.status='toegewezen';
  RETURN jsonb_build_object('boeking_id',v_b.boeking_id,'betaling_id',v_b.id,'dubbel',false,
    'ontvangen_bedrag',v_nieuw,'volledig',v_nieuw=v_b.bedrag);
END;
$$;
REVOKE ALL ON FUNCTION public.verhuur_registreer_ontvangst(text,text,bigint,bigint,timestamptz,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.verhuur_registreer_ontvangst(text,text,bigint,bigint,timestamptz,text,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.verhuur_markeer_termijn_ontvangen(p_betaling_id bigint,p_actor_label text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_b public.betalingen%ROWTYPE; v_boeking_id bigint;
BEGIN
  SELECT boeking_id INTO v_boeking_id FROM public.betalingen WHERE id=p_betaling_id;
  PERFORM id FROM public.boekingen WHERE id=v_boeking_id FOR UPDATE;
  SELECT * INTO v_b FROM public.betalingen WHERE id=p_betaling_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Betaaltermijn ontbreekt'; END IF;
  IF ((auth.uid() IS NOT NULL AND (app.heeft_recht('finance','schrijven') OR app.heeft_recht('boekingen','schrijven') OR app.heeft_recht('aanvragen','schrijven')))
      OR public.verhuur_machine_mag(v_b.boeking_id,NULL)) IS NOT TRUE THEN
    RAISE EXCEPTION 'Geen recht op ontvangstregistratie' USING ERRCODE='42501';
  END IF;
  IF v_b.status='geannuleerd' THEN RAISE EXCEPTION 'Termijn is geannuleerd'; END IF;
  IF v_b.ontvangen_bedrag>=v_b.bedrag THEN
    RETURN jsonb_build_object('boeking_id',v_b.boeking_id,'betaling_id',v_b.id,'dubbel',true,'volledig',true);
  END IF;
  RETURN public.verhuur_registreer_ontvangst('handmatig','termijn:'||v_b.id||':'||v_b.ontvangen_bedrag::text,v_b.id,
    ((v_b.bedrag-v_b.ontvangen_bedrag)*100)::bigint,now(),'Handmatig gecontroleerde bankontvangst',p_actor_label);
END;
$$;
REVOKE ALL ON FUNCTION public.verhuur_markeer_termijn_ontvangen(bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.verhuur_markeer_termijn_ontvangen(bigint,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.verhuur_claim_factuurmail(p_factuur_id bigint,p_soort text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_f public.facturen%ROWTYPE; v_b public.betalingen%ROWTYPE; v_z public.verhuur_factuurverzendingen%ROWTYPE;
BEGIN
  IF p_soort NOT IN ('factuur','herinnering_1','herinnering_2') THEN RAISE EXCEPTION 'Onbekende factuuractie'; END IF;
  SELECT * INTO v_f FROM public.facturen WHERE id=p_factuur_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factuur ontbreekt'; END IF;
  IF ((auth.uid() IS NOT NULL AND app.heeft_recht('finance','schrijven')) OR public.verhuur_machine_mag(v_f.boeking_id,NULL)) IS NOT TRUE THEN
    RAISE EXCEPTION 'Geen recht op factuurverzending' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_b FROM public.betalingen WHERE id=v_f.betaling_id FOR UPDATE;
  IF NOT FOUND OR v_b.status='geannuleerd' OR NOT EXISTS (SELECT 1 FROM public.boekingen WHERE id=v_f.boeking_id AND status IN ('optie','definitief')) THEN
    RAISE EXCEPTION 'De factuur of boeking is niet actief';
  END IF;
  IF p_soort='factuur' AND v_f.provider_bericht_id IS NOT NULL THEN RETURN jsonb_build_object('status','verzonden','id',NULL); END IF;
  IF p_soort<>'factuur' AND (v_f.provider_bericht_id IS NULL OR v_f.verzonden_op IS NULL OR v_b.ontvangen_bedrag>=v_b.bedrag OR v_b.status::text IN ('ontvangen','betaald')) THEN
    RAISE EXCEPTION 'Geen verzonden open factuur om te herinneren';
  END IF;
  SELECT * INTO v_z FROM public.verhuur_factuurverzendingen WHERE factuur_id=p_factuur_id AND soort=p_soort FOR UPDATE;
  IF FOUND THEN
    IF v_z.status IN ('verzonden','bezig','onzeker') THEN
      RETURN jsonb_build_object('id',v_z.id,'status',v_z.status,'idempotentie',v_z.idempotentie);
    END IF;
    IF v_z.pogingen>=3 THEN RAISE EXCEPTION 'Drie geweigerde verzendpogingen; handmatige controle vereist'; END IF;
    UPDATE public.verhuur_factuurverzendingen SET status='bezig',pogingen=pogingen+1,bijgewerkt_op=now() WHERE id=v_z.id;
  ELSE
    INSERT INTO public.verhuur_factuurverzendingen(factuur_id,soort,idempotentie,status)
      VALUES(p_factuur_id,p_soort,'factuur:'||p_factuur_id||':'||p_soort,'bezig') RETURNING * INTO v_z;
  END IF;
  RETURN jsonb_build_object('id',v_z.id,'status','geclaimd','idempotentie',v_z.idempotentie);
END;
$$;
REVOKE ALL ON FUNCTION public.verhuur_claim_factuurmail(bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.verhuur_claim_factuurmail(bigint,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.verhuur_factuurmail_resultaat(
  p_claim_id bigint,p_status text,p_bericht_id text DEFAULT NULL,p_pdf_pad text DEFAULT NULL,p_pdf_sha256 text DEFAULT NULL,p_melding text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_z public.verhuur_factuurverzendingen%ROWTYPE; v_boeking bigint; v_factuur_id bigint;
BEGIN
  IF p_status NOT IN ('verzonden','geweigerd','onzeker') THEN RAISE EXCEPTION 'Ongeldige verzenduitkomst'; END IF;
  SELECT factuur_id INTO v_factuur_id FROM public.verhuur_factuurverzendingen WHERE id=p_claim_id;
  PERFORM id FROM public.facturen WHERE id=v_factuur_id FOR UPDATE;
  SELECT * INTO v_z FROM public.verhuur_factuurverzendingen WHERE id=p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verzendclaim ontbreekt'; END IF;
  SELECT boeking_id INTO v_boeking FROM public.facturen WHERE id=v_z.factuur_id;
  -- Registratie van al ontstane provideruitkomst mag ook na gelijktijdige annulering.
  -- Dit geeft geen bevoegdheid een nieuwe verzending te starten.
  IF (auth.role()='service_role' OR (auth.uid() IS NOT NULL AND app.heeft_recht('finance','schrijven'))) IS NOT TRUE THEN
    RAISE EXCEPTION 'Geen recht op verzendregistratie' USING ERRCODE='42501';
  END IF;
  IF v_z.status='verzonden' THEN
    IF v_z.bericht_id IS DISTINCT FROM p_bericht_id OR p_status<>'verzonden' THEN RAISE EXCEPTION 'Verzendbewijs is onveranderlijk'; END IF;
    RETURN;
  END IF;
  IF v_z.status NOT IN ('bezig','onzeker') THEN RAISE EXCEPTION 'Geen lopende claim'; END IF;
  IF p_status='verzonden' AND (nullif(btrim(p_bericht_id),'') IS NULL OR
      (v_z.soort='factuur' AND (nullif(btrim(p_pdf_pad),'') IS NULL OR p_pdf_sha256 !~ '^[0-9a-f]{64}$'))) THEN
    RAISE EXCEPTION 'Provider- of PDF-bewijs ontbreekt';
  END IF;
  UPDATE public.verhuur_factuurverzendingen SET status=p_status,bericht_id=p_bericht_id,
    pdf_pad=p_pdf_pad,pdf_sha256=p_pdf_sha256,melding=left(p_melding,500),bijgewerkt_op=now() WHERE id=p_claim_id;
  IF p_status='verzonden' AND v_z.soort='factuur' THEN
    -- Het document is eerder opgeslagen; de oorspronkelijke nota wordt nooit vervangen.
    UPDATE public.facturen SET verzonden_op=now(),provider_bericht_id=p_bericht_id,pdf_pad=p_pdf_pad,pdf_sha256=p_pdf_sha256
      WHERE id=v_z.factuur_id AND provider_bericht_id IS NULL;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.verhuur_factuurmail_resultaat(bigint,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.verhuur_factuurmail_resultaat(bigint,text,text,text,text,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.bewaar_verhuur_profielen(p_profielen jsonb,p_machine jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_key text; v_p jsonb; v_bestaand jsonb;
BEGIN
  IF auth.uid() IS NULL OR app.heeft_recht('instellingen','schrijven') IS NOT TRUE THEN
    RAISE EXCEPTION 'Geen recht om verhuurinstellingen te bewaren' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_profielen) IS DISTINCT FROM 'object' OR jsonb_typeof(p_machine) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Ongeldige instellingen'; END IF;
  FOR v_key,v_p IN SELECT * FROM jsonb_each(p_profielen) LOOP
    IF v_key NOT IN ('expositie','bruiloft','concert','diverse') OR jsonb_typeof(v_p)<>'object' OR
      coalesce(v_p->>'tijdVan','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR coalesce(v_p->>'tijdTot','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR
      (v_p->>'tijdVan')>=(v_p->>'tijdTot') OR nullif(btrim(v_p->>'opbouw'),'') IS NULL OR nullif(btrim(v_p->>'afbouw'),'') IS NULL OR
      coalesce((v_p->>'aanbetalingEuro')::numeric,-1)<0 OR
      coalesce((v_p->>'betalingBinnenDagen')::integer,0) NOT BETWEEN 1 AND 45 OR
      coalesce((v_p->>'restantMaandenVoorStart')::integer,0) NOT BETWEEN 1 AND 12 OR
      jsonb_typeof(v_p->'kortVoorStartVolledig') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Onvolledig contractprofiel: %',v_key; END IF;
  END LOOP;
  IF jsonb_typeof(p_machine->'actief') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_machine->'historieCompleet') IS DISTINCT FROM 'boolean' OR
     (coalesce((p_machine->>'actief')::boolean,false) AND (coalesce(p_machine->>'vanaf','') !~ '^\d{4}-\d{2}-\d{2}$' OR p_profielen='{}'::jsonb)) THEN
    RAISE EXCEPTION 'Een actief proces vereist een startdatum en volledige profielen';
  END IF;
  IF p_machine->>'vanaf' IS NOT NULL AND p_machine->>'vanaf'<>'' THEN PERFORM (p_machine->>'vanaf')::date; END IF;
  IF jsonb_typeof(p_machine->'beleid') IS DISTINCT FROM 'object' OR
     p_machine->'beleid'->>'maanden' IS DISTINCT FROM '18' OR
     p_machine->'beleid'->>'grondslag' IS DISTINCT FROM 'einde_begin' OR
     p_machine->'beleid'->>'versie' IS DISTINCT FROM 'expositie-18m-einde-begin-v1' THEN
    RAISE EXCEPTION 'Dit proces gebruikt de vastgestelde termijn van 18 maanden van einde tot begin. Een afwijking wordt per dossier besloten';
  END IF;
  SELECT waarde INTO v_bestaand FROM public.instellingen WHERE sleutel='verhuur_machine' FOR UPDATE;
  INSERT INTO public.instellingen(sleutel,groep,waarde,toelichting)
    VALUES('verhuur_autocontract_profielen','verhuur',p_profielen,'Vastgelegde standaardcontractafspraken per verhuurtype')
    ON CONFLICT(sleutel) DO UPDATE SET waarde=excluded.waarde;
  INSERT INTO public.instellingen(sleutel,groep,waarde,toelichting)
    VALUES('verhuur_machine','verhuur',coalesce(v_bestaand,'{}'::jsonb)||p_machine,'Automatisch verhuurproces: expliciet mandaat en startscope')
    ON CONFLICT(sleutel) DO UPDATE SET waarde=excluded.waarde;
END;
$$;
REVOKE ALL ON FUNCTION public.bewaar_verhuur_profielen(jsonb,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.bewaar_verhuur_profielen(jsonb,jsonb) TO authenticated;

-- Uitsluitend een menselijke sessie mag onzeker providerbewijs reconciliëren.
-- De applicatie vergelijkt vooraf de oorspronkelijke storage-PDF's met de
-- bevroren contract/factuursnapshot. Een nieuwe verzending is geen onderdeel hiervan.
CREATE OR REPLACE FUNCTION public.verhuur_herstel_verzending(
 p_boeking_id bigint,p_type text,p_claim_id bigint,p_uitkomst text,p_provider_id text,p_bewijs text,p_manifest jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.boekingen%ROWTYPE; z public.contract_verzendingen%ROWTYPE;
  q public.verhuur_factuurverzendingen%ROWTYPE; f public.facturen%ROWTYPE;
  v_d jsonb; v_pdf jsonb; v_versie integer; v_taak text;
BEGIN
  IF auth.uid() IS NULL OR app.heeft_recht('instellingen','schrijven') IS NOT TRUE OR
     (app.heeft_recht('finance','schrijven') OR app.heeft_recht('boekingen','schrijven') OR app.heeft_recht('aanvragen','schrijven')) IS NOT TRUE THEN
    RAISE EXCEPTION 'Geen recht op verzendherstel' USING ERRCODE='42501';
  END IF;
  IF p_type NOT IN ('contract','factuur') OR p_uitkomst NOT IN ('geaccepteerd','niet_verzonden') OR
      length(btrim(coalesce(p_bewijs,''))) NOT BETWEEN 20 AND 2000 OR
      (p_uitkomst='geaccepteerd' AND length(btrim(coalesce(p_provider_id,''))) NOT BETWEEN 1 AND 200) THEN
    RAISE EXCEPTION 'Gecontroleerd providerbewijs ontbreekt';
  END IF;
  SELECT * INTO b FROM public.boekingen WHERE id=p_boeking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Boeking ontbreekt'; END IF;
  v_taak:=CASE WHEN p_type='contract' THEN 'contract' ELSE 'financieel' END;
  IF p_type='contract' THEN
    SELECT * INTO z FROM public.contract_verzendingen WHERE id=p_claim_id AND boeking_id=p_boeking_id AND soort IN ('contract','herhaling') FOR UPDATE;
    IF NOT FOUND OR z.status NOT IN ('bezig','verzonden') THEN RAISE EXCEPTION 'Geen te herstellen contractclaim'; END IF;
    IF z.status='bezig' AND z.op>now()-interval '15 minutes' AND NOT EXISTS (
      SELECT 1 FROM public.verhuur_proces_jobs WHERE boeking_id=p_boeking_id AND taak='contract' AND status IN ('onzeker','wacht_op_mens')
      AND bijgewerkt_op>=z.op AND status='onzeker'
    ) THEN RAISE EXCEPTION 'De contractverzending is nog actief; wacht op een vastgestelde fout of afloop van de claimtermijn'; END IF;
    v_versie:=z.versie;
    SELECT * INTO f FROM public.facturen WHERE boeking_id=p_boeking_id AND contract_versie=z.versie ORDER BY id LIMIT 1 FOR UPDATE;
  ELSE
    SELECT * INTO q FROM public.verhuur_factuurverzendingen WHERE id=p_claim_id;
    IF NOT FOUND OR q.status NOT IN ('bezig','onzeker','verzonden') THEN RAISE EXCEPTION 'Geen te herstellen factuurclaim'; END IF;
    SELECT * INTO f FROM public.facturen WHERE id=q.factuur_id AND boeking_id=p_boeking_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'De factuurclaim hoort niet bij dit dossier'; END IF;
    SELECT * INTO q FROM public.verhuur_factuurverzendingen WHERE id=p_claim_id FOR UPDATE;
    IF q.status NOT IN ('bezig','onzeker','verzonden') THEN RAISE EXCEPTION 'Geen te herstellen factuurclaim'; END IF;
    v_versie:=f.contract_versie;
    IF q.status='bezig' AND q.bijgewerkt_op>now()-interval '15 minutes' AND NOT EXISTS (
      SELECT 1 FROM public.verhuur_proces_jobs WHERE boeking_id=p_boeking_id AND taak='financieel' AND status IN ('onzeker','wacht_op_mens')
      AND bijgewerkt_op>=q.bijgewerkt_op AND status='onzeker'
    ) THEN RAISE EXCEPTION 'De factuurverzending is nog actief; wacht op een vastgestelde fout of afloop van de claimtermijn'; END IF;
  END IF;
  IF p_uitkomst='niet_verzonden' THEN
    IF (p_type='contract' AND (z.bericht_id IS NOT NULL OR z.status='verzonden' OR (z.soort='contract' AND f.provider_bericht_id IS NOT NULL))) OR
       (p_type='factuur' AND (q.bericht_id IS NOT NULL OR q.status='verzonden' OR (q.soort='factuur' AND f.provider_bericht_id IS NOT NULL))) THEN
      RAISE EXCEPTION 'Geaccepteerde verzending kan niet worden vrijgegeven';
    END IF;
    IF p_type='contract' THEN UPDATE public.contract_verzendingen SET status='geweigerd' WHERE id=z.id;
    ELSE UPDATE public.verhuur_factuurverzendingen SET status='geweigerd',pogingen=0,melding=p_bewijs,bijgewerkt_op=now() WHERE id=q.id;
    END IF;
  ELSE
    IF f.id IS NULL OR jsonb_typeof(p_manifest) IS DISTINCT FROM 'array' OR
       jsonb_array_length(p_manifest)<>(CASE WHEN p_type='contract' THEN 3 ELSE 1 END) THEN
      RAISE EXCEPTION 'Factuur of geverifieerd documentmanifest ontbreekt';
    END IF;
    IF (SELECT count(DISTINCT value->>'pad') FROM jsonb_array_elements(p_manifest))<>jsonb_array_length(p_manifest) THEN
      RAISE EXCEPTION 'Documentmanifest bevat dubbele paden';
    END IF;
    FOR v_d IN SELECT value FROM jsonb_array_elements(p_manifest) LOOP
      IF coalesce(v_d->>'sha256','') !~ '^[0-9a-f]{64}$' OR coalesce((v_d->>'bytes')::integer,0)<100 OR
         NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='booking-documents' AND name=v_d->>'pad') THEN
        RAISE EXCEPTION 'Oorspronkelijk document niet aantoonbaar aanwezig';
      END IF;
      IF v_d->>'pad'='facturen/'||p_boeking_id||'/'||f.factuurnummer||'.pdf' THEN v_pdf:=v_d;
      ELSIF p_type<>'contract' OR v_d->>'pad' NOT IN (
        'contracten/'||p_boeking_id||'/overeenkomst-v'||v_versie||'.pdf',
        'contracten/'||p_boeking_id||'/voorwaarden-v'||v_versie||'.pdf'
      ) THEN RAISE EXCEPTION 'Document hoort niet bij deze contractuitgifte'; END IF;
    END LOOP;
    IF v_pdf IS NULL OR (f.pdf_sha256 IS NOT NULL AND f.pdf_sha256<>v_pdf->>'sha256') THEN RAISE EXCEPTION 'Factuurdocument wijkt af'; END IF;
    IF p_type='contract' THEN
      IF z.bericht_id IS NOT NULL AND z.bericht_id<>p_provider_id THEN RAISE EXCEPTION 'Ander providerbewijs bestaat'; END IF;
      UPDATE public.contract_verzendingen SET status='verzonden',bericht_id=p_provider_id,provider_status='geaccepteerd',bijlagen=p_manifest WHERE id=z.id;
      IF f.provider_bericht_id IS NULL THEN PERFORM public.factuur_markeer_verzonden(f.id,p_provider_id,v_pdf->>'pad',v_pdf->>'sha256'); END IF;
      IF b.status IN ('optie','definitief') AND v_versie=(SELECT max(versie) FROM public.contractversies WHERE boeking_id=p_boeking_id) THEN
        UPDATE public.contract_tekeningen SET vrijgegeven=true WHERE boeking_id=p_boeking_id AND versie=v_versie AND ondertekend_op IS NULL AND verloopt_op>now();
      END IF;
    ELSE
      IF q.bericht_id IS NOT NULL AND q.bericht_id<>p_provider_id THEN RAISE EXCEPTION 'Ander providerbewijs bestaat'; END IF;
      UPDATE public.verhuur_factuurverzendingen SET status='verzonden',bericht_id=p_provider_id,pdf_pad=v_pdf->>'pad',pdf_sha256=v_pdf->>'sha256',melding=p_bewijs,bijgewerkt_op=now() WHERE id=q.id;
      IF q.soort='factuur' AND f.provider_bericht_id IS NULL THEN PERFORM public.factuur_markeer_verzonden(f.id,p_provider_id,v_pdf->>'pad',v_pdf->>'sha256'); END IF;
    END IF;
    FOR v_d IN SELECT value FROM jsonb_array_elements(p_manifest) LOOP
      INSERT INTO public.documenten(boeking_id,type,bestandsnaam,storage_pad,mime_type,grootte_bytes)
        SELECT p_boeking_id,CASE WHEN v_d->>'pad' LIKE 'facturen/%' THEN 'factuur' ELSE 'contract' END,
          v_d->>'bestandsnaam',v_d->>'pad','application/pdf',(v_d->>'bytes')::integer
        WHERE NOT EXISTS (SELECT 1 FROM public.documenten WHERE boeking_id=p_boeking_id AND storage_pad=v_d->>'pad');
    END LOOP;
  END IF;
  INSERT INTO public.auditlog(actor_id,actor_naam,actor_type,onderwerp_type,onderwerp_id,actie,reden,dedup_sleutel)
    VALUES(auth.uid(),'Beheerder '||auth.uid()::text,'gebruiker','boeking',p_boeking_id::text,
      'verzendbewijs_hersteld',p_type||' '||p_claim_id||': '||p_uitkomst||'. '||p_bewijs,
      'verzendherstel:'||p_type||':'||p_claim_id||':'||p_uitkomst||':'||coalesce(p_provider_id,''))
    ON CONFLICT DO NOTHING;
  IF b.status IN ('optie','definitief') THEN
    UPDATE public.verhuur_proces_jobs SET status='te_doen',claim_token=NULL,geclaimd_op=NULL,
      gepland_op=now(),bijgewerkt_op=now(),last_fout=NULL
      WHERE boeking_id=p_boeking_id AND taak=v_taak AND status IN ('onzeker','wacht_op_mens');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.verhuur_herstel_verzending(bigint,text,bigint,text,text,text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.verhuur_herstel_verzending(bigint,text,bigint,text,text,text,jsonb) TO authenticated;
