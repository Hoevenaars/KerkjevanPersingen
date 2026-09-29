select public.pas_continuiteit_mutaties($json$[
  {"soort":"insert_relatie","ref":"rel","velden":{"naam":"Marieke","email":"klant@example.nl"}},
  {"soort":"insert_aanvraag","ref":"aan","relatie_ref":"rel","velden":{"status":"wacht_op_aanvrager","naam":"Marieke","email":"klant@example.nl","verhuurtype_sleutel":"expositie","start_datum":"2027-06-12","eind_datum":"2027-06-13"}},
  {"soort":"insert_boeking","ref":"boek","aanvraag_ref":"aan","relatie_ref":"rel","velden":{"status":"optie","verhuurtype_sleutel":"expositie","interne_titel":"Marieke","start_datum":"2027-06-12","eind_datum":"2027-06-13","huurder_naam_snapshot":"Marieke","huurder_email_snapshot":"klant@example.nl","aanbetaling_bedrag":100,"optie_aangemaakt_op":"2027-01-01","optie_einddatum":"2027-01-15"}},
  {"soort":"upsert_betaling","boeking_ref":"boek","velden":{"soort":"aanbetaling","bedrag":100,"status":"ontvangen"}},
  {"soort":"upsert_betaling","boeking_ref":"boek","velden":{"soort":"aanbetaling","bedrag":100,"status":"ontvangen"}},
  {"soort":"upsert_job","boeking_ref":"boek","velden":{"template_sleutel":"booking_content_request","dedup_sleutel":"job:test:booking_content_request","status":"gepland","modus":"automatisch","ontvanger_email":"klant@example.nl","onderwerp":"Content"}},
  {"soort":"upsert_job","boeking_ref":"boek","velden":{"template_sleutel":"booking_content_request","dedup_sleutel":"job:test:booking_content_request","status":"verzonden","modus":"automatisch","ontvanger_email":"klant@example.nl","onderwerp":"Content","pogingen":1}},
  {"soort":"insert_audit","velden":{"onderwerp_type":"boeking","onderwerp_id":"1","actie":"betaling_ontvangen","dedup_sleutel":"betaling:1:aanbetaling","actor_type":"gebruiker"}},
  {"soort":"insert_audit","velden":{"onderwerp_type":"boeking","onderwerp_id":"1","actie":"betaling_ontvangen","dedup_sleutel":"betaling:1:aanbetaling","actor_type":"gebruiker"}}
]$json$::jsonb);

do $$
declare
  n int;
begin
  select count(*) into n from public.betalingen;
  if n <> 1 then raise exception 'dubbele aanbetaling: %', n; end if;
  select count(*) into n from public.communicatie_jobs where status = 'verzonden';
  if n <> 1 then raise exception 'dubbele job: %', n; end if;
  select count(*) into n from public.auditlog where dedup_sleutel = 'betaling:1:aanbetaling';
  if n <> 1 then raise exception 'dubbele audit: %', n; end if;
  select count(*) into n from public.aanvragen where status = 'wacht_op_aanvrager';
  if n <> 1 then raise exception 'status ontbreekt'; end if;
end $$;

do $$
begin
  begin
    set local role anon;
    perform 1 from public.workflow_taken;
    raise exception 'anon mag workflow_taken niet lezen';
  exception
    when insufficient_privilege then null;
  end;
end $$;
