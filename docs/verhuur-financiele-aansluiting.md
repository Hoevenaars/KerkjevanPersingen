# Financiële aansluiting van de verhuurmachine

De contractmachine gebruikt één vastgelegd bestuursmandaat. Voor `concert` en `diverse` komt de definitieve totale huurprijs uit het besluit; voor de andere ondersteunde typen uit de bij het besluit vastgelegde tariefprijs. De contractprofielen zijn eveneens bij het besluit bevroren. Een latere wijziging van tarieven of instellingen verandert een goedgekeurd dossier niet.

Standaardbetaaltermijnen worden gerekend vanaf de vastgelegde besluitdatum. Een vertraagde worker verschuift die afspraken niet. Is de eerste vervaldag intussen verstreken, dan moet het bestuur een concreet concept met actuele termijnen beoordelen. De profielopslag borgt de vastgestelde regel van 18 maanden van einde tot begin; een uitzondering geldt uitsluitend voor het expliciet beoordeelde dossier en wordt ook in de overeenkomst genoemd.

## Workerfuncties

- `verwerkContractVoorMandaat` in `src/lib/operatie/verhuur-contract-machine.ts`: verifieert het mandaat met de database, maakt maximaal één passende contractversie en voert de bestaande claim-/pakketroute uit. De uitvoerende actor is `type: 'systeem', id: 'system'` met expliciete modulerechten. Dit is geen nieuwe menselijke goedkeuring.
- `verwerkFinancieleTermijnen` in `src/lib/operatie/verhuur-financieel.ts`: controleert de echte vervaldatum, uitgegeven facturen en ontvangen saldo. De eerste factuur blijft in het contractpakket. De restfactuur heeft een eigen uitgiftedatum, eigen nummer per betaaltermijn en een blijvende verzendclaim. Toekomstige controles worden met `verhuur_plan_stap` gepland.
- `verwerkBetaalontvangst` in `src/lib/operatie/verhuur-betaalontvangst.ts`, ook geëxporteerd vanuit `verhuur-financieel.ts`: registreert een eenduidig gekoppelde, geauthenticeerde ontvangst. De SQL-transactie bewaart het externe bewijs, verhoogt het ontvangen saldo en plant de definitiefcontrole samen.
- `verhuur_promoveer_indien_klaar` is de transactionele definitiefcontrole voor machineboekingen. Boeking, actuele aanvraag/mandaat, laatste ondertekende contractversie en ontvangen termijnen worden onder locks gecontroleerd. Alleen een complete actuele checklist verandert de boeking; de bestaande status-trigger plant bevestiging en agenda in dezelfde transactie. Een RPC-fout valt niet terug op een onbewaakte statuswijziging.

De financiële planner stuurt de eerste herinnering standaard zeven dagen en de tweede veertien dagen na de vervaldag. Als de factuur later is verzonden, begint deze termijn op de verzenddag. Er gaat geen herinnering voor een ongezonden nota of een volledig ontvangen termijn. Bij een deelbetaling gebruikt de mail het actuele openstaande saldo.

Voor automatische uitvoering zijn `VERHUUR_MACHINE=true`, de ingestelde startscope, de bestaande contractvlaggen en de relevante mailpoorten nodig. De migratie schakelt niets in. De bestaande beheerpagina **Instellingen → Verhuur** bewaart profielen, startdatum en historische dekking. De btw-/factuuridentiteit blijft via de bestaande factuurinstellingen ingesteld.

## Providerneutrale betaalontvangst

Er is geen bank of betaalprovider gekozen. Een bank-/boekhoudadapter of gecontroleerde import moet externe transacties eerst betrouwbaar aan één bestaande `betalingen.id` koppelen. Een onduidelijke match mag niet op naam, vrij tekstkenmerk of geschat bedrag worden geboekt.

De serveringang is `POST /api/verhuur/betaalontvangst`. Stel een afzonderlijk geheim `VERHUUR_BETALING_WEBHOOK_SECRET` van minimaal 32 tekens in. Bewaar dat uitsluitend op de server en in de gekozen adapter.

Voorbeeldpayload met fictieve ids:

```json
{
  "events": [
    {
      "bron": "boekhouding",
      "eventId": "transactie-2027-000123",
      "betalingId": 123,
      "bedragCent": 10000,
      "ontvangenOp": "2027-04-20T10:00:00Z",
      "referentie": "KVPF-2027-000123"
    }
  ]
}
```

De headers zijn:

- `X-Verhuur-Timestamp`: Unix-tijdstip in hele seconden.
- `X-Verhuur-Signature`: hexadecimale HMAC-SHA256 met het ingestelde geheim over **timestamp + `.` + de exacte ongewijzigde JSON-body**.
- `Content-Type: application/json`.

Het tijdvenster is vijf minuten. De body mag maximaal 100.000 tekens en 100 events bevatten. Gebruik een stabiele unieke `bron` + `eventId`; herhaal bij een netwerkstoring precies dezelfde ontvangstgegevens met een nieuw HTTP-tijdstip/signature. Een dubbele gebeurtenis verhoogt het saldo niet opnieuw. Dezelfde gebeurtenis-id met andere termijn, bedrag, ontvangsttijd of referentie wordt afgewezen.

Een succesvolle batch retourneert HTTP 200. Een batch met individuele fouten retourneert 207 met een resultaat per event. Een deelbetaling blijft open totdat het bedrag van de termijn volledig ontvangen is. Overbetaling, een gesloten dossier of een onduidelijke koppeling wordt een financiële uitzondering. De adapter moet die fout voor menselijke afhandeling zichtbaar maken en mag niet een willekeurige andere termijn proberen.

Dit is een gereed integratiepunt; daadwerkelijke bankontvangsten stromen pas nadat een echte bron is gekozen, gekoppeld en getest. Tot die tijd gebruiken bevoegde beheerders **Aanbetaling ontvangen**, **Volledige betaling ontvangen** of **Restbetaling ontvangen** in het dossier. Deze handelingen gebruiken dezelfde transactionele ontvangstregistratie.

## Verzendbewijs herstellen

`herstelVerhuurVerzending` in `src/lib/operatie/verhuur-verzendherstel.ts` is uitsluitend voor een bevoegde menselijke beheersessie. Controleer eerst in het providerlog de bedoelde ontvanger, het concrete bericht en het verzendtijdstip. Leg het bewijs en, bij acceptatie, het providerbericht-id vast.

Bij bevestigde acceptatie controleert de helper de oorspronkelijke PDF-bytes tegen de bevroren contract-/factuursnapshot. Vervolgens herstelt de SQL-transactie claim, factuurregistratie, documentverwijzingen en waar nog geldig de tekenlink. Een geannuleerde boeking krijgt geen nieuwe geldige tekenlink. Er wordt tijdens herstel geen mail verstuurd.

Alleen na aangetoonde niet-verzending mag een onbevestigde claim worden vrijgegeven. Een reeds geaccepteerde verzending kan niet terug naar ongestuurd. Een verse actieve claim kan niet worden overgenomen; een onzekere provideruitkomst leidt nooit tot een blinde tweede verzending. Elke handmatige herstelactie krijgt een auditregel met de echte gebruikers-id.

## Een concreet uitzonderingsconcept goedkeuren

`leesMachineConceptBeoordeling` en `keurMachineConceptGoed` in `src/lib/operatie/verhuur-concept-herbeoordeling.ts` sluiten de bestaande beheerwizard aan op de machine. Een ingelogde bestuurder ziet de opgeslagen contracttekst, prijs, voorwaarden, termijnen en actuele waarschuwingen. De bevestiging bevat de concrete concept-id, aanvraagversie, gecombineerde bronhash en een reden. Zij bevat geen nieuwe losse prijs.

De database controleert dezelfde snapshot opnieuw en bewaart een aanvullende besluitrevisie, ook als de aanvraaginhoud zelf niet veranderde. Daarna wordt uitsluitend de goedkeuringsmetadata van het bestaande concept gewijzigd. De eerder opgeslagen tekst en eerdere besluiten blijven staan. De nieuwe contractjob hoort bij exact deze goedgekeurde versie en betaalregels.

Dit pad is uitsluitend voor onuitgegeven opties. Een factuur, geaccepteerde/onzekere verzending, handtekening of (deel)ontvangst blokkeert een nieuwe conceptgoedkeuring en een nieuwe machinewizardversie. Het dossier krijgt menselijke opvolging met eigenaar en termijn. Een creditnota, restitutie of wijziging van een al getekende overeenkomst wordt niet automatisch verzonnen.

## Verificatie vóór activering

De lokale pure tests dekken prijsdoorgifte, mandaatcontrole, de nul-aanbetalingregressie, termijnplanning, deelbetalingsuitkomsten, HMAC en profielvalidatie. Node-syntaxcontrole is geen TypeScript-build of PostgreSQL-integratietest.

Test in de ingerichte stagingdatabase ten minste: één Ja met vaste en ingevoerde prijs; gewijzigde profielinstellingen na Ja; gelijktijdige ontvangen events; deel-/dubbele betaling; eerste en latere factuur met onveranderlijke PDF; provideracceptatie gevolgd door registratie-uitval; handmatig bewezen verzendherstel; een conceptrevisie met dezelfde aanvraaghash; verouderde conceptpreview; ondertekening/betaling in beide volgordes; herbeoordeling en annulering tijdens de definitiefcontrole. Gebruik een testtransport en voer geen historische dossiers alsnog in de live mailketen in.
