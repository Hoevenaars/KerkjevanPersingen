# Vereenvoudiging beheeromgeving

Onderzoek en uitwerking op 10 november 2026 (Europe/Amsterdam), tegen `main` op `fbb3d68`. Geen productiegegevens gewijzigd, geen migratie gedraaid, geen mail verstuurd, niets gemerged.

De nieuwe indeling staat achter `BEHEER_HOOFDNAV`. Zonder die waarde, of met een andere waarde dan `true`, blijft het bestaande menu staan. `VERHUUR_OVERZICHT` blijft de schakelaar van de verhuuragenda en van `/beheer/website/`. De vlag staat niet in `vercel.json`.

## 1. Functieaudit

Classificatie:

- **Behouden:** noodzakelijk zelfstandig werkgebied.
- **Samenvoegen:** de bediening hoort bij een bestaand werkgebied. De route blijft.
- **Secundair:** niet in het dagelijkse menu. Bereikbaar waar het thuishoort.
- **Uitfaseren:** pas als er geen functie en geen afhankelijkheid meer is. In deze ronde is niets verwijderd.

Rollen komen uit de bestaande modules. Super Admin ziet alles. Een gewone rol ziet alleen modules met lezen of schrijven. De nieuwe navigatie geeft geen extra schrijfrecht. Mutaties blijven server-side gecontroleerd in `toegangVoorBeheerPad`.

### Hoofdmenu

| Route | Functie | Gegevens | Werkende actie | Alleen visueel | Rol | Dubbel met | Zelfde gegevens elders | Samenvoegen | Dagelijks | Uniek |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/beheer/verhuur/` | Verhuuragenda en huurdersdossier | Weekenden, aanvragen, boekingen, betalingen, stukken, gastheer | Gastheer en dossieracties die al bestonden | Geen nieuwe knoppen toegevoegd | `boekingen` | Boekingen, planning, kalender | Ja, in de oude dossiers | Behouden | Ja | Ja. Dit is de referentie uit PR #101 |
| `/beheer/website/` | Ingang voor de site | Links naar bestaande onderdelen, vaste pagina's als niet-bewerkbaar | Alleen doorverwijzen | Vaste pagina's zijn niet bewerkbaar | `agenda`, plus `VERHUUR_OVERZICHT` | Agenda, publiceren | Ja | Behouden als ingang | Ja | De ingang zelf |
| `/beheer/` | Startscherm | Aanvragen, opties, agenda, signalen | Alleen navigeren | De oude kaarten tellen, ze wijzigen niets | `dashboard` | Aanvragen, boekingen, agenda | Ja | Samenvoegen tot Overzicht. Opties en de komende 21 dagen staan apart | Ja | De dagvraag |
| `/beheer/aanvragen/` | Aanvragen behandelen | Status, soort, datum, dossier | Optie, afwijzen, informatievraag via de bestaande procedure | Meer-informatie mailt alleen als de schakelaar aan staat. Die staat uit | `aanvragen` | Blok op de verhuuragenda | De aanvraag wordt een boeking | Samenvoegen onder Verhuur | Ja | De behandelstroom en de statusfilters |
| `/beheer/boekingen/` | Lijst en nieuw | Status, huurder, periode | Nieuwe boeking, filters | Geen | `boekingen` | Verhuuragenda | Het dossier | Samenvoegen onder Verhuur | Bij zoeken op status | Statusfilters en het formulier nieuwe boeking |
| `/beheer/kalender/` | Maandraster | Bezetting | Maand wisselen, openen | Geen mutatie | `kalender` | Verhuuragenda | Zelfde boekingen | Secundair onder Verhuur | Nee | Het maandbeeld |
| `/beheer/agenda/` | Activiteit bewerken | Tekst, contentstatus, publicatiestatus, gastheer | Opslaan van de activiteit | Geen | `agenda` | Publiceren | Dezelfde activiteit | Samenvoegen onder Website | Ja | Eén activiteit, inclusief publicatiestatus |
| `/beheer/planning/` | Expositiebegeleider over een periode | Boekingen en toewijzing | Gastheer opslaan | Geen | `planning` | Dossier op de agenda | `gastheer_relatie_id` | Samenvoegen onder Verhuur | Bij het indelen | Het periodebord |
| `/beheer/publiceren/` | Wachtrij, foto, vrij weekend | Publicatiestatus, foto, banner | Bewaren, publiceren, verbergen, foto uploaden | Geen | `agenda` | Agendadetail | Dezelfde activiteit | Samenvoegen onder Website | Bij publicatie | De wachtrij, de foto en het vrijgekomen weekend |
| `/beheer/relaties/` | Relatiekaart | Naam, contact, notities, gekoppelde boekingen | Opslaan van de relatie | Historische boekingen houden hun snapshot | `relaties` | Huurder op een boeking | Nee, een relatie is geen vriend | Samenvoegen onder Contacten | Ja | Het verhuurcontact |
| `/beheer/finance/` | Geld | Oude vlag op de boeking, en de tabel `betalingen` | Alleen lezen | "Als ontvangen markeren" bestaat niet | `finance` | Betaalblok in het dossier | Ja, de vlag en de tabel | Behouden als Financiën | Ja, voor de penningmeester | Het totaaloverzicht |
| `/beheer/vrienden/` | Vriendenbestand | Naam, e-mail, frequentie | Export, alleen Super Admin | Toevoegen is uitgeschakeld | `vrienden` | Relaties | Nee | Samenvoegen onder Contacten | Soms | Het aparte bestand en de toestemming |
| `/beheer/nieuwsbrief/` | Weekoverzicht | Bestaande weken | Openen en voorbeeld | Bewaren en verzenden zijn uit | `nieuwsbrief` | Stond ook op de website-ingang | Eigen tabel | Samenvoegen onder Contacten | Soms | De bestaande nieuwsbrief, zonder nieuwe zending |
| `/beheer/analytics/` | Bezoekcijfers | `page_views` | Lezen als er rijen zijn | De pagina zegt zelf wanneer de meting nog leeg is | `analytics` | Geen | Nee | Secundair onder Instellingen | Nee | De meting, als die er is |
| `/beheer/zoeken/` | Zoeken in de snapshot | Namen en datums | Zoeken | Geen | `dashboard` | Filters op de agenda | Ja | Behouden in de balk | Ja | Het zoekveld |
| `/beheer/migratie/` | Leesbare migratiestatus | Aantal `migratie_vastgelegd`. De Sanity-controlelijst alleen als de bron nog Sanity is | Niets. Het scherm schrijft niet | De stappenlijst beschrijft een oude volgorde en start geen import | `migratie`, erft van instellingen | Geen dagelijks scherm | De boekingen zelf | Secundair onder Instellingen, technisch | Nee | Het enige scherm dat zegt dat er niets wordt geschreven |

Eerdere terugkoppeling zei dat `/beheer/migratie/` geen pagina had. Op deze `main` staat `src/pages/beheer/migratie/index.astro` wel. Het scherm is geen dagelijkse bestuursfunctie. Het blijft bereikbaar en verdwijnt alleen uit het hoofdmenu als `BEHEER_HOOFDNAV` aan staat. Importcode is niet verwijderd.

### Instellingen

| Route | Werkende actie | Classificatie |
| --- | --- | --- |
| `/beheer/instellingen/` | Slaat openingstijden en adressen op in Supabase | Behouden, groep Organisatie |
| `/beheer/instellingen/meldingen/` | Slaat de homepagebanner op | Behouden, groep Communicatie, ook te openen vanaf Website |
| `/beheer/instellingen/verhuur/` | POST komt terug als nog niet beschikbaar. De knop is uit | Secundair. Niet als werkende opslag getoond |
| `/beheer/instellingen/finance/` | Zelfde. De knop is uit | Secundair. Niet als werkende opslag getoond |
| `/beheer/instellingen/gastheren/` | Toevoegen, wijzigen, actief, verwijderen | Behouden, groep Personen |
| `/beheer/instellingen/automatiseringen/` | Schakelaars. Verzenden blijft uit zolang de schakelaar uit staat | Secundair, groep Communicatie. Niets aangezet |
| `/beheer/instellingen/systeem/` | Alleen status | Secundair, groep Technisch |
| `/beheer/instellingen/mailtemplates/` | Tekst en versies. Geen template is in deze ronde gewijzigd | Secundair, groep Communicatie |
| `/beheer/instellingen/gebruikers/` | Uitnodigen, rollen, view-as | Behouden, groep Personen |
| `/beheer/instellingen/templates/` | Blijft een doorverwijzing naar mailtemplates | Ongewijzigd |

### Wat bewust niet op het startscherm komt

- Lege contentstatus. Dat is geen bewijs dat informatie ontbreekt.
- Ontbrekend contract. Er is geen betrouwbare contractkolom. Upload staat uit.
- Importconflicten. Die zitten niet in de beheer-snapshot.
- Een verzendstatus als "aangekomen". Een fouttaak, als het getal er is, blijft een afwijking en geen bewijs van ontvangst.
- Boekingen van 4 november 2026. Er is geen correctie op rijen uitgevoerd.

## 2. Nieuwe plek van iedere functie

| Oud | Nieuw, als `BEHEER_HOOFDNAV=true` |
| --- | --- |
| Dashboard | Overzicht |
| Verhuuragenda | Verhuur → Verhuuragenda |
| Aanvragen, boekingen | Verhuur |
| Kalender | Verhuur → Maandkalender |
| Planning | Verhuur → Planning |
| Website, agenda, publiceren | Website |
| Homepage-melding | Website én Instellingen → Meldingen |
| Relaties, vrienden, nieuwsbrief | Contacten. De lijsten blijven apart |
| Finance | Financiën, geleid door `betalingen` |
| Analytics, systeem, migratie | Instellingen → Technisch |
| Overige instellingen | Instellingen, in vier groepen |

Oude URL's zijn niet omgeleid. Een link uit een mail of een bladwijzer opent hetzelfde scherm. Vanaf Overzicht of Financiën krijgt het dossier `?van=overzicht` of `?van=financien`, zodat de kruimel terugwijst. Andere waarden van `van` worden genegeerd.

`/beheer/contacten/` is nieuw en alleen een ingang. POST is server-side geweigerd. De pagina ziet alleen de lijsten waarvoor de rol al recht heeft.

## 3. Samengevoegd

De bediening, niet de gegevens.

- Aanvragen, boekingen, maandkalender en planning horen bij Verhuur. Het dossier blijft het zijpaneel van de verhuuragenda.
- Agenda en publiceren horen bij Website. De activiteit bewaart tekst en publicatiestatus. Publiceren houdt de foto, de wachtrij en het vrijgekomen weekend. Het zijn geen twee agenda's, wel twee bestaande schrijfschermen.
- Relaties, vrienden en nieuwsbrief horen bij Contacten. Een huurder wordt geen vriend en geen abonnee.

## 4. Secundair

Maandkalender, bezoekcijfers, systeem, migratie, automatiseringen, mailtemplates, en de twee instelschermen die nog niet opslaan. Die laatste twee zeggen in het menu "nog niet op te slaan".

## 5. Bewust behouden

Verhuuragenda, huurdersdossier, gastheer, statussen, rechten, `VERHUUR_OVERZICHT`, het oude menu als de nieuwe vlag uit staat, alle oude routes, de betaaltabel, de nieuwsbriefinfrastructuur met verzenden uit, en de boekingscorrecties zoals ze al zijn opgeslagen.

## 6. Wat later zou kunnen vervallen

Nog niet vervallen, en niet in deze ronde:

- Het maandraster, als het bestuur de verhuuragenda voldoende vindt.
- De aparte boekingenlijst, als de statusfilters op de agenda staan. Die filters zijn nu niet overgezet, dus de lijst blijft.
- De Sanity-stappen op het migratiescherm, zodra vaststaat dat niemand ze nog leest. Het scherm zelf blijft tot dat besluit.
- Bezoekcijfers, als de meting leeg blijft en het bestuur ze niet wil.

## 7. Niet gewijzigd

Publieke pagina's, het aanvraagformulier, het aanleverformulier voor exposanten, SEO, content, e-mailtemplates, cron, automatiseringsschakelaars, database, en de schrijfpaden van aanvraag, boeking, publicatie en relatie.

De verhuuragenda is niet opnieuw gebouwd. De navigatie erboven komt uit dezelfde vlag als de rest.

## 8. Risico's

- Agenda en publiceren kunnen dezelfde publicatiestatus nog allebei schrijven. De ingang wijst dat aan. De schrijfpaden zijn niet samengevoegd, om geen tegenstrijdige opslag te maken.
- Financiën toont de tabel en vergelijkt de oude vlag. Een betaling als ontvangen markeren of een restitutie uitvoeren ontbreekt nog. Dat is bewust. De bestaande regel weigert die mutatie.
- Het migratiescherm noemt nog een volgorde uit de Sanity-tijd. Op Supabase schrijft het niets. De tekst is niet herschreven.
- `BEHEER_HOOFDNAV` en `VERHUUR_OVERZICHT` zijn twee schakelaars. Zonder de tweede wijst Verhuur naar `/beheer/boekingen/` en Website naar `/beheer/agenda/`, niet naar een dicht scherm.
- Een rol zonder `dashboard` ziet geen Overzicht. Dat was al zo voor `/beheer/`.

## 9. Tests

- `node --experimental-strip-types --test tests/beheer-hoofdnav.test.ts` en `tests/platform-autorisatie.test.ts`: 27 geslaagd, daarna nog eens 17 na de plaatsing van migratie.
- `npm test`: één bestaande fout, `tests/sql/run.sh` mist een lokale Postgres-gebruiker. Geen van de nieuwe tests zit in dat bestand.
- `npm run build`: geslaagd.
- Lokaal, met `BEHEER_HOOFDNAV=true` en `VERHUUR_OVERZICHT=true`, op voorbeelddata `?bron=demo`: Overzicht, verhuuragenda, dossier, Website, Contacten, Financiën en Instellingen. Desktop en een smal venster. De voorbeeldbanner blijft zichtbaar. Dat is geen productiedatabase.
- `GET /`, `/verhuur/` en `/agenda/` geven 200 en bevatten de nieuwe beheernaam niet.
- Oude beheerroutes geven 200, inclusief `/beheer/migratie/`.
- De tijdelijke lokale sessie waarmee die schermafbeeldingen zijn gemaakt, zit niet in de code.

## 10. Schermen

De schermafbeeldingen horen bij de lokale voorbeelddata, niet bij productie.

- Overzicht, desktop en smal venster.
- Verhuuragenda, met het bestaande dossier.
- Website, Contacten, Financiën, Instellingen.

## 11. Preview en release

1. Zet op een preview `BEHEER_HOOFDNAV=true`. Laat `VERHUUR_OVERZICHT` zoals die al staat.
2. Loop als Super Admin en, via view-as, als een beperkte rol: Overzicht, een aanvraag, de verhuuragenda, een dossier, Website, Contacten, Financiën, Instellingen.
3. Controleer dat een rol zonder finance geen betaalbedragen opent, en dat een rol zonder aanvragen dat menu-item niet ziet.
4. Verander geen schakelaar bij automatiseringen en verstuur geen testmail.
5. Pas na akkoord de vlag op productie zetten. Niet in dezelfde stap als een datamigratie.

## 12. Rollback

Zet `BEHEER_HOOFDNAV` leeg of op iets anders dan `true`. Het oude menu, inclusief het item Migratie, komt terug. Routes, gegevens en de verhuuragenda blijven. Er is geen migratie om terug te draaien.

## Knoppen die werken, en wat nog niet

Werkt, ongewijzigd: aanvraag behandelen, boeking vastleggen, gastheer, activiteit opslaan, publiceren, relatie opslaan, homepage-melding, expositiebegeleiders, gebruikers, mailtekst bewaren, automatiseringsschakelaar.

Werkt als lezen: het nieuwe overzicht, de financiële lijst, contacten als ingang, zoeken.

Werkt nog niet, en wordt niet als werkende knop gepresenteerd: verhuurinstellingen opslaan, financiële instellingen opslaan, betaling als ontvangen markeren, restitutie uitvoeren, vriend toevoegen, nieuwsbrief bewaren of verzenden, document uploaden, de twee-wekenmail.

Nieuwe automatische verzendingen zijn niet toegevoegd.
