-- Dezelfde vrij-weekendbanner kan ook alleen tekst tonen, zonder datum.
-- Oudere records hebben geen soort en blijven een vrij weekend.
-- De publieke site leest nog steeds alleen deze ene functie.

create or replace function public.publieke_vrijgekomen_weekend_banner()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce((i.waarde->>'actief')::boolean, false) is not true then null
    when coalesce(i.waarde->>'soort', 'weekend') = 'tekst' then
      case
        when nullif(btrim(coalesce(i.waarde->>'titel', '')), '') is null
          and nullif(btrim(coalesce(i.waarde->>'tekst', '')), '') is null then null
        else jsonb_build_object(
          'soort', 'tekst',
          'eyebrow', btrim(coalesce(i.waarde->>'eyebrow', '')),
          'titel', btrim(coalesce(i.waarde->>'titel', '')),
          'tekst', btrim(coalesce(i.waarde->>'tekst', '')),
          'knop', btrim(coalesce(i.waarde->>'knop', '')),
          'link', btrim(coalesce(i.waarde->>'link', ''))
        )
      end
    when coalesce(i.waarde->>'zaterdag', '') !~ '^\d{4}-\d{2}-\d{2}$' then null
    when extract(dow from (i.waarde->>'zaterdag')::date) <> 6 then null
    when (timezone('Europe/Amsterdam', now()))::date > ((i.waarde->>'zaterdag')::date + 1) then null
    else jsonb_build_object(
      'soort', 'weekend',
      'zaterdag', i.waarde->>'zaterdag',
      'zondag', to_char((i.waarde->>'zaterdag')::date + 1, 'YYYY-MM-DD')
    )
  end
  from public.instellingen i
  where i.sleutel = 'vrijgekomen_weekend_banner'
$$;

revoke all on function public.publieke_vrijgekomen_weekend_banner() from public;
grant execute on function public.publieke_vrijgekomen_weekend_banner() to anon, authenticated, service_role;
