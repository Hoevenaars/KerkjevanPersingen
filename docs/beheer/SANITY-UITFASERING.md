# Verificatie: applicatie zonder Sanity

Gecontroleerd op 8 november 2026 (Europe/Rome). Er is niets uit Supabase verwijderd. Bestaande boekingen, betalingen, activiteiten en relaties zijn niet gewijzigd. Er is niet gedeployed. Het Sanity-project en het abonnement zijn niet opgezegd. Dat wacht op een aparte vrijgave.

## Wat de data laat zien

Alle 18 rijen in `publieke_activiteiten` zijn gelezen. Geen enkele `foto_pad`, extra afbeelding of tekst bevat `cdn.sanity.io`.

| id | slug | foto |
| --- | --- | --- |
| 1 | geen | leeg |
| 2 | expositie-anja-peters-icm-lisa-peters | leeg |
| 3 | expositie-isabelle-hartman | leeg |
| 4 | expositie-leon-swinkels-icm-j-haverkate-f-timmermans-r-hendriks-j-van-swelm | leeg |
| 5 | expositie-trinette-korver | leeg |
| 6 | geen | leeg |
| 8 | second-nature | `/foto/exposities/second-nature.jpg` |
| 11 | martina-vieten | Supabase `public-media` |
| 12 | marie-jose-lieferink | leeg |
| 13 | ben-wasser | leeg |
| 14 | floris-udink-ten-cate | leeg |
| 15 | petra-crielaard-en-marjon-meulenbrugge | leeg |
| 16 | expositie-wybe-de-greef | leeg |
| 17 | expositie-nick-cillessen | leeg |
| 18 | expositie-elin-bennaars | leeg |
| 19 | expositie-ilse-aarsman | leeg |
| 20 | hans-peters-ineke-christiaans-en-willem-meulenbeld | Supabase `public-media` |
| 21 | geen | leeg |

Zes van die rijen hebben een `raw_sanity`-kopie in de rij zelf. Die kopie is blijven staan. Wissen zou de activiteit wijzigen.

`activiteit_bron` (24), `nieuwsbrieven` (7) en `instellingen` (14) bevatten geen `cdn.sanity.io`. `sanity_bridge_agenda` en `bridge_sync_log` zijn leeg.

`mediabestanden` heeft 16 rijen met een Sanity-CDN-adres. Alle zestien hebben `runtime_gebruikt = false` en `migratiestatus = overgeslagen_geen_koppeling`. De applicatie leest die tabel niet. De beelden zijn lokaal gedownload als back-up, 16 bestanden, allemaal met status ok. Ze zijn niet naar Supabase-storage geschreven, omdat geen activiteit ernaar wijst en een nieuwe storage-rij de site niet verandert.

Een live dataset-export uit Sanity zelf kon niet. `SANITY_API_TOKEN` staat niet in deze omgeving. De publieke site gebruikt die dataset niet.

## Wat uit de applicatie is

- npm-pakketten `sanity`, `@sanity/client`, `@sanity/image-url`, en de alleen daarvoor gebruikte `react` en `react-dom`.
- Studio (`sanity/`, `sanity.config.ts`, `sanity.cli.ts`) en de deploy-workflow.
- De webhook `/api/bridge/sanity` antwoordt 410 en schrijft niets.
- `/admin` verwijst niet meer naar `kerkje-van-persingen.sanity.studio`.
- Het bruggenscherm leest Sanity niet en heeft geen synchronisatieknop.
- `publiekeFotoUrl` maakt geen Sanity-beeld-URL meer. Een http- of sitepad blijft werken.
- `cdn.sanity.io` staat niet meer in het beeldbeleid van `vercel.json`.

De databasefunctie `pas_sanity_bridge` en de bridgetabellen zijn blijven staan. Verwijderen daarvan is een schemawijziging. De applicatie roept ze niet meer aan.

## Wat de tests deden

Publieke agenda, bezetting en slug lezen Supabase. De veertien oude Sanity-schrijffuncties gooien een fout en doen geen request. `npm test`: 538 geslaagd. Twee uitval: de lokale Postgres-gebruiker ontbreekt, en de Studio-roltest is verwijderd omdat `sanity/lib/rollen.ts` niet meer bestaat. De beheerrollen blijven in `src/platform/rollen.ts`.

## Wat nog buiten de repository staat

| Onderdeel | Stand |
| --- | --- |
| Vercel-variabelen `SANITY_*` | Niet vanuit hier gewist. Ze hebben geen code meer die ze leest. Weghalen in het dashboard hoort bij de vrijgave, niet bij een deploy. |
| Webhook in het Sanity-project | Niet zichtbaar zonder token. Een aanroep krijgt 410 en wijzigt geen rij. |
| Sanity-project en abonnement | Niet verwijderd. Dat is onomkeerbaar en wacht op expliciete vrijgave. |
| Productie | Deze code is niet gedeployed. Tot die deploy draait de live site nog met de oude bundel, die Sanity al niet als leesbron gebruikt. |

Automatiseringen zijn niet aangezet. Er is geen mail, betaling of refund gestart.
