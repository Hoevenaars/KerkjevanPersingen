# Voorstel: beoordeling van een aangeleverd stuk

Status: **niet uitgevoerd**. Niet op productie toepassen zonder akkoord.
De nieuwe verhuuragenda toont de bestaande status en laat een stuk zien.
Zij heeft geen knop die goedkeuren of afkeuren opslaat.

## Wat er al is

- `publieke_activiteiten.inhoud_status` en `contentstatus` beschrijven de inhoud als geheel.
- `beheer_activiteit_mutatie` kan `contentstatus` zetten. Die functie gebruikt de service-role, bewaart geen reden, bindt het besluit niet aan `inhoud_versie`, en de audit-sleutel botst bij een tweede keer dezelfde status.
- `content_beoordelen` op het kernpad kan daarna een social-mediabericht starten. Een stuk goedkeuren mag geen publicatie, mail of betaling zijn.
- `documenten` en `content_intake_bestanden` hebben geen beoordelingsstatus. De documentbucket uit de eerste migratie ontbreekt in de audit van 8 november 2026.

## Wat ontbreekt

Een additieve tabel, één rij per stuk en per versie:

```sql
create table if not exists public.stuk_beoordelingen (
  id bigint generated always as identity primary key,
  boeking_id bigint not null references public.boekingen (id),
  stuk_type text not null check (stuk_type in ('inhoud', 'document', 'intake')),
  stuk_id text not null,
  versie integer not null check (versie > 0),
  status text not null check (status in ('goedgekeurd', 'afgekeurd')),
  reden text,
  beoordeeld_door uuid,
  beoordeeld_op timestamptz not null default now(),
  unique (stuk_type, stuk_id, versie)
);

alter table public.stuk_beoordelingen enable row level security;
revoke all on table public.stuk_beoordelingen from anon;
```

Een nieuwe versie krijgt een nieuwe rij. Een eerdere goedkeuring blijft staan en geldt niet meer voor de nieuwe versie.
Afkeuren bewaart een reden. De schrijfactie gaat via de ingelogde sessie, schrijft een auditregel, en wijzigt geen betaling, contract, publicatie of mail.

## Test buiten productie

1. Migratie op een lege of staging-database, niet op het project Kerkje van Persingen.
2. Goedkeuren, afkeuren met reden, en dezelfde versie een tweede keer.
3. Een hogere versie toont weer "Te beoordelen".
4. Controleren dat `betalingen`, `zichtbaarheid` en `communicatie_jobs` gelijk blijven.
