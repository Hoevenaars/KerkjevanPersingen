-- Dezelfde vrij-weekendbanner kan ook alleen tekst tonen, zonder datum.
-- De boodschap dat 17 en 18 oktober 2026 beschikbaar zijn, wordt de sluitingstekst.
-- Oudere records voor een ander weekend blijven een vrij weekend.
-- De publieke site leest nog steeds alleen deze ene functie.

update public.instellingen
set
  waarde = jsonb_build_object(
    'actief', true,
    'soort', 'tekst',
    'zaterdag', '2026-10-17',
    'eyebrow', '',
    'titel', 'Door omstandigheden is het kerkje komend weekend (17/18 oktober) gesloten.',
    'tekst', 'Geen expositie dus. Excuses voor het ongemak!',
    'knop', '',
    'link', null,
    'tot', '2026-10-18'
  ),
  toelichting = 'Banner onder de kop: sluiting of een vrij weekend'
where sleutel = 'vrijgekomen_weekend_banner'
  and coalesce(waarde->>'soort', 'weekend') <> 'tekst'
  and coalesce(waarde->>'zaterdag', '') = '2026-10-17';

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
        when coalesce(i.waarde->>'tot', '') ~ '^\d{4}-\d{2}-\d{2}$'
          and (timezone('Europe/Amsterdam', now()))::date > (i.waarde->>'tot')::date then null
        else jsonb_build_object(
          'soort', 'tekst',
          'eyebrow', btrim(coalesce(i.waarde->>'eyebrow', '')),
          'titel', btrim(coalesce(i.waarde->>'titel', '')),
          'tekst', btrim(coalesce(i.waarde->>'tekst', '')),
          'knop', btrim(coalesce(i.waarde->>'knop', '')),
          'link', btrim(coalesce(i.waarde->>'link', '')),
          'tot', case
            when coalesce(i.waarde->>'tot', '') ~ '^\d{4}-\d{2}-\d{2}$' then i.waarde->>'tot'
            else ''
          end
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
