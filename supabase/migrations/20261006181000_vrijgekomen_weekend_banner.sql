-- Banner voor een vrij expositieweekend, te zetten via Beheer → Publiceren.
-- De publieke site leest alleen deze ene sleutel, via een smalle functie.
-- Anon heeft geen tabelrechten op instellingen.
-- 17 en 18 oktober 2026 is de huidige banner; Beheer kan hem daarna vervangen.

insert into public.instellingen (sleutel, groep, waarde, toelichting)
values (
  'vrijgekomen_weekend_banner',
  'website',
  jsonb_build_object(
    'actief', true,
    'zaterdag', '2026-10-17'
  ),
  'Banner voor een vrij expositieweekend'
)
on conflict (sleutel) do nothing;

create or replace function public.publieke_vrijgekomen_weekend_banner()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce((i.waarde->>'actief')::boolean, false) is not true then null
    when coalesce(i.waarde->>'zaterdag', '') !~ '^\d{4}-\d{2}-\d{2}$' then null
    when extract(dow from (i.waarde->>'zaterdag')::date) <> 6 then null
    when (timezone('Europe/Amsterdam', now()))::date > ((i.waarde->>'zaterdag')::date + 1) then null
    else jsonb_build_object(
      'zaterdag', i.waarde->>'zaterdag',
      'zondag', to_char((i.waarde->>'zaterdag')::date + 1, 'YYYY-MM-DD')
    )
  end
  from public.instellingen i
  where i.sleutel = 'vrijgekomen_weekend_banner'
$$;

revoke all on function public.publieke_vrijgekomen_weekend_banner() from public;
grant execute on function public.publieke_vrijgekomen_weekend_banner() to anon, authenticated, service_role;
