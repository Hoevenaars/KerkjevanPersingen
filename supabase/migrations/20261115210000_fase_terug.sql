-- Een fase terug: een ingetrokken contract telt niet meer als verzonden.
-- Het bestand en de verzending blijven staan. Er gaat geen mail uit.
-- Terugdraaien:
--   alter table public.documenten drop column if exists ingetrokken_op;
--   drop policy if exists verzendingen_update_dossier on public.communicatie_verzendingen;
--   drop policy if exists jobs_update_aanvraag on public.communicatie_jobs;

alter table public.documenten
  add column if not exists ingetrokken_op timestamptz;

comment on column public.documenten.ingetrokken_op is
  'Gezet bij een fase terug. Het bestand blijft, maar telt niet meer als verzonden of ondertekend contract.';

do $$
declare
  naam text;
begin
  for naam in
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
    execute format('alter table public.contract_verzendingen drop constraint %I', naam);
  end loop;
end $$;

alter table public.contract_verzendingen
  drop constraint if exists contract_verzendingen_status_check;

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
