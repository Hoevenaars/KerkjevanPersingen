# Supabase — beheerplatform (nog niet live)

Dit is de databasestructuur voor `/beheer`. De publieke website leest en schrijft
nog **Sanity**. Niets hier is gekoppeld tot beide vlaggen bewust aan staan:

```text
CONTENT_BRON=supabase
ALLOW_SUPABASE_CONTENT=true
```

Zie `docs/beheer/ARCHITECTUUR.md`.

## Remote project

Supabase-project **Kerkje van Persingen**, ref `xskqpefeumylrticrphp`, regio
`eu-central-1`. API: `https://xskqpefeumylrticrphp.supabase.co`.

De kern (profielen, modules, rechten) en de rollen Hans, Nelleke en Paul staan
erin. De overige migraties in deze map zijn nog niet volledig toegepast. Fluweel
en Kopvast zijn andere projecten en horen hier niet bij.

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
