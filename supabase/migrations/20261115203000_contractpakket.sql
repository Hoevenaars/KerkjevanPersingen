-- Contractpakket: tekenlink, bijlagenmanifest en provideracceptatie.
-- Bestaande aanvragen, boekingen en al verzonden mails worden niet gewijzigd.
-- Terugdraaien:
--   drop table if exists public.contract_tekeningen;
--   alter table public.contract_verzendingen drop column if exists bijlagen;
--   alter table public.contract_verzendingen drop column if exists provider_status;
--   alter table public.contract_verzendingen drop column if exists afgeleverd_op;

alter table public.contract_verzendingen
  add column if not exists bijlagen jsonb not null default '[]'::jsonb,
  add column if not exists provider_status text,
  add column if not exists afgeleverd_op timestamptz;

alter table public.contract_verzendingen drop constraint if exists contract_verzendingen_soort_check;
alter table public.contract_verzendingen
  add constraint contract_verzendingen_soort_check
  check (soort in ('contract', 'proef', 'praktisch', 'promotie', 'bevestiging', 'herhaling'));

alter table public.contract_verzendingen drop constraint if exists contract_verzendingen_provider_status_check;
alter table public.contract_verzendingen
  add constraint contract_verzendingen_provider_status_check
  check (provider_status is null or provider_status = 'geaccepteerd');

create table if not exists public.contract_tekeningen (
  id bigint generated always as identity primary key,
  boeking_id bigint not null,
  versie integer not null,
  token_hash text not null unique,
  verloopt_op timestamptz not null,
  code_hash text,
  code_verloopt timestamptz,
  pogingen integer not null default 0,
  geverifieerd_op timestamptz,
  ondertekend_op timestamptz,
  naam text,
  email text not null,
  vrijgegeven boolean not null default false,
  document_hash text,
  pdf_pad text,
  bevestiging_id text,
  audit jsonb not null default '{}'::jsonb,
  foreign key (boeking_id, versie) references public.contractversies (boeking_id, versie) on delete restrict,
  unique (boeking_id, versie)
);

alter table public.contract_tekeningen enable row level security;
revoke all on table public.contract_tekeningen from public, anon;
grant select, insert, update on table public.contract_tekeningen to authenticated;
grant usage, select on sequence public.contract_tekeningen_id_seq to authenticated;

drop policy if exists contract_tekeningen_select on public.contract_tekeningen;
create policy contract_tekeningen_select on public.contract_tekeningen
  for select to authenticated
  using ((select app.heeft_recht('boekingen', 'lezen')) or (select app.heeft_recht('aanvragen', 'lezen')));

drop policy if exists contract_tekeningen_insert on public.contract_tekeningen;
create policy contract_tekeningen_insert on public.contract_tekeningen
  for insert to authenticated
  with check ((select app.heeft_recht('boekingen', 'schrijven')) or (select app.heeft_recht('aanvragen', 'schrijven')));

drop policy if exists contract_tekeningen_update on public.contract_tekeningen;
create policy contract_tekeningen_update on public.contract_tekeningen
  for update to authenticated
  using ((select app.heeft_recht('boekingen', 'schrijven')) or (select app.heeft_recht('aanvragen', 'schrijven')))
  with check ((select app.heeft_recht('boekingen', 'schrijven')) or (select app.heeft_recht('aanvragen', 'schrijven')));

drop policy if exists documenten_aanvragen_schrijven on public.documenten;
create policy documenten_aanvragen_schrijven on public.documenten
  for all to authenticated
  using ((select app.heeft_recht('aanvragen', 'schrijven')))
  with check ((select app.heeft_recht('aanvragen', 'schrijven')));

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    execute $policy$
      drop policy if exists booking_documents_aanvragen_insert on storage.objects;
      create policy booking_documents_aanvragen_insert on storage.objects
        for insert to authenticated
        with check (bucket_id = 'booking-documents' and (select app.heeft_recht('aanvragen', 'schrijven')));
      drop policy if exists booking_documents_aanvragen_update on storage.objects;
      create policy booking_documents_aanvragen_update on storage.objects
        for update to authenticated
        using (bucket_id = 'booking-documents' and (select app.heeft_recht('aanvragen', 'schrijven')))
        with check (bucket_id = 'booking-documents' and (select app.heeft_recht('aanvragen', 'schrijven')));
      drop policy if exists booking_documents_aanvragen_select on storage.objects;
      create policy booking_documents_aanvragen_select on storage.objects
        for select to authenticated
        using (bucket_id = 'booking-documents' and (select app.heeft_recht('aanvragen', 'lezen')));
    $policy$;
  end if;
end $$;
