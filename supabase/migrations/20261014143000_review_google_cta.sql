update public.communicatie_template_versies as versie
set
  onderwerp = 'Dank voor uw bezoek aan het Kerkje',
  inhoud = jsonb_set(
    jsonb_set(
      jsonb_set(
        versie.inhoud::jsonb,
        '{hoofdtekst}',
        to_jsonb($review$Dank dat u het Kerkje van Persingen heeft gebruikt voor {{activiteitstype}}.

Wij hopen dat u een fijne ervaring heeft gehad.

Een korte review helpt het Kerkje en toekomstige bezoekers en exposanten.$review$::text)
      ),
      '{callToActionTekst}',
      to_jsonb('Laat een Google Review achter'::text)
    ),
    '{knoppen}',
    '[{"label":"Laat een Google Review achter","actie":"link"}]'::jsonb
  )::text
from public.communicatie_templates as template
where versie.template_id = template.id
  and template.sleutel = 'booking_review_request'
  and versie.versie = template.huidige_versie;
