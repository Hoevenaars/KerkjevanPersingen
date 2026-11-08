# Verhuuroverzicht

Het dagelijkse scherm staat op `/beheer/verhuur/`. Het is een agenda in de trant van het Excel-huuroverzicht: elke periode op een eigen regel, en een dossier ernaast zodra de beheerder op de huurder klikt.

De vlag `VERHUUR_OVERZICHT` staat uit zolang zij niet letterlijk `true` is. `vercel.json` zet haar niet. Zonder vlag geeft het adres een 404 en verschijnt Verhuur niet in het menu. De bestaande beheerpagina's blijven staan. Er is geen productie-deploy en de migratie hieronder is niet op de database uitgevoerd.

`docs/beheer/AUDIT-WEBSITE-CMS.md` staat niet in de repository. Het onderzoek is gedaan op `docs/beheer/AUDIT-2026-11-08.md` en op de code van dossiers, stukken, gastheren, rechten en het auditlog.

## Wat de beheerder doet

1. Open Verhuur. Kies jaar en maand, of het hele jaar.
2. Zoek het weekend. Vrije weekenden, winterstops en annuleringen staan in dezelfde lijst.
3. Klik op de naam. Het dossier opent. Sluiten brengt terug naar diezelfde regel.
4. Bekijk de foto of open het document.
5. Kies Goedkeuren of Afkeuren. Afkeuren vraagt een korte reden.
6. Kies een gastheer in de lijst en klik Gastheer toevoegen.
7. Lees de betaling. Ontvangen, open en te laat komen uit de betaalregels.
8. Sluit het dossier. De agenda staat waar zij stond.

Een groen vinkje betekent afgerond, een open bolletje nog te beoordelen of nog open, een uitroepteken actie nodig, en een vraagteken onbekend. Onbekend wordt nooit als afgerond getoond.

## Hergebruikte functies

| Handeling | Bestaande functie |
| --- | --- |
| Agenda, relaties, boekingen, betalingen, documenten, aanvragen, interne blokkades | `laadBeheerSnapshot` en `leesSupabaseBeheer` |
| Gastheer kiezen, alleen actieve personen plus de huidige | `gastherenVoorKoppeling` |
| Gastheer opslaan of losmaken, met audit, zonder mail | `voerDossierViaSessie` met soort `gastheer`, die `koppelGastheerViaSessie` aanroept |
| Recht om te schrijven, kijkrol en view-as | `magSchrijven`, `beheerToegang`, module `boekingen` |
| Foto's bij een aanvraag | tabel `aanvraag_fotos`, bucket `aanvraag-fotos` |
| Foto's uit het klantportaal | tabel `content_intake_bestanden`, bucket `content-intake` |
| Documentmetadata | tabel `documenten` |
| Betaalstatus | tabel `betalingen`. `aanbetaling_ontvangen` wordt niet gelezen |
| Verzendbewijs | `communicatie_verzendingen` met status `verzonden`, geen test, en een vulmoment. Een job telt niet |
| Auditlog | alleen lezen als de ingelogde beheerder super-admin is en niet in view-as zit. De policy blijft `app.is_super_admin()` |
| Overlap van datums | `periodesOverlappen` |

Er is geen tweede gastheerregistratie. De knop schrijft `boekingen.gastheer_relatie_id`. Oude rijen in `gastbegeleider_toewijzingen` worden getoond en niet door dit scherm overschreven. Meer dan één gastheer tegelijk opslaan kan deze bestaande functie niet. Staat er al iemand, dan vraagt het scherm bevestiging voor vervanging. Een gastheer die in dezelfde periode ook elders staat, krijgt eerst een waarschuwing.

Goedkeuren publiceert niets, ondertekent niets, registreert geen betaling en verstuurt geen e-mail. De bestaande actie `content_beoordelen` doet dat deels wel en wordt hier bewust niet gebruikt.

## Database

Nieuwe tabel, alleen toevoegen: `public.stuk_beoordelingen` in `supabase/migrations/20261108223127_stuk_beoordelingen.sql`.

Een besluit is een nieuwe rij. Update en delete hebben geen policy. RLS eist leesrecht op boekingen om te zien en schrijfrecht om toe te voegen. Bestaande tabellen, importregels en de correcties van 4 november 2026 worden niet aangeraakt.

De migratie is niet op productie uitgevoerd. Zolang de tabel ontbreekt, blijven de stukken zichtbaar en weigert opslaan met de melding dat er niets is gewijzigd.

Welke stukken het scherm verwacht, staat op één plek: `VERHUUR_REGELS` in `src/platform/verhuur-overzicht.ts`. Een expositie vanaf 8 november 2026 verwacht een foto en een tekst. Een bruiloft niet. Oudere boekingen zonder digitaal bestand blijven "onbekend" of "geen digitale stukken", geen vinkje. Een lege activiteitsoort wordt niet als expositie behandeld.

## Contract

| Wat er ligt | Status |
| --- | --- |
| Documentsoort `getekend_contract` | Ondertekend |
| Verzending van een contractsjabloon, status verzonden, geen test, met tijdstip | Verstuurd |
| Documentsoort `contract` | Voorbereid |
| Optie of definitief zonder die bronnen | Ontbreekt |
| Al het andere, inclusief een oude Excel-tekst | Status onbekend |

`contract_raw` uit de import wordt niet gelezen en telt niet als ondertekening.

## Beperkingen

- Betaling als ontvangen markeren kan hier niet. `voerDossierViaSessie` weigert die actie. Het scherm toont alleen de betaalregels.
- Er gaat geen mail uit en er wordt niets gepubliceerd.
- De uploadknop voor contracten bestond al niet. Een bestand opent alleen als de opslag een adres teruggeeft. De bucket `booking-documents` ontbreekt in productie.
- Historische gastheerrijen in `gastbegeleider_toewijzingen` zijn te zien, niet apart te verwijderen.
- Een beheerder zonder auditrecht ziet verzendbewijzen en beoordelingen, niet het volledige auditlog.
- De vlag moet expliciet aan staan om het scherm te oefenen. Productie blijft uit tot daar akkoord voor is.
