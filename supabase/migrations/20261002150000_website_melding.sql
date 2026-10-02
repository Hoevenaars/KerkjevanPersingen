-- Tijdelijke homepage-melding in de bestaande instellingen-tabel.
-- De publieke site leest alleen deze ene sleutel, via een smalle functie.
-- Anon heeft geen tabelrechten op instellingen.

insert into public.instellingen (sleutel, groep, waarde, toelichting)
values (
  'website_melding',
  'website',
  jsonb_build_object(
    'actief', true,
    'titel', 'LET OP: GEWIJZIGDE BEREIKBAARHEID VAN 5 T/M 30 OKTOBER',
    'tekst', E'Vanwege werkzaamheden is de N325 (Ubbergseweg) van 5 tot en met 30 oktober 2026 in beide richtingen afgesloten voor auto- en vrachtverkeer.\n\nHet Kerkje van Persingen blijft bereikbaar via de Hubertusweg.\n\nHoud tijdens uw bezoek rekening met een aangepaste aanrijroute.',
    'geldig_van', null,
    'geldig_tot', '2026-10-30'
  ),
  'Tijdelijke melding op de homepage'
)
on conflict (sleutel) do nothing;

create or replace function public.publieke_website_melding()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce((i.waarde->>'actief')::boolean, false) is not true then null
    when nullif(btrim(coalesce(i.waarde->>'titel', '')), '') is null
      and nullif(btrim(coalesce(i.waarde->>'tekst', '')), '') is null then null
    when nullif(i.waarde->>'geldig_van', '') is not null
      and (timezone('Europe/Amsterdam', now()))::date < (i.waarde->>'geldig_van')::date then null
    when nullif(i.waarde->>'geldig_tot', '') is not null
      and (timezone('Europe/Amsterdam', now()))::date > (i.waarde->>'geldig_tot')::date then null
    else jsonb_build_object(
      'titel', btrim(coalesce(i.waarde->>'titel', '')),
      'tekst', btrim(coalesce(i.waarde->>'tekst', ''))
    )
  end
  from public.instellingen i
  where i.sleutel = 'website_melding'
$$;

revoke all on function public.publieke_website_melding() from public;
grant execute on function public.publieke_website_melding() to anon, authenticated, service_role;
