# Voorstel: beoordeling van een aangeleverd stuk

Status: **uitgevoerd in de applicatie**. De migratie `20261115210000_stuk_beoordelingen.sql` moet op het project Kerkje van Persingen staan voordat de knoppen bewaren.
Goedkeuren en afkeuren schrijven één rij per onderdeel en per versie, met reden, beoordelaar en datum. De knop publiceert de website niet en verstuurt geen mail.

## Wat er al is

- `publieke_activiteiten.inhoud_status` en `contentstatus` beschrijven de inhoud als geheel.
- `beheer_activiteit_mutatie` kan `contentstatus` zetten. Die functie gebruikt de service-role, bewaart geen reden, bindt het besluit niet aan `inhoud_versie`, en de audit-sleutel botst bij een tweede keer dezelfde status.
- `content_beoordelen` op het kernpad kan daarna een social-mediabericht starten. Een stuk goedkeuren mag geen publicatie, mail of betaling zijn.
- `documenten` en `content_intake_bestanden` hebben geen beoordelingsstatus. De documentbucket uit de eerste migratie ontbreekt in de audit van 8 november 2026.

## Opslag

De tabel staat in `supabase/migrations/20261115210000_stuk_beoordelingen.sql`. Eén rij per stuk en per versie. Versie 0 is de huidige aanlevering zolang een nieuwe upload de teller nog niet heeft verhoogd. Afkeuren bewaart een reden. De naam van de beoordelaar staat op de rij, omdat de auditlog niet voor elke beheerder leesbaar is.

Een nieuwe versie krijgt een nieuwe rij. Een eerdere goedkeuring blijft staan en geldt niet meer voor de nieuwe versie. De schrijfactie gaat via de ingelogde sessie, schrijft een auditregel, en wijzigt geen betaling, contract, publicatie of mail.

## Test

1. Migratie op het project Kerkje van Persingen.
2. Goedkeuren, afkeuren met reden, en dezelfde versie een tweede keer.
3. Een hogere versie toont weer "Te beoordelen".
4. Controleren dat `betalingen`, `zichtbaarheid` en `communicatie_jobs` gelijk blijven.
