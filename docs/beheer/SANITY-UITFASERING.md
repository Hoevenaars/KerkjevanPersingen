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

Zes rijen (id 1 tot en met 6) hebben een `raw_sanity`-object. De sleutels zijn `_id`, `contentStatus`, `eind`, `interneTitel`, `kunstenaars`, `omschrijving`, `publiekeTitel`, `slug`, `soort`, `start` en `toonVanafMaanden`. Geen van die zes bevat `cdn.sanity.io`. De objecten zijn 330 tot 457 bytes. Ze zijn niet gewist en niet herschreven.

`activiteit_bron` (24), `nieuwsbrieven` (7) en `instellingen` (14) bevatten geen `cdn.sanity.io`. `sanity_bridge_agenda` en `bridge_sync_log` zijn leeg.

`mediabestanden` heeft 16 rijen met een Sanity-CDN-adres. Alle zestien hebben `runtime_gebruikt = false` en `migratiestatus = overgeslagen_geen_koppeling`. De applicatie leest die tabel niet. De rijen zelf zijn niet gewijzigd.

Die zestien bestanden staan nu ook in de privébucket `sanity-archief`, pad `ongekoppeld/{id}/{oorspronkelijke-bestandsnaam}`, plus `herkomst.json` met id, naam, bron `cdn.sanity.io`, project `8le5jso9`, dataset `production`, sha256 en bytegrootte. Na upload is elk bestand teruggelezen: dezelfde sha256 en dezelfde lengte. JPEG- en PNG-bestanden hebben een geldige bestandskop. Twee CDN-namen eindigen op `.webp` en `.avif` (id 12 en 13); de bytes zelf zijn JPEG, 420×595 en 500×653. De bucket is niet publiek. De tijdelijke lees- en schrijfrechten voor anonieme uploads zijn daarna verwijderd. Een anonieme lezing krijgt geen bestand. Er staan 16 beelden en 16 herkomstbestanden, geen losse kopieën.

Een live dataset-export uit Sanity zelf kon niet. In deze omgeving ontbreken `SANITY_API_TOKEN`, `SANITY_AUTH_TOKEN` en `SANITY_PROJECT_ID`. De handmatige export, door iemand met toegang tot het Sanity-project `8le5jso9`:

1. Log in op [sanity.io/manage](https://www.sanity.io/manage) bij het project `8le5jso9`, dataset `production`.
2. Exporteer het dataset, of lokaal: `npx sanity@latest login` en daarna `npx sanity@latest dataset export production ./production.tar.gz --project 8le5jso9`.
3. Bewaar het archief buiten de repository. De site leest het niet.
4. Het oude GitHub-secret `SANITY_AUTH_TOKEN` kan die export nog mogelijk maken. De waarde is hier niet gelezen. Na de export mag dat secret weg, samen met de andere `SANITY_*`-variabelen.

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

Automatiseringen zijn niet aangezet. Er is geen mail, betaling of refund gestart. `VERHUUR_OVERZICHT` staat niet in `vercel.json` en is niet gezet.

## Tests

In de bron staan op `main` 535 regels met `test(` en op deze branch 534. Het enige verwijderde testbestand is `tests/rollen.test.ts`: vier controles van de Studio-rol `isWebmaster`. Die functie zat in `sanity/lib/rollen.ts` en is met de Studio weg. De beheerrollen blijven gedekt door `tests/platform-rollen.test.ts`. Daar zijn drie controles voor het ontbreken van Sanity voor in de plaats gekomen (`tests/sanity-verwijderd.test.ts`).

De suite telt meer subtests dan `test(`-regels, omdat sommige tests in een lus zitten. Eén bestaande test, `sql-migraties en mutatie-rpc`, start niet: er is lokaal geen Postgres-gebruiker `postgres` en geen database `kerkje_test`. Die test bestond al vóór deze uitfasering en raakt productie niet. Er zijn geen zestien verdwenen producttesten.

## Webhook

Op deze branch leest `/api/bridge/sanity` de body niet en roept `pas_sanity_bridge` niet aan. Het antwoord is 410. In `src/` komt `pas_sanity_bridge` niet meer voor. De functie en de tabellen `sanity_bridge_agenda` en `bridge_sync_log` blijven in de database tot een aparte opruiming is goedgekeurd.

De live site draait deze branch nog niet. Tot de deploy kan een webhook op de oude productiecode nog schrijven. Na de deploy krijgt diezelfde URL 410 en wijzigt geen rij.

## Release, pas na akkoord

1. Back-up: de zestien archiefbestanden staan in `sanity-archief` en zijn op sha256 gecontroleerd. De zes `raw_sanity`-objecten staan ongewijzigd in `publieke_activiteiten`. Een volledige Sanity-dataset-export is de handmatige stap hierboven.
2. Preview: deploy deze branch als Vercel Preview, niet als Production. Zet `VERHUUR_OVERZICHT` niet aan.
3. Publiek: homepage, `/agenda/`, een agendaslug, `/verhuur/` en `/verhuur/aanvragen/`. Geen verzoek naar `cdn.sanity.io` of `sanity.studio`.
4. Beheer: `/beheer/` vraagt om login. `/admin` legt uit dat Studio weg is. `/beheer/instellingen/sanity-bridge/` heeft geen synchronisatieknop.
5. Verhuur: een bestaande boeking openen, de kalender van juli 2027 bekijken. 8 en 9 mei 2027 blijven vrij, 10 en 11 juli 2027 blijven de vastgelegde en de geannuleerde boeking. Niets opslaan.
6. Publicatie: `/beheer/publiceren/` opent. Geen publicatie klikken in de previewcontrole, tenzij het een bewust testdocument is.
7. Rollback: de vorige Production-deployment in Vercel terugzetten. De database hoeft niet terug, omdat deze release geen boeking, betaling, activiteit of relatie wijzigt. De bucket `sanity-archief` mag blijven staan.
8. Deploy naar Production alleen na expliciet akkoord.
9. Na deploy: dezelfde publieke URL’s, een webhook-POST verwacht 410, en de agenda toont dezelfde slugs.

## Definitieve verwijdering, nog niet uitvoeren

- [ ] Vercel: verwijder `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SANITY_API_TOKEN`, `SANITY_BRIDGE_SECRET`, `SANITY_STUDIO_PROJECT_ID` en `SANITY_AUTH_TOKEN` als ze er staan.
- [ ] GitHub: verwijder de secrets `SANITY_AUTH_TOKEN` en `SANITY_PROJECT_ID` nadat de dataset-export binnen is.
- [ ] Sanity manage: verwijder de webhook die naar `/api/bridge/sanity` wijst.
- [ ] Sanity manage: verwijder dataset `production` en daarna project `8le5jso9`.
- [ ] Sanity-facturatie: zeg het abonnement op en controleer de eerstvolgende factuur op nul.
- [ ] Pas deze lijst afvinken na de productiecontrole hierboven. Niet eerder.
