-- Canonical template bodies. Geen nieuwe teksten.
insert into public.communicatie_templates (sleutel, naam, actief, trigger_soort, termijn_waarde, termijn_eenheid, ontvanger_rol, verzendwijze, huidige_versie)
values ('booking_cancelled', 'Annulering', true, 'boeking_geannuleerd', null, null, 'huurder', 'automatisch'::public.verzendwijze, 1)
on conflict (sleutel) do nothing;
insert into public.communicatie_templates (sleutel, naam, actief, trigger_soort, termijn_waarde, termijn_eenheid, ontvanger_rol, verzendwijze, huidige_versie)
values ('host_availability_request', 'Beschikbaarheid gastheer', true, 'handmatig_gestart', null, null, 'gastheer', 'handmatig'::public.verzendwijze, 1)
on conflict (sleutel) do nothing;
insert into public.communicatie_templates (sleutel, naam, actief, trigger_soort, termijn_waarde, termijn_eenheid, ontvanger_rol, verzendwijze, huidige_versie)
values ('host_assignment_confirmed', 'Gastheer bevestigd', true, 'gastheer_accepteert', null, null, 'gastheer', 'automatisch'::public.verzendwijze, 1)
on conflict (sleutel) do nothing;
insert into public.communicatie_templates (sleutel, naam, actief, trigger_soort, termijn_waarde, termijn_eenheid, ontvanger_rol, verzendwijze, huidige_versie)
values ('exhibition_weekend_available', 'Vrijgekomen expositieweekend', true, 'expositie_vrijgegeven', null, null, 'reservelijst', 'handmatig'::public.verzendwijze, 1)
on conflict (sleutel) do nothing;
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Aanpassing gevraagd voor uw activiteit', '{"aanhef":"Beste {{voornaam}},","introductie":"","hoofdtekst":"Dank voor de informatie die u heeft aangeleverd.\n\nVoordat wij deze kunnen gebruiken, vragen wij u nog het volgende aan te passen:\n\n**{{feedback}}**\n\nWilt u de aangepaste informatie via onderstaande knop doorgeven?","callToActionTekst":"Informatie aanpassen","secundaireTekst":"","slottekst":"","ondertekening":"Stichting Het Kerkje van Persingen","knoppen":[{"label":"Informatie aanpassen","actie":"link"}],"categorie":"Content","ontvanger":"Aanvrager","cc":"","bcc":"","verzendwijze":"besluit","trigger":{"soort":"besluit_content","beschrijving":"Bestuur vraagt aanpassing","automatischVersturen":false,"conceptKlaarzetten":false}}'
from public.communicatie_templates t
where t.sleutel = 'booking_content_changes_requested'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Uw aanvraag voor het Kerkje van Persingen', '{"aanhef":"Beste {{voornaam}},","introductie":"","hoofdtekst":"Het bestuur heeft uw aanvraag voor {{datum}} bekeken.\n\nHelaas kunnen wij uw aanvraag niet bevestigen.\n\n{{reden_afwijzing}}\n\nDank voor uw belangstelling in het Kerkje van Persingen.","callToActionTekst":"","secundaireTekst":"","slottekst":"","ondertekening":"Stichting Het Kerkje van Persingen","knoppen":[],"categorie":"Aanvraag","ontvanger":"Aanvrager","cc":"","bcc":"","verzendwijze":"besluit","trigger":{"soort":"besluit_afwijzing","beschrijving":"Bestuur bevestigt afwijzing","automatischVersturen":false,"conceptKlaarzetten":false}}'
from public.communicatie_templates t
where t.sleutel = 'booking_request_rejected'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Uw aanvraag is goedgekeurd', '{"aanhef":"Beste {{voornaam}},","introductie":"","hoofdtekst":"Het bestuur heeft uw aanvraag voor het Kerkje van Persingen goedgekeurd.\n\n**{{activiteitstype}}**  \n{{datum}}  \n{{tijd}}\n\nOm de reservering definitief te maken, vragen wij u de betaling van **{{bedrag}}** voor **{{betaaldeadline}}** af te ronden.\n\nNa ontvangst van de betaling is uw reservering definitief.","callToActionTekst":"Reservering afronden","secundaireTekst":"","slottekst":"","ondertekening":"Stichting Het Kerkje van Persingen","knoppen":[{"label":"Reservering afronden","actie":"link"}],"categorie":"Aanvraag","ontvanger":"Aanvrager","cc":"","bcc":"","verzendwijze":"besluit","trigger":{"soort":"besluit_goedkeuring","beschrijving":"Bestuur bevestigt goedkeuring","automatischVersturen":false,"conceptKlaarzetten":false}}'
from public.communicatie_templates t
where t.sleutel = 'booking_approved_payment_required'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Uw aanvraag voor het Kerkje van Persingen', '{"aanhef":"Beste {{voornaam}},","introductie":"","hoofdtekst":"Dank voor uw aanvraag voor het Kerkje van Persingen.\n\n**{{activiteitstype}}**  \n{{datum}}  \n{{tijd}}\n\nHet bestuur bekijkt uw aanvraag en beoordeelt of deze past bij het Kerkje. U ontvangt daarna van ons bericht.\n\nUw aanvraag is op dit moment nog geen definitieve reservering.","callToActionTekst":"","secundaireTekst":"","slottekst":"","ondertekening":"Stichting Het Kerkje van Persingen","knoppen":[],"categorie":"Aanvraag","ontvanger":"Aanvrager","cc":"","bcc":"","verzendwijze":"automatisch","trigger":{"soort":"nieuwe_aanvraag","beschrijving":"Nieuwe aanvraag ingediend","automatischVersturen":true,"conceptKlaarzetten":false}}'
from public.communicatie_templates t
where t.sleutel = 'booking_request_received'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Aanvraag opnieuw klaar voor beoordeling: {{datum}}', '{"aanhef":"","introductie":"","hoofdtekst":"De gevraagde aanvullende informatie is ontvangen.\n\n**Aanvrager**  \n{{naam}}\n\n**Activiteit**  \n{{activiteitstype}}\n\n**Datum**  \n{{datum}}\n\n**Aanvulling**  \n{{aanvullende_informatie}}\n\nDe aanvraag staat opnieuw klaar voor beoordeling.","callToActionTekst":"Aanvraag beoordelen","secundaireTekst":"","slottekst":"","ondertekening":"","knoppen":[{"label":"Aanvraag beoordelen","actie":"link"}],"categorie":"Intern","ontvanger":"Bestuur","cc":"","bcc":"","verzendwijze":"automatisch","trigger":{"soort":"aanvulling_ontvangen","beschrijving":"Aanvulling ontvangen","automatischVersturen":true,"conceptKlaarzetten":false}}'
from public.communicatie_templates t
where t.sleutel = 'internal_booking_information_received'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Annulering van uw reservering', '{"aanhef":"Beste {{voornaam}},","introductie":"","hoofdtekst":"Uw reservering van het Kerkje van Persingen op **{{datum}}** is geannuleerd.\n\n{{annulering_toelichting}}\n\nHeeft u hierover nog een vraag, dan kunt u contact met ons opnemen.","callToActionTekst":"","secundaireTekst":"","slottekst":"","ondertekening":"Stichting Het Kerkje van Persingen","knoppen":[],"categorie":"Boeking","ontvanger":"Aanvrager","cc":"","bcc":"","verzendwijze":"automatisch","trigger":{"soort":"boeking_geannuleerd","beschrijving":"Boeking geannuleerd na bevestiging","automatischVersturen":true,"conceptKlaarzetten":false}}'
from public.communicatie_templates t
where t.sleutel = 'booking_cancelled'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Dank voor uw bezoek aan het Kerkje', '{"aanhef":"Beste {{voornaam}},","introductie":"","hoofdtekst":"Dank dat u het Kerkje van Persingen heeft gebruikt voor {{activiteitstype}}.\n\nWij hopen dat u met plezier terugkijkt op uw tijd in het Kerkje.\n\nWilt u uw ervaring met anderen delen? Dat stellen wij zeer op prijs.","callToActionTekst":"Deel uw ervaring","secundaireTekst":"","slottekst":"","ondertekening":"Stichting Het Kerkje van Persingen","knoppen":[{"label":"Deel uw ervaring","actie":"link"}],"categorie":"Nazorg","ontvanger":"Aanvrager","cc":"","bcc":"","verzendwijze":"automatisch","trigger":{"soort":"dagen_na_activiteit","beschrijving":"1 dag na activiteit","automatischVersturen":true,"conceptKlaarzetten":false,"offsetWaarde":1,"offsetEenheid":"dagen","offsetRichting":"na"}}'
from public.communicatie_templates t
where t.sleutel = 'booking_review_request'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Kun jij gastheer zijn op {{datum}}?', '{"aanhef":"Beste {{voornaam}},","introductie":"","hoofdtekst":"Kun jij gastheer of gastvrouw zijn bij onderstaande activiteit?\n\n**{{activiteitnaam}}**  \n{{datum}}  \n{{tijd}}\n\nLaat weten of je beschikbaar bent.","callToActionTekst":"Ja, ik kan","secundaireTekst":"Nee, ik kan niet","slottekst":"","ondertekening":"Stichting Het Kerkje van Persingen","knoppen":[{"label":"Ja, ik kan","actie":"gastheer_ja"},{"label":"Nee, ik kan niet","actie":"gastheer_nee"}],"categorie":"Gastheer","ontvanger":"Gastheer","cc":"","bcc":"","verzendwijze":"handmatig","trigger":{"soort":"handmatig_gestart","beschrijving":"Medewerker nodigt gastheer uit","automatischVersturen":false,"conceptKlaarzetten":false}}'
from public.communicatie_templates t
where t.sleutel = 'host_availability_request'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Actie nodig: betaling {{naam}} | {{datum}}', '{"aanhef":"","introductie":"","hoofdtekst":"De betaling voor onderstaande reservering is niet binnen de afgesproken termijn ontvangen.\n\n**Aanvrager**  \n{{naam}}\n\n**Datum**  \n{{datum}}\n\n**Openstaand**  \n{{bedrag}}\n\n**Betaaldeadline**  \n{{betaaldeadline}}\n\nDe automatische herinneringen zijn verstuurd. Er is nu handmatige opvolging nodig.","callToActionTekst":"Bekijk reservering","secundaireTekst":"","slottekst":"","ondertekening":"","knoppen":[{"label":"Bekijk reservering","actie":"link"}],"categorie":"Intern","ontvanger":"Finance / bestuur","cc":"","bcc":"","verzendwijze":"escalatie","trigger":{"soort":"betaaldeadline_verstreken","beschrijving":"Betaaldeadline verstreken","automatischVersturen":true,"conceptKlaarzetten":false}}'
from public.communicatie_templates t
where t.sleutel = 'internal_payment_overdue'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Herinnering voor uw reservering op {{datum}}', '{"aanhef":"Beste {{voornaam}},","introductie":"","hoofdtekst":"Uw aanvraag voor {{datum}} is goedgekeurd. De betaling van **{{bedrag}}** staat nog open.\n\nWilt u de betaling voor **{{betaaldeadline}}** afronden? Daarna is uw reservering definitief.","callToActionTekst":"Betaling afronden","secundaireTekst":"","slottekst":"","ondertekening":"Stichting Het Kerkje van Persingen","knoppen":[{"label":"Betaling afronden","actie":"link"}],"categorie":"Betaling","ontvanger":"Aanvrager","cc":"","bcc":"","verzendwijze":"automatisch","trigger":{"soort":"betaling_open_dagen","beschrijving":"Betaling na 7 dagen open","automatischVersturen":true,"conceptKlaarzetten":false,"offsetWaarde":7,"offsetEenheid":"dagen","offsetRichting":"na"}}'
from public.communicatie_templates t
where t.sleutel = 'booking_payment_reminder'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Uw informatie is akkoord', '{"aanhef":"Beste {{voornaam}},","introductie":"","hoofdtekst":"De informatie voor uw activiteit op **{{datum}}** is akkoord.\n\nWij gebruiken deze informatie voor de communicatie rondom uw activiteit.\n\nU hoeft hiervoor niets meer te doen.","callToActionTekst":"","secundaireTekst":"","slottekst":"","ondertekening":"Stichting Het Kerkje van Persingen","knoppen":[],"categorie":"Content","ontvanger":"Aanvrager","cc":"","bcc":"","verzendwijze":"besluit","trigger":{"soort":"besluit_content","beschrijving":"Bestuur keurt content goed","automatischVersturen":false,"conceptKlaarzetten":false}}'
from public.communicatie_templates t
where t.sleutel = 'booking_content_approved'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Content klaar voor beoordeling: {{activiteitnaam}}', '{"aanhef":"","introductie":"","hoofdtekst":"Alle informatie voor onderstaande activiteit is ontvangen.\n\n**Activiteit**  \n{{activiteitnaam}}\n\n**Datum**  \n{{datum}}\n\nControleer de informatie voordat deze wordt gepubliceerd.","callToActionTekst":"Goedkeuren","secundaireTekst":"Aanpassing vragen","slottekst":"","ondertekening":"","knoppen":[{"label":"Goedkeuren","actie":"content_goedkeuren"},{"label":"Aanpassing vragen","actie":"content_aanpassen"}],"categorie":"Intern","ontvanger":"Bestuur","cc":"","bcc":"","verzendwijze":"automatisch","trigger":{"soort":"content_compleet","beschrijving":"Content compleet","automatischVersturen":true,"conceptKlaarzetten":false}}'
from public.communicatie_templates t
where t.sleutel = 'internal_content_review_required'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Actie nodig: informatie ontbreekt voor {{datum}}', '{"aanhef":"","introductie":"","hoofdtekst":"De informatie voor onderstaande activiteit is nog niet compleet.\n\n**Activiteit**  \n{{activiteitnaam}}\n\n**Datum**  \n{{datum}}\n\n**Ontbreekt**  \n{{ontbrekende_content}}\n\nDe automatische herinneringen zijn verstuurd. Handmatige opvolging is nodig.","callToActionTekst":"Bekijk activiteit","secundaireTekst":"","slottekst":"","ondertekening":"","knoppen":[{"label":"Bekijk activiteit","actie":"link"}],"categorie":"Intern","ontvanger":"Bestuur","cc":"","bcc":"","verzendwijze":"escalatie","trigger":{"soort":"weken_voor_activiteit","beschrijving":"8 weken vooraf indien incompleet","automatischVersturen":true,"conceptKlaarzetten":false,"offsetWaarde":8,"offsetEenheid":"weken","offsetRichting":"voor"}}'
from public.communicatie_templates t
where t.sleutel = 'internal_content_overdue'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Is alles goed verlopen?', '{"aanhef":"Beste {{voornaam}},","introductie":"","hoofdtekst":"Is de activiteit van **{{datum}}** goed verlopen?","callToActionTekst":"Alles is goed verlopen","secundaireTekst":"Bijzonderheid melden · Met vriendelijke groet, · Stichting Het Kerkje van Persingen","slottekst":"","ondertekening":"Stichting Het Kerkje van Persingen","knoppen":[{"label":"Alles is goed verlopen","actie":"post_ok"},{"label":"Bijzonderheid melden","actie":"post_melding"},{"label":"Met vriendelijke groet,","actie":"post_melding"},{"label":"Stichting Het Kerkje van Persingen","actie":"post_melding"}],"categorie":"Nazorg","ontvanger":"Gastheer","cc":"","bcc":"","verzendwijze":"automatisch","trigger":{"soort":"dagen_na_activiteit","beschrijving":"1 dag na activiteit","automatischVersturen":true,"conceptKlaarzetten":false,"offsetWaarde":1,"offsetEenheid":"dagen","offsetRichting":"na"}}'
from public.communicatie_templates t
where t.sleutel = 'host_post_event_check'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Morgen in het Kerkje: {{activiteitnaam}}', '{"aanhef":"Beste {{voornaam}},","introductie":"","hoofdtekst":"Morgen ben je gastheer of gastvrouw bij:\n\n**{{activiteitnaam}}**  \n{{datum}}  \n{{tijd}}\n\n**Organisator**  \n{{klantnaam}}  \n{{klanttelefoon}}\n\n**Aanwezig vanaf**  \n{{toegang_vanaf}}\n\n**Bijzonderheden**  \n{{bijzonderheden}}\n\nVia onderstaande knop vind je de volledige informatie en checklist voor de dag.","callToActionTekst":"Bekijk daginformatie","secundaireTekst":"","slottekst":"","ondertekening":"Stichting Het Kerkje van Persingen","knoppen":[{"label":"Bekijk daginformatie","actie":"link"}],"categorie":"Gastheer","ontvanger":"Gastheer","cc":"","bcc":"","verzendwijze":"automatisch","trigger":{"soort":"dagen_voor_activiteit","beschrijving":"1 dag vooraf","automatischVersturen":true,"conceptKlaarzetten":false,"offsetWaarde":1,"offsetEenheid":"dagen","offsetRichting":"voor"}}'
from public.communicatie_templates t
where t.sleutel = 'host_final_instructions'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Bevestigd: gastheer op {{datum}}', '{"aanhef":"Beste {{voornaam}},","introductie":"","hoofdtekst":"Dank. Je bent ingepland als gastheer of gastvrouw voor:\n\n**{{activiteitnaam}}**  \n{{datum}}  \n{{tijd}}\n\nJe ontvangt vooraf automatisch alle informatie die je voor deze activiteit nodig hebt.","callToActionTekst":"","secundaireTekst":"","slottekst":"","ondertekening":"Stichting Het Kerkje van Persingen","knoppen":[],"categorie":"Gastheer","ontvanger":"Gastheer","cc":"","bcc":"","verzendwijze":"automatisch","trigger":{"soort":"gastheer_accepteert","beschrijving":"Gastheer accepteert","automatischVersturen":true,"conceptKlaarzetten":false}}'
from public.communicatie_templates t
where t.sleutel = 'host_assignment_confirmed'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Gastheer nodig voor {{datum}}', '{"aanhef":"","introductie":"","hoofdtekst":"Voor onderstaande activiteit is nog geen gastheer of gastvrouw toegewezen.\n\n**Activiteit**  \n{{activiteitnaam}}\n\n**Datum**  \n{{datum}}\n\n**Tijd**  \n{{tijd}}\n\nWijs een gastheer of gastvrouw toe om de voorbereiding compleet te maken.","callToActionTekst":"Gastheer toewijzen","secundaireTekst":"","slottekst":"","ondertekening":"","knoppen":[{"label":"Gastheer toewijzen","actie":"link"}],"categorie":"Planning","ontvanger":"Planning","cc":"","bcc":"","verzendwijze":"escalatie","trigger":{"soort":"geen_gastheer","beschrijving":"4 weken vooraf en geen gastheer","automatischVersturen":true,"conceptKlaarzetten":false,"offsetWaarde":4,"offsetEenheid":"weken","offsetRichting":"voor"}}'
from public.communicatie_templates t
where t.sleutel = 'internal_host_required'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Informatie voor uw activiteit op {{datum}}', '{"aanhef":"Beste {{voornaam}},","introductie":"","hoofdtekst":"Uw activiteit in het Kerkje komt dichterbij.\n\nVoor onze website, agenda en communicatie ontvangen wij graag de informatie over uw activiteit.\n\n{{content_lijst}}\n\nWilt u de gegevens uiterlijk **{{contentdeadline}}** aanleveren?","callToActionTekst":"Informatie aanleveren","secundaireTekst":"","slottekst":"","ondertekening":"Stichting Het Kerkje van Persingen","knoppen":[{"label":"Informatie aanleveren","actie":"link"}],"categorie":"Content","ontvanger":"Aanvrager","cc":"","bcc":"","verzendwijze":"automatisch","trigger":{"soort":"weken_voor_activiteit","beschrijving":"12 weken vooraf","automatischVersturen":true,"conceptKlaarzetten":false,"offsetWaarde":12,"offsetEenheid":"weken","offsetRichting":"voor"}}'
from public.communicatie_templates t
where t.sleutel = 'booking_content_request'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Uw reservering is nog niet definitief', '{"aanhef":"Beste {{voornaam}},","introductie":"","hoofdtekst":"Uw reservering voor **{{datum}}** is nog niet definitief, omdat wij de betaling nog niet hebben ontvangen.\n\nDe betaaltermijn loopt af op **{{betaaldeadline}}**.\n\nWilt u de reservering behouden? Rond de betaling dan voor deze datum af.","callToActionTekst":"Betaling afronden","secundaireTekst":"","slottekst":"","ondertekening":"Stichting Het Kerkje van Persingen","knoppen":[{"label":"Betaling afronden","actie":"link"}],"categorie":"Betaling","ontvanger":"Aanvrager","cc":"","bcc":"","verzendwijze":"automatisch","trigger":{"soort":"voor_betaaldeadline","beschrijving":"2 dagen voor betaaldeadline","automatischVersturen":true,"conceptKlaarzetten":false,"offsetWaarde":2,"offsetEenheid":"dagen","offsetRichting":"voor"}}'
from public.communicatie_templates t
where t.sleutel = 'booking_payment_final_reminder'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Voor {{datum}}: de laatste informatie', '{"aanhef":"Beste {{voornaam}},","introductie":"","hoofdtekst":"Binnenkort vindt uw activiteit plaats in het Kerkje van Persingen.\n\nNog even de belangrijkste gegevens:\n\n**Datum**  \n{{datum}}\n\n**Activiteit**  \n{{activiteitstype}}\n\n**Toegang vanaf**  \n{{toegang_vanaf}}\n\n**Aanvang**  \n{{tijd}}\n\n**Gastheer of gastvrouw**  \n{{gastheer_naam}}  \n{{gastheer_telefoon}}\n\n{{laatste_bijzonderheden}}\n\nWij wensen u een mooie dag in het Kerkje.","callToActionTekst":"Bekijk alle informatie","secundaireTekst":"","slottekst":"","ondertekening":"Stichting Het Kerkje van Persingen","knoppen":[{"label":"Bekijk alle informatie","actie":"link"}],"categorie":"Boeking","ontvanger":"Aanvrager","cc":"","bcc":"","verzendwijze":"automatisch","trigger":{"soort":"dagen_voor_activiteit","beschrijving":"2 dagen vooraf","automatischVersturen":true,"conceptKlaarzetten":false,"offsetWaarde":2,"offsetEenheid":"dagen","offsetRichting":"voor"}}'
from public.communicatie_templates t
where t.sleutel = 'booking_final_instructions'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Aanvulling op uw aanvraag voor {{datum}}', '{"aanhef":"Beste {{voornaam}},","introductie":"","hoofdtekst":"Om uw aanvraag goed te kunnen beoordelen, ontvangen wij graag nog de volgende informatie:\n\n**{{vraag}}**\n\nWilt u deze informatie aanvullen? Daarna nemen wij uw aanvraag opnieuw in behandeling.","callToActionTekst":"Informatie aanvullen","secundaireTekst":"","slottekst":"","ondertekening":"Stichting Het Kerkje van Persingen","knoppen":[{"label":"Informatie aanvullen","actie":"link"}],"categorie":"Aanvraag","ontvanger":"Aanvrager","cc":"","bcc":"","verzendwijze":"besluit","trigger":{"soort":"besluit_meer_info","beschrijving":"Bestuur kiest Meer informatie","automatischVersturen":false,"conceptKlaarzetten":true}}'
from public.communicatie_templates t
where t.sleutel = 'booking_more_information_requested'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Nieuwe aanvraag: {{datum}} | {{activiteitstype}}', '{"aanhef":"","introductie":"","hoofdtekst":"Er staat een nieuwe aanvraag klaar voor beoordeling.\n\n**Aanvrager**  \n{{naam}}\n\n**Activiteit**  \n{{activiteitstype}}\n\n**Datum en tijd**  \n{{datum}}  \n{{tijd}}\n\n**Aantal personen**  \n{{aantal_personen}}\n\n**Toelichting**  \n{{omschrijving}}\n\n**Controle**  \n{{controle_overzicht}}\n\nBeoordeel of deze activiteit past bij het Kerkje.","callToActionTekst":"Goedkeuren","secundaireTekst":"Meer informatie vragen · Afwijzen","slottekst":"","ondertekening":"","knoppen":[{"label":"Goedkeuren","actie":"goedkeuren"},{"label":"Meer informatie vragen","actie":"meer_info"},{"label":"Afwijzen","actie":"afwijzen"}],"categorie":"Intern","ontvanger":"Bestuur","cc":"","bcc":"","verzendwijze":"automatisch","trigger":{"soort":"aanvraag_compleet","beschrijving":"Nieuwe aanvraag compleet","automatischVersturen":true,"conceptKlaarzetten":false}}'
from public.communicatie_templates t
where t.sleutel = 'internal_booking_review_required'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Praktische informatie voor {{datum}}', '{"aanhef":"Beste {{voornaam}},","introductie":"","hoofdtekst":"Uw activiteit in het Kerkje vindt plaats op **{{datum}}**.\n\nHierbij ontvangt u de praktische informatie voor deze dag.\n\n**Aanvang**  \n{{tijd}}\n\n**Toegang vanaf**  \n{{toegang_vanaf}}\n\n**Gastheer of gastvrouw**  \n{{gastheer_naam}}\n\n{{praktische_kerninformatie}}\n\nVia onderstaande knop vindt u alle informatie voor de voorbereiding en het gebruik van het Kerkje.","callToActionTekst":"Bekijk praktische informatie","secundaireTekst":"","slottekst":"","ondertekening":"Stichting Het Kerkje van Persingen","knoppen":[{"label":"Bekijk praktische informatie","actie":"link"}],"categorie":"Boeking","ontvanger":"Aanvrager","cc":"","bcc":"","verzendwijze":"automatisch","trigger":{"soort":"weken_voor_activiteit","beschrijving":"4 weken vooraf","automatischVersturen":true,"conceptKlaarzetten":false,"offsetWaarde":4,"offsetEenheid":"weken","offsetRichting":"voor"}}'
from public.communicatie_templates t
where t.sleutel = 'booking_practical_information'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Praktische informatie voor {{datum}}', '{"aanhef":"Beste {{voornaam}},","introductie":"","hoofdtekst":"Hierbij de informatie voor je dienst in het Kerkje.\n\n**Activiteit**  \n{{activiteitnaam}}\n\n**Datum**  \n{{datum}}\n\n**Organisator**  \n{{klantnaam}}\n\n**Telefoon**  \n{{klanttelefoon}}\n\n**Aantal bezoekers**  \n{{aantal_personen}}\n\n**Toegang vanaf**  \n{{toegang_vanaf}}\n\n**Aanvang**  \n{{tijd}}\n\n**Bijzonderheden**  \n{{bijzonderheden}}\n\nKort voor de activiteit ontvang je nog een laatste overzicht.","callToActionTekst":"Bekijk volledige informatie","secundaireTekst":"","slottekst":"","ondertekening":"Stichting Het Kerkje van Persingen","knoppen":[{"label":"Bekijk volledige informatie","actie":"link"}],"categorie":"Gastheer","ontvanger":"Gastheer","cc":"","bcc":"","verzendwijze":"automatisch","trigger":{"soort":"weken_voor_activiteit","beschrijving":"4 weken vooraf","automatischVersturen":true,"conceptKlaarzetten":false,"offsetWaarde":4,"offsetEenheid":"weken","offsetRichting":"voor"}}'
from public.communicatie_templates t
where t.sleutel = 'host_practical_information'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Uw informatie voor {{datum}} is nog niet compleet', '{"aanhef":"Beste {{voornaam}},","introductie":"","hoofdtekst":"Wij missen nog informatie voor uw activiteit op **{{datum}}**.\n\nWilt u de ontbrekende gegevens uiterlijk **{{contentdeadline}}** aanvullen? Dan kunnen wij uw activiteit op tijd voorbereiden en publiceren.","callToActionTekst":"Informatie aanvullen","secundaireTekst":"","slottekst":"","ondertekening":"Stichting Het Kerkje van Persingen","knoppen":[{"label":"Informatie aanvullen","actie":"link"}],"categorie":"Content","ontvanger":"Aanvrager","cc":"","bcc":"","verzendwijze":"automatisch","trigger":{"soort":"weken_voor_activiteit","beschrijving":"10 weken vooraf indien incompleet","automatischVersturen":true,"conceptKlaarzetten":false,"offsetWaarde":10,"offsetEenheid":"weken","offsetRichting":"voor"}}'
from public.communicatie_templates t
where t.sleutel = 'booking_content_reminder'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Uw reservering is definitief', '{"aanhef":"Beste {{voornaam}},","introductie":"","hoofdtekst":"Wij hebben uw betaling ontvangen. Uw reservering van het Kerkje van Persingen is daarmee definitief.\n\n**{{activiteitstype}}**  \n{{datum}}  \n{{tijd}}\n\nU hoeft op dit moment niets te doen.\n\nVoor uw activiteit nemen wij vanzelf weer contact met u op.\n\nRuim voor de activiteit vragen wij de benodigde informatie op voor onze website en communicatie.\n\nDaarna ontvangt u van ons de praktische informatie en kort voor de activiteit de laatste informatie voor de dag zelf.\n\nZo weet u steeds op tijd wat er van u wordt verwacht.","callToActionTekst":"Bekijk uw reservering","secundaireTekst":"","slottekst":"","ondertekening":"Stichting Het Kerkje van Persingen","knoppen":[{"label":"Bekijk uw reservering","actie":"link"}],"categorie":"Boeking","ontvanger":"Aanvrager","cc":"","bcc":"","verzendwijze":"automatisch","trigger":{"soort":"betaling_ontvangen","beschrijving":"Betaling ontvangen","automatischVersturen":true,"conceptKlaarzetten":false}}'
from public.communicatie_templates t
where t.sleutel = 'booking_confirmed'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Er is een expositieweekend vrijgekomen', '{"aanhef":"Beste {{voornaam}},","introductie":"","hoofdtekst":"Er is een expositieweekend vrijgekomen in het Kerkje van Persingen:\n\n**{{datum_of_weekend}}**\n\nU heeft eerder aangegeven dat u bericht wilt ontvangen wanneer een weekend beschikbaar komt.\n\nHeeft u belangstelling? Bekijk het weekend en dien eenvoudig een aanvraag in.","callToActionTekst":"Bekijk het weekend","secundaireTekst":"","slottekst":"","ondertekening":"Stichting Het Kerkje van Persingen","knoppen":[{"label":"Bekijk het weekend","actie":"link"}],"categorie":"Boeking","ontvanger":"Reservelijst","cc":"","bcc":"","verzendwijze":"handmatig","trigger":{"soort":"expositie_vrijgegeven","beschrijving":"Expositieweekend vrijgegeven","automatischVersturen":false,"conceptKlaarzetten":false}}'
from public.communicatie_templates t
where t.sleutel = 'exhibition_weekend_available'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Aanvraag afgewezen', 'Beste {naam},

Hartelijk dank voor uw aanvraag voor {soort} op {datum}.

Helaas kunnen we deze datum niet toewijzen. De ruimte is dan niet beschikbaar, of de aanvraag past niet binnen onze verhuurvoorwaarden.

U bent van harte welkom een andere datum voor te stellen via kerkjepersingen.nl/verhuur/aanvragen/.

Met vriendelijke groet,
Bestuur Het Kerkje van Persingen'
from public.communicatie_templates t
where t.sleutel = 'afwijzing'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Contract voor uw boeking', 'Beste {naam},

Bij deze het contract voor uw {soort} op {datum}. Het tarief is {tarief}.

Wilt u het ondertekend terugsturen? Daarna volgt de aanbetaling. Zodra die binnen is, is de boeking definitief. U hoort dat van ons.

Vragen over het contract: Nelleke van der Pol, contractbeheer, of bel 06 52 66 84 49.

Met vriendelijke groet,
Bestuur Het Kerkje van Persingen'
from public.communicatie_templates t
where t.sleutel = 'contract_begeleiding'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Volgende stappen na definitief', 'Beste {naam},

Goed nieuws: uw boeking voor {soort} op {datum} is definitief. De aanbetaling is ontvangen.

Wat nu:
• U ontvangt van ons de praktische informatie tijdig voor de datum.
• Voor een expositie vragen we u later om een korte tekst en een foto voor de website.
• Parkeren kan op het terrein aan de overkant van de straat.
• Vragen? Bel 06 52 66 84 49.

Het afgesproken tarief is {tarief}.

Met vriendelijke groet,
Bestuur Het Kerkje van Persingen'
from public.communicatie_templates t
where t.sleutel = 'volgende_stappen'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Aanbetaling binnen?', 'Paul, korte check.

Boeking: {soort} op {datum}, {naam}.
Afgesproken tarief: {tarief}.
De termijn voor de aanbetaling is voorbij.

Is de aanbetaling binnen?
• Ja — zet in Sanity bij de boeking “Aanbetaling binnen” aan. De huurder krijgt dan automatisch de volgende stappen.
• Nee — laat het Nelleke (contractbeheer) weten. De boeking blijft een optie tot het is afgehandeld.

Deze mail is intern; de huurder ziet hem niet.'
from public.communicatie_templates t
where t.sleutel = 'aanbetaling_check_paul'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Tekst en foto voor de website', 'Beste {naam},

Uw {soort} in het kerkje is op {datum}. We zetten het graag op tijd op de website, zodat bezoekers het kunnen vinden.

Wilt u ons vóór {uitersteDatum} sturen:
• een korte tekst (een paar zinnen is genoeg)
• één foto die we mogen publiceren
• of we de foto mogen gebruiken (kort bevestigen is voldoende)

Stuur dit naar {contactpersoon} of antwoord op deze mail.

Zonder tekst en foto blijft de datum op de kalender op “bezet” staan, zonder verdere toelichting. Dat is geen probleem — het is alleen zonde als bezoekers het event niet kunnen vinden.

Met vriendelijke groet,
Bestuur Het Kerkje van Persingen'
from public.communicatie_templates t
where t.sleutel = 'content_verzoek'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Content ter beoordeling', 'Er is content binnengekomen voor {soort} op {datum} ({naam}).

Bekijk tekst en foto in Sanity, onder de boeking, bij “Aangeleverde website-content”.
Akkoord? Zet de status op Goedgekeurd. Afgewezen? Zet Afgewezen en laat kort weten wat er anders moet.'
from public.communicatie_templates t
where t.sleutel = 'content_ter_beoordeling'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Praktische informatie — Kerkje van Persingen', 'Beste {naam},

Over vier weken is het zover: {soort} op {datum} in het kerkje van Persingen.

Praktisch:
• Adres: Persingensestraat 7, 6575 JA Persingen.
• Parkeren: alleen op het terrein aan de overkant van de straat.
• Geen entree heffen, bij geen enkele activiteit.
• Geen horeca verkopen. Iets aanbieden uit gastvrijheid mag wel.
• Schade tijdens de huurperiode is voor rekening van de huurder.

Voor exposities:
• In principe het hele weekend, zaterdag én zondag, 11.00–17.00 uur.
• Werk ophangen alleen aan de aanwezige systemen, max. 10 kg per houder.
• Staat er op vrijdag al iets anders, dan inrichten vanaf circa 16.30 uur.

Uw contactpersoon vanuit het bestuur is {contactpersoon}.
De gastheer of gastvrouw die dienst heeft: {gastheer}.
Telefonisch: 06 52 66 84 49.

De volledige voorwaarden staan op kerkjepersingen.nl/verhuur/voorwaarden/.

Met vriendelijke groet,
Bestuur Het Kerkje van Persingen'
from public.communicatie_templates t
where t.sleutel = 'praktisch_4w'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Praktische informatie gastheer', 'Hallo {gastheer},

Je hebt dienst bij {soort} op {datum}.

Huurder: {naam}
Contact vanuit het bestuur: {contactpersoon}
Telefoon kerkje: 06 52 66 84 49

De huurder krijgt dezelfde praktische info (parkeren overkant, geen entree, geen horeca verkopen, tijden bij een expositie 11.00–17.00).

Kun je er niet bij zijn? Laat het {contactpersoon} zo snel mogelijk weten.

Dank je wel,
Bestuur Het Kerkje van Persingen'
from public.communicatie_templates t
where t.sleutel = 'praktisch_gastheer'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Herinnering 1 dag', 'Beste {naam},

Morgen is het zover: {soort} in het kerkje van Persingen ({datum}).

Even ter herinnering:
• Persingensestraat 7, 6575 JA Persingen
• Parkeren aan de overkant van de straat
• Contact: {contactpersoon} of 06 52 66 84 49
• Gastheer/gastvrouw: {gastheer}

Fijne dag, en tot morgen.

Met vriendelijke groet,
Bestuur Het Kerkje van Persingen'
from public.communicatie_templates t
where t.sleutel = 'herinnering_1d'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Herinnering 1 dag gastheer', 'Hallo {gastheer},

Morgen heb je dienst: {soort} op {datum}.
Huurder: {naam}. Bij vragen: {contactpersoon} of 06 52 66 84 49.

Dank je wel,
Bestuur Het Kerkje van Persingen'
from public.communicatie_templates t
where t.sleutel = 'herinnering_gastheer'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Google-review na afloop', 'Beste {naam},

We hopen dat {soort} op {datum} in het kerkje goed is bevallen.

Als u een moment heeft: een korte Google-review helpt anderen dit kerkje te vinden. Dat mag in een paar zinnen.

{googleReviewUrl}

Hartelijk dank, ook namens de vrijwilligers.

Met vriendelijke groet,
Bestuur Het Kerkje van Persingen'
from public.communicatie_templates t
where t.sleutel = 'review_verzoek'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Er is een expositie-weekend vrijgekomen', 'Beste {naam},

Er is een expositie-weekend vrijgekomen in het kerkje van Persingen: {datum}.

Als u wilt exposeren, reageer dan op deze mail of bel 06 52 66 84 49. We kijken in volgorde van binnenkomst, en houden de gewone verhuurvoorwaarden aan (onder meer: in principe een heel weekend, en niet binnen 18 maanden opnieuw).

Geen interesse meer in dit soort berichten? Zeg het even terug, dan halen we u van de reservelijst.

Met vriendelijke groet,
Bestuur Het Kerkje van Persingen'
from public.communicatie_templates t
where t.sleutel = 'reservelijst'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
insert into public.communicatie_template_versies (template_id, versie, onderwerp, inhoud)
select t.id, 1, 'Optie verlopen — actie vereist', 'De optie voor {soort} op {datum} is verlopen. Neem contact op met de klant.'
from public.communicatie_templates t
where t.sleutel = 'optie_verlopen_contractbeheerder'
  and not exists (
    select 1 from public.communicatie_template_versies v
    where v.template_id = t.id and v.versie = 1
  );
