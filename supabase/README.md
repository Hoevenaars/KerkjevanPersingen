# Supabase — beheerplatform

`/beheer` logt in via Supabase Auth. De publieke website leest en schrijft
nog **Sanity**. Content uit Supabase komt pas als beide vlaggen bewust aan staan:

```text
CONTENT_BRON=supabase
ALLOW_SUPABASE_CONTENT=true
```

Zie `docs/beheer/ARCHITECTUUR.md`.

## Remote project

Project **Kerkje van Persingen** (`xskqpefeumylrticrphp`, eu-central-1).
`/beheer/login` gebruikt de publishable key. `SUPABASE_SERVICE_ROLE_KEY` blijft
in het Vercel-dashboard en is nodig om gebruikers uit te nodigen.

Redirect-URL voor uitnodigingen en wachtwoordherstel, in Authentication → URL
Configuration:

```text
https://kerkjepersingen.nl/beheer/auth/callback
```

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
