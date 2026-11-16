-- Handmatige boeking door een bestuurder.
-- Een bewuste afwijking mag een tweede reservering vastleggen.
-- Bestaande opties en definitieve boekingen blijven elkaar uitsluiten.
-- Een bestaande rij wordt niet gewijzigd, geannuleerd of verwijderd.

alter table public.boekingen
  add column if not exists overlap_toegestaan boolean not null default false;

alter table public.boekingen drop constraint if exists boekingen_geen_dubbele_bezetting;
alter table public.boekingen
  add constraint boekingen_geen_dubbele_bezetting
  exclude using gist (daterange(start_datum, eind_datum, '[]') with &&)
  where (status in ('optie', 'definitief') and overlap_toegestaan = false);

alter table public.boekingen drop constraint if exists boekingen_een_actieve_optie;
alter table public.boekingen
  add constraint boekingen_een_actieve_optie
  exclude using gist (daterange(start_datum, eind_datum, '[]') with &&)
  where (status = 'optie' and overlap_toegestaan = false);

drop policy if exists interne_activiteiten_select_boekingen on public.interne_activiteiten;
create policy interne_activiteiten_select_boekingen on public.interne_activiteiten
  for select to authenticated
  using ((select app.heeft_recht('boekingen', 'lezen')));

drop policy if exists interne_activiteiten_insert_bestuur on public.interne_activiteiten;
create policy interne_activiteiten_insert_bestuur on public.interne_activiteiten
  for insert to authenticated
  with check ((select app.heeft_recht('instellingen', 'schrijven')));

drop policy if exists aanvragen_insert_bestuur on public.aanvragen;
create policy aanvragen_insert_bestuur on public.aanvragen
  for insert to authenticated
  with check ((select app.heeft_recht('instellingen', 'schrijven')));

drop policy if exists boekingen_insert_bestuur on public.boekingen;
create policy boekingen_insert_bestuur on public.boekingen
  for insert to authenticated
  with check ((select app.heeft_recht('instellingen', 'schrijven')));
