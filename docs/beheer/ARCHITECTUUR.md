# Beheerplatform — architectuur (voorbereiding)

Leidende specificatie: **Functioneel Ontwerp v1.0**.

Dit document beschrijft wat er klaarstaat. Het beschrijft **niet** een live
cutover. De publieke website en Sanity blijven werken zoals nu.

## Huidige runtime

```text
PUBLIEKE WEBSITE  ──leest/schrijft──►  SANITY
/admin            ──redirect────────►  Sanity Studio
/beheer           ──404, tenzij BEHEER_ENABLED=true
```

Supabase is voorbereid (schema, RLS, seed) maar nog niet gekoppeld.

## Doelarchitectuur (ná gecontroleerde migratie)

```text
PUBLIEKE WEBSITE  ──alleen publieke data──►  SUPABASE
                                              ├── Database + RLS
                                              ├── Auth + rechten
                                              ├── Private bestanden
                                              └── Publieke afbeeldingen
                                                    ▲
/beheer  ───────────────────────────────────────────┘
```

## Dubbele slot op de website

`src/platform/bron.ts` leest twee vlaggen. Alleen als **beide** waar zijn, zou
de website Supabase mogen lezen. De website gebruikt deze functie nog nergens.

| Variabele | Standaard | Effect |
| --- | --- | --- |
| `CONTENT_BRON` | (leeg) | `supabase` alleen samen met de vlag hieronder |
| `ALLOW_SUPABASE_CONTENT` | (leeg) | moet `true` zijn |
| `BEHEER_ENABLED` | (leeg) | `/beheer` is 404 tot dit `true` is |

Per datatype houdt tabel `bronnen` bij wie mag schrijven. Seed: alles `sanity`.

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
