# Aanvulling: websitecontentbeheer

Onderzoek op 8 november 2026 (Europe/Rome), tegen de code op `main` plus het verhuuroverzicht achter `VERHUUR_OVERZICHT`. Geen contentproces is vervangen, Sanity is niet uitgezet, en er is geen schrijfscherm omgezet.

Dit rapport vult `docs/beheer/AUDIT-2026-11-08.md` aan. Die audit staat op de onderzoeksbranch. De tellingen hieronder komen uit die lezing van dezelfde dag: 18 publieke activiteiten, 7 nieuwsbrieven, 2 vrienden, 16 mediabestanden, 0 nieuwsbriefverzendingen. De nieuwsbriefschakelaar stond uit.

Een functie die hier niet staat, is in de repository niet aangetroffen. Die is niet bijgebouwd.

## 1. Wat er wel en niet is

| Onderdeel | Status | Waar het echt zit |
| --- | --- | --- |
| Homepage-tekst en hero | Vast in code | `src/pages/index.astro`. De blokken “vandaag / volgende / daarna” komen uit de agenda. |
| Overige websitepagina’s | Vast in code | `het-kerkje`, `geschiedenis`, `omgeving`, `contact`, `organisatie`, `steun-ons`, `privacyverklaring`, `verhuur`, `verhuur/voorwaarden`. Geen CMS-velden. |
| Nieuwsberichten | Niet aangetroffen | Geen tabel, geen schema, geen scherm. “Kort nieuws” is een veld van de nieuwsbrief, geen nieuwspagina. |
| Nieuwsbrief | Gebouwd, verzenden vanuit beheer geblokkeerd | Supabase `nieuwsbrieven` en `vrienden`. Scherm `/beheer/nieuwsbrief/`. Opslaan en verzenden wijst de pagina af (`nieuwsbrief/[id].astro` regel 13–16). De cron kan wel verzenden als de schakelaar aan staat. Die staat uit. |
| Exposities en exposanten | Gebouwd als activiteit, niet als aparte soort content | Soort `expositie` op een activiteit. Exposanten zijn tekst op de activiteit (`exposanten`), plus `mede_exposanten` op de boeking. Geen exposantenpagina. |
| Concerten en overige activiteiten | Zelfde activiteit | Soorten onder meer expositie, bruiloft, concert, viering, diverse. Eén tabel `publieke_activiteiten`. |
| Foto’s | Drie verschillende plekken | Publicatiefoto in bucket `public-media`. Vaste sitefoto’s in `public/foto/`. Eén expositie, Second Nature, forceert een lokale poster (`src/lib/second-nature.ts`). |
| Teksten van een activiteit | Gebouwd | Titel, korte en volledige omschrijving, praktische informatie, exposanten. |
| Agenda op de site | Gebouwd | `/agenda` en `/agenda/[slug]`, via RPC `publieke_agenda` en `publieke_activiteit_op_slug`. |
| SEO van activiteiten | Deels | Slug en paginatitel komen uit de activiteit. De meta-beschrijving van vaste pagina’s staat in de Astro-bestanden. Er is geen scherm voor titel-template of Open Graph per pagina. |
| Concept en publiceren | Gebouwd | `/beheer/publiceren/` en `/beheer/agenda/[id]/`. Zichtbaarheid `verborgen`, `bezet` of `publiek`. |
| Publicatiemoment | Gebouwd als trigger, geen losse publicatiedatum | `publicatie_trigger`: direct, of pas een aantal maanden voor de start. Geen kalenderdatum “publiceer op 12 maart”. |
| Navigatie en footer | Vast in code | `src/components/Header.astro` en `Footer.astro`. Facebook-adressen staan daar en in `src/lib/seo.ts`, niet in de database. |
| Homepage-melding | Gebouwd | `/beheer/instellingen/meldingen/`, sleutel `website_melding` in `instellingen`. |
| Vrijgekomen-weekendbanner | Gebouwd | `/beheer/publiceren/`, schrijft een instelling. |
| Vriendenlijst | Gebouwd, toevoegen in het scherm uit | `/beheer/vrienden/`. Aanmelden gaat via `/vrienden/aanmelden/`. |

## 2. Per contenttype

### Activiteit (expositie, concert, overige)

1. Opgeslagen in `publieke_activiteiten`. Oudere of bridgerijen kunnen ook in `activiteit_bron` staan. De beheerleeslaag voegt die samen in `snapshot.agenda` (`src/platform/beheer-supabase-lees.ts`).
2. De publieke site leest Supabase zolang `CONTENT_BRON=supabase` en `ALLOW_SUPABASE_CONTENT=true`. Dat staat in `vercel.json`. `src/lib/sanity.ts` is dan een façade naar `src/lib/publiek-lezen.ts`.
3. Bewerken: `/beheer/agenda/[id]/` en de werklijst `/beheer/publiceren/`.
4. Opslaan gaat via `voerActiviteitActie` en `voerPublicatie` naar Supabase (`src/lib/activiteit-schrijf.ts`). Niet terug naar Sanity.
5. Publiceren zet zichtbaarheid op `publiek` en de trigger op `direct` (`HANDMATIGE_PUBLICATIE_TRIGGER` in `src/platform/publiceren.ts`). “Toch publiceren” bestaat als de tekstchecks niet groen zijn. Verbergen zet de activiteit van de site. Een concept zonder record krijgt zichtbaarheid `verborgen` en blokkeert de verhuurkalender niet.
6. Foto-upload op publiceren schrijft naar `public-media` (`src/lib/publicatie-foto.ts`). De site toont het pad. Een http- of sitepad gaat niet langs de Sanity-CDN (`directeFotoUrl` in `src/lib/agenda-zichtbaarheid.ts`). Ontbreekt de foto, dan valt de site terug op `/foto/geen-foto.jpg` of het standaardbeeld.
7. Automatisch: de trigger “uiterlijk N maanden” toont de activiteit pas als dat moment bereikt is (`timingBereikt`). Er is geen cron die op een klokdatum publiceert. Goedkeuren van content kan een social-mediaconcept starten (`agenda/[id].astro` regel 69–74). Die schakelaar `social_media_content` stond uit.
8. De route `/beheer/agenda` en `/beheer/publiceren` horen bij module `agenda` (`src/platform/autorisatie.ts`). Schrijven vereist schrijfrecht. De publieke RPC’s zijn `SECURITY DEFINER` en geven alleen de publieke velden.
9. Behouden: zichtbaarheid, levenscyclus, trigger, slug, koppeling `boeking_id`, lokale override tegen een latere Sanity-brug, en de regel dat een boeking niet vanzelf een pagina is.
10. Om Sanity uit te zetten ontbreekt geen tweede activiteiten-CMS. Wel: controleren of geen `foto_pad` nog naar `cdn.sanity.io` wijst, de webhook uit, en de hardcoded Second Nature-uitzondering bewust houden of in de activiteit zetten.

Een bevestigde boeking en een publieke activiteit zijn twee dingen. `publieke_bezetting()` zet een boeking met status optie, definitief, migratie_vastgelegd of optie_verlopen op bezet, zonder titel op de site. Op de agenda komt alleen een activiteit met zichtbaarheid `publiek`, niet geannuleerd, en waarvan de trigger niet `niet_publiceren` is (`hoortOpPubliekeAgenda`, `src/lib/agenda-zichtbaarheid.ts` regel 125–131). Ontbrekende tekst blokkeert die poort niet.

### Vaste pagina’s, menu, footer, SEO

1. Opgeslagen in de Astro-bron. Niet in Supabase en niet in Sanity.
2. De site leest die bestanden bij elke build.
3. Er is geen beheerscherm. Wijzigen is een codewijziging.
4. Nergens in de database.
5. Publiceren is een deploy.
6. Foto’s liggen in `public/foto/`.
7. Geen.
8. De pagina’s zijn openbaar. Beheer heeft er geen rol op.
9. URL’s in `src/pages/sitemap.xml.ts` (de vaste lijst plus agendaslugs). Canonieke URL en JSON-LD in `src/lib/seo.ts`.
10. Dit hoeft niet uit Sanity te komen, want het zit er niet. Een beheerder kan deze teksten nu niet zelf wijzigen. Dat is een gat ten opzichte van een volledig CMS, geen Sanity-rest.

### Nieuwsbrief en vrienden

1. `nieuwsbrieven` (week, kort nieuws, donatie-update, overgeslagen, verstuurd) en `vrienden`.
2. Lezen in beheer komt uit Supabase. De donderdag- en vrijdagcron gebruiken `src/lib/nieuwsbrief.ts` en `nieuwsbrief-supabase.ts`, niet Sanity, zolang de contentvlaggen aan staan.
3. `/beheer/nieuwsbrief/` en `/beheer/nieuwsbrief/[id]/` tonen de week en een HTML-voorbeeld. `/beheer/vrienden/` toont de lijst. Exporteren mag alleen de super-admin.
4. Bewaren vanuit het nieuwsscherm is geblokkeerd. De cron schrijft verzendingen als hij echt verstuurt. Die tabel had 0 rijen.
5. Er is geen “publiceer op de site”. De nieuwsbrief is e-mail. De site heeft geen nieuwsarchief.
6. De HTML gebruikt agenda-afbeeldingen, inclusief een vaste sfeer-URL.
7. Vercel-cron: preview donderdag 15:00 UTC, verzending vrijdag 09:30 UTC (`vercel.json`). Beide respecteren de schakelaar `nieuwsbrief`, die uit staat. Frequentie per vriend: wekelijks, tweewekelijks, maandelijks (`src/lib/nieuwsbrief-frequentie.ts`).
8. Module `nieuwsbrief` en `vrienden`.
9. Afmeldtoken, frequentie, en de regel dat een testverzending de vriendenlijst niet raakt.
10. De beheerder kan een week nog niet opslaan of zelf verzenden. Dat gat zit in het beheer, niet in Sanity. De Studio-schema’s `nieuwsbrief` en `vriend` zijn de oude kopie.

### Homepage-melding en banner

1. `instellingen`, sleutels `website_melding` en de vrijgekomen-weekendbanner.
2. De site leest de melding via `publieke_website_melding`.
3. Melding: `/beheer/instellingen/meldingen/`. Banner: onderaan `/beheer/publiceren/`.
4. Supabase, via de ingelogde sessie.
5. Zichtbaar zodra de melding aan staat. Geen apart publicatie-uur.
6. Geen foto op de melding.
7. Geen.
8. Module `instellingen` respectievelijk `agenda`.
9. De publieke RPC.
10. Niets uit Sanity.

## 3. Sanity die nog mee kan doen

De brug is eenrichting en was op 8 november 2026 leeg: `bridge_sync_log` en `sanity_bridge_agenda` hadden 0 rijen. De site leest Sanity dan niet.

Wat blijft hangen als Sanity uit gaat zonder voorbereiding:

| Blijft | Stopt of blijft een los eind |
| --- | --- |
| Agenda, kalender, aanvragen, nieuwsbriefdata, melding, publiceren | `/admin` opent Studio |
| Foto’s die al een Supabase- of sitepad hebben | Een fotopad dat nog op `cdn.sanity.io` staat. Dat is per rij niet nagelopen. |
| | De beheerpagina Sanity-brug en de webhook `/api/bridge/sanity` |
| | Second Nature blijft werken, want die poster staat in de repository |

Studio-typen die geen eigen Supabase-scherm meer nodig hebben voor de site: `activiteit`, `aanvraag`, `vriend`, `nieuwsbrief`. `persoon` gaat niet door de brug. `instellingen` in Sanity, inclusief de oude mailteksten, is niet de bron van de 27 mailtemplates in Supabase.

Supabase bevat dus de gepubliceerde activiteiten én de velden om ze te bewerken: tekst, zichtbaarheid, trigger, slug, foto, exposanten, koppeling naar de boeking. Het is geen leeg publicatiekanaal. Wat Supabase niet bevat, zijn de vaste paginateksten, het menu en de footer.

## 4. Voorstel voor twee hoofdonderdelen

Dit legt geen scherm vast. Bestaande knoppen blijven tot er een akkoord is om ze te verplaatsen.

**Verhuur**, al als leesoverzicht achter `VERHUUR_OVERZICHT`. Later, na akkoord: aanvraag behandelen, dossier wijzigen, contract en betaling, communicatie. Niet de websitepagina.

**Website**, vier lijsten. Een regel opent één formulier onder elkaar.

| Lijst | Wat de beheerder ziet | Eerste versie |
| --- | --- | --- |
| Activiteiten | Datum, titel, soort, concept of op de site, gekoppelde boeking | De werklijst van `/beheer/publiceren/` en het formulier van `/beheer/agenda/[id]/`, zonder de woorden slug, bucket of JSON. De slug blijft het technische veld achter “Adres op de site”. |
| Pagina’s | De vaste pagina’s, nu alleen als lijst “deze tekst zit in de site en is nog niet bewerkbaar” | Niet verzinnen. Pas een editor als de tekst uit de bestanden naar een tabel gaat, in een latere fase, zonder de URL te wijzigen. |
| Nieuwsbrief | Week, concept of verstuurd, voorbeeld | Het bestaande voorbeeld. Opslaan en verzenden pas als de geblokkeerde actie bewust wordt aangesloten. |
| Meldingen | Homepage-melding en vrijgekomen weekend | De twee bestaande formulieren. |

**Instellingen**, niet dagelijks: gebruikers, rechten, mailtemplates, automatiseringen, tarieven, systeem, Sanity-brug tot die uit is.

Geen derde activiteiten-tab voor concert of expositie. Dat is een filter op soort in dezelfde lijst. Exposanten blijven velden op die activiteit.

Knoppen die er al zijn en zo moeten terugkomen: Opslaan, Publiceer, Toch publiceren, Verbergen (`publiceren/index.astro` regel 483–501). Een voorbeeld is de publieke URL als de activiteit al `publiek` is, en het nieuwsbrief-HTML-voorbeeld. Een waarschuwing bij niet-opgeslagen wijzigingen zit nog niet op die formulieren. Die hoort bij de latere schermbouw, niet bij deze inventarisatie.

## 5. Van oud scherm naar nieuw onderdeel

| Bestaande functie | Huidig scherm | Straks |
| --- | --- | --- |
| Activiteittekst, soort, exposanten, datums | `/beheer/agenda/[id]/` | Website → Activiteit |
| Publiceren, verbergen, foto, slug, checks | `/beheer/publiceren/` | Website → Activiteit. Dezelfde functies `voerPublicatie` en `uploadPublicatieFoto`. |
| Zichtbaarheid publiek / bezet / verborgen | beide | Blijft. “Bezet” betekent: kalender dicht, niet op de agenda. “Publiek” betekent: op de agenda. |
| Trigger “vanaf N maanden” | agenda-detail | Website → Activiteit, als “Zichtbaar vanaf”. |
| Koppeling boeking | `boeking_id` | Zichtbaar op de activiteit en op het verhuurdossier. Geen automatische pagina bij een boeking. |
| Homepage-melding | `/beheer/instellingen/meldingen/` | Website → Meldingen |
| Vrijgekomen weekend | `/beheer/publiceren/` | Website → Meldingen |
| Nieuwsbrief lezen en voorbeeld | `/beheer/nieuwsbrief/` | Website → Nieuwsbrief |
| Nieuwsbrief opslaan en verzenden | geblokkeerd | Zelfde plek, pas aansluiten na een apart akkoord |
| Vrienden | `/beheer/vrienden/` | Website → Nieuwsbrief, of Instellingen als de lijst privacygevoelig moet blijven |
| Vaste pagina’s, menu, footer, SEO-tekst | code | Website → Pagina’s, eerst alleen-lezen, later bewerkbaar zonder URL-wijziging |
| Second Nature-poster | code | Blijft tot de activiteit zelf die foto draagt |
| Sanity-brug | `/beheer/instellingen/sanity-bridge/` | Instellingen, tot de webhook uit is |
| Mailtemplates en workflow | instellingen | Instellingen. Niet in het website-dagmenu |
| Audit op een publicatie | `auditlog` | Op het activiteitdossier, zoals bij verhuur alleen voor de super-admin |

## 6. Risico’s

| Soort | Bevinding |
| --- | --- |
| Aangetoond | De beheerder kan vaste paginatekst niet wijzigen. Dat is geen verborgen Sanity-functie. |
| Aangetoond | Nieuwsberichten bestaan niet. Een nieuwsmodule bouwen zou nieuw zijn. |
| Aangetoond | Nieuwsbrief opslaan en verzenden vanuit het scherm is bewust dicht. De cron bestaat wel. |
| Aangetoond | Second Nature toont een vaste poster, ook als de activiteit een andere foto heeft. |
| Aangetoond | Publiceren en een boeking zijn gescheiden. Een vereenvoudigd scherm dat die twee gelijktrekt, zet huurgegevens op de site of haalt een bezet weekend van de kalender. |
| Aangetoond | Een Sanity-webhook kan velden zonder lokale override nog overschrijven. De bruglog was leeg. |
| Niet gecontroleerd | Of een van de 18 activiteiten nog een Sanity-fotoadres heeft. |
| Niet gecontroleerd | Of de webhook in het Sanity-project nog op `/api/bridge/sanity` staat. |

## 7. Veilig vervolg

Pas na akkoord, en zonder de verhuurvlag of de contentvlaggen te gebruiken als excuus om Sanity uit te zetten.

1. Website-lijst alleen lezen, achter een eigen vlag, met de bestaande snapshot. Geen nieuwe tabel. De huidige publicatiepagina blijft de schrijfplek.
2. Het activiteitformulier hernoemen en onder elkaar zetten, nog steeds via `voerActiviteitActie` en `voerPublicatie`. Slug blijft bewaard, alleen de zichtbare naam wordt “Adres op de site”.
3. Nieuwsbrief: eerst het voorbeeld houden. Opslaan pas als vaststaat dat de cron niet tegelijk dezelfde week verstuurt.
4. Vaste pagina’s: pas een tabel als de tekst letterlijk uit de Astro-bestanden is overgenomen en de URL’s in de sitemap gelijk blijven.
5. Sanity uit: webhook leeg, fotopaden gecontroleerd, `/admin` geeft een rustige melding. De Second Nature-poster blijft in de site staan.

Elke stap laat `publieke_agenda` en `publieke_bezetting` dezelfde rijen teruggeven als ervoor, behalve waar een beheerder zelf publiceert of verbergt.

Er is nog geen contentproces vervangen. Het verhuuroverzicht blijft de enige nieuwe leesinterface.
