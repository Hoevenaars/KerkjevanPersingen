# Beheerplatform — architectuur

Leidende specificatie: **Functioneel Ontwerp v1.0**.

Supabase is de bron van de publieke website en van `/beheer`.

## Runtime

```text
PUBLIEKE WEBSITE  ──leest──────────────►  SUPABASE
/admin            ──verwijst───────────►  /beheer
/beheer           ──Supabase-login, tenzij BEHEER_ENABLED=false
```

## Opslag

```text
PUBLIEKE WEBSITE  ──alleen publieke data──►  SUPABASE
                                              ├── Database + RLS
                                              ├── Auth + rechten
                                              ├── Private bestanden
                                              └── Publieke afbeeldingen
                                                    ▲
/beheer  ───────────────────────────────────────────┘
```

| Variabele | Standaard | Effect |
| --- | --- | --- |
| `BEHEER_ENABLED` | (leeg) | `/beheer` is 404 op Production tot dit `true` is. Vercel Preview toont `/beheer` altijd. |
| `SUPABASE_URL` | project-URL | Login op `/beheer` via Supabase Auth. Geen gedeeld wachtwoord. |

Per datatype houdt tabel `bronnen` bij dat beheer de schrijvende bron is.

## Scheiding privé / publiek

| Object | Zichtbaar op website | Voorbeelden |
| --- | --- | --- |
| Boeking | nooit | huurder, tarief, notities, documenten |
| Publieke activiteit | alleen indien gepubliceerd | titel, omschrijving, foto, slug |
| Interne activiteit | nooit (hooguit "bezet") | schoonmaak, kerstsluiting |

## Rechten

Moduleniveaus: verborgen / lezen / schrijven. Geen starre rollen.
Super Admin (Nick) staat in `profielen.is_super_admin` en kan niet beperkt
worden. Schrijfrecht = domeinverantwoordelijkheid.

Export vrienden: alleen Super Admin (afgedwongen in `src/platform/rechten.ts`
én later in de UI).

## Communicatie

Echte verzending is uniek op `(boeking, template, relatie)`. Testmails hebben
`test = true` en tellen niet mee. Planning: `Europe/Amsterdam`.

## Bewust nog niet gebouwd

Geen contractgenerator, geen digitale handtekening, geen klantportaal, geen
bankkoppeling, geen facturatie, geen AI. Document-upload is wél voorbereid
(private bucket `booking-documents`).
