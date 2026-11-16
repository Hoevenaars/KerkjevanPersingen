-- Tekst van de mail "Uw reservering is definitief".
-- Geen knop meer: de brief verwijst naar contact bij vragen.

update public.communicatie_template_versies as versie
set
  inhoud = jsonb_set(
    jsonb_set(
      jsonb_set(
        versie.inhoud::jsonb,
        '{hoofdtekst}',
        to_jsonb($brief$Goed nieuws! Uw reservering voor het Kerkje van Persingen is definitief bevestigd. Wij kijken ernaar uit u bij ons te mogen ontvangen.

Uw reservering

Activiteit: {{activiteitstype}}
Datum: {{datum}}
Tijd: {{tijd}}

Hoe gaat het nu verder?

Voorlopig hoeft u niets te doen. Wij nemen op de juiste momenten contact met u op.

- Voorbereiding: Ruim voor uw activiteit vragen wij eventuele informatie op voor onze website en communicatie.
- Praktische afspraken: U ontvangt tijdig alle informatie over het gebruik van het kerkje.
- Laatste informatie: Kort voor uw activiteit nemen wij de laatste bijzonderheden met u door.

Zo kunt u zich volledig richten op de voorbereiding van uw activiteit. Wij zorgen dat u tijdig weet wat er nodig is.

Heeft u tussentijds vragen? Neem gerust contact met ons op.$brief$::text)
      ),
      '{callToActionTekst}',
      to_jsonb(''::text)
    ),
    '{knoppen}',
    '[]'::jsonb
  )::text
from public.communicatie_templates as template
where versie.template_id = template.id
  and template.sleutel = 'booking_confirmed'
  and versie.versie = template.huidige_versie
  and left(ltrim(versie.inhoud), 1) = '{';
