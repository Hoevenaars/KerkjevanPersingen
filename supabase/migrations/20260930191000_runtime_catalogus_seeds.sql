-- Canonical runtime-catalogus uit de repository-seeds.
-- Idempotent op de natuurlijke sleutel. Geen nieuwe inhoud.

insert into public.tarieven (verhuurtype_sleutel, prijstype, bedrag, geldig_vanaf, geldig_tot, toelichting) values
  ('expositie', 'vast', 490, '2020-01-01', '2028-12-31', null),
  ('expositie', 'vast', 525, '2029-01-01', null, null),
  ('bruiloft', 'vast', 550, '2020-01-01', '2028-12-31', null),
  ('bruiloft', 'vast', 590, '2029-01-01', null, null),
  ('concert', 'op_aanvraag', null, '2020-01-01', null, 'Op aanvraag'),
  ('diverse', 'vanaf', 250, '2020-01-01', '2028-12-31', 'vanaf'),
  ('diverse', 'vanaf', 275, '2029-01-01', null, 'vanaf')
on conflict (verhuurtype_sleutel, geldig_vanaf) do update set
  prijstype = excluded.prijstype,
  bedrag = excluded.bedrag,
  geldig_tot = excluded.geldig_tot,
  toelichting = excluded.toelichting;

insert into public.instellingen (sleutel, groep, waarde, toelichting) values
  ('optietermijn_dagen', 'verhuur', '14', 'Standaard geldigheid van een nieuwe optie. Bestaande opties wijzigen niet mee.'),
  ('betaaltermijn_dagen', 'finance', '14', 'Standaard betaaltermijn.'),
  ('aanbetaling_standaard', 'finance', '100', 'Standaard aanbetaling in euro’s, tenzij per type anders.'),
  ('aanbetaling_verplicht_voor_definitief', 'finance', 'true', 'Automatisch definitief na bevestigde aanbetaling.'),
  ('expositie_openingstijden', 'verhuur', '{"van":"11:00","tot":"17:00"}', 'Openingstijden exposities, niet meer hardcoded in mails.'),
  ('tijdzone', 'algemeen', '"Europe/Amsterdam"', 'Alle planning in Nederlandse tijd.'),
  ('max_document_bytes', 'algemeen', '20971520', 'Maximale uploadgrootte documenten (20 MB).'),
  ('beoordeling_deadline_dagen', 'verhuur', '7', 'Technische standaard tot het bestuur een andere beoordelingstermijn vastlegt.'),
  ('toegangstoken_dagen', 'algemeen', '21', 'Geldigheid van een magische klantlink.')
on conflict (sleutel) do update set
  groep = excluded.groep,
  waarde = excluded.waarde,
  toelichting = excluded.toelichting;

insert into public.bronnen (datatype, schrijvende_bron, toelichting) values
  ('aanvragen', 'sanity', 'Websiteformulier en Sanity Studio'),
  ('boekingen', 'sanity', 'Activiteit-document in Sanity'),
  ('publieke_activiteiten', 'sanity', 'Zichtbaarheid publiek op activiteit'),
  ('interne_activiteiten', 'sanity', 'Soort blokkade'),
  ('relaties', 'sanity', 'Persoon-document'),
  ('vrienden', 'sanity', 'Vriend-document'),
  ('nieuwsbrieven', 'sanity', 'Nieuwsbrief-document + cron'),
  ('instellingen', 'sanity', 'Instellingen-document'),
  ('templates', 'sanity', 'Mailteksten in instellingen')
on conflict (datatype) do update set
  schrijvende_bron = excluded.schrijvende_bron,
  toelichting = excluded.toelichting;

insert into public.communicatie_templates
  (sleutel, naam, trigger_soort, termijn_waarde, termijn_eenheid, ontvanger_rol, verzendwijze)
values
  ('afwijzing', 'Aanvraag afgewezen', 'handmatig', null, null, 'huurder', 'handmatig'),
  ('contract_begeleiding', 'Contract meesturen', 'handmatig', null, null, 'huurder', 'handmatig'),
  ('volgende_stappen', 'Volgende stappen na definitief', 'na_definitief', 0, 'dagen', 'huurder', 'concept'),
  ('aanbetaling_check_paul', 'Aanbetaling-check', 'na_optie', 14, 'dagen', 'finance', 'concept'),
  ('content_verzoek', 'Tekst/foto aanleveren', 'voor_activiteit', 4, 'maanden', 'huurder', 'concept'),
  ('content_ter_beoordeling', 'Content ter beoordeling', 'handmatig', null, null, 'bestuur', 'handmatig'),
  ('praktisch_4w', 'Praktische informatie', 'voor_activiteit', 4, 'weken', 'huurder', 'concept'),
  ('praktisch_gastheer', 'Praktische informatie gastheer', 'voor_activiteit', 4, 'weken', 'gastheer', 'concept'),
  ('herinnering_1d', 'Herinnering 1 dag', 'voor_activiteit', 1, 'dagen', 'huurder', 'concept'),
  ('herinnering_gastheer', 'Herinnering 1 dag gastheer', 'voor_activiteit', 1, 'dagen', 'gastheer', 'concept'),
  ('review_verzoek', 'Google-review na afloop', 'na_activiteit', 1, 'dagen', 'huurder', 'concept'),
  ('reservelijst', 'Vrijgekomen weekend', 'handmatig', null, null, 'reservelijst', 'handmatig'),
  ('optie_verlopen_contractbeheerder', 'Optie verlopen', 'optie_verlopen', 0, 'dagen', 'contractbeheerder', 'automatisch'),
  ('booking_request_received', 'Aanvraag ontvangen', 'nieuwe_aanvraag', null, null, 'huurder', 'automatisch'),
  ('internal_booking_review_required', 'Nieuwe aanvraag intern', 'aanvraag_compleet', null, null, 'bestuur', 'automatisch'),
  ('booking_more_information_requested', 'Meer informatie nodig', 'besluit_meer_info', null, null, 'huurder', 'concept'),
  ('internal_booking_information_received', 'Aanvulling ontvangen', 'aanvulling_ontvangen', null, null, 'bestuur', 'automatisch'),
  ('booking_request_rejected', 'Aanvraag afgewezen', 'besluit_afwijzing', null, null, 'huurder', 'concept'),
  ('booking_approved_payment_required', 'Aanvraag goedgekeurd', 'besluit_goedkeuring', null, null, 'huurder', 'concept'),
  ('booking_payment_reminder', 'Betalingsherinnering', 'na_optie', 7, 'dagen', 'huurder', 'automatisch'),
  ('booking_payment_final_reminder', 'Laatste betalingsherinnering', 'voor_betaaldeadline', 2, 'dagen', 'huurder', 'automatisch'),
  ('internal_payment_overdue', 'Betaling te laat', 'betaaldeadline', 0, 'dagen', 'finance', 'automatisch'),
  ('booking_confirmed', 'Reservering definitief', 'na_definitief', 0, 'dagen', 'huurder', 'automatisch'),
  ('booking_content_request', 'Informatie aanleveren', 'voor_activiteit', 12, 'weken', 'huurder', 'automatisch'),
  ('booking_content_reminder', 'Reminder informatie', 'voor_activiteit', 10, 'weken', 'huurder', 'automatisch'),
  ('internal_content_overdue', 'Content ontbreekt', 'voor_activiteit', 8, 'weken', 'bestuur', 'automatisch'),
  ('internal_content_review_required', 'Content beoordelen', 'handmatig', null, null, 'bestuur', 'automatisch'),
  ('booking_content_changes_requested', 'Aanpassing gevraagd', 'handmatig', null, null, 'huurder', 'concept'),
  ('booking_content_approved', 'Content akkoord', 'handmatig', null, null, 'huurder', 'concept'),
  ('internal_host_required', 'Gastheer ontbreekt', 'voor_activiteit', 4, 'weken', 'planning', 'automatisch'),
  ('booking_practical_information', 'Praktische informatie', 'voor_activiteit', 4, 'weken', 'huurder', 'automatisch'),
  ('host_practical_information', 'Praktische informatie gastheer', 'voor_activiteit', 4, 'weken', 'gastheer', 'automatisch'),
  ('booking_final_instructions', 'Laatste daginformatie', 'voor_activiteit', 2, 'dagen', 'huurder', 'automatisch'),
  ('host_final_instructions', 'Daginformatie gastheer', 'voor_activiteit', 1, 'dagen', 'gastheer', 'automatisch'),
  ('booking_review_request', 'Review na afloop', 'na_activiteit', 1, 'dagen', 'huurder', 'automatisch'),
  ('host_post_event_check', 'Afloopcheck gastheer', 'na_activiteit', 1, 'dagen', 'gastheer', 'automatisch')
on conflict (sleutel) do update set
  naam = excluded.naam,
  trigger_soort = excluded.trigger_soort,
  termijn_waarde = excluded.termijn_waarde,
  termijn_eenheid = excluded.termijn_eenheid,
  ontvanger_rol = excluded.ontvanger_rol,
  verzendwijze = excluded.verzendwijze;

-- communicatie_template_versies heeft in de repository geen seed.
-- pas_continuiteit_mutaties resolvet template_sleutel op communicatie_templates.
