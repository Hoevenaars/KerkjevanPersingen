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
deze map zodat we die in één keer kunnen toepassen zodra het project er is.

```bash
npx supabase init          # alleen als config.toml ontbreekt
npx supabase link --project-ref <project-id>
npx supabase db push
```

Super Admin (Nick) wordt daarna als eerste auth-user aangemaakt en in
`profielen.is_super_admin = true` gezet. Dat veld kan niet door andere
gebruikers worden beperkt.
