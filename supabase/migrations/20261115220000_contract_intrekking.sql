-- Een ongetekend contract kan één fase terug.
-- De versie blijft bevroren. De verzending telt daarna niet meer als verzonden.
-- Terugdraaien:
--   drop policy if exists verzendingen_update_dossier on public.communicatie_verzendingen;
--   drop policy if exists jobs_update_aanvraag on public.communicatie_jobs;
--   update public.contract_verzendingen set status = 'verzonden' where status = 'ingetrokken';
--   alter table public.contract_verzendingen drop constraint if exists contract_verzendingen_status_check;
--   alter table public.contract_verzendingen
--     add constraint contract_verzendingen_status_check
--     check (status in ('bezig', 'verzonden', 'geweigerd'));

do $$
declare
  beperking record;
begin
  for beperking in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'contract_verzendingen'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
      and pg_get_constraintdef(con.oid) not ilike '%provider_status%'
  loop
    execute format('alter table public.contract_verzendingen drop constraint %I', beperking.conname);
  end loop;
end $$;

alter table public.contract_verzendingen
  add constraint contract_verzendingen_status_check
  check (status in ('bezig', 'verzonden', 'geweigerd', 'ingetrokken'));

drop policy if exists verzendingen_update_dossier on public.communicatie_verzendingen;
create policy verzendingen_update_dossier on public.communicatie_verzendingen
  for update to authenticated
  using (
    (select app.heeft_recht('aanvragen', 'schrijven'))
    or (select app.heeft_recht('boekingen', 'schrijven'))
  )
  with check (
    (select app.heeft_recht('aanvragen', 'schrijven'))
    or (select app.heeft_recht('boekingen', 'schrijven'))
  );

drop policy if exists jobs_update_aanvraag on public.communicatie_jobs;
create policy jobs_update_aanvraag on public.communicatie_jobs
  for update to authenticated
  using ((select app.heeft_recht('aanvragen', 'schrijven')))
  with check ((select app.heeft_recht('aanvragen', 'schrijven')));
