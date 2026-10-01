-- Beheer leest activiteit_bron met de ingelogde sessie.
-- De tabel was alleen voor service_role bereikbaar, waardoor /beheer stopte
-- met permission denied. Anon blijft dicht. Schrijven blijft via de mutatie-functie.

grant select on table public.activiteit_bron to authenticated;

drop policy if exists activiteit_bron_select on public.activiteit_bron;
create policy activiteit_bron_select on public.activiteit_bron
  for select to authenticated
  using (
    (select app.heeft_recht('agenda', 'lezen'))
    or (select app.heeft_recht('kalender', 'lezen'))
    or (select app.heeft_recht('boekingen', 'lezen'))
  );
