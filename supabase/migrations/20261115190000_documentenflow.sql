-- Documentenflow v1. Alleen nieuwe tabellen.
-- Bestaande aanvragen, boekingen, betalingen en mails worden niet gewijzigd.
-- Terugdraaien:
--   drop trigger if exists contractversies_bevries on public.contractversies;
--   drop trigger if exists contractversies_bestuur on public.contractversies;
--   drop table if exists public.contract_verzendingen;
--   drop table if exists public.contractversies;

create table if not exists public.contractversies (
  id bigint generated always as identity primary key,
  boeking_id bigint not null references public.boekingen (id) on delete restrict,
  versie integer not null,
  contractnummer text not null,
  opgesteld_op date not null,
  tekst text not null,
  voorwaarden_tekst text not null,
  huisregels_tekst text not null,
  plattegrond_tekst text not null,
  vingerafdruk text not null,
  afspraken jsonb not null default '{}'::jsonb,
  bestuur_verplicht boolean not null default true,
  bestuur text not null default 'open' check (bestuur in ('open', 'wacht', 'akkoord', 'terug')),
  bestuur_actor text,
  bestuur_op timestamptz,
  bestuur_toelichting text,
  ondertekening text not null default 'open' check (ondertekening in ('open', 'ontvangen')),
  ondertekening_actor text,
  ondertekening_op timestamptz,
  ondertekening_nummer text,
  ondertekening_versie integer,
  checks jsonb not null default '{}'::jsonb,
  unique (boeking_id, versie),
  unique (contractnummer)
);

create table if not exists public.contract_verzendingen (
  id bigint generated always as identity primary key,
  boeking_id bigint not null,
  versie integer not null,
  soort text not null check (soort in ('contract', 'proef', 'praktisch', 'promotie', 'bevestiging')),
  idempotentie text not null unique,
  ontvanger text not null,
  werkelijk text not null,
  status text not null check (status in ('bezig', 'verzonden', 'geweigerd')),
  bericht_id text,
  op timestamptz not null default now(),
  foreign key (boeking_id, versie) references public.contractversies (boeking_id, versie) on delete restrict
);

create unique index if not exists contract_een_echte_verzending
  on public.contract_verzendingen (boeking_id, versie)
  where soort = 'contract' and status in ('bezig', 'verzonden');

create unique index if not exists contract_een_praktische_mail
  on public.contract_verzendingen (boeking_id)
  where soort = 'praktisch' and status = 'verzonden';

create unique index if not exists contract_een_promotie_mail
  on public.contract_verzendingen (boeking_id)
  where soort = 'promotie' and status = 'verzonden';

create unique index if not exists contract_een_bevestiging
  on public.contract_verzendingen (boeking_id)
  where soort = 'bevestiging' and status = 'verzonden';

create or replace function public.contractversie_bevries()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.boeking_id is distinct from old.boeking_id
    or new.versie is distinct from old.versie
    or new.contractnummer is distinct from old.contractnummer
    or new.tekst is distinct from old.tekst
    or new.voorwaarden_tekst is distinct from old.voorwaarden_tekst
    or new.huisregels_tekst is distinct from old.huisregels_tekst
    or new.plattegrond_tekst is distinct from old.plattegrond_tekst
    or new.vingerafdruk is distinct from old.vingerafdruk
    or new.afspraken is distinct from old.afspraken
    or new.opgesteld_op is distinct from old.opgesteld_op
    or new.bestuur_verplicht is distinct from old.bestuur_verplicht
  then
    raise exception 'contractversie is bevroren';
  end if;
  return new;
end;
$$;

drop trigger if exists contractversies_bevries on public.contractversies;
create trigger contractversies_bevries
  before update on public.contractversies
  for each row execute function public.contractversie_bevries();

create or replace function public.contractversie_bewaak_bestuur()
returns trigger
language plpgsql
set search_path = public, app
as $$
begin
  if new.bestuur in ('akkoord', 'terug') and (
    new.bestuur is distinct from old.bestuur
    or new.bestuur_actor is distinct from old.bestuur_actor
    or new.bestuur_op is distinct from old.bestuur_op
  ) then
    if not app.heeft_recht('instellingen', 'schrijven') then
      raise exception 'bestuursakkoord vereist schrijfrecht op instellingen';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists contractversies_bestuur on public.contractversies;
create trigger contractversies_bestuur
  before update on public.contractversies
  for each row execute function public.contractversie_bewaak_bestuur();

alter table public.contractversies enable row level security;
alter table public.contract_verzendingen enable row level security;
revoke all on table public.contractversies from public, anon;
revoke all on table public.contract_verzendingen from public, anon;
grant select, insert, update on table public.contractversies to authenticated;
grant select, insert, update on table public.contract_verzendingen to authenticated;
grant usage, select on sequence public.contractversies_id_seq to authenticated;
grant usage, select on sequence public.contract_verzendingen_id_seq to authenticated;

drop policy if exists contractversies_select on public.contractversies;
create policy contractversies_select on public.contractversies
  for select to authenticated
  using ((select app.heeft_recht('boekingen', 'lezen')) or (select app.heeft_recht('aanvragen', 'lezen')));

drop policy if exists contractversies_insert on public.contractversies;
create policy contractversies_insert on public.contractversies
  for insert to authenticated
  with check ((select app.heeft_recht('boekingen', 'schrijven')) or (select app.heeft_recht('aanvragen', 'schrijven')));

drop policy if exists contractversies_update on public.contractversies;
create policy contractversies_update on public.contractversies
  for update to authenticated
  using ((select app.heeft_recht('boekingen', 'schrijven')) or (select app.heeft_recht('aanvragen', 'schrijven')))
  with check ((select app.heeft_recht('boekingen', 'schrijven')) or (select app.heeft_recht('aanvragen', 'schrijven')));

drop policy if exists contract_verzendingen_select on public.contract_verzendingen;
create policy contract_verzendingen_select on public.contract_verzendingen
  for select to authenticated
  using ((select app.heeft_recht('boekingen', 'lezen')) or (select app.heeft_recht('aanvragen', 'lezen')));

drop policy if exists contract_verzendingen_insert on public.contract_verzendingen;
create policy contract_verzendingen_insert on public.contract_verzendingen
  for insert to authenticated
  with check ((select app.heeft_recht('boekingen', 'schrijven')) or (select app.heeft_recht('aanvragen', 'schrijven')));

drop policy if exists contract_verzendingen_update on public.contract_verzendingen;
create policy contract_verzendingen_update on public.contract_verzendingen
  for update to authenticated
  using ((select app.heeft_recht('boekingen', 'schrijven')) or (select app.heeft_recht('aanvragen', 'schrijven')))
  with check ((select app.heeft_recht('boekingen', 'schrijven')) or (select app.heeft_recht('aanvragen', 'schrijven')));
