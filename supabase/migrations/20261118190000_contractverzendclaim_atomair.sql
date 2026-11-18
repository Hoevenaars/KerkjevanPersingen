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
  IF auth.uid() IS NULL OR NOT (
    app.heeft_recht('boekingen','schrijven') OR
    (app.heeft_recht('aanvragen','schrijven') AND app.heeft_recht('instellingen','schrijven'))
  ) THEN
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
GRANT EXECUTE ON FUNCTION public.claim_contractverzending(bigint,integer,text,text,text,text) TO authenticated;

-- Also protect older contract-writing routes that insert directly rather than
-- using the V4 atomic RPC: a newer version cannot be created mid-dispatch.
CREATE OR REPLACE FUNCTION public.blokkeer_contractversie_tijdens_verzending()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM id FROM public.boekingen WHERE id = NEW.boeking_id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.contract_verzendingen
      WHERE boeking_id = NEW.boeking_id
        AND soort IN ('contract','herhaling') AND status = 'bezig'
  ) THEN
    RAISE EXCEPTION 'Er loopt nog een contractverzending; maak nu geen nieuwe contractversie';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS contractversies_verzendlock ON public.contractversies;
CREATE TRIGGER contractversies_verzendlock
BEFORE INSERT ON public.contractversies
FOR EACH ROW EXECUTE FUNCTION public.blokkeer_contractversie_tijdens_verzending();
