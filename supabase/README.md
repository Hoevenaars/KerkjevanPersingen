# Supabase — beheerplatform (nog niet live)

Dit is de databasestructuur voor `/beheer`. De publieke website leest en schrijft
nog **Sanity**. Niets hier is gekoppeld tot beide vlaggen bewust aan staan:

```text
CONTENT_BRON=supabase
ALLOW_SUPABASE_CONTENT=true
```

Zie `docs/beheer/ARCHITECTUUR.md`.

## Nog geen remote project

Er is nog geen Supabase-project "Kerkje van Persingen". Schema en seed staan in
deze map zodat we die in één keer kunnen toepassen zodra het project er is
(bewuste kostbevestiging). Tot die tijd: live-lezen in `/beheer` + dry-run
(`npm run migratie:dry-run`) ter voorbereiding van de import.

```bash
npx supabase init          # alleen als config.toml ontbreekt
npx supabase link --project-ref <project-id>
npx supabase db push
```

Daarna migraties pushen, inclusief `20260921120000_beheer_gebruikersaccounts.sql`.
Zet `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` en
`SUPER_ADMIN_EMAIL`. Die laatste wordt bij eerste login Super Admin. Nodig de
overige beheerders uit via `/beheer/instellingen/gebruikers/`. Het veld
`is_super_admin` kan niet door andere gebruikers worden gezet.
