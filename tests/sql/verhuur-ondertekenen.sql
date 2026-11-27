-- Alleen via run-verhuur-lokaal.mjs op een volledig gemigreerde, lokale testdatabase.
-- Elke fixture gebruikt example.test en wordt aan het eind teruggedraaid.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='5s';
SET LOCAL request.jwt.claims='{"role":"service_role"}';

-- De lokale bootstrap heeft geen Auth-server. Alleen binnen deze teruggerolde
-- testtransactie lezen de Auth-functies de expliciet gezette testclaims.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','')::uuid;
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role';
$$;

CREATE FUNCTION pg_temp.eis(p_voorwaarde boolean,p_tekst text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_voorwaarde IS NOT TRUE THEN RAISE EXCEPTION 'TEST: %',p_tekst; END IF; END;
$$;
CREATE FUNCTION pg_temp.moet_falen(p_sql text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE p_sql; EXCEPTION WHEN OTHERS THEN RETURN; END;
  RAISE EXCEPTION 'TEST: verboden bewerking slaagde: %',p_sql;
END;
$$;

SELECT pg_temp.eis(NOT has_function_privilege('anon','public.leg_contract_ondertekening_vast(text,text,timestamptz,text,text,text,integer,jsonb)','execute'),
  'anonieme bezoekers mogen geen teken-RPC aanroepen');
SELECT pg_temp.eis(NOT has_function_privilege('authenticated','public.leg_contract_ondertekening_vast(text,text,timestamptz,text,text,text,integer,jsonb)','execute'),
  'de publieke tekenroute moet de serververificatie doorlopen');
SELECT pg_temp.eis(has_function_privilege('service_role','public.leg_contract_ondertekening_vast(text,text,timestamptz,text,text,text,integer,jsonb)','execute'),
  'server heeft recht op onderteken-RPC');

CREATE TEMP TABLE teken_fixture (nr integer PRIMARY KEY,aanvraag bigint,boeking bigint,contract bigint,token text,pdf_hash text,pad text);
DO $$
DECLARE i integer; a bigint; b bigint; c bigint; h text;
BEGIN
  FOR i IN 1..3 LOOP
    INSERT INTO public.aanvragen(status,naam,email,verhuurtype_sleutel,start_datum,eind_datum)
      VALUES('goedgekeurd','Lokale tekentest '||i,'tekentest-'||i||'@example.test','expositie',
        make_date(2099,i,10),make_date(2099,i,11)) RETURNING id INTO a;
    INSERT INTO public.boekingen(status,aanvraag_id,interne_titel,verhuurtype_sleutel,start_datum,eind_datum,
      huurder_naam_snapshot,huurder_email_snapshot,tarief_bedrag,aanbetaling_bedrag)
      VALUES('optie',a,'Lokale tekentest '||i,'expositie',make_date(2099,i,10),make_date(2099,i,11),
        'Test Exposant','tekentest-'||i||'@example.test',490,100) RETURNING id INTO b;
    UPDATE public.aanvragen SET boeking_id=b WHERE id=a;
    IF i<3 THEN
      INSERT INTO public.verhuur_besluiten(aanvraag_id,aanvraag_versie,besluit,huurprijs_euro,prijs_bron,actor_label,boeking_id,status)
        VALUES(a,public.verhuur_aanvraag_versie(a),'ja',490,'bestuur','Lokale test',b,'toegewezen');
      INSERT INTO public.verhuur_beslislinks(aanvraag_id,aanvraag_versie,ontvanger,token_hash,geldig_tot)
        VALUES(a,public.verhuur_aanvraag_versie(a),'bestuur@example.test',repeat((i+3)::text,64),now()+interval '1 day');
    END IF;
    INSERT INTO public.contractversies(boeking_id,versie,contractnummer,opgesteld_op,tekst,voorwaarden_tekst,huisregels_tekst,
      plattegrond_tekst,vingerafdruk,bestuur,ondertekening,mandaat_aanvraag_versie)
      VALUES(b,1,'LOKAAL-TEKEN-'||b,current_date,'Vast contract voor lokale databasecontrole.',
        'Vaste voorwaarden.','Vaste huisregels.','','test-vingerafdruk-'||b,'akkoord','open',
        CASE WHEN i<3 THEN public.verhuur_aanvraag_versie(a) ELSE NULL END) RETURNING id INTO c;
    INSERT INTO public.contract_tekeningen(boeking_id,versie,token_hash,verloopt_op,email,vrijgegeven,
      code_hash,code_verloopt,geverifieerd_op)
      VALUES(b,1,repeat(i::text,64),now()+interval '1 day','tekentest-'||i||'@example.test',true,
        repeat('f',64),now()+interval '15 minutes',now());
    INSERT INTO public.toegangstokens(boeking_id,aanvraag_id,doel,token_hash,verloopt_op)
      VALUES(b,a,'content','lokale-content-'||b,now()+interval '1 day');
    h:=repeat('a',64);
    INSERT INTO teken_fixture VALUES(i,a,b,c,repeat(i::text,64),h,'contracten/'||b||'/getekend-v1-'||h||'.pdf');
  END LOOP;
END;
$$;

-- Een documentinsert-fout moet handtekening, contractstatus én vervolgjobs terugdraaien.
CREATE FUNCTION pg_temp.faal_documentinsert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('kvp_test.faal_document',true)='true' AND NEW.type='getekend_contract' THEN
    RAISE EXCEPTION 'Gesimuleerde lokale documentfout';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lokale_teken_test_documentfout BEFORE INSERT ON public.documenten FOR EACH ROW EXECUTE FUNCTION pg_temp.faal_documentinsert();
SET LOCAL kvp_test.faal_document='true';
SELECT pg_temp.moet_falen(format('SELECT public.leg_contract_ondertekening_vast(%L,%L,now(),%L,%L,%L,1000,%L::jsonb)',
  token,'Eerste Testpersoon',repeat('b',64),pdf_hash,pad,'{}')) FROM teken_fixture WHERE nr=1;
SELECT pg_temp.eis((SELECT ondertekend_op IS NULL FROM public.contract_tekeningen WHERE token_hash=f.token),
  'databasefout laat geen handtekening achter') FROM teken_fixture f WHERE nr=1;
SELECT pg_temp.eis((SELECT ondertekening='open' FROM public.contractversies WHERE id=f.contract),
  'databasefout laat geen ontvangen contractstatus achter') FROM teken_fixture f WHERE nr=1;
SELECT pg_temp.eis(NOT EXISTS(SELECT 1 FROM public.verhuur_proces_jobs WHERE boeking_id=f.boeking AND taak IN ('ondertekenbevestiging','controleer_definitief')),
  'databasefout maakt geen vervolgjob') FROM teken_fixture f WHERE nr=1;
SET LOCAL kvp_test.faal_document='false';

SELECT pg_temp.eis((public.leg_contract_ondertekening_vast(token,'Eerste Testpersoon',now(),repeat('b',64),pdf_hash,pad,1000,'{}')->>'status')='nieuw',
  'eerste ondertekening is nieuw') FROM teken_fixture WHERE nr=1;
SELECT pg_temp.eis((public.leg_contract_ondertekening_vast(token,'Tweede Testpersoon',now(),repeat('c',64),repeat('d',64),
  'ander-pad.pdf',1000,'{}')->>'status')='al','herhaling schrijft niets over') FROM teken_fixture WHERE nr=1;
SELECT pg_temp.eis((SELECT naam='Eerste Testpersoon' AND pdf_pad=f.pad AND document_hash=repeat('b',64)
  FROM public.contract_tekeningen WHERE token_hash=f.token),'eerste bewijs blijft canoniek') FROM teken_fixture f WHERE nr=1;
SELECT pg_temp.eis((SELECT count(*)=1 FROM public.documenten WHERE boeking_id=f.boeking AND type='getekend_contract'),
  'precies één bewijsdocument') FROM teken_fixture f WHERE nr=1;
SELECT pg_temp.eis((SELECT count(*)=2 FROM public.verhuur_proces_jobs WHERE boeking_id=f.boeking AND taak IN ('ondertekenbevestiging','controleer_definitief')),
  'precies één ontvangstmailjob en één checklistjob') FROM teken_fixture f WHERE nr=1;
SELECT pg_temp.moet_falen(format('UPDATE public.contract_tekeningen SET naam=%L WHERE token_hash=%L','Gewijzigde naam',token))
  FROM teken_fixture WHERE nr=1;
SELECT pg_temp.moet_falen(format('SELECT public.bevestig_contract_ontvangstmail(%s,%s,NULL,%L)',
  boeking,contract,'bewijs-zonder-ontvanger')) FROM teken_fixture WHERE nr=1;
SELECT pg_temp.eis((SELECT bevestiging_id IS NULL AND bestuur_bevestiging_id IS NULL
  FROM public.contract_tekeningen WHERE token_hash=f.token),'ontbrekende ontvanger mag geen ontvangstbewijs schrijven')
  FROM teken_fixture f WHERE nr=1;

-- De twee ontvangers hebben eigen claims. Een crashvenster blijft gesloten,
-- ook als de overkoepelende procesjob opnieuw wordt geclaimd.
UPDATE public.verhuur_proces_jobs SET status='bezig',claim_token=gen_random_uuid(),geclaimd_op=now()
  WHERE sleutel=(SELECT 'ondertekend:'||boeking||':'||contract FROM teken_fixture WHERE nr=1);
SELECT pg_temp.eis(public.claim_contract_ontvangstmail(boeking,contract,'huurder')->>'status'='geclaimd',
  'eerste huurderclaim is exclusief') FROM teken_fixture WHERE nr=1;
SELECT pg_temp.eis(public.claim_contract_ontvangstmail(boeking,contract,'huurder')->>'status'='bezig',
  'tweede uitvoerder mag de huurder niet mailen') FROM teken_fixture WHERE nr=1;
SELECT pg_temp.eis(public.claim_contract_ontvangstmail(boeking,contract,'bestuur')->>'status'='geclaimd',
  'bestuursmelding heeft een afzonderlijke claim') FROM teken_fixture WHERE nr=1;
CREATE TEMP TABLE oude_tekenclaims AS SELECT c.* FROM public.contract_ontvangstmail_claims c JOIN teken_fixture f
  ON f.contract=c.contractversie_id WHERE f.nr=1;
SELECT public.registreer_contract_ontvangstmail_resultaat(boeking_id,contractversie_id,richting,claim_token,'onzeker',NULL,'Gesimuleerde onderbreking')
  FROM oude_tekenclaims;
UPDATE public.verhuur_proces_jobs SET status='onzeker'
  WHERE sleutel=(SELECT 'ondertekend:'||boeking||':'||contract FROM teken_fixture WHERE nr=1);
SELECT pg_temp.moet_falen(format('SELECT public.herstel_contract_ontvangstmail(%s,%s,%L,%L,%L,%L)',
  boeking,contract,'huurder','geaccepteerd','test-huurder-1','Providerlog is gecontroleerd op de juiste ontvanger en het tijdstip.'))
  FROM teken_fixture WHERE nr=1;
SELECT pg_temp.eis(NOT has_function_privilege('service_role','public.herstel_contract_ontvangstmail(bigint,bigint,text,text,text,text)','execute'),
  'herstel vereist een menselijke beheersessie');

INSERT INTO auth.users(id,email,raw_user_meta_data)
  VALUES('f820faac-2222-4ccc-8ddd-01302a7b4f56','recovery-bestuur@example.test','{"naam":"Lokale hersteltest"}') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.profielen(id,email,naam,is_super_admin,status)
  VALUES('f820faac-2222-4ccc-8ddd-01302a7b4f56','recovery-bestuur@example.test','Lokale hersteltest',false,'active')
  ON CONFLICT(id) DO UPDATE SET status='active';
INSERT INTO public.gebruikersrechten(profiel_id,module_sleutel,niveau) VALUES
  ('f820faac-2222-4ccc-8ddd-01302a7b4f56','instellingen','schrijven'),
  ('f820faac-2222-4ccc-8ddd-01302a7b4f56','aanvragen','schrijven')
  ON CONFLICT(profiel_id,module_sleutel) DO UPDATE SET niveau='schrijven';
SET LOCAL request.jwt.claims='{"role":"authenticated","sub":"f820faac-2222-4ccc-8ddd-01302a7b4f56"}';
UPDATE public.verhuur_proces_jobs SET status='bezig',geclaimd_op=now()
  WHERE sleutel=(SELECT 'ondertekend:'||boeking||':'||contract FROM teken_fixture WHERE nr=1);
SELECT pg_temp.moet_falen(format('SELECT public.herstel_contract_ontvangstmail(%s,%s,%L,%L,%L,%L)',
  boeking,contract,'huurder','geaccepteerd','test-huurder-1','Providerlog is gecontroleerd op de juiste ontvanger en het tijdstip.'))
  FROM teken_fixture WHERE nr=1;
UPDATE public.verhuur_proces_jobs SET status='onzeker'
  WHERE sleutel=(SELECT 'ondertekend:'||boeking||':'||contract FROM teken_fixture WHERE nr=1);
SELECT pg_temp.eis(public.herstel_contract_ontvangstmail(boeking,contract,'huurder','geaccepteerd','test-huurder-1',
  'Providerlog is gecontroleerd op de juiste ontvanger en het tijdstip.')->>'status'='onzeker',
  'één herstelde ontvanger laat de andere onzeker') FROM teken_fixture WHERE nr=1;
SELECT pg_temp.eis((SELECT bevestiging_id='test-huurder-1' AND bestuur_bevestiging_id IS NULL
  FROM public.contract_tekeningen WHERE token_hash=f.token),'herstel raakt uitsluitend de huurder') FROM teken_fixture f WHERE nr=1;
SELECT pg_temp.moet_falen(format('SELECT public.herstel_contract_ontvangstmail(%s,%s,%L,%L,NULL,%L)',
  boeking,contract,'huurder','niet_verzonden','Deze onjuiste correctie moet bestaande ontvangst bewijzen intact laten.'))
  FROM teken_fixture WHERE nr=1;
SELECT pg_temp.eis((public.herstel_contract_ontvangstmail(boeking,contract,'bestuur','niet_verzonden',NULL,
  'Providerlog toont voor de interne ontvanger aantoonbaar geen geaccepteerd bericht.')->>'hervat')::boolean,
  'na oplossing van beide onzekere richtingen mag de overgebleven mail hervatten') FROM teken_fixture WHERE nr=1;
SELECT pg_temp.moet_falen(format('SELECT public.registreer_contract_ontvangstmail_resultaat(%s,%s,%L,%L::uuid,%L,%L,%L)',
  boeking_id,contractversie_id,richting,claim_token,'verzonden','verouderde-provider-response','Een late worker mag het herstel niet overschrijven.'))
  FROM oude_tekenclaims WHERE richting='bestuur';
SET LOCAL request.jwt.claims='{"role":"service_role"}';
UPDATE public.verhuur_proces_jobs SET status='bezig',claim_token=gen_random_uuid(),geclaimd_op=now()
  WHERE sleutel=(SELECT 'ondertekend:'||boeking||':'||contract FROM teken_fixture WHERE nr=1);
SELECT pg_temp.eis(public.claim_contract_ontvangstmail(boeking,contract,'bestuur')->>'status'='geclaimd',
  'alleen de aantoonbaar niet-verzonden interne mail krijgt een nieuwe claim') FROM teken_fixture WHERE nr=1;
SELECT public.registreer_contract_ontvangstmail_resultaat(boeking_id,contractversie_id,richting,claim_token,'verzonden','test-bestuur-2','Provideracceptatie in lokale fixture')
  FROM public.contract_ontvangstmail_claims WHERE contractversie_id=(SELECT contract FROM teken_fixture WHERE nr=1) AND richting='bestuur';
SELECT pg_temp.eis((SELECT bevestiging_id='test-huurder-1' AND bestuur_bevestiging_id='test-bestuur-2'
  FROM public.contract_tekeningen WHERE token_hash=f.token),'beide providerbewijzen zijn afzonderlijk bewaard') FROM teken_fixture f WHERE nr=1;

-- Een niet-machineboeking mag gewoon tekenen, zonder historische inhaaljobs.
SELECT pg_temp.eis((public.leg_contract_ondertekening_vast(token,'Historische Testpersoon',now(),repeat('b',64),pdf_hash,pad,1000,'{}')->>'status')='nieuw',
  'handmatige boeking mag tekenen') FROM teken_fixture WHERE nr=3;
SELECT pg_temp.eis(NOT EXISTS(SELECT 1 FROM public.verhuur_proces_jobs WHERE boeking_id=f.boeking),
  'geen historische inhaaljobs') FROM teken_fixture f WHERE nr=3;

-- Nieuwe contractversie maakt het oude, nog niet getekende token onbruikbaar.
INSERT INTO public.contractversies(boeking_id,versie,contractnummer,opgesteld_op,tekst,voorwaarden_tekst,huisregels_tekst,
  plattegrond_tekst,vingerafdruk,bestuur,ondertekening)
  SELECT boeking,2,'LOKAAL-TEKEN-'||boeking||'-2',current_date,'Nieuwe tekst','Nieuwe voorwaarden','Nieuwe huisregels','',
    'nieuwe-vingerafdruk','akkoord','open' FROM teken_fixture WHERE nr=2;
SELECT pg_temp.moet_falen(format('SELECT public.werk_contract_tekening_bij(%L,%L,%L,now()+interval ''15 minutes'',0)',token,'code',repeat('e',64)))
  FROM teken_fixture WHERE nr=2;
SELECT pg_temp.moet_falen(format('SELECT public.leg_contract_ondertekening_vast(%L,%L,now(),%L,%L,%L,1000,%L::jsonb)',
  token,'Verouderde Testpersoon',repeat('b',64),pdf_hash,pad,'{}')) FROM teken_fixture WHERE nr=2;

-- Annulering stopt de lopende keten en bewaart het bestaande bewijs.
UPDATE public.boekingen SET status='geannuleerd' WHERE id IN (SELECT boeking FROM teken_fixture WHERE nr<=2);
SELECT pg_temp.eis((SELECT status='geannuleerd' FROM public.verhuur_besluiten WHERE aanvraag_id=f.aanvraag),
  'besluit is geannuleerd') FROM teken_fixture f WHERE nr<=2;
SELECT pg_temp.eis(NOT EXISTS(SELECT 1 FROM public.verhuur_proces_jobs WHERE boeking_id=f.boeking AND status NOT IN ('geannuleerd','afgerond')),
  'geen actieve machinejobs na annulering') FROM teken_fixture f WHERE nr<=2;
SELECT pg_temp.eis(NOT EXISTS(SELECT 1 FROM public.verhuur_beslislinks WHERE aanvraag_id=f.aanvraag AND ingetrokken_op IS NULL),
  'bestuurslinks ingetrokken') FROM teken_fixture f WHERE nr<=2;
SELECT pg_temp.eis(NOT EXISTS(SELECT 1 FROM public.toegangstokens WHERE boeking_id=f.boeking AND ingetrokken_op IS NULL),
  'aanleverlinks ingetrokken') FROM teken_fixture f WHERE nr<=2;
SELECT pg_temp.eis((SELECT ingetrokken_op IS NOT NULL AND NOT vrijgegeven FROM public.contract_tekeningen WHERE token_hash=f.token),
  'tekenlink ingetrokken') FROM teken_fixture f WHERE nr<=2;
SELECT pg_temp.eis((SELECT naam='Eerste Testpersoon' AND pdf_pad=f.pad FROM public.contract_tekeningen WHERE token_hash=f.token),
  'annulering bewaart ondertekenbewijs') FROM teken_fixture f WHERE nr=1;
SELECT pg_temp.eis(public.lees_contract_ondertekening_voor_bevestiging(boeking,contract) IS NULL,
  'geannuleerde boeking kan geen ontvangstmail meer beginnen') FROM teken_fixture WHERE nr=1;
SELECT pg_temp.moet_falen(format('SELECT public.leg_contract_ondertekening_vast(%L,%L,now(),%L,%L,%L,1000,%L::jsonb)',
  token,'Na Annulering',repeat('b',64),pdf_hash,pad,'{}')) FROM teken_fixture WHERE nr=1;
SELECT pg_temp.eis(public.verhuur_plan_stap(aanvraag,boeking,'controleer_definitief','na-annulering:'||boeking) IS NULL,
  'geen nieuwe procesjob voor geannuleerde boeking') FROM teken_fixture WHERE nr=1;
SELECT pg_temp.moet_falen(format('INSERT INTO public.toegangstokens(boeking_id,doel,token_hash,verloopt_op) VALUES(%s,%L,%L,now()+interval ''1 day'')',
  boeking,'content','nieuwe-link-na-annulering')) FROM teken_fixture WHERE nr=1;

ROLLBACK;
\echo 'ondertekenen-annuleren-sql-ok (alle fixtures teruggedraaid)'
