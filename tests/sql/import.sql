-- Tweede import van dezelfde Sanity-batch mag geen extra rijen maken.

do $$
declare
  batch jsonb := $json$
  {
    "relaties": [{"legacy_id":"persoon-1","naam":"Henk","email":"henk@example.test","rollen":["gastheer"]}],
    "aanvragen": [{"legacy_id":"aan-1","status":"nieuw","naam":"Jansen","email":"jansen@example.test","verhuurtype_sleutel":"expositie","start_datum":"2026-11-07","eind_datum":"2026-11-08","relatie_legacy_id":"rel-jansen"}],
    "boekingen": [{"legacy_id":"act-1","nummer":"S-TEST-1","status":"migratie_vastgelegd","verhuurtype_sleutel":"expositie","interne_titel":"Second Nature","start_datum":"2026-10-03","eind_datum":"2026-10-04","relatie_legacy_id":"rel-sn","huurder_naam_snapshot":"Collectief","huurder_email_snapshot":"sn@example.test"}],
    "publiek": [{"boeking_legacy_id":"act-1","titel":"Second Nature","slug":"second-nature-import","omschrijving":"Groepsexpositie.","start_datum":"2026-10-03","eind_datum":"2026-10-04","publicatie_trigger":"zodra_content_compleet","gepubliceerd":true,"inhoud_status":"goedgekeurd"}],
    "intern": [{"legacy_id":"blok-1","titel":"Kerst","start_datum":"2026-12-25","eind_datum":"2026-12-26","blokkeert":true}],
    "vrienden": [{"legacy_id":"v-1","naam":"Anna","email":"anna-import@example.test","actief":true,"frequentie":"wekelijks","uitschrijf_token":"import-v-1"}],
    "nieuwsbrieven": [{"legacy_id":"nb-1","week_maandag":"2026-09-07","kort_nieuws":"Restauratie","verstuurd":true}]
  }
  $json$;
  extra jsonb;
  eerste jsonb;
  tweede jsonb;
begin
  extra := '{"relaties":[
    {"legacy_id":"rel-jansen","naam":"Jansen","email":"jansen@example.test","rollen":["aanvrager"]},
    {"legacy_id":"rel-sn","naam":"Collectief","email":"sn@example.test","rollen":["huurder"]}
  ]}'::jsonb;
  batch := jsonb_set(batch, '{relaties}', (batch->'relaties') || (extra->'relaties'));

  eerste := public.importeer_sanity_batch(batch);
  tweede := public.importeer_sanity_batch(batch);
  if (eerste->>'boekingen')::int <> 1 then
    raise exception 'verwacht 1 boeking, kreeg %', eerste;
  end if;
  if (tweede->>'boekingen')::int <> 1 or (tweede->>'aanvragen')::int <> 1 then
    raise exception 'tweede run dupliceert: %', tweede;
  end if;
  if (tweede->>'bijgewerkt')::int < 1 then
    raise exception 'tweede run hoort bij te werken: %', tweede;
  end if;
  if (select count(*) from public.publieke_activiteiten where slug = 'second-nature-import' and gepubliceerd and inhoud_status = 'goedgekeurd') <> 1 then
    raise exception 'publieke activiteit niet online';
  end if;
  if jsonb_array_length(tweede->'conflicten') <> 0 then
    raise exception 'onverwacht conflict %', tweede->'conflicten';
  end if;
end $$;

do $$
begin
  begin
    set local role anon;
    perform public.importeer_sanity_batch('{}'::jsonb);
    raise exception 'anon mag niet importeren';
  exception
    when insufficient_privilege then
      null;
  end;
end $$;
