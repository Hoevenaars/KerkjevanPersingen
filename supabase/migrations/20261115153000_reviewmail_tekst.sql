-- Nieuwe tekst van de automatische reviewmail naar de aanvrager.
-- review_verzoek blijft een losse, handmatige kopie en krijgt geen eigen verzending.

update public.communicatie_template_versies as versie
set
  onderwerp = 'Dank voor uw bezoek aan het Kerkje',
  inhoud = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          versie.inhoud::jsonb,
          '{hoofdtekst}',
          to_jsonb($review$Wat fijn dat uw {{activiteitstype}} in het Kerkje van Persingen heeft plaatsgevonden!

We hopen dat u en uw gasten met plezier terugkijken op deze bijzondere gelegenheid.

Mogen we u iets vragen?

Zou u een minuutje de tijd willen nemen om uw ervaring met ons te delen? Met uw Google-review helpt u anderen om ons bijzondere kerkje te ontdekken. Bovendien helpt uw feedback ons om het steeds een beetje beter te doen.$review$::text)
        ),
        '{slottekst}',
        to_jsonb('Alvast hartelijk dank! We hopen u in de toekomst nog eens te mogen verwelkomen.'::text)
      ),
      '{callToActionTekst}',
      to_jsonb('Deel uw ervaring op Google'::text)
    ),
    '{knoppen}',
    '[{"label":"Deel uw ervaring op Google","actie":"link"}]'::jsonb
  )::text
from public.communicatie_templates as template
where versie.template_id = template.id
  and template.sleutel = 'booking_review_request'
  and versie.versie = template.huidige_versie
  and left(ltrim(versie.inhoud), 1) = '{';
