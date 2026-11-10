# Overdracht aan het bestuur

Automatiseringen blijven uit. Er is geen bankkoppeling. Het bestuur werkt in het menu dat nu live is: `/beheer/`.

De knoppen voor betaling, datum, verhuurtype, inhoud en contract staan op de boeking zodra pull request #102 en daarna #103 zijn gemerged en Vercel opnieuw heeft gedeployed. Tot die deploy ontbreken die knoppen op productie.

## Wat het bestuur dagelijks doet

| Taak | Waar | Mail |
| --- | --- | --- |
| Nieuwe aanvraag bekijken, optie, afwijzen of meer informatie | Aanvragen | Geen mail naar de aanvrager |
| Definitief, optie verlengen, annuleren, gastheer, incident | Boeking | Geen |
| Aanbetaling ontvangen, of volledige betaling binnen | Boeking, blok Handmatig. Alleen finance, Paul | Geen. Niets gaat naar de bank |
| Datum verplaatsen | Zelfde blok, nadat het verhuurtype is gekozen | Geen. Een overlap wordt geweigerd |
| Verhuurtype kiezen | Zelfde blok | Geen |
| Inhoud goedkeuren of afkeuren | Zelfde blok | Geen. De site verandert niet |
| Contractstatus | Zelfde blok. Een echt bestand telt zwaarder | Geen upload |
| Tekst en foto op de site | Publiceren | Geen |

Een aanvraag komt binnen als status Nieuw, onder Aanvragen. Er ontstaat geen boeking. De datum blijft vrij tot iemand een optie maakt. Het bestuur krijgt de bestaande notificatie. De bevestiging naar de aanvrager blijft uit.

Bij annuleren kies je: open termijnen laten staan, of afboeken. Afboeken is geen terugstorting.

## Wat uit blijft

Instellingen → Automatiseringen. Niets op Aan zetten, behalve de schakelaar die al aan staat: **Nieuwe verhuuraanvraag naar bestuur**.

Uit blijven: workflow, nieuwsbrief, statusmail naar de huurder, betaalherinnering, social media en de Google-reviewmail.

## Wat niet vanzelf goed komt

| Punt | Wat je doet |
| --- | --- |
| 127 boekingen zonder verhuurtype | Per boeking een type kiezen. Er wordt niet geraden. |
| Betaalvlag wijkt af van de betaalregels | De regels zijn de waarheid. Als Paul een betaling vastlegt, gaat de vlag van die boeking mee. De oude 134 worden niet in één keer herschreven. |
| Zeven importconflicten | Niet opnieuw importeren. Apply stopt zolang een plan `CONFLICT_REVIEW_REQUIRED` bevat. Er wordt dan niets geschreven. |
| Open aanvragen sinds 4 oktober | Per aanvraag beslissen: nog lopen, of afwijzen. Ze blokkeren de kalender niet. |
| ANBI op `/organisatie/` en de privacyverklaring | Teksten van het bestuur. Zonder die teksten is de site niet klaar als publicatie van de stichting. Het verhuurbeheer kan wel. |

## Wat de webmaster nog doet

1. Pull request #102 mergen, daarna #103, en de deploy afwachten.
2. Bestuurders uitnodigen via Instellingen → Gebruikers. Daarvoor moet `SUPABASE_SERVICE_ROLE_KEY` in Vercel staan.
3. Eén proefaanvraag met een testadres: hij staat op Aanvragen als Nieuw, de bestuursmail komt aan, de aanvrager krijgt niets, de datum blijft vrij.
4. Vercel, Supabase, Resend en de vijf domeinen op naam van de stichting, met een tweede beheerder.
