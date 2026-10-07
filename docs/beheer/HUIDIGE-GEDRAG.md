# Huidig gedrag vs. nieuw beheerplatform

Tijdens bouwen mag bestaande functionaliteit niet ongemerkt verdwijnen
(FO §34, §78). Dit is de checklist van wat de website **nu** doet.

## Beschikbaarheidskalender

Bron: `getBezetteData()` in `src/lib/sanity.ts` + `src/components/Kalender.astro`.

- Bezet = `zichtbaarheid != 'verborgen'` (dus `bezet` én `publiek`).
- Optie met zichtbaarheid `verborgen` blokkeert **niet**.
- Meerdaagse boekingen: alle dagen van start t/m eind.
- Geen namen, geen type, geen finance op de publieke kalender.

**Nieuw (nog niet actief):** bezet alleen bij status `definitief` of interne
activiteit met `blokkeert_verhuurkalender`. Functies: `publiekeBezetteDagen()`.

## Homepage-agenda

`getAgendaOverzicht()`: publiek, lopend of toekomstig, plus `toonVanafMaanden`.

## Agenda-detail

`getActiviteitBySlug()` respecteert dezelfde publicatieregel. Directe URL
toont niets te vroeg.

## Sitemap

Alleen slugs van `getPubliekeAgenda()`. `/admin` en `/beheer` staan er niet in.

## Afbeeldingen

- Website: WebP via `imageUrl()`.
- Mail: JPEG via `mailImageUrl()` (Outlook).

Nieuw: origineel → websitevariant → nieuwsbriefvariant. Nog niet aangesloten.

## Nieuwsbriefselectie

`src/lib/nieuwsbrief-frequentie.ts` + `nieuwsbrief-agenda.ts`.

- Wekelijks: eerstvolgende / dit weekend.
- Tweewekelijks: 14 dagen.
- Maandelijks: rest van de kalendermaand.
- Tweewekelijks volgt even ISO-weeknummers; maandelijks de eerste vrijdag.

## Vrienden

Aanmelden reactiveert een bestaand adres. Afmeldtoken in de mail.
Alleen webmaster ziet de lijst in Studio.

## Mailontvangers aanvraag

1. `CONTACT_FALLBACK_EMAIL`, anders `contractbeheer.kvp@gmail.com`
2. BCC naar `nhoevenaars@gmail.com` op mail die naar iemand van het kerkje gaat
   (bestuur, gastbegeleider, penningmeester, voorzitter, webmaster, contractbeheer).
   Uit te zetten met een lege `TOEZICHT_BCC_EMAIL`.
3. optioneel extra adressen in `CONTACT_BCC_EMAIL`, alleen op diezelfde interne mail

Mail naar de aanvrager krijgt die BCC niet.

Van: `Het Kerkje van Persingen <noreply@send.kerkjepersingen.nl>`.
Reply-To bij een nieuwe aanvraag naar contractbeheer: het e-mailadres van de aanvrager.
Reply-To bij mail aan aanvrager, huurder, gastheer of reservelijst: `contractbeheer.kvp@gmail.com`.
Reply-To wijst nooit naar `noreply@send.kerkjepersingen.nl`.

## Formulier

`src/lib/validatie.ts`: expositie-weekend is een **waarschuwing**, geen
blokkade. Nieuw (nog niet op het formulier): harde za+zo / ma–vr-regels in
`src/platform/verhuur.ts`.

## Environment

Zie README. Nieuwe vlaggen (`BEHEER_ENABLED`, `CONTENT_BRON`,
`ALLOW_SUPABASE_CONTENT`) doen de publieke website niets zolang de contentvlaggen
leeg blijven. `/beheer` gaat via Supabase-login op `/beheer/login`. `LIVE_VANAF`
en `SITE_PASSWORD` zetten die deur niet open. Live Sanity alleen ná inloggen.
Schrijven niet.
