-- Beoordeling van een aangeleverd stuk, één rij per onderdeel en per versie.
-- Een nieuwe versie krijgt een nieuwe rij. De eerdere beslissing blijft staan.
-- Versie 0 is de huidige aanlevering zolang een nieuwe upload de teller nog niet heeft verhoogd.
-- Deze tabel wijzigt geen publicatie, betaling, contract of mail.

create table if not exists public.stuk_beoordelingen (
  id bigint generated always as identity primary key,
  boeking_id bigint not null references public.boekingen (id),
  stuk_type text not null check (stuk_type in ('inhoud', 'document', 'intake')),
  stuk_id text not null check (char_length(stuk_id) between 1 and 400),
  versie integer not null check (versie >= 0),
  status text not null check (status in ('goedgekeurd', 'afgekeurd')),
  reden text,
  beoordelaar_naam text not null check (char_length(beoordelaar_naam) between 1 and 200),
  beoordeeld_door uuid not null,
  beoordeeld_op timestamptz not null default now(),
  unique (stuk_type, stuk_id, versie),
  constraint stuk_beoordelingen_reden_check check (
    (status = 'goedgekeurd' and (reden is null or btrim(reden) = ''))
    or (status = 'afgekeurd' and reden is not null and btrim(reden) <> '' and char_length(reden) <= 1000)
  )
);

create index if not exists stuk_beoordelingen_boeking_idx
  on public.stuk_beoordelingen (boeking_id);

alter table public.stuk_beoordelingen enable row level security;
revoke all on table public.stuk_beoordelingen from public, anon;
grant select, insert on table public.stuk_beoordelingen to authenticated;
grant usage, select on sequence public.stuk_beoordelingen_id_seq to authenticated;

drop policy if exists stuk_beoordelingen_lezen on public.stuk_beoordelingen;
create policy stuk_beoordelingen_lezen on public.stuk_beoordelingen
  for select to authenticated
  using (
    (select app.heeft_recht('boekingen', 'lezen'))
    or (select app.heeft_recht('agenda', 'lezen'))
  );

drop policy if exists stuk_beoordelingen_toevoegen on public.stuk_beoordelingen;
create policy stuk_beoordelingen_toevoegen on public.stuk_beoordelingen
  for insert to authenticated
  with check (
    beoordeeld_door = (select auth.uid())
    and (select app.heeft_recht('boekingen', 'schrijven'))
  );
