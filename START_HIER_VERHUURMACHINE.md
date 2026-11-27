# Kerkje van Persingen — implementatie verhuurmachine

**Oplevering: 25 november 2026.** Deze broncode implementeert het besproken aanvraagproces. De wijzigingen zijn lokaal aangebracht en met netwerkvrije tests gecontroleerd. Er is geen productieomgeving bijgewerkt, geen productiemigratie uitgevoerd en geen echte mail verzonden.

De publieke verhuurpagina’s, het aanvraagformulier en de kalenderweergave zijn behouden. De veranderingen zitten in de verwerking, de bestuursmail, een beveiligde beslispagina en het bestaande beheer.

## 1. Het proces

| Stap | Verwerking | Wanneer het bestuur nodig is |
| --- | --- | --- |
| 1. Aanvraag ontvangen | De bestaande intake bewaart de aanvraag. De database legt ook een verzendopdracht vast. Het afronden of verlaten van een foto-upload laat die opdracht niet verdwijnen. | Niet voor een reguliere intake. |
| 2. Voorcontrole | Controle op overlappende aanvragen, reserveringen, interne blokkades en relevante activiteiten. Bij exposities ook de historie van hoofd- en mede-exposanten. | Onvolledige gegevens worden zichtbaar gemaakt. |
| 3. Bestuursmail | Ja/Nee met actuele aanvraaggegevens, waarschuwingen en de eventuele prijsinvraag. | Het bestuur beoordeelt de inhoud. |
| 4. Besluit bevestigen | De knop opent een beveiligde pagina. Openen of vooraf scannen van de link neemt geen besluit. De bevestiging bewaart akkoord, prijs en getoonde waarschuwingen in één transactie. | Eén inhoudelijk besluit. Concert/Overig vereist daarbij de definitieve totaalprijs. |
| 5. Periode toewijzen | Als de periode vrij is ontstaat één optie. Een inhoudelijk Ja kan blijven wachten op beschikbaarheid. | Bij concurrerende aanvragen kiest het bestuur expliciet welke aanvraag de periode krijgt. Er is geen automatische FIFO-keuze. |
| 6. Contractpakket | De machine gebruikt de goedgekeurde prijs en de bij Ja bevroren standaardafspraken. Contract, voorwaarden, factuur en tekenlink volgen de bestaande pakketroute. | Alleen bij ontbrekende of afwijkende afspraken is een concrete conceptbeoordeling nodig. |
| 7. Ondertekening en ontvangst | Ondertekening wordt samen met controleerbaar documentbewijs vastgelegd. Betalingen worden per termijn en unieke ontvangstgebeurtenis geregistreerd. | Handmatige ontvangstregistratie blijft beschikbaar zolang geen echte betaalbron is gekoppeld. |
| 8. Definitief | De database controleert de actuele contractversie, het bestuursmandaat, ondertekenbewijs, vereiste betaling en beschikbaarheid opnieuw in één transactie. | Alleen bij een uitzondering. |
| 9. Opvolging | Definitieve bevestiging, agenda, restfactuur en herinneringen. De bestaande inhouds- en praktische mails gebruiken hun bestaande timing en templates, met opslag van opdracht en klantlink vóór verzending. | Inhoudelijk beheer, begeleiding en zichtbare uitzonderingen blijven menselijke taken. |

### De afgesproken uitzonderingen

**Andere aanvraag voor dezelfde periode.** De bestuursmail meldt: “Let op: er loopt al een aanvraag”. Ja legt het inhoudelijke akkoord vast. Bij een conflict blijft de aanvraag in behandeling; een bestaande optie, boeking of blokkade wordt niet overschreven. Wachtende goedkeuringen worden na vrijgave en via de cron opnieuw gecontroleerd. De vaste wachtopdracht heeft een eigenaar en opvolgdatum.

**Achttien maanden.** De controle gebruikt kalendermaanden, standaard van het einde van de eerdere expositie tot het begin van de volgende. Precies achttien maanden is toegestaan. Hoofd- en mede-exposanten, eerdere en toekomstig geplande exposities tellen mee. Een mogelijke naamsovereenkomst wordt herkenbaar anders weergegeven dan een bevestigde koppeling. De waarschuwing verhindert een bestuurlijke uitzondering niet. De afwijking wordt bewaard en waar nodig expliciet in de contractafspraken opgenomen. Historische dekking staat aanvankelijk op onbekend; zet die pas op volledig wanneer dat inhoudelijk is gecontroleerd.

**Concert en Overig.** `concert` en `diverse` vragen in dezelfde bestuursmail om een definitieve totaalprijs. De bevestigingspagina combineert prijs en Ja. Nee heeft geen bedrag nodig. Een vanafbedrag is geen prijsafspraak en wordt niet als definitieve prijs vooringevuld. Het vastgelegde bedrag gaat naar contract en facturen; de algemene tarieventabel verandert niet.

## 2. Wat de code bewaart

Het bestuursbesluit bevat de aanvraagversie, prijs, prijsbron, getoonde waarschuwingen, beleid, identiteit van de ingelogde bestuurder of beslissende mailbox en het standaardcontractprofiel. Een latere wijziging van algemene tarieven of profielen verandert dit akkoord niet.

Betekenisvolle aanvraagwijzigingen krijgen een nieuwe inhoudsrevisie. Ook het terugdraaien van een eerdere wijziging geeft dus geen oude beslislink of oude procesopdracht opnieuw bevoegdheid. Uploadsluiting, zoekindex en interne opvolgvelden tellen niet als een nieuwe inhoudelijke aanvraag.

`verhuur_proces_jobs` is de duurzame werklijst. Elke opdracht heeft een unieke sleutel, claim, status, pogingenteller en waar nodig eigenaar, deadline en providerbewijs. Dubbele klikken en herhaalde gebeurtenissen maken geen tweede boeking of verzending. De worker claimt één opdracht tegelijk. Gewone hercontrole kan opnieuw; een onbekende uitkomst rond een mail vraagt eerst controle van het providerbewijs.

Het bestaande dossier toont open opdrachten afzonderlijk van begrensde afgeronde historie. Daardoor verdwijnen oudere herstelacties of deadlines niet tussen dagelijkse controles.

## 3. Installatievolgorde

### Stap A — bouw en database eerst in een zelfstandige testomgeving

Gebruik een eigen lokale of stagingdatabase, testopslag en testmailvoorziening. De bestaande beveiliging blokkeert schrijvende previews die naar de productiedatabase verwijzen. Laat alle nieuwe activatievlaggen uit totdat onderstaande acceptatie is uitgevoerd.

Installeer de versies uit de bestaande lockfile en voer de volledige build uit:

```bash
npm ci
npm run build
```

De implementatie voegt geen npm-afhankelijkheden toe. Pas de bestaande migratiereeks toe en vervolgens deze vijf toegevoegde migraties in bestandsvolgorde:

1. `supabase/migrations/20261125100000_verhuurmachine_besluit_en_proces.sql`
2. `supabase/migrations/20261125110000_verhuur_contract_financieel.sql`
3. `supabase/migrations/20261125120000_ondertekenen_en_annuleren_atomair.sql`
4. `supabase/migrations/20261125130000_verhuur_concept_herbeoordelen.sql`
5. `supabase/migrations/20261125150000_verhuur_opvolging.sql`

Alle eerder aanwezige migraties blijven nodig. De al bestaande nieuwsbriefmigratie van `20261125103000` is geen onderdeel van deze wijziging; houd bij een volledige databaseopbouw de normale bestandsvolgorde aan.

De nieuwe migraties maken de machine niet automatisch actief. Bestaande dossiers worden niet als inhaalactie naar de nieuwe mailketen gezet. De intakefunctie krijgt een expliciete beschikbaarheidslock; de migratie stopt wanneer de verwachte bestaande functie afwijkt, zodat dit niet ongemerkt wordt overgeslagen.

### Stap B — bestaande instellingen en nieuwe servervariabelen invullen

| Instelling | Gebruik |
| --- | --- |
| `VERHUUR_MACHINE=true` | Servervrijgave voor de nieuwe verwerking. Daarnaast is de databasescope verplicht. |
| `VERHUUR_BESLUIT_SECRET` | Afzonderlijk willekeurig servergeheim van minimaal 32 bytes voor beslislinks en bevestigingsbewijs. Nooit een `PUBLIC_`-variabele. |
| `VERHUUR_BASIS_URL` | De vertrouwde eigen HTTPS-basis-URL voor mail- en beslislinks; in staging de staging-URL. |
| `VERHUUR_BETALING_WEBHOOK_SECRET` | Alleen nodig voor de gekozen betaalimport; afzonderlijk geheim van minimaal 32 tekens. |
| `DOCUMENTENFLOW=true` | Bestaande contract-/documentenroute. |
| `V4_ATOMAIR_CONTRACT=true` | Bestaande atomaire contractopslag. |
| `V4_AUTOCONTRACT=true` | Voorbereiding uit vastgelegde standaardafspraken. |
| `FACTUURPAKKET_V3=true` | Bestaande route voor het complete contract-/voorwaarden-/factuurpakket. |
| Bestaande Supabase-, opslag-, Resend- en croninstellingen | Blijven nodig; zet echte geheimen uitsluitend in de serveromgeving. |

Vul op **Beheer → Instellingen → Verhuur** de standaardafspraken in voor alle automatisch te verwerken verhuurtypen: tijden, opbouw/afbouw, aanbetaling, betaaltermijn, moment van restant en restfactuur, en de afspraak bij een korte boekingstermijn. Een ontbrekend profiel leidt tot een zichtbare uitzondering; de code verzint geen contractafspraak.

Controleer de bestaande bestuursontvangers, extra ontvanger en toezichtkopieën. Een beslislink vertegenwoordigt de bevoegdheid van de geadresseerde mailbox; hij bewijst niet welk bestuurslid achter die mailbox klikte. Een ingelogd besluit in het dossier registreert wel de individuele gebruiker.

Controleer ook de bestaande contracttemplate, verhuurder-/factuurgegevens en relevante automatiseringspoorten. Onder meer `aanvraag_bestuur`, `handmatige_template`, `statusmail_huurder`, `betalingscommunicatie`, `betaalherinnering`, `workflow` en de bestaande inhouds-/praktische categorieën moeten voor de gewenste verwerking passend ingesteld zijn. Deze oplevering zet die poorten niet zelf aan.

Een bestuursmail in Test bevat alleen een gewone beheerlink. Een live beslislink, contractpakket of klantlink mag niet door een tussentijdse omschakeling op Test naar een testadres worden omgeleid. Test de echte klikroute daarom in een zelfstandige stagingomgeving met expliciete testontvangers en bijbehorende vrijgave.

### Stap C — startscope en planning

Kies een expliciete startdatum op de verhuurinstellingenpagina. Een datum zonder tijd betekent het begin van die dag in Nederland. Alleen aanvragen binnen de actieve scope zonder historische importherkomst gaan automatisch naar de nieuwe intakeketen. Schakel de database-instelling en de servervlag pas in na acceptatie.

De normale intake, het bestuursbesluit en ondertekening wekken de worker direct. De bestaande `/api/cron/workflow` verwerkt herstel, toekomstige financiële opdrachten en beschikbaarheidsopvolging. De aangeleverde `vercel.json` behoudt hiervoor de bestaande dagelijkse planning om 06:00 UTC. Er is geen nieuwe frequentie of hostingabonnement verondersteld. Een vergeten upload of onderbroken request wordt uiterlijk bij een volgende succesvolle cronronde opgepakt; voor een korter herstelinterval moet die planning bewust worden ingericht.

De workflow-hoofdschakelaar houdt de eigen contract-/betaal-/beslismailwachtrij niet tegen; elk bericht blijft aan zijn eigen mailpoort gebonden. Machineboekingen blijven buiten de oude betaal- en bevestigingsplanner, ook als de machine tijdelijk wordt gepauzeerd.

## 4. Betaalontvangsten: gereed aansluitpunt, nog geen gekozen bankkoppeling

De code heeft `POST /api/verhuur/betaalontvangst` met HMAC-controle, unieke bron-/gebeurtenis-ID, koppeling aan een concrete betaaltermijn, deelbetaling en dubbele-ontvangstcontrole. Dit is een integratiepunt voor een bank- of boekhoudadapter. Er is geen provider geselecteerd of een echte rekening aangesloten.

Tot die aansluiting gebruikt een bevoegde beheerder **Aanbetaling ontvangen**, **Volledige betaling ontvangen** of **Restbetaling ontvangen** in het dossier. Ook dan loopt de verdere definitiefcontrole automatisch via dezelfde transactionele verwerking. Nul aanbetaling is nooit op zichzelf bewijs dat de volledige huur is betaald.

Payload, headers, herhaalgedrag, foutafhandeling en financieel verzendherstel staan volledig in `docs/verhuur-financiele-aansluiting.md`.

## 5. Herstel en uitzonderingen

| Situatie | Actie in het dossier |
| --- | --- |
| Andere aanvraag of reservering | Bekijk de concurrerende dossiers. Wijs de periode bewust toe zodra de harde capaciteit dit toestaat. |
| Ontbrekende standaardafspraak of ongezonden concept | Werk het concrete contract uit in de bestaande wizard. Beoordeel vervolgens precies die opgeslagen versie, prijs en termijnen. |
| Wijziging na Ja | Het oude mandaat pauzeert. Een geboekt dossier krijgt een menselijke herbeoordelingstaak met eigenaar en deadline. |
| Contract/factuur al uitgegeven, ondertekend of betaald | Bestuur en penningmeester handelen de wijziging af op de bestaande stukken. Geen automatische vervanging, creditnota of nieuwe factuur veronderstellen. |
| Provideruitkomst onbekend | Controleer ontvanger, bericht en tijdstip bij de provider. Leg bestaand bericht-ID en bewijs vast, of bewijs dat er niets is verstuurd. Pas daarna hervatten. |
| Ondertekenbevestiging deels verzonden | Herstel huurdersmail en interne bestuursmelding afzonderlijk. Een bewezen verzonden ontvanger wordt niet nogmaals gemaild. |
| Verlopen of ingetrokken aanleverlink | De geplande mail stopt. Maak via de bestaande dossierroute een actuele klantlink en handel de inhoudsvraag af; geen onbruikbare link alsnog verzenden. |
| Machine tijdelijk uit | Dossiers en bewijs blijven zichtbaar; besluiten, wizardmutaties en verzending worden gepauzeerd. De oude Ja/Nee-route keert niet terug. |

Verwijder of reset de nieuwe tabellen niet om een fout te “verhelpen”: daarmee verdwijnt het ontdubbelings- en verzendbewijs. Pauzeer zo nodig met de servervlag en relevante mailpoort, corrigeer de concrete oorzaak en hervat via de beheeractie. De vijfde onderbroken poging krijgt een menselijke taak in plaats van een stil hangende opdracht.

## 6. Uitgevoerde verificatie

De gezamenlijke netwerkvrije regressieronde omvat **71 testbestanden en 612 tests: 611 geslaagd, nul mislukt, één bestaande skip** wegens een ontbrekend historisch importbronbestand. De oudere SQL-resettest is bewust uitgefilterd en zit niet in die telling. De laatste aanpassing die open taken naast historie laadt is daarna afzonderlijk gecontroleerd: **17/17 UI-tests geslaagd**.

Daarnaast zijn **55 TypeScript/MJS-bestanden en vier Astro-frontmatters syntactisch gecontroleerd**; `git diff --check` is schoon. De tests blokkeren netwerk, laten productievariabelen buiten het testproces en roepen geen echte mailprovider aan.

Dit verifieert onder meer overlapping, achttien kalendermaanden, mede-exposanten, prijsinvraag, dubbele beslisklikken, oude aanvraag-/bronversies, GET/HEAD zonder mutatie, de wissel Live→Test, ondertekenfouten, onbekende provideruitkomsten, deelbetalingen, nul aanbetaling, conceptgoedkeuring en de gezamenlijke opslag van klanttoken en vervolgmail.

**Niet uitgevoerd in de opleveromgeving:** volledige Astro-build, TypeScript-typecheck, migratie-uitvoering op PostgreSQL, echte Supabase/RLS-integratie en een browserketentest met een ingerichte stagingomgeving. PostgreSQL/psql ontbrak en installatie van de vereiste applicatieafhankelijkheden werd door de packageomgeving geweigerd. De lokale tests vervangen deze vrijgavecontroles niet.

Herhaal de gerichte suite met:

```bash
npm run test:verhuur
```

De SQLfixture draait uitsluitend op een expliciet benoemde lokale testdatabase met alle migraties. De runner weigert externe hosts en databasenamen buiten `kerkje_test_*`:

```bash
KVP_SQL_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1/kerkje_test_verhuur npm run test:verhuur:sql
```

De fixture werkt in een teruggedraaide transactie en verstuurt niets. Stel eventuele lokale authenticatie zelf in; zet geen productie-URL in dit commando.

## 7. Acceptatie vóór de eerste live aanvraag

Voer met testgegevens minstens deze ketens uit en controleer zowel databasebewijs als werkelijk ontvangen testberichten:

1. Expositie met vrije periode: één Ja → één optie → één contractpakket → tekenen en vereiste betaling → definitief, bevestiging en agenda.
2. Concert en Overig: prijs ontbreekt/ongeldig → geen akkoord; geldige totaalprijs → exact hetzelfde bedrag in besluit, contract, termijnen en facturen. Nee werkt zonder prijs.
3. Twee aanvragen voor hetzelfde weekend: waarschuwing; beide inhoudelijk akkoord kan, automatische dubbele toewijzing niet. Een bestuurder wijst expliciet toe.
4. Harde reservering, interne blokkade en onbekende datum: geen automatische toewijzing. Vrijgave wekt wachtende goedkeuringen opnieuw.
5. Hoofd- en mede-exposant binnen achttien maanden, exact op de grens en bij een latere reeds geplande expositie. Controleer de opgeslagen afwijking en contractclausule.
6. Twee bestuurders bevestigen gelijktijdig: één besluit en één prijs winnen; de andere bevestiging overschrijft die niet. Openen/scannen van de mailknop beslist niets.
7. Aanvraag- of beschikbaarheidswijziging tussen tonen en bevestigen: nieuwe beoordeling verplicht. Een inhoudswijziging terugdraaien maakt de oude link niet opnieuw geldig.
8. Storing vóór opslag, na provideracceptatie, tijdens bewijsregistratie en tussen beide ondertekenbevestigingen: geen valse succesmelding of blinde herverzending; gecontroleerd herstel werkt.
9. Ondertekening vóór betaling en betaling vóór ondertekening; nul aanbetaling; deelbetaling en dubbele import. Definitief uitsluitend na alle actuele voorwaarden.
10. Restfactuur op de afgesproken uitgiftedag, herinnering volgens echte vervaldag en openstaand saldo; geen herinnering voor een nog niet aantoonbaar verzonden nota.
11. Annulering of herbeoordeling tegelijk met een geplande verzending/definitiefcontrole: geen nieuwe geldige tekenlink, overboeking of onterechte definitiefstatus.
12. Conceptcorrectie zonder uitgegeven stukken vervolgt na expliciete goedkeuring; uitgegeven/ondertekende/betaalde stukken blijven behouden en vragen een concrete uitzondering.
13. Inhoudsvraag: token is al opgeslagen wanneer de mail vertrekt; opnieuw plannen dupliceert niets; ingetrokken/verlopen tokens stoppen de mail.
14. Servervlag of scope pauzeren: de bestaande machinehistorie blijft zichtbaar, oude Ja/Nee-/verzend-/wizardroutes blijven dicht.
15. Controleer de publieke pagina’s en het bestaande formulier visueel, en het bestuursdossier en de nieuwe beslispagina op desktop en mobiel.

Pas na deze acceptatie de vijf migraties en configuratie gecontroleerd toe op de bedoelde liveomgeving en activeer de gekozen startscope. Voor bestaande uitgegeven stukken en echte betaalbronnen blijven de expliciete aansluit- en correctiehandelingen uit deze handleiding leidend.

## 8. Inhoud van dit pakket

De projectmap bevat de volledige bijgewerkte broncode. `VERHUURMACHINE_WIJZIGINGEN.patch` toont de wijzigingen tegenover de aangeleverde bron. Pas die patch alleen op een ongewijzigde oorspronkelijke checkout toe, niet nogmaals op de al bijgewerkte map uit dit pakket. De exacte testselectie, resultaten, syntaxcontrole en vergelijking van bestaande publieke bestanden staan in `docs/verification/`. `IMPLEMENTATIE_MANIFEST.json` bevat de bronreferentie en hashes van de opgeleverde bestanden.
