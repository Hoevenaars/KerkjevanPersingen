# Vormgeving beheeromgeving

Onderzoek en uitwerking op 10 november 2026, tegen `main` na PR #105 en #107. Geen productiegegevens gewijzigd, geen migratie, geen mail, geen merge.

PR #105 is gemerged: de zes onderdelen staan achter `BEHEER_HOOFDNAV`. PR #107 is gemerged: `vercel.json` zet die vlag aan. `VERHUUR_OVERZICHT` blijft de schakelaar van de verhuuragenda en van `/beheer/website/`. Deze ronde verandert geen vlag.

De verhuuragenda en het huurdersdossier zijn niet opnieuw gebouwd. De lade blijft `position: fixed` en schuift de hoofdnavigatie niet opzij.

## 1. Waarom de pagina’s versprongen

Twee schillen naast elkaar, allebei actief zodra `BEHEER_HOOFDNAV` aan staat.

| | Verhuur en Website | Overzicht, Contacten, Financiën, Instellingen en de oude lijsten |
| --- | --- | --- |
| Layout | `BeheerConcept` (`.kc`) | `Beheer` met `.bh-app--eenvoud` |
| Navigatie | Balk, inhoud op 1450 px gecentreerd | Balk over de volle vensterbreedte, regels die omvouwen |
| Tweede balk | Alleen als het onderdeel subpagina’s heeft | Zoekveld, gebruiker en submenu wisselden van plek |
| Werkgebied | `padding: 40px 34px`, tekst 18 px | Extra kleefbalk (`bh-werk-kop`) plus `bh-main` met andere padding |
| Tekstbreedte | Geen globale `max-width` op alinea’s | `global.css` zette alinea’s op 62 tekens |
| Tabellen | Binnen het werkgebied | Konden de pagina zelf verbreden |
| Scrollbalk | Wisselde de beschikbare breedte | Zelfde, zonder `scrollbar-gutter` |

De verspringing zat dus niet in een losse `max-width` per scherm, maar in twee layouts.

## 2. Structurele oplossing

`BeheerSchil` is de enige buitenkant.

- Verhuur en Website (`BeheerConcept`) gebruiken die schil.
- Alle andere beheerpagina’s gebruiken haar zodra `BEHEER_HOOFDNAV` aan staat.
- Staat de vlag uit, dan blijft het oude zijmenu in `Beheer.astro` staan. Verhuur en Website houden dan hun oude tweelinksbalk.

De maat staat op één plek in `src/styles/beheer-concept.css`:

```css
--beheer-breedte: 1450px;
--beheer-pad: 34px;
--beheer-balk: 83px;
```

Balk, submenu en werkgebied gebruiken die variabelen, inclusief de smallere padding op 860 px en 640 px. `scrollbar-gutter: stable` en `overflow-x: clip` op de pagina houden de buitenbreedte gelijk als een scherm wel of geen verticale balk heeft. Een brede tabel scrollt in het werkgebied of in de kaart. Zij vergroot de balk niet.

Elk onderdeel heeft dezelfde subregel, ook Overzicht en Financiën. Onder 1100 px schuift die regel horizontaal, zodat de balkhoogte gelijk blijft. Op een breed scherm vouwt Instellingen de groepen onder elkaar. De balk erboven, de linkerkant en de inhoudsbreedte blijven gelijk.

Gemeten tegen de verhuuragenda, voorbeelddata, zonder horizontale pagina-overflow:

| Venster | Balk en werkgebied | Balkhoogte |
| --- | --- | --- |
| 1440 px | overal x 0, breedte 1425 px | 184 px, verhuur 208 px door het maandlabel, Instellingen 324 px |
| 1024 px | overal x 0, breedte 1009 px | 245–280 px |
| 390 px | overal x 0, breedte 390 px | 439–459 px |

Het geopende huurdersdossier blijft een vaste lade. De balk bleef 1425 px.

## 3. Gedeelde componenten

Bestaande klassen, geen tweede knoppenbibliotheek.

| Maat | Klassen | In de schil |
| --- | --- | --- |
| Primaire actie | `.kc-knop--primair`, `.bh-btn` | Steenrood, minstens 48 px hoog |
| Secundair, terug, annuleren | `.kc-knop`, `.bh-btn--sec` | Lichte knop, dezelfde hoogte |
| Waarschuwing | `.bh-btn--gevaar` | Alleen afwijzen en een boeking annuleren |
| Uit | `:disabled` | Grijs, niet klikbaar |
| Velden | `.kc-veld`, `.bh-form` | Minstens 52 px, zelfde rand en straal |
| Tabellen | `.kc-lijst`, `.bh-tabel` | Kop zonder kapitalen, tekst vanaf 16 px, scroll in de kaart |
| Leeg en melding | `.kc-melding`, `.kc-fout`, `.bh-flash`, `.bh-leeg` | Zelfde blok |

Icon-only “kijk als” in de oude kleefbalk is vervangen door de tekstknop **Kijk als** in de subregel. Die staat alleen bij een super admin.

## 4. Voor en na

| Onderdeel | Voor | Na | Routes |
| --- | --- | --- | --- |
| Overzicht | Eigen volle-breedtebalk en dashboardresten als de vlag uit staat | Zelfde schil. Alleen open punten uit bestaande gegevens | `/beheer/` |
| Verhuur | Referentieschil, plus losse lijsten in de andere schil | Agenda en dossier ongewijzigd in gedrag. Aanvragen, boekingen, kalender en planning blijven in het submenu | `/beheer/verhuur/`, `/beheer/aanvragen/`, `/beheer/boekingen/`, `/beheer/kalender/`, `/beheer/planning/` |
| Website | Referentieschil, activiteiten en publiceren in de andere schil | Zelfde schil. Activiteit blijft één detail. Publiceren houdt foto, wachtrij en vrij weekend | `/beheer/website/`, `/beheer/agenda/`, `/beheer/publiceren/` |
| Contacten | Tussenpagina in de andere schil | Zelfde schil. Relaties, vrienden en nieuwsbrief blijven aparte gegevens. De drie open-knoppen zijn secundair | `/beheer/contacten/`, `/beheer/relaties/`, `/beheer/vrienden/`, `/beheer/nieuwsbrief/` |
| Financiën | Andere schil, zelfde betaaltabel | Zelfde schil en dezelfde tabellen. Een regel linkt naar het dossier. Geen nieuwe mutatie | `/beheer/finance/` |
| Instellingen | Andere schil, groepen stonden al | Zelfde schil. Groepen blijven. Wat niet opslaat blijft zo benoemd | `/beheer/instellingen/` en de bestaande subpagina’s |

## 5. Wat is samengevoegd, en wat niet

Samengevoegd is de bediening van de buitenkant, niet de gegevens.

Bewust niet verwijderd uit het menu, omdat de functie niet in het dossier zit:

- Aanvragen: behandelstroom en status.
- Boekingen: statusfilters en het formulier nieuwe boeking.
- Maandkalender: het maandbeeld. Het menu zegt nu “maandbeeld, zelden nodig”. De route blijft.
- Planning: het periodebord voor expositiebegeleiders.
- Publiceren: foto, wachtrij en vrijgekomen weekend. De activiteit zelf blijft op `/beheer/agenda/[id]/`.
- Relaties, vrienden, nieuwsbrief: gescheiden bestanden en toestemming. Geen nieuwe mail.
- Bezoekcijfers, systeem, migratie: technisch, onder Instellingen, met de bestaande toelichting.

Nog niet vervallen, en niet in deze ronde:

- De maandkalender, als het bestuur de agenda voldoende vindt.
- De boekingenlijst, zolang de statusfilters niet op de agenda staan.
- De contacten-ingang. Het submenu opent de lijst ook direct. De ingang legt het verschil tussen relatie, vriend en abonnee uit.
- De Sanity-tekst op migratie. Het scherm schrijft niets.

## 6. Wat intact is

Routes, rechten, de verhuuragenda, het dossier, gastheer, betalingen als lezen, nieuwsbrief met verzenden uit, mailtemplates, automatiseringsschakelaars, de publieke site, het aanvraagformulier en het aanleverformulier. `BEHEER_HOOFDNAV` uit zetten brengt het oude menu terug. Er is geen datamigratie.

## 7. Activeren

De nieuwe schil volgt de vlag die PR #107 al aanzet. Mergen van deze PR zet haar op de site, samen met de bestaande deploy. Niet mergen is de review.

Rollback: haal `BEHEER_HOOFDNAV` uit `vercel.json`, of zet de waarde op iets anders dan `true`. De agenda, de routes en de gegevens blijven.
