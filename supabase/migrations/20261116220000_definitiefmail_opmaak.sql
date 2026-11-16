-- Tekst van de definitieve reserveringsmail.
-- De reserveringsgegevens komen uit de boeking, niet uit deze tekst.

update public.communicatie_template_versies as versie
set
  onderwerp = 'Uw reservering is definitief | Kerkje van Persingen',
  inhoud = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                versie.inhoud::jsonb,
                '{introductie}',
                to_jsonb($intro$Wat fijn dat we u binnenkort mogen verwelkomen in het Kerkje van Persingen!

Uw reservering is inmiddels definitief. Daarmee staat alles vast voor uw activiteit.$intro$::text)
              ),
              '{hoofdtekst}',
              to_jsonb($vervolg$Voorlopig hoeft u vanuit ons niets te regelen. Naarmate uw activiteit dichterbij komt, nemen wij vanzelf contact met u op.

We bespreken dan de praktische zaken en vragen, indien nodig, informatie op voor onze website en communicatie. Kort voor uw komst stemmen we de laatste details met u af.

Heeft u in de tussentijd vragen of wilt u iets met ons bespreken? Neem dan gerust contact met ons op.$vervolg$::text)
            ),
            '{slottekst}',
            to_jsonb('Wij wensen u alvast veel plezier met de voorbereidingen en kijken uit naar uw komst!'::text)
          ),
          '{ondertekening}',
          to_jsonb(''::text)
        ),
        '{callToActionTekst}',
        to_jsonb(''::text)
      ),
      '{knoppen}',
      '[]'::jsonb
    ),
    '{aanhef}',
    to_jsonb('Beste {{voornaam}},'::text)
  )::text
from public.communicatie_templates as template
where versie.template_id = template.id
  and template.sleutel = 'booking_confirmed'
  and versie.versie = template.huidige_versie
  and left(ltrim(versie.inhoud), 1) = '{';
