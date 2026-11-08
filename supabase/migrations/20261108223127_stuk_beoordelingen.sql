-- Minimale, niet-destructieve opslag voor de beoordeling van aangeleverde stukken.
-- Bestaande boekingen, betalingen, publicaties, contracten en importregels blijven onaangeroerd.
-- Een rij is een besluit. Wijzigen of verwijderen kan niet; een nieuw besluit is een nieuwe rij.
-- Goedkeuren publiceert niets, ondertekent niets, boekt geen betaling en verstuurt geen e-mail.
-- Deze migratie niet op productie toepassen zonder expliciet akkoord.

create table if not exists public.stuk_beoordelingen (
  id bigint generated always as identity primary key,
  boeking_id bigint not null references public.boekingen (id) on delete cascade,
  bron text not null,
  bron_id text not null,
  versie text not null,
  status text not null,
  reden text,
  beoordeeld_door uuid references public.profielen (id),
  beoordeeld_door_naam text not null,
  beoordeeld_op timestamptz not null default now(),
  constraint stuk_beoordeling_bron check (
    bron in ('aanvraag_foto', 'content_intake', 'document', 'aanvraag_tekst', 'activiteit_tekst', 'activiteit_foto')
  ),
  constraint stuk_beoordeling_status check (status in ('goedgekeurd', 'afgekeurd')),
  constraint stuk_beoordeling_reden check (
    (status = 'goedgekeurd' and coalesce(length(trim(reden)), 0) = 0)
    or (status = 'afgekeurd' and length(trim(reden)) between 1 and 500)
  ),
  constraint stuk_beoordeling_ids check (
    length(trim(bron_id)) between 1 and 200
    and length(trim(versie)) between 1 and 400
    and length(trim(beoordeeld_door_naam)) between 1 and 200
  )
);

create index if not exists stuk_beoordelingen_boeking_idx
  on public.stuk_beoordelingen (boeking_id, bron, bron_id, beoordeeld_op desc);

comment on table public.stuk_beoordelingen is
  'Append-only beoordeling van een aangeleverd stuk. Een andere versie maakt een eerdere goedkeuring ongeldig.';

alter table public.stuk_beoordelingen enable row level security;
revoke all on table public.stuk_beoordelingen from public, anon;
grant select, insert on table public.stuk_beoordelingen to authenticated;

drop policy if exists stuk_beoordelingen_lezen on public.stuk_beoordelingen;
create policy stuk_beoordelingen_lezen on public.stuk_beoordelingen
  for select to authenticated
  using ((select app.heeft_recht('boekingen', 'lezen')));

drop policy if exists stuk_beoordelingen_toevoegen on public.stuk_beoordelingen;
create policy stuk_beoordelingen_toevoegen on public.stuk_beoordelingen
  for insert to authenticated
  with check ((select app.heeft_recht('boekingen', 'schrijven')));

-- Geen update- of delete-policy: de geschiedenis blijft staan.
