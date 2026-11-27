-- Een uitzonderingsconcept kan alleen door een ingelogde bestuurder opnieuw
-- worden gemandateerd. Oude tekst, facturen, ontvangstbewijzen en besluiten
-- blijven bewaard. Deze migratie verstuurt niets en activeert geen machine.
ALTER TABLE public.verhuur_besluiten ADD COLUMN revisie integer NOT NULL DEFAULT 1 CHECK (revisie>0);
ALTER TABLE public.verhuur_besluiten ADD COLUMN contractversie_id bigint REFERENCES public.contractversies(id);
ALTER TABLE public.verhuur_besluiten ADD COLUMN contract_snapshot jsonb;
ALTER TABLE public.verhuur_besluiten ADD COLUMN contract_snapshot_hash text;
ALTER TABLE public.verhuur_besluiten ADD COLUMN concept_bron_versie text;

CREATE TABLE public.verhuur_contract_besluit_historie (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aanvraag_id bigint NOT NULL REFERENCES public.aanvragen(id),
  revisie integer NOT NULL,
  aanvraag_versie text NOT NULL,
  contractversie_id bigint NOT NULL REFERENCES public.contractversies(id),
  bron_versie text NOT NULL,
  vorig_besluit jsonb NOT NULL,
  besluit jsonb NOT NULL,
  snapshot jsonb NOT NULL,
  beoordelingsbron jsonb NOT NULL,
  actor_id uuid NOT NULL,
  reden text NOT NULL,
  vastgelegd_op timestamptz NOT NULL DEFAULT now(),
  UNIQUE(aanvraag_id,revisie)
);
ALTER TABLE public.verhuur_contract_besluit_historie ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.verhuur_contract_besluit_historie FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.verhuur_contract_besluit_historie TO authenticated;
GRANT ALL ON public.verhuur_contract_besluit_historie TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.verhuur_contract_besluit_historie_id_seq TO service_role;
CREATE POLICY verhuur_concept_historie_lezen ON public.verhuur_contract_besluit_historie
  FOR SELECT TO authenticated USING (app.heeft_recht('aanvragen','lezen'));
CREATE TRIGGER verhuur_concept_historie_bewaren BEFORE UPDATE OR DELETE ON public.verhuur_contract_besluit_historie
  FOR EACH ROW EXECUTE FUNCTION public.verhuur_historie_onwijzigbaar();

-- Alleen materiële gegevens: betaling/status/ondertekening mogen vooruitgaan
-- zonder de goedgekeurde prijs, tekst of termijn ineens ongeldig te maken.
CREATE OR REPLACE FUNCTION public.verhuur_contract_snapshot(p_contractversie_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('contract',jsonb_build_object(
    'id',c.id,'boeking_id',c.boeking_id,'versie',c.versie,'contractnummer',c.contractnummer,
    'opgesteld_op',c.opgesteld_op,'tekst',c.tekst,'voorwaarden_tekst',c.voorwaarden_tekst,
    'huisregels_tekst',c.huisregels_tekst,'plattegrond_tekst',c.plattegrond_tekst,
    'vingerafdruk',c.vingerafdruk,'afspraken',c.afspraken),
    'betalingen',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'soort',p.soort,
      'bedrag',p.bedrag,'vervaldatum',p.vervaldatum,'factuur_op',p.factuur_op) ORDER BY p.id)
      FROM public.betalingen p WHERE p.boeking_id=c.boeking_id AND p.status<>'geannuleerd'
      AND p.soort IN ('aanbetaling','restant')),'[]'))
  FROM public.contractversies c WHERE c.id=p_contractversie_id;
$$;

CREATE OR REPLACE FUNCTION public.verhuur_contract_mandaat_geldig(p_boeking_id bigint,p_contractversie_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM public.verhuur_besluiten d
    JOIN public.boekingen b ON b.id=d.boeking_id
    JOIN public.contractversies c ON c.boeking_id=b.id AND c.id=p_contractversie_id
    WHERE b.id=p_boeking_id AND b.aanvraag_id=d.aanvraag_id AND d.besluit='ja' AND d.status='toegewezen'
      AND d.aanvraag_versie=public.verhuur_aanvraag_versie(d.aanvraag_id)
      AND c.mandaat_aanvraag_versie=d.aanvraag_versie AND c.bestuur='akkoord'
      AND d.huurprijs_euro=b.tarief_bedrag
      AND NOT EXISTS(SELECT 1 FROM public.contractversies n WHERE n.boeking_id=b.id AND n.versie>c.versie)
      AND (d.contractversie_id IS NULL OR (d.contractversie_id=c.id AND
        d.contract_snapshot_hash=encode(sha256(convert_to(public.verhuur_contract_snapshot(c.id)::text,'UTF8')),'hex'))));
$$;

-- Dit is ook de servercontrole van de UI. Een concept met fiscale of verzend-
-- bewijzen wordt nooit stilzwijgend een nieuwe versie of een nieuwe factuur.
CREATE OR REPLACE FUNCTION public.verhuur_concept_blokkade(p_aanvraag_id bigint,p_contractversie_id bigint)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.aanvragen%ROWTYPE; b public.boekingen%ROWTYPE; c public.contractversies%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.aanvragen WHERE id=p_aanvraag_id;
  SELECT * INTO b FROM public.boekingen WHERE id=a.boeking_id AND aanvraag_id=a.id;
  IF NOT FOUND THEN RETURN 'De bestaande boeking is niet eenduidig gekoppeld.'; END IF;
  IF b.status::text NOT IN ('optie','optie_verlopen') THEN
    RETURN 'Dit dossier is geen onuitgegeven optie. Bestuur en penningmeester moeten de bestaande afspraken afhandelen.';
  END IF;
  SELECT * INTO c FROM public.contractversies WHERE id=p_contractversie_id AND boeking_id=b.id;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.contractversies n WHERE n.boeking_id=b.id AND n.versie>c.versie) THEN
    RETURN 'Het getoonde concept is niet meer de actuele contractversie.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.facturen WHERE boeking_id=b.id) THEN
    RETURN 'Er is al een factuur uitgegeven. De penningmeester moet eerst het bestaande fiscale traject beoordelen; dit concept wordt niet verzonden.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.contract_verzendingen WHERE boeking_id=b.id AND soort IN ('contract','herhaling')
       AND (status IN ('bezig','verzonden') OR bericht_id IS NOT NULL)) OR
     EXISTS(SELECT 1 FROM public.verhuur_proces_jobs WHERE boeking_id=b.id AND taak IN ('contract','financieel')
       AND status IN ('bezig','onzeker')) THEN
    RETURN 'Er is een lopende, geaccepteerde of onzekere verzending. Herstel eerst het providerbewijs; geen nieuw pakket.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.contractversies WHERE boeking_id=b.id AND ondertekening='ontvangen') OR
     EXISTS(SELECT 1 FROM public.contract_tekeningen WHERE boeking_id=b.id AND ondertekend_op IS NOT NULL) OR
     EXISTS(SELECT 1 FROM public.documenten WHERE boeking_id=b.id AND type='getekend_contract') THEN
    RETURN 'Er is al een ondertekende overeenkomst. Het bestuur moet een expliciet wijzigings- of beëindigingstraject afspreken.';
  END IF;
  IF b.aanbetaling_ontvangen OR EXISTS(SELECT 1 FROM public.betalingen WHERE boeking_id=b.id
       AND (ontvangen_bedrag>0 OR status IN ('ontvangen','betaald'))) OR
     EXISTS(SELECT 1 FROM public.verhuur_betaalontvangsten r JOIN public.betalingen p ON p.id=r.betaling_id WHERE p.boeking_id=b.id) THEN
    RETURN 'Er zijn ontvangsten vastgelegd. De penningmeester moet deze eerst aan de juiste bestaande afspraak koppelen.';
  END IF;
  IF a.start_datum IS NULL OR a.eind_datum IS NULL OR a.eind_datum<a.start_datum OR
     a.start_datum<(now() AT TIME ZONE 'Europe/Amsterdam')::date OR
     a.start_datum IS DISTINCT FROM b.start_datum OR a.eind_datum IS DISTINCT FROM b.eind_datum OR
     a.verhuurtype_sleutel IS DISTINCT FROM b.verhuurtype_sleutel THEN
    RETURN 'Aanvraag, boeking en actuele periode sluiten niet aan. Controleer eerst datum en beschikbaarheid in het bestaande dossier.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.boekingen r WHERE r.id<>b.id AND r.status::text IN ('optie','definitief','optie_verlopen','migratie_vastgelegd')
       AND (r.start_datum IS NULL OR r.eind_datum IS NULL OR (r.start_datum<=a.eind_datum AND r.eind_datum>=a.start_datum))) OR
     EXISTS(SELECT 1 FROM public.interne_activiteiten r WHERE r.blokkeert_verhuurkalender
       AND (r.start_datum IS NULL OR r.eind_datum IS NULL OR (r.start_datum<=a.eind_datum AND r.eind_datum>=a.start_datum))) OR
     EXISTS(SELECT 1 FROM public.activiteit_bron r WHERE
       (r.start_datum IS NULL OR r.eind_datum IS NULL OR (r.start_datum<=a.eind_datum AND r.eind_datum>=a.start_datum)) AND
       ((r.zichtbaarheid::text='publiek' AND coalesce(r.levenscyclus::text,'actief')<>'geannuleerd') OR
        (r.zichtbaarheid::text='bezet' AND NOT(coalesce(r.lokale_override,'{}')?'annulering'))) AND
       NOT (r.start_datum IS NOT NULL AND r.eind_datum IS NOT NULL AND
         r.start_datum>=b.start_datum AND r.eind_datum<=b.eind_datum AND
         EXISTS(SELECT 1 FROM public.publieke_activiteiten p WHERE p.boeking_id=b.id
           AND p.legacy_source=r.legacy_source AND p.legacy_id=r.legacy_id))) THEN
    RETURN 'Er is een andere reservering, activiteit of onvolledige blokkade. Eerst de beschikbaarheid oplossen.';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.verhuur_concept_beoordelingsbron(p_aanvraag_id bigint,p_contractversie_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE d public.verhuur_besluiten%ROWTYPE; c public.contractversies%ROWTYPE; v jsonb; s jsonb; reden text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL OR
     (SELECT app.heeft_recht('aanvragen','schrijven')) IS NOT TRUE OR
     (SELECT app.heeft_recht('instellingen','schrijven')) IS NOT TRUE THEN
    RAISE EXCEPTION 'Een concrete contractbeoordeling vereist een ingelogde bestuurder.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO d FROM public.verhuur_besluiten WHERE aanvraag_id=p_aanvraag_id;
  IF NOT FOUND OR d.boeking_id IS NULL OR NOT public.verhuur_machine_in_scope(p_aanvraag_id) THEN
    RAISE EXCEPTION 'Dit dossier heeft geen bestaand machinecontracttraject.';
  END IF;
  SELECT * INTO c FROM public.contractversies WHERE id=p_contractversie_id AND boeking_id=d.boeking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Het concept hoort niet bij dit dossier.'; END IF;
  s:=public.verhuur_contract_snapshot(c.id);
  reden:=public.verhuur_concept_blokkade(p_aanvraag_id,c.id);
  v:=jsonb_build_object('aanvraag_versie',public.verhuur_aanvraag_versie(p_aanvraag_id),
    'contract',s->'contract','wizard',s->'contract'->'afspraken'->'wizard','betalingen',s->'betalingen',
    'snapshot',s,'snapshot_hash',encode(sha256(convert_to(s::text,'UTF8')),'hex'),
    'beoordelingsbron',public.verhuur_beoordelingsbron(p_aanvraag_id),'huidig_besluit',to_jsonb(d),
    'toelaatbaar',reden IS NULL,'blokkade',reden,'eigenaar','Bestuur en penningmeester',
    'opvolgen_voor',(SELECT min(j.opvolgen_voor) FROM public.verhuur_proces_jobs j WHERE j.aanvraag_id=p_aanvraag_id
      AND j.status IN ('wacht_op_mens','onzeker')));
  RETURN v||jsonb_build_object('bron_versie',encode(sha256(convert_to(v::text,'UTF8')),'hex'));
END;
$$;

CREATE OR REPLACE FUNCTION public.verhuur_keur_concept_goed(p_aanvraag_id bigint,p_contractversie_id bigint,
  p_aanvraag_versie text,p_bron_versie text,p_reden text,p_waarschuwingen jsonb,p_beleid jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.aanvragen%ROWTYPE; b public.boekingen%ROWTYPE; c public.contractversies%ROWTYPE;
  d public.verhuur_besluiten%ROWTYPE; v jsonb; w jsonb; s jsonb; oud jsonb; nieuw jsonb;
  prijs numeric; aan numeric; huurtext text; aantext text; t public.betalingen%ROWTYPE;
  eerste date; totaal numeric:=0; aantal_aan integer:=0; aantal_rest integer:=0; lead integer;
  reden text; actor text; job uuid; rev integer; vast_tarief numeric;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL OR
     (SELECT app.heeft_recht('aanvragen','schrijven')) IS NOT TRUE OR
     (SELECT app.heeft_recht('instellingen','schrijven')) IS NOT TRUE THEN
    RAISE EXCEPTION 'Alleen een ingelogde bestuurder kan een concreet concept goedkeuren.' USING ERRCODE='42501';
  END IF;
  IF length(btrim(coalesce(p_reden,'')))<20 OR length(p_reden)>2000 OR
     coalesce(p_aanvraag_versie,'') !~ '^[0-9a-f]{64}$' OR coalesce(p_bron_versie,'') !~ '^[0-9a-f]{64}$' OR
     jsonb_typeof(p_waarschuwingen) IS DISTINCT FROM 'array' OR jsonb_typeof(p_beleid) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Leg de concrete beoordeling, bronversie en reden vast.';
  END IF;
  PERFORM pg_advisory_xact_lock(872501,1);
  -- Boeking eerst: dezelfde volgorde als contractopslag, ondertekening en ontvangst.
  SELECT * INTO b FROM public.boekingen WHERE aanvraag_id=p_aanvraag_id AND
    id=(SELECT boeking_id FROM public.aanvragen WHERE id=p_aanvraag_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bestaande boeking ontbreekt.'; END IF;
  SELECT * INTO a FROM public.aanvragen WHERE id=p_aanvraag_id FOR UPDATE;
  SELECT * INTO d FROM public.verhuur_besluiten WHERE aanvraag_id=a.id AND boeking_id=b.id FOR UPDATE;
  IF NOT FOUND OR NOT public.verhuur_machine_in_scope(a.id) THEN RAISE EXCEPTION 'Geen bestaand machinebesluit.'; END IF;
  SELECT * INTO c FROM public.contractversies WHERE id=p_contractversie_id AND boeking_id=b.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Concept hoort niet bij dit dossier.'; END IF;
  PERFORM id FROM public.betalingen WHERE boeking_id=b.id ORDER BY id FOR UPDATE;
  IF public.verhuur_aanvraag_versie(a.id) IS DISTINCT FROM p_aanvraag_versie THEN
    RAISE EXCEPTION 'De aanvraag is gewijzigd. Bekijk het actuele concept en alle waarschuwingen opnieuw.';
  END IF;
  IF d.contractversie_id=c.id AND d.concept_bron_versie=p_bron_versie AND d.aanvraag_versie=p_aanvraag_versie
     AND d.status='toegewezen' AND public.verhuur_contract_mandaat_geldig(b.id,c.id) THEN
    RETURN jsonb_build_object('ok',true,'alVerwerkt',true,'boekingId',b.id,'revisie',d.revisie,'melding','Dit concrete concept is al goedgekeurd.');
  END IF;
  v:=public.verhuur_concept_beoordelingsbron(a.id,c.id);
  IF v->>'bron_versie' IS DISTINCT FROM p_bron_versie THEN
    RAISE EXCEPTION 'Concept, termijnen of waarschuwingen zijn gewijzigd. Bekijk de actuele beoordeling opnieuw.';
  END IF;
  reden:=v->>'blokkade';
  IF reden IS NOT NULL THEN
    UPDATE public.verhuur_besluiten SET status='herbeoordelen',blokkade_reden=reden WHERE aanvraag_id=a.id;
    job:=public.verhuur_plan_stap(a.id,b.id,'hervatten','concept-uitzondering:'||a.id||':'||c.id||':'||p_aanvraag_versie);
    UPDATE public.verhuur_proces_jobs SET status='wacht_op_mens',last_fout=reden,verantwoordelijke='Bestuur en penningmeester',
      opvolgen_voor=coalesce(opvolgen_voor,now()+interval '7 days'),bijgewerkt_op=now() WHERE id=job;
    RETURN jsonb_build_object('ok',false,'wachtOpMens',true,'melding',reden,'eigenaar','Bestuur en penningmeester',
      'opvolgenVoor',now()+interval '7 days','boekingId',b.id);
  END IF;
  w:=v->'wizard';
  IF jsonb_typeof(w) IS DISTINCT FROM 'object' OR nullif(btrim(c.vingerafdruk),'') IS NULL OR
     length(c.tekst)<50 OR length(c.voorwaarden_tekst)<30 OR length(c.huisregels_tekst)<30 OR
     w->>'periodeVan' IS DISTINCT FROM b.start_datum::text OR w->>'periodeTot' IS DISTINCT FROM b.eind_datum::text OR
     w->>'naam' IS DISTINCT FROM a.naam OR lower(btrim(w->>'email')) IS DISTINCT FROM lower(btrim(a.email)) OR
     coalesce(w->>'straat','') IS DISTINCT FROM coalesce(a.straat,'') OR
     coalesce(w->>'huisnummer','') IS DISTINCT FROM coalesce(a.huisnummer,'') OR
     coalesce(w->>'toevoeging','') IS DISTINCT FROM coalesce(a.huisnummer_toevoeging,'') OR
     coalesce(w->>'postcode','') IS DISTINCT FROM coalesce(a.postcode,'') OR
     coalesce(w->>'woonplaats','') IS DISTINCT FROM coalesce(a.woonplaats,'') OR
     coalesce(w->>'tijdVan','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR
     coalesce(w->>'tijdTot','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR w->>'tijdTot'<=w->>'tijdVan' OR
     nullif(btrim(w->>'opbouw'),'') IS NULL OR nullif(btrim(w->>'afbouw'),'') IS NULL THEN
    RAISE EXCEPTION 'Het opgeslagen concept sluit niet aan op de actuele aanvraag of mist concrete afspraken.';
  END IF;
  huurtext:=regexp_replace(btrim(coalesce(w->>'huurprijs','')),'[€[:space:]]','','g');
  aantext:=regexp_replace(btrim(coalesce(w->>'aanbetaling','')),'[€[:space:]]','','g');
  IF position(',' IN huurtext)>0 THEN huurtext:=replace(replace(huurtext,'.',''),',','.'); END IF;
  IF position(',' IN aantext)>0 THEN aantext:=replace(replace(aantext,'.',''),',','.'); END IF;
  IF huurtext !~ '^[0-9]+(\.[0-9]{1,2})?$' OR aantext !~ '^[0-9]+(\.[0-9]{1,2})?$' THEN RAISE EXCEPTION 'Ongeldige conceptprijs.'; END IF;
  prijs:=huurtext::numeric; aan:=aantext::numeric;
  IF prijs<=0 OR prijs>=100000000 OR aan<0 OR aan>prijs OR prijs IS DISTINCT FROM b.tarief_bedrag OR aan IS DISTINCT FROM b.aanbetaling_bedrag THEN
    RAISE EXCEPTION 'Conceptprijs en boekingsbedragen zijn niet identiek.';
  END IF;
  IF a.verhuurtype_sleutel NOT IN ('concert','diverse') THEN
    SELECT bedrag INTO vast_tarief FROM public.tarieven WHERE verhuurtype_sleutel=a.verhuurtype_sleutel AND prijstype::text='vast'
      AND geldig_vanaf<=a.start_datum AND (geldig_tot IS NULL OR geldig_tot>=a.start_datum) ORDER BY geldig_vanaf DESC LIMIT 1;
    IF prijs IS DISTINCT FROM vast_tarief AND NOT(d.aanvraag_versie=p_aanvraag_versie AND d.prijs_bron='tarief' AND prijs=d.huurprijs_euro) THEN
      RAISE EXCEPTION 'Voor dit verhuurtype moet de conceptprijs overeenkomen met het vaste of eerder goedgekeurde tarief.';
    END IF;
  END IF;
  lead:=coalesce(nullif(w->>'restFactuurDagenVoorVerval','')::integer,0);
  IF lead NOT BETWEEN 0 AND 90 THEN RAISE EXCEPTION 'Het concrete factuurmoment is ongeldig.'; END IF;
  FOR t IN SELECT * FROM public.betalingen WHERE boeking_id=b.id AND status<>'geannuleerd' LOOP
    IF t.soort NOT IN ('aanbetaling','restant') OR t.bedrag<=0 OR t.status<>'open' OR t.ontvangen_bedrag<>0 OR
       t.vervaldatum IS NULL OR t.vervaldatum<(now() AT TIME ZONE 'Europe/Amsterdam')::date OR t.vervaldatum>b.start_datum OR
       t.factuur_op IS NULL OR t.factuur_op>t.vervaldatum THEN RAISE EXCEPTION 'Het concrete betaalplan is onvolledig of niet actueel.'; END IF;
    IF t.soort='aanbetaling' THEN
      aantal_aan:=aantal_aan+1; eerste:=t.vervaldatum;
      IF t.bedrag<>aan OR w->>'aanbetalingVerval' IS DISTINCT FROM t.vervaldatum::text THEN RAISE EXCEPTION 'Aanbetaling wijkt af van het getoonde concept.'; END IF;
    ELSE
      aantal_rest:=aantal_rest+1;
      IF aan=0 THEN eerste:=t.vervaldatum; END IF;
      IF t.bedrag<>prijs-aan OR w->>'restVerval' IS DISTINCT FROM t.vervaldatum::text OR
        (aan>0 AND t.factuur_op IS DISTINCT FROM t.vervaldatum-lead) THEN RAISE EXCEPTION 'Resttermijn wijkt af van het getoonde concept.'; END IF;
    END IF;
    totaal:=totaal+t.bedrag;
  END LOOP;
  IF totaal<>prijs OR aantal_aan<>(CASE WHEN aan>0 THEN 1 ELSE 0 END) OR
     aantal_rest<>(CASE WHEN prijs>aan THEN 1 ELSE 0 END) OR eerste IS NULL THEN RAISE EXCEPTION 'Betaaltermijnen zijn dubbel of tellen niet op tot de contractprijs.'; END IF;
  IF coalesce(p_beleid->>'maanden','')<>'18' OR coalesce(p_beleid->>'grondslag','')<>'einde_begin' OR
     coalesce(p_beleid->>'versie','')<>'expositie-18m-einde-begin-v1' OR
     jsonb_typeof(p_beleid->'afwijking18Maanden') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Het getoonde expositiebeleid moet expliciet worden beoordeeld.';
  END IF;
  IF (p_beleid->>'afwijking18Maanden')::boolean AND a.verhuurtype_sleutel='expositie' AND
     coalesce(w->>'bijzondereAfspraken','') NOT LIKE '%uitzondering%18 maanden%' THEN
    RAISE EXCEPTION 'Het concept moet de expliciete uitzondering op de termijn van 18 maanden bevatten.';
  END IF;
  oud:=to_jsonb(d); rev:=d.revisie+1; s:=v->'snapshot'; actor:='Bestuurder '||auth.uid()::text;
  UPDATE public.verhuur_besluiten SET aanvraag_versie=p_aanvraag_versie,besluit='ja',status='toegewezen',
    huurprijs_euro=prijs,prijs_bron=CASE WHEN a.verhuurtype_sleutel IN ('concert','diverse') THEN 'bestuur' ELSE 'tarief' END,
    actor_label=actor,actor_id=auth.uid(),waarschuwingen=p_waarschuwingen,beleid=p_beleid,vastgelegd_op=now(),
    contract_profiel=jsonb_build_object('bron','concreet_concept','tijdVan',w->>'tijdVan','tijdTot',w->>'tijdTot',
      'opbouw',w->>'opbouw','afbouw',w->>'afbouw','aanbetalingEuro',aan,'aanbetalingVerval',w->>'aanbetalingVerval',
      'restVerval',w->>'restVerval','restFactuurDagenVoorVerval',lead),
    revisie=rev,contractversie_id=c.id,contract_snapshot=s,contract_snapshot_hash=v->>'snapshot_hash',
    concept_bron_versie=p_bron_versie,blokkade_reden=NULL WHERE aanvraag_id=a.id;
  -- Alleen goedkeuringsmetadata wijzigt; documenttekst/wizard blijven bevroren.
  UPDATE public.contractversies SET bestuur='akkoord',bestuur_actor=actor,bestuur_op=now(),
    bestuur_toelichting=btrim(p_reden),mandaat_aanvraag_versie=p_aanvraag_versie WHERE id=c.id;
  UPDATE public.boekingen SET status='optie',betaling_vereist=CASE WHEN aan>0 THEN 'aanbetaling' ELSE 'volledig' END,
    optie_einddatum=greatest(coalesce(optie_einddatum,eerste),eerste),bijgewerkt_op=now() WHERE id=b.id;
  UPDATE public.aanvragen SET status='goedgekeurd' WHERE id=a.id;
  UPDATE public.verhuur_beslislinks SET ingetrokken_op=coalesce(ingetrokken_op,now()) WHERE aanvraag_id=a.id AND verbruikt_op IS NULL;
  UPDATE public.contract_tekeningen SET ingetrokken_op=coalesce(ingetrokken_op,now()),vrijgegeven=false,code_hash=NULL,code_verloopt=NULL,geverifieerd_op=NULL
    WHERE boeking_id=b.id AND versie<c.versie AND ondertekend_op IS NULL;
  UPDATE public.verhuur_proces_jobs SET status='geannuleerd',last_fout='Vervangen door expliciete conceptgoedkeuring.',bijgewerkt_op=now()
    WHERE aanvraag_id=a.id AND taak IN ('contract','financieel','controleer_definitief','hervatten') AND status IN ('te_doen','wacht_op_mens');
  SELECT to_jsonb(r) INTO nieuw FROM public.verhuur_besluiten r WHERE r.aanvraag_id=a.id;
  INSERT INTO public.verhuur_contract_besluit_historie(aanvraag_id,revisie,aanvraag_versie,contractversie_id,bron_versie,
    vorig_besluit,besluit,snapshot,beoordelingsbron,actor_id,reden)
    VALUES(a.id,rev,p_aanvraag_versie,c.id,p_bron_versie,oud,nieuw,s,v->'beoordelingsbron',auth.uid(),btrim(p_reden));
  INSERT INTO public.auditlog(actor_id,actor_type,actor_naam,onderwerp_type,onderwerp_id,actie,reden,details,dedup_sleutel)
    VALUES(auth.uid(),'gebruiker',actor,'aanvraag',a.id::text,'machine_concept_goedgekeurd',btrim(p_reden),
      jsonb_build_object('revisie',rev,'contractversieId',c.id,'aanvraagVersie',p_aanvraag_versie,'snapshotHash',v->>'snapshot_hash','prijs',prijs),
      'conceptgoedkeuring:'||a.id||':'||rev);
  job:=public.verhuur_plan_stap(a.id,b.id,'contract','contract-concept:'||a.id||':'||rev||':'||c.id,
    jsonb_build_object('contractversie_id',c.id,'revisie',rev));
  RETURN jsonb_build_object('ok',true,'boekingId',b.id,'revisie',rev,'jobId',job,'melding','Het getoonde concept is goedgekeurd. Het bestaande dossier vervolgt automatisch.');
END;
$$;

REVOKE ALL ON FUNCTION public.verhuur_contract_snapshot(bigint),public.verhuur_concept_blokkade(bigint,bigint),
  public.verhuur_concept_beoordelingsbron(bigint,bigint),public.verhuur_keur_concept_goed(bigint,bigint,text,text,text,jsonb,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.verhuur_concept_beoordelingsbron(bigint,bigint),
  public.verhuur_keur_concept_goed(bigint,bigint,text,text,text,jsonb,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.verhuur_contract_mandaat_geldig(bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verhuur_contract_mandaat_geldig(bigint,bigint) TO service_role;
