-- De afloopmail gebruikte de groet als knop. Alleen de twee echte acties blijven.

update public.communicatie_template_versies v
set inhoud = (
  jsonb_set(
    jsonb_set(
      v.inhoud::jsonb,
      '{knoppen}',
      coalesce((
        select jsonb_agg(knop)
        from jsonb_array_elements(coalesce(v.inhoud::jsonb->'knoppen', '[]'::jsonb)) knop
        where coalesce(knop->>'label', '') !~* 'vriendelijke groet'
          and coalesce(knop->>'label', '') !~* '^stichting het kerkje'
      ), '[]'::jsonb)
    ),
    '{secundaireTekst}',
    to_jsonb('Bijzonderheid melden'::text)
  )
)::text
from public.communicatie_templates t
where v.template_id = t.id
  and t.sleutel = 'host_post_event_check'
  and left(ltrim(v.inhoud), 1) = '{';
