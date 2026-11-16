-- Contractbeheer mag een aanbetaling lezen en als ontvangen vastleggen.
-- Verwijderen blijft bij finance. De restbetaling en de boekingsstatus
-- veranderen hier niet.
-- Terugdraaien:
--   drop policy if exists betalingen_dossier_select on public.betalingen;
--   drop policy if exists betalingen_dossier_insert on public.betalingen;
--   drop policy if exists betalingen_dossier_update on public.betalingen;

drop policy if exists betalingen_dossier_select on public.betalingen;
create policy betalingen_dossier_select on public.betalingen
  for select to authenticated
  using (
    (select app.heeft_recht('aanvragen', 'schrijven'))
    or (select app.heeft_recht('boekingen', 'schrijven'))
  );

drop policy if exists betalingen_dossier_insert on public.betalingen;
create policy betalingen_dossier_insert on public.betalingen
  for insert to authenticated
  with check (
    (select app.heeft_recht('aanvragen', 'schrijven'))
    or (select app.heeft_recht('boekingen', 'schrijven'))
  );

drop policy if exists betalingen_dossier_update on public.betalingen;
create policy betalingen_dossier_update on public.betalingen
  for update to authenticated
  using (
    (select app.heeft_recht('aanvragen', 'schrijven'))
    or (select app.heeft_recht('boekingen', 'schrijven'))
  )
  with check (
    (select app.heeft_recht('aanvragen', 'schrijven'))
    or (select app.heeft_recht('boekingen', 'schrijven'))
  );
