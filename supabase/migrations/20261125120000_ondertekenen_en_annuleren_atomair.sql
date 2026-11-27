-- Ondertekening, bewijsmetadata en vervolgjob committen samen.
-- De PDF wordt vooraf onveranderlijk opgeslagen onder een inhoudsafhankelijk pad.
-- Geen historische mails of jobs worden bij installatie aangemaakt.
BEGIN;

ALTER TABLE public.contract_tekeningen
  ADD COLUMN IF NOT EXISTS ingetrokken_op timestamptz,
  ADD COLUMN IF NOT EXISTS pdf_hash text,
  ADD COLUMN IF NOT EXISTS bestuur_bevestiging_id text;

CREATE TABLE public.contract_ontvangstmail_claims (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  boeking_id bigint NOT NULL REFERENCES public.boekingen(id),
  contractversie_id bigint NOT NULL REFERENCES public.contractversies(id),
  richting text NOT NULL CHECK (richting IN ('huurder','bestuur')),
  status text NOT NULL CHECK (status IN ('bezig','verzonden','niet_verzonden','onzeker')),
  claim_token uuid,
  provider_id text,
  pogingen integer NOT NULL DEFAULT 1,
  aangemaakt_op timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op timestamptz NOT NULL DEFAULT now(),
  melding text,
  UNIQUE (contractversie_id,richting)
);
ALTER TABLE public.contract_ontvangstmail_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contract_ontvangstmail_claims FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.contract_ontvangstmail_claims TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.contract_ontvangstmail_claims_id_seq TO service_role;
GRANT SELECT ON public.contract_ontvangstmail_claims TO authenticated;
CREATE POLICY contract_ontvangstmail_claims_lezen ON public.contract_ontvangstmail_claims
  FOR SELECT TO authenticated USING (app.heeft_recht('boekingen','lezen') OR app.heeft_recht('aanvragen','lezen'));

CREATE OR REPLACE FUNCTION public.contract_tekening_mandaat_geldig(p_boeking_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT NOT EXISTS(SELECT 1 FROM public.verhuur_besluiten WHERE boeking_id=p_boeking_id)
    OR EXISTS(SELECT 1 FROM public.verhuur_besluiten d JOIN public.boekingen b ON b.id=d.boeking_id
      WHERE b.id=p_boeking_id AND b.aanvraag_id=d.aanvraag_id AND d.besluit='ja' AND d.status='toegewezen'
        AND d.aanvraag_versie=public.verhuur_aanvraag_versie(d.aanvraag_id) AND d.huurprijs_euro=b.tarief_bedrag
        AND public.verhuur_contract_mandaat_geldig(b.id,
          (SELECT id FROM public.contractversies WHERE boeking_id=b.id ORDER BY versie DESC LIMIT 1)));
$$;

CREATE OR REPLACE FUNCTION public.lees_contract_tekening(p_token_hash text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'tekening', to_jsonb(t),
    'contract', to_jsonb(v),
    'boeking', jsonb_build_object('status', b.status, 'aanvraag_id', b.aanvraag_id, 'huurder_naam_snapshot', b.huurder_naam_snapshot,
      'verhuurtype_sleutel', b.verhuurtype_sleutel),
    'actuele_versie', (SELECT max(c.versie) FROM public.contractversies c WHERE c.boeking_id=b.id),
    'machine_proces', EXISTS (SELECT 1 FROM public.verhuur_besluiten d WHERE d.boeking_id=b.id),
    'machine_mandaat_geldig', public.contract_tekening_mandaat_geldig(b.id)
  )
  FROM public.contract_tekeningen t
  JOIN public.contractversies v ON v.boeking_id=t.boeking_id AND v.versie=t.versie
  JOIN public.boekingen b ON b.id=t.boeking_id
  WHERE t.token_hash=p_token_hash AND p_token_hash ~ '^[a-f0-9]{64}$';
$$;

CREATE OR REPLACE FUNCTION public.werk_contract_tekening_bij(
  p_token_hash text,
  p_actie text,
  p_code_hash text DEFAULT NULL,
  p_code_verloopt timestamptz DEFAULT NULL,
  p_pogingen integer DEFAULT NULL,
  p_verwachte_code_hash text DEFAULT NULL,
  p_op timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_boeking_id bigint;
  v_boeking public.boekingen%ROWTYPE;
  v_tekening public.contract_tekeningen%ROWTYPE;
  v_contract public.contractversies%ROWTYPE;
BEGIN
  SELECT boeking_id INTO v_boeking_id FROM public.contract_tekeningen WHERE token_hash=p_token_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tekenlink ontbreekt'; END IF;
  -- Alle tekenmutaties gebruiken dezelfde lockvolgorde als contractvernieuwing en annulering.
  SELECT * INTO v_boeking FROM public.boekingen WHERE id=v_boeking_id FOR UPDATE;
  PERFORM 1 FROM public.verhuur_besluiten WHERE boeking_id=v_boeking_id FOR SHARE;
  SELECT * INTO v_tekening FROM public.contract_tekeningen WHERE token_hash=p_token_hash FOR UPDATE;
  SELECT * INTO v_contract FROM public.contractversies WHERE boeking_id=v_boeking_id ORDER BY versie DESC LIMIT 1 FOR UPDATE;
  IF v_boeking.status NOT IN ('optie','definitief') OR
     v_tekening.ingetrokken_op IS NOT NULL OR v_tekening.verloopt_op <= now() OR
     v_tekening.ondertekend_op IS NOT NULL OR NOT v_tekening.vrijgegeven OR
     v_contract.versie IS DISTINCT FROM v_tekening.versie OR
     (v_contract.bestuur_verplicht AND v_contract.bestuur <> 'akkoord') OR v_contract.bestuur='terug' OR
     NOT public.contract_tekening_mandaat_geldig(v_boeking_id) THEN
    RAISE EXCEPTION 'Tekenlink is niet meer geldig of vrijgegeven';
  END IF;
  IF v_tekening.pogingen >= 5 THEN RAISE EXCEPTION 'Te veel verificatiepogingen'; END IF;
  IF p_actie='code' THEN
    IF p_code_hash IS NULL OR p_code_hash !~ '^[a-f0-9]{64}$' OR
       p_code_verloopt IS NULL OR p_code_verloopt <= now() OR p_code_verloopt > now()+interval '16 minutes' OR
       p_pogingen IS DISTINCT FROM v_tekening.pogingen THEN
      RAISE EXCEPTION 'Verificatie is intussen gewijzigd';
    END IF;
    UPDATE public.contract_tekeningen SET code_hash=p_code_hash, code_verloopt=p_code_verloopt,
      geverifieerd_op=NULL WHERE id=v_tekening.id;
  ELSIF p_actie IN ('foute_code','geverifieerd') THEN
    IF p_verwachte_code_hash IS NULL OR p_verwachte_code_hash IS DISTINCT FROM v_tekening.code_hash OR
       v_tekening.code_verloopt IS NULL OR v_tekening.code_verloopt <= now() THEN
      RAISE EXCEPTION 'De code is intussen gewijzigd of verlopen';
    END IF;
    IF p_actie='foute_code' THEN
      UPDATE public.contract_tekeningen SET pogingen=pogingen+1 WHERE id=v_tekening.id;
    ELSE
      IF p_op IS NULL OR p_op < now()-interval '5 minutes' OR p_op > now()+interval '1 minute' THEN
        RAISE EXCEPTION 'Verificatietijdstip is ongeldig';
      END IF;
      UPDATE public.contract_tekeningen SET geverifieerd_op=p_op, pogingen=0 WHERE id=v_tekening.id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Onbekende tekenmutatie';
  END IF;
  RETURN jsonb_build_object('ok',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.leg_contract_ondertekening_vast(
  p_token_hash text,
  p_naam text,
  p_op timestamptz,
  p_document_hash text,
  p_pdf_hash text,
  p_pdf_pad text,
  p_pdf_grootte integer,
  p_audit jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_boeking_id bigint;
  v_boeking public.boekingen%ROWTYPE;
  v_tekening public.contract_tekeningen%ROWTYPE;
  v_contract public.contractversies%ROWTYPE;
  v_aanvraag_id bigint;
BEGIN
  SELECT boeking_id INTO v_boeking_id FROM public.contract_tekeningen WHERE token_hash=p_token_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tekenlink ontbreekt'; END IF;
  SELECT * INTO v_boeking FROM public.boekingen WHERE id=v_boeking_id FOR UPDATE;
  PERFORM 1 FROM public.verhuur_besluiten WHERE boeking_id=v_boeking_id FOR SHARE;
  SELECT * INTO v_tekening FROM public.contract_tekeningen WHERE token_hash=p_token_hash FOR UPDATE;
  SELECT * INTO v_contract FROM public.contractversies WHERE boeking_id=v_boeking_id ORDER BY versie DESC LIMIT 1 FOR UPDATE;
  IF v_boeking.status NOT IN ('optie','definitief') OR v_tekening.ingetrokken_op IS NOT NULL OR
     v_contract.versie IS DISTINCT FROM v_tekening.versie OR NOT v_tekening.vrijgegeven OR
     (v_contract.bestuur_verplicht AND v_contract.bestuur <> 'akkoord') OR v_contract.bestuur='terug' OR
     NOT public.contract_tekening_mandaat_geldig(v_boeking_id) THEN
    RAISE EXCEPTION 'De boeking, vrijgave of contractversie is intussen gewijzigd';
  END IF;
  -- Een herhaling bewijst alleen een bestaande handtekening. Geen nieuwe naam,
  -- datum, documentmetadata, mail of job mag over de eerste commit heen schrijven.
  IF v_tekening.ondertekend_op IS NOT NULL THEN
    RETURN jsonb_build_object('status','al');
  END IF;
  IF v_tekening.verloopt_op <= now() OR v_tekening.geverifieerd_op IS NULL OR
     v_tekening.geverifieerd_op < now()-interval '30 minutes' OR
     p_op IS NULL OR p_op < now()-interval '5 minutes' OR p_op > now()+interval '1 minute' OR
     length(btrim(COALESCE(p_naam,''))) < 3 OR length(p_naam) > 250 OR
     p_document_hash IS NULL OR p_document_hash !~ '^[a-f0-9]{64}$' OR
     p_pdf_hash IS NULL OR p_pdf_hash !~ '^[a-f0-9]{64}$' OR
     p_pdf_pad IS DISTINCT FROM ('contracten/'||v_boeking_id||'/getekend-v'||v_tekening.versie||'-'||p_pdf_hash||'.pdf') OR
     p_pdf_grootte IS NULL OR p_pdf_grootte NOT BETWEEN 100 AND 8000000 OR
     p_audit IS NULL OR jsonb_typeof(p_audit) <> 'object' THEN
    RAISE EXCEPTION 'Ondertekening of bewijs is onvolledig of verlopen';
  END IF;
  UPDATE public.contract_tekeningen SET ondertekend_op=p_op, naam=p_naam,
    document_hash=p_document_hash, pdf_hash=p_pdf_hash, pdf_pad=p_pdf_pad,
    audit=p_audit || jsonb_build_object('email',v_tekening.email,'documentHash',p_document_hash,'pdfHash',p_pdf_hash),
    code_hash=NULL,code_verloopt=NULL WHERE id=v_tekening.id;
  UPDATE public.contractversies SET ondertekening='ontvangen', ondertekening_actor=p_naam,
    ondertekening_op=p_op, ondertekening_nummer=contractnummer, ondertekening_versie=versie WHERE id=v_contract.id;
  INSERT INTO public.documenten (boeking_id,type,bestandsnaam,storage_pad,mime_type,grootte_bytes)
    VALUES (v_boeking_id,'getekend_contract',v_contract.contractnummer||'-getekend.pdf',p_pdf_pad,'application/pdf',p_pdf_grootte);
  SELECT aanvraag_id INTO v_aanvraag_id FROM public.verhuur_besluiten
    WHERE boeking_id=v_boeking_id AND status='toegewezen' LIMIT 1;
  IF v_aanvraag_id IS NOT NULL THEN
    PERFORM public.verhuur_plan_stap(v_aanvraag_id,v_boeking_id,'ondertekenbevestiging',
      'ondertekend:'||v_boeking_id||':'||v_contract.id,
      jsonb_build_object('contractversie_id',v_contract.id,'versie',v_contract.versie));
    PERFORM public.verhuur_plan_stap(v_aanvraag_id,v_boeking_id,'controleer_definitief',
      'getekend:'||v_boeking_id||':'||v_contract.id,
      jsonb_build_object('contractversie_id',v_contract.id,'versie',v_contract.versie));
  END IF;
  RETURN jsonb_build_object('status','nieuw');
END;
$$;

CREATE OR REPLACE FUNCTION public.lees_contract_ondertekening_voor_bevestiging(p_boeking_id bigint,p_contractversie_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.lees_contract_tekening(t.token_hash) || jsonb_build_object('contractversie_id',v.id)
  FROM public.contractversies v
  JOIN public.contract_tekeningen t ON t.boeking_id=v.boeking_id AND t.versie=v.versie
  JOIN public.boekingen b ON b.id=v.boeking_id
  WHERE b.id=p_boeking_id AND v.id=p_contractversie_id
    AND b.status IN ('optie','definitief') AND t.ingetrokken_op IS NULL AND t.ondertekend_op IS NOT NULL
    AND v.versie=(SELECT max(c.versie) FROM public.contractversies c WHERE c.boeking_id=b.id)
    AND public.contract_tekening_mandaat_geldig(b.id)
    AND EXISTS (SELECT 1 FROM public.verhuur_besluiten d WHERE d.boeking_id=b.id AND d.status='toegewezen');
$$;

CREATE OR REPLACE FUNCTION public.bevestig_contract_ontvangstmail(
  p_boeking_id bigint,p_contractversie_id bigint,p_richting text,p_provider_id text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_tekening public.contract_tekeningen%ROWTYPE;
BEGIN
  -- Ook na annulering het al geaccepteerde providerbewijs bewaren.
  PERFORM 1 FROM public.boekingen WHERE id=p_boeking_id FOR UPDATE;
  SELECT t.* INTO v_tekening FROM public.contract_tekeningen t JOIN public.contractversies v
    ON v.boeking_id=t.boeking_id AND v.versie=t.versie
    WHERE t.boeking_id=p_boeking_id AND v.id=p_contractversie_id FOR UPDATE OF t;
  IF NOT FOUND OR v_tekening.ondertekend_op IS NULL OR p_richting IS NULL OR p_richting NOT IN ('aanvrager','intern') OR
     nullif(btrim(p_provider_id),'') IS NULL THEN RAISE EXCEPTION 'Ontvangstmailbewijs is onvolledig'; END IF;
  IF p_richting='aanvrager' THEN
    IF v_tekening.bevestiging_id IS NOT NULL AND v_tekening.bevestiging_id<>p_provider_id THEN
      RAISE EXCEPTION 'Er bestaat al een ander providerbewijs';
    END IF;
    UPDATE public.contract_tekeningen SET bevestiging_id=p_provider_id WHERE id=v_tekening.id;
  ELSE
    IF v_tekening.bestuur_bevestiging_id IS NOT NULL AND v_tekening.bestuur_bevestiging_id<>p_provider_id THEN
      RAISE EXCEPTION 'Er bestaat al een ander intern providerbewijs';
    END IF;
    UPDATE public.contract_tekeningen SET bestuur_bevestiging_id=p_provider_id WHERE id=v_tekening.id;
  END IF;
  RETURN true;
END;
$$;

-- Een bewijs blijft onveranderlijk, ook wanneer een beheerpad de tabel rechtstreeks bijwerkt.
CREATE OR REPLACE FUNCTION public.claim_contract_ontvangstmail(p_boeking_id bigint,p_contractversie_id bigint,p_richting text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.contract_ontvangstmail_claims%ROWTYPE; v_bewijs jsonb; v_id text; v_claim uuid;
BEGIN
  IF p_richting IS NULL OR p_richting NOT IN ('huurder','bestuur') THEN RAISE EXCEPTION 'Ongeldige ontvanger'; END IF;
  PERFORM 1 FROM public.boekingen WHERE id=p_boeking_id FOR UPDATE;
  v_bewijs:=public.lees_contract_ondertekening_voor_bevestiging(p_boeking_id,p_contractversie_id);
  IF v_bewijs IS NULL THEN RAISE EXCEPTION 'De ondertekening kan niet meer worden bevestigd'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.verhuur_proces_jobs WHERE sleutel='ondertekend:'||p_boeking_id||':'||p_contractversie_id
      AND status='bezig' AND claim_token IS NOT NULL) THEN RAISE EXCEPTION 'Geen lopende procesclaim'; END IF;
  SELECT * INTO c FROM public.contract_ontvangstmail_claims
    WHERE contractversie_id=p_contractversie_id AND richting=p_richting FOR UPDATE;
  v_id:=v_bewijs->'tekening'->>(CASE WHEN p_richting='huurder' THEN 'bevestiging_id' ELSE 'bestuur_bevestiging_id' END);
  IF v_id IS NOT NULL THEN RETURN jsonb_build_object('status','verzonden','providerId',v_id); END IF;
  IF FOUND AND c.status IN ('bezig','onzeker','verzonden') THEN
    RETURN jsonb_build_object('status',c.status,'providerId',c.provider_id);
  END IF;
  v_claim:=gen_random_uuid();
  INSERT INTO public.contract_ontvangstmail_claims(boeking_id,contractversie_id,richting,status,claim_token)
    VALUES(p_boeking_id,p_contractversie_id,p_richting,'bezig',v_claim)
    ON CONFLICT(contractversie_id,richting) DO UPDATE SET status='bezig',claim_token=v_claim,
      pogingen=public.contract_ontvangstmail_claims.pogingen+1,bijgewerkt_op=now(),melding=NULL;
  RETURN jsonb_build_object('status','geclaimd','claimToken',v_claim);
END;
$$;

CREATE OR REPLACE FUNCTION public.registreer_contract_ontvangstmail_resultaat(
  p_boeking_id bigint,p_contractversie_id bigint,p_richting text,p_claim_token uuid,p_status text,
  p_provider_id text DEFAULT NULL,p_melding text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.contract_ontvangstmail_claims%ROWTYPE;
BEGIN
  IF p_richting IS NULL OR p_richting NOT IN ('huurder','bestuur') OR
     p_status IS NULL OR p_status NOT IN ('verzonden','niet_verzonden','onzeker') THEN
    RAISE EXCEPTION 'Ongeldige ontvangstmailstatus of ontvanger';
  END IF;
  PERFORM 1 FROM public.boekingen WHERE id=p_boeking_id FOR UPDATE;
  SELECT * INTO c FROM public.contract_ontvangstmail_claims
    WHERE boeking_id=p_boeking_id AND contractversie_id=p_contractversie_id AND richting=p_richting FOR UPDATE;
  IF NOT FOUND OR p_claim_token IS NULL OR c.claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'Deze verzendclaim is intussen vervangen of hersteld';
  END IF;
  IF c.status='verzonden' THEN
    IF p_status='verzonden' AND c.provider_id=p_provider_id THEN RETURN true; END IF;
    RAISE EXCEPTION 'Een bestaand verzendbewijs mag niet worden gewijzigd';
  END IF;
  IF c.status NOT IN ('bezig','onzeker') THEN RAISE EXCEPTION 'Geen lopende ontvangstmailclaim'; END IF;
  IF p_status='verzonden' THEN
    IF nullif(btrim(p_provider_id),'') IS NULL THEN RAISE EXCEPTION 'Providerbewijs ontbreekt'; END IF;
    PERFORM public.bevestig_contract_ontvangstmail(p_boeking_id,p_contractversie_id,
      CASE WHEN p_richting='huurder' THEN 'aanvrager' ELSE 'intern' END,p_provider_id);
  END IF;
  UPDATE public.contract_ontvangstmail_claims SET status=p_status,provider_id=p_provider_id,
    bijgewerkt_op=now(),melding=left(p_melding,1000) WHERE id=c.id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.herstel_contract_ontvangstmail(
  p_boeking_id bigint,p_contractversie_id bigint,p_richting text,p_uitkomst text,p_provider_id text,p_bewijs text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.contract_ontvangstmail_claims%ROWTYPE; j public.verhuur_proces_jobs%ROWTYPE;
  v_tekening public.contract_tekeningen%ROWTYPE; v_bestaand text; v_onzeker boolean; v_klaar boolean;
BEGIN
  IF auth.uid() IS NULL OR app.heeft_recht('instellingen','schrijven') IS NOT TRUE OR
     (app.heeft_recht('aanvragen','schrijven') OR app.heeft_recht('boekingen','schrijven')) IS NOT TRUE THEN
    RAISE EXCEPTION 'Alleen een bevoegde beheerder mag ontvangstmailbewijs herstellen' USING ERRCODE='42501';
  END IF;
  IF p_richting IS NULL OR p_richting NOT IN ('huurder','bestuur') OR p_uitkomst IS NULL OR p_uitkomst NOT IN ('geaccepteerd','niet_verzonden') OR
     length(btrim(COALESCE(p_bewijs,''))) NOT BETWEEN 20 AND 2000 OR
     (p_uitkomst='geaccepteerd' AND (nullif(btrim(p_provider_id),'') IS NULL OR length(p_provider_id)>200)) THEN
    RAISE EXCEPTION 'Leg gecontroleerd providerbewijs vast voor de juiste ontvanger';
  END IF;
  PERFORM 1 FROM public.boekingen WHERE id=p_boeking_id FOR UPDATE;
  SELECT * INTO j FROM public.verhuur_proces_jobs
    WHERE sleutel='ondertekend:'||p_boeking_id||':'||p_contractversie_id AND boeking_id=p_boeking_id FOR UPDATE;
  IF NOT FOUND OR NOT(j.status IN ('wacht_op_mens','onzeker') OR
      (j.status='bezig' AND j.geclaimd_op IS NOT NULL AND j.geclaimd_op < now()-interval '15 minutes')) THEN
    RAISE EXCEPTION 'Deze ontvangstmail wacht niet op handmatig herstel';
  END IF;
  SELECT t.* INTO v_tekening FROM public.contract_tekeningen t JOIN public.contractversies v
    ON v.boeking_id=t.boeking_id AND v.versie=t.versie
    WHERE t.boeking_id=p_boeking_id AND v.id=p_contractversie_id FOR UPDATE OF t;
  IF NOT FOUND OR v_tekening.ondertekend_op IS NULL THEN RAISE EXCEPTION 'Bijbehorende ondertekening ontbreekt'; END IF;
  SELECT * INTO c FROM public.contract_ontvangstmail_claims
    WHERE boeking_id=p_boeking_id AND contractversie_id=p_contractversie_id AND richting=p_richting FOR UPDATE;
  v_bestaand:=CASE WHEN p_richting='huurder' THEN v_tekening.bevestiging_id ELSE v_tekening.bestuur_bevestiging_id END;
  IF v_bestaand IS NOT NULL AND (p_uitkomst<>'geaccepteerd' OR v_bestaand<>p_provider_id) THEN
    RAISE EXCEPTION 'Een bewezen verzending mag niet worden gewist of vervangen';
  END IF;
  IF c.status='verzonden' AND (p_uitkomst<>'geaccepteerd' OR c.provider_id IS DISTINCT FROM p_provider_id) THEN
    RAISE EXCEPTION 'Een bewezen verzendclaim mag niet worden gewist of vervangen';
  END IF;
  IF p_uitkomst='geaccepteerd' THEN
    PERFORM public.bevestig_contract_ontvangstmail(p_boeking_id,p_contractversie_id,
      CASE WHEN p_richting='huurder' THEN 'aanvrager' ELSE 'intern' END,p_provider_id);
  END IF;
  INSERT INTO public.contract_ontvangstmail_claims(boeking_id,contractversie_id,richting,status,claim_token,provider_id,melding)
    VALUES(p_boeking_id,p_contractversie_id,p_richting,CASE WHEN p_uitkomst='geaccepteerd' THEN 'verzonden' ELSE 'niet_verzonden' END,
      NULL,CASE WHEN p_uitkomst='geaccepteerd' THEN p_provider_id ELSE NULL END,p_bewijs)
    ON CONFLICT(contractversie_id,richting) DO UPDATE SET status=excluded.status,claim_token=NULL,
      provider_id=excluded.provider_id,melding=excluded.melding,bijgewerkt_op=now();
  SELECT EXISTS(SELECT 1 FROM public.contract_ontvangstmail_claims WHERE contractversie_id=p_contractversie_id AND status IN ('bezig','onzeker')) INTO v_onzeker;
  SELECT bevestiging_id IS NOT NULL AND bestuur_bevestiging_id IS NOT NULL INTO v_klaar
    FROM public.contract_tekeningen WHERE id=v_tekening.id;
  UPDATE public.verhuur_proces_jobs SET
    status=CASE WHEN v_onzeker THEN 'onzeker' WHEN v_klaar THEN 'afgerond' ELSE 'te_doen' END,
    claim_token=NULL,geclaimd_op=NULL,pogingen=0,gepland_op=now(),bijgewerkt_op=now(),
    last_fout=CASE WHEN v_onzeker THEN 'Controleer ook het providerbewijs van de andere ontvanger.' ELSE NULL END,
    opvolgen_voor=CASE WHEN v_onzeker THEN now() ELSE NULL END
    WHERE id=j.id;
  INSERT INTO public.auditlog(actor_id,actor_type,actor_naam,onderwerp_type,onderwerp_id,actie,details)
    VALUES(auth.uid(),'gebruiker','Beheerder '||auth.uid()::text,'boeking',p_boeking_id::text,'ondertekenbevestiging_hersteld',
      jsonb_build_object('contractversieId',p_contractversie_id,'richting',p_richting,'uitkomst',p_uitkomst,
        'providerId',p_provider_id,'bewijs',p_bewijs,'vorigeStatus',c.status,'vorigeProviderId',c.provider_id,'andereRichtingOnzeker',v_onzeker));
  RETURN jsonb_build_object('ok',true,'hervat',NOT v_onzeker AND NOT v_klaar,
    'status',CASE WHEN v_onzeker THEN 'onzeker' WHEN v_klaar THEN 'afgerond' ELSE 'te_doen' END);
END;
$$;

CREATE OR REPLACE FUNCTION public.bescherm_contract_tekening()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_status text;
BEGIN
  SELECT status::text INTO v_status FROM public.boekingen WHERE id=NEW.boeking_id FOR UPDATE;
  IF TG_OP='UPDATE' AND OLD.ondertekend_op IS NOT NULL AND
    ROW(NEW.boeking_id,NEW.versie,NEW.ondertekend_op,NEW.naam,NEW.email,NEW.document_hash,NEW.pdf_hash,NEW.pdf_pad,NEW.audit)
    IS DISTINCT FROM ROW(OLD.boeking_id,OLD.versie,OLD.ondertekend_op,OLD.naam,OLD.email,OLD.document_hash,OLD.pdf_hash,OLD.pdf_pad,OLD.audit) THEN
    RAISE EXCEPTION 'Opgeslagen ondertekenbewijs is onveranderlijk';
  END IF;
  IF v_status='geannuleerd' THEN
    IF NEW.ondertekend_op IS NOT NULL AND (TG_OP='INSERT' OR OLD.ondertekend_op IS NULL) THEN
      RAISE EXCEPTION 'Een geannuleerde boeking kan niet worden ondertekend';
    END IF;
    NEW.ingetrokken_op := COALESCE(NEW.ingetrokken_op,now());
    NEW.vrijgegeven := false;
    NEW.code_hash := NULL;
    NEW.code_verloopt := NULL;
    NEW.geverifieerd_op := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_tekening_bescherm_bewijs ON public.contract_tekeningen;
CREATE TRIGGER contract_tekening_bescherm_bewijs BEFORE INSERT OR UPDATE ON public.contract_tekeningen
  FOR EACH ROW EXECUTE FUNCTION public.bescherm_contract_tekening();

CREATE OR REPLACE FUNCTION public.stop_geannuleerde_verhuurketen()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_aanvragen bigint[];
BEGIN
  IF NEW.status <> 'geannuleerd' THEN RETURN NEW; END IF;
  SELECT array_agg(DISTINCT id) INTO v_aanvragen FROM (
    SELECT NEW.aanvraag_id AS id WHERE NEW.aanvraag_id IS NOT NULL
    UNION SELECT id FROM public.aanvragen WHERE boeking_id=NEW.id
    UNION SELECT aanvraag_id FROM public.verhuur_besluiten WHERE boeking_id=NEW.id
  ) gekoppeld;
  UPDATE public.contract_tekeningen SET ingetrokken_op=COALESCE(ingetrokken_op,now()),
    vrijgegeven=false,code_hash=NULL,code_verloopt=NULL,geverifieerd_op=NULL WHERE boeking_id=NEW.id;
  UPDATE public.toegangstokens SET ingetrokken_op=COALESCE(ingetrokken_op,now())
    WHERE boeking_id=NEW.id OR aanvraag_id=ANY(v_aanvragen);
  UPDATE public.verhuur_beslislinks SET ingetrokken_op=COALESCE(ingetrokken_op,now())
    WHERE aanvraag_id=ANY(v_aanvragen);
  UPDATE public.verhuur_proces_jobs SET status='geannuleerd',claim_token=NULL
    WHERE (boeking_id=NEW.id OR aanvraag_id=ANY(v_aanvragen)) AND status NOT IN ('afgerond','geannuleerd');
  UPDATE public.verhuur_besluiten SET status='geannuleerd'
    WHERE (boeking_id=NEW.id OR aanvraag_id=ANY(v_aanvragen)) AND status <> 'geannuleerd';
  UPDATE public.communicatie_jobs SET status='geannuleerd' WHERE boeking_id=NEW.id AND status NOT IN ('verzonden','geannuleerd');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boeking_stop_verhuurketen ON public.boekingen;
CREATE TRIGGER boeking_stop_verhuurketen AFTER UPDATE OF status ON public.boekingen
  FOR EACH ROW EXECUTE FUNCTION public.stop_geannuleerde_verhuurketen();

CREATE OR REPLACE FUNCTION public.bewaak_geannuleerde_verhuurlink()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_boeking_id bigint; v_status text;
BEGIN
  v_boeking_id := nullif(to_jsonb(NEW)->>'boeking_id','')::bigint;
  IF v_boeking_id IS NOT NULL THEN
    SELECT status::text INTO v_status FROM public.boekingen WHERE id=v_boeking_id FOR UPDATE;
  ELSE
    SELECT status::text INTO v_status FROM public.boekingen WHERE aanvraag_id=NEW.aanvraag_id ORDER BY id DESC LIMIT 1 FOR UPDATE;
  END IF;
  IF v_status='geannuleerd' THEN
    IF NEW.ingetrokken_op IS NULL OR (TG_OP='UPDATE' AND NEW.token_hash IS DISTINCT FROM OLD.token_hash) THEN
      RAISE EXCEPTION 'Geen nieuwe toegangs- of beslislink voor een geannuleerde boeking';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS toegangstoken_annulering ON public.toegangstokens;
CREATE TRIGGER toegangstoken_annulering BEFORE INSERT OR UPDATE ON public.toegangstokens
  FOR EACH ROW EXECUTE FUNCTION public.bewaak_geannuleerde_verhuurlink();
DROP TRIGGER IF EXISTS beslislink_annulering ON public.verhuur_beslislinks;
CREATE TRIGGER beslislink_annulering BEFORE INSERT OR UPDATE ON public.verhuur_beslislinks
  FOR EACH ROW EXECUTE FUNCTION public.bewaak_geannuleerde_verhuurlink();

REVOKE ALL ON FUNCTION public.lees_contract_tekening(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.contract_tekening_mandaat_geldig(bigint) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.werk_contract_tekening_bij(text,text,text,timestamptz,integer,text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.leg_contract_ondertekening_vast(text,text,timestamptz,text,text,text,integer,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.lees_contract_ondertekening_voor_bevestiging(bigint,bigint) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bevestig_contract_ontvangstmail(bigint,bigint,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lees_contract_tekening(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.werk_contract_tekening_bij(text,text,text,timestamptz,integer,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.leg_contract_ondertekening_vast(text,text,timestamptz,text,text,text,integer,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.lees_contract_ondertekening_voor_bevestiging(bigint,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.bevestig_contract_ontvangstmail(bigint,bigint,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.claim_contract_ontvangstmail(bigint,bigint,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.registreer_contract_ontvangstmail_resultaat(bigint,bigint,text,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.herstel_contract_ontvangstmail(bigint,bigint,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_contract_ontvangstmail(bigint,bigint,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.registreer_contract_ontvangstmail_resultaat(bigint,bigint,text,uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.herstel_contract_ontvangstmail(bigint,bigint,text,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.bescherm_contract_tekening() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.stop_geannuleerde_verhuurketen() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.bewaak_geannuleerde_verhuurlink() FROM PUBLIC,anon,authenticated;

COMMIT;
