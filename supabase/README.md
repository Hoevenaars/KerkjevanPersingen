# Supabase — beheerplatform

`/beheer` logt in via Supabase Auth. De publieke website leest en schrijft
nog **Sanity**. Content uit Supabase komt pas als beide vlaggen bewust aan staan:

```text
CONTENT_BRON=supabase
ALLOW_SUPABASE_CONTENT=true
```

Zie `docs/beheer/ARCHITECTUUR.md`.

## Remote project

Supabase-project **Kerkje van Persingen**, ref `xskqpefeumylrticrphp`, regio
`eu-central-1`. API: `https://xskqpefeumylrticrphp.supabase.co`.

`/beheer/login` gebruikt de publishable key. `SUPABASE_SERVICE_ROLE_KEY` blijft
in het Vercel-dashboard en is nodig om gebruikers uit te nodigen.

De kern (profielen, modules, rechten) staat erin. Rollen zijn een naam met een
rechtenmatrix (`beheer_rollen`), los van een account. Hans, Nelleke en Paul zijn
de start. De overige migraties in deze map zijn nog niet volledig toegepast.
Fluweel en Kopvast zijn andere projecten en horen hier niet bij.

Redirect-URL voor uitnodigingen en wachtwoordherstel, in Authentication → URL
Configuration:

```text
https://kerkjepersingen.nl/beheer/auth/callback
```

```bash
npx supabase link --project-ref xskqpefeumylrticrphp
npx supabase db push
```

Zet daarna op de host `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` en `SUPER_ADMIN_EMAIL`. Die laatste wordt bij de
eerste login Super Admin. Hans, Nelleke en Paul nodig je uit via
`/beheer/instellingen/gebruikers/` zodra hun e-mailadres bekend is. De rol zelf
richt je daar al in en bekijk je via het oogje, zonder iemand te koppelen. Het veld
`is_super_admin` kan niet door andere gebruikers worden gezet.
