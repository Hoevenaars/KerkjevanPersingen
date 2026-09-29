# Kerkje van Persingen 3.0 — Masterplan, architectuur en besluitdocument

**Versie:** 1.0  
**Datum:** 29 september 2026  
**Doel:** duurzaam naslagdocument voor visie, functionele keuzes, Supabase-architectuur, implementatie, migratie en bestuurlijke livegang.

> **Kern:** het bestuur blijft bepalen wat bij het Kerkje past; het systeem zorgt dat geen processtap onzichtbaar stilvalt.

---

## 1. Waarom 3.0

Kerkje van Persingen 3.0 is niet primair een nieuw beheersysteem. Het is een **continuïteitsplatform** rondom de volledige levenscyclus van een aanvraag en activiteit.

De huidige applicatie bevat al veel bouwstenen: aanvragen, boekingen, kalender, agenda, finance, relaties, planning, rollen, communicatie en diverse domeinregels. De stap naar 3.0 is daarom niet alles opnieuw bouwen, maar:

1. bestaande logica behouden;
2. onderdelen aan één centraal dossier koppelen;
3. operationele state persistent maken;
4. workflows daadwerkelijk laten uitvoeren;
5. uitzonderingen zichtbaar maken;
6. productie uiteindelijk van Sanity naar Supabase verplaatsen.

### Kernbelofte

**Niet de mens uit het proces halen. Wel voorkomen dat het proces afhankelijk is van één mens.**

Het systeem moet op ieder moment kunnen beantwoorden:

1. Waar staat dit dossier?
2. Wie is aan zet?
3. Wanneer moet dit gebeuren?
4. Wat is daarna de volgende stap?
5. Wat gebeurt er als niemand iets doet?

---

## 2. Menselijke maat als ontwerpprincipe

Het kerkbestuur wil de menselijke maat behouden. Dat betekent niet dat processen handmatig moeten blijven.

### Het systeem doet zelfstandig

Feitelijke, voorspelbare en laag-risico handelingen:

- aanvraag registreren;
- volledigheid controleren;
- deadlines bewaken;
- reminders plannen;
- betaalstatus verwerken;
- kalenderstatus bijwerken;
- content uitvragen;
- gastheercontrole plannen;
- readiness berekenen;
- communicatie klaarzetten of versturen;
- technische fouten signaleren;
- dossierhistorie vastleggen.

### Het systeem bereidt voor, de mens beslist

Waar menselijke controle waarde heeft:

- conceptmail klaarzetten;
- content ter beoordeling aanbieden;
- uitzondering presenteren met alle relevante informatie;
- dossier klaarzetten voor eindcontrole;
- afwijkende financiële situatie als actie tonen.

### De mens beslist

Waar identiteit, reputatie, beleid, relatie of uitzondering speelt:

- past deze aanvraag bij het Kerkje?
- mag een uitzondering worden toegestaan?
- is aangeleverde content passend?
- is persoonlijk contact wenselijk?
- hoe gaan we om met een incident?
- mag van een procesregel worden afgeweken?

### Ontwerpregel

**Automatiseer de bewaking van contact. Niet noodzakelijk het contact zelf.**

Het systeem mag dus signaleren dat een bestuurder persoonlijk contact moet opnemen. Dat houdt de continuïteit hoog zonder de relatie te automatiseren.

---

## 3. Strategische keuze: geen demo-architectuur

Er wordt **geen aparte demo-app, fictieve state-machine of cookie-gestuurde nepworkflow** gebouwd.

De bestuurlijke presentatie moet zoveel mogelijk de **echte toekomstige applicatie** tonen:

- echte Supabase data;
- echte database-mutaties;
- echte workflows;
- echte klantflow;
- echte contentaanlevering;
- echte readiness;
- echte audit;
- echte website-output in preview/staging.

Alleen de productieschakelaar blijft uit totdat het bestuur definitief GO geeft.

### Voor de bestuurlijke GO

- productie blijft op Sanity;
- 3.0 draait veilig in preview/staging op Supabase;
- Sanity blijft productiebron en rollbackmogelijkheid;
- geen echte klanten worden onbedoeld vanuit staging gemaild.

### Na bestuurlijke GO

- laatste datamigratie;
- reconciliatie;
- smoke tests;
- bron-switch naar Supabase;
- stabilisatie;
- pas daarna Sanity verwijderen.

Daarmee is de GO een **cutover-besluit**, geen startschot voor het echte technische werk.

---

## 4. Huidige situatie — werkhypothese

Uit de eerdere code-analyse blijkt dat al veel 3.0-bouwstenen aanwezig zijn. Cursor moet dit vóór wijzigingen opnieuw verifiëren tegen de actuele repository.

Aangetroffen of eerder vastgesteld zijn onder meer:

- publiek aanvraagformulier;
- beheerpagina's voor aanvragen;
- boekingsdossiers;
- finance-overzicht;
- kalender en agenda;
- planning/gastheer;
- relaties;
- dashboard;
- rechten;
- aanvraagstatussen;
- boekingsstatussen;
- optielogica;
- finance-domeinregels;
- publicatieregels;
- kalenderregels;
- mailtemplates;
- datumgestuurde communicatieplanning;
- Supabase voor auth/rechten en reeds voorbereid schema;
- bronabstractie/feature flags voor Sanity versus Supabase;
- Sanity als huidige productie-contentbron.

### Belangrijkste huidige gap

De grootste gap is naar verwachting niet “functionaliteit ontbreekt”, maar:

> **domeinlogica, UI en operationele opslag zijn nog niet overal end-to-end met elkaar verbonden.**

Veel functies lijken al als regel, knop of berekening te bestaan, maar moeten nog werkelijk schrijven, persistent worden, vervolgstappen starten, audit vastleggen en veilig/idempotent worden uitgevoerd.

---

# 5. Doelarchitectuur Supabase

## 5.1 Hoofdprincipe

**`bookings` is de centrale kapstok van een definitieve activiteit, maar niet de opslagplaats voor alles.**

We vermijden twee uitersten:

1. één gigantische `bookings`-tabel met tientallen proceskolommen;
2. tientallen losse tabellen zonder duidelijke bron van waarheid.

De duurzame middenweg:

- booking = centrale identiteit en kernstatus;
- inhoudelijke subdomeinen krijgen eigen gekoppelde tabellen;
- afgeleide informatie wordt berekend;
- workflowregels zitten in code;
- concrete workflowstate staat in de database.

## 5.2 Eén applicatieschema

Gebruik in beginsel het standaard `public` schema voor applicatietabellen, tenzij de actuele codebase al bewust een andere consistente structuur gebruikt.

Geen kunstmatige opsplitsing in PostgreSQL-schema's zoals `finance`, `workflow` en `content` alleen om architectonisch “netjes” te lijken.

Eenvoud en onderhoudbaarheid gaan voor abstractie.

---

# 6. Logisch datamodel

> De onderstaande namen zijn **doelconcepten**, geen opdracht om blind nieuwe tabellen te maken. Cursor moet eerst het bestaande Supabase-schema inventariseren en ieder bestaand object hierop mappen.

## 6.1 Identiteit en rechten

### `auth.users`

Supabase Auth blijft de bron voor authenticatie.

Geen tweede eigen gebruikersadministratie bouwen.

### `profiles`

Alleen applicatieprofielinformatie, bijvoorbeeld naam, weergavenaam en status.

Bestaande rollen- en rechtenstructuur hergebruiken.

Alle mutaties worden server-side geautoriseerd. Een verborgen knop is nooit beveiliging.

---

## 6.2 Relaties en contacten

Logisch domein:

- `relations`
- `contacts`

Doel: een persoon of organisatie wordt niet opnieuw aangemaakt omdat deze later opnieuw huurt, exposeert of organiseert.

```text
relation
├── contacts
├── applications
└── bookings
```

Gebruik bestaande equivalenten indien aanwezig.

---

## 6.3 Aanvragen

Logisch domein:

### `applications`

Bevat de aanvraagfase en kerngegevens, bijvoorbeeld:

- id;
- relation/contact;
- activiteitstype;
- gewenste datum;
- aanvraagstatus;
- ingediend op;
- beoordelingsdeadline;
- created_at / updated_at.

Niet alle historie als losse kolommen opslaan. Besluiten en mutaties zijn via audit traceerbaar.

Na goedkeuring ontstaat een koppeling naar een boeking.

---

## 6.4 Boekingen

### `bookings`

Dit is de centrale kapstok.

Kerngegevens kunnen zijn:

- id;
- application_id;
- relation_id;
- activity_type;
- status;
- startdatum/tijd;
- einddatum/tijd;
- optie-einddatum;
- pricing snapshot of koppeling;
- publicatiestatus;
- created_at;
- updated_at;
- eventueel archived_at.

### Niet doen

Geen wildgroei zoals:

- content_deadline;
- host_deadline;
- finance_deadline;
- wait_on;
- escalation_text;
- payment_1;
- payment_2;
- readiness_green;
- dashboard_color;

als parallelle bron van waarheid.

---

## 6.5 Finance

Logisch domein:

### `payments`

In plaats van steeds meer financiële booleans op `bookings`.

Mogelijke velden:

- id;
- booking_id;
- type;
- bedrag;
- status;
- due_at;
- received_at;
- reference;
- created_at.

Hiermee is later zonder herbouw mogelijk:

- aanbetaling;
- volledige betaling;
- restant;
- correctie;
- restitutie.

De boeking kan een afgeleide financiële status tonen, maar financiële transactiestate blijft bij finance.

---

## 6.6 Content

### `booking_content`

Eén huidige inhoudelijke set per boeking is in eerste instantie voldoende, tenzij het bestaande model al anders werkt.

Mogelijke velden:

- booking_id;
- titel;
- omschrijving;
- publieke tekst;
- praktische informatie;
- status;
- submitted_at;
- approved_at;
- approved_by;
- updated_at.

Inhoudelijke wijzigingen zijn via audit traceerbaar.

### Bestanden

Bestanden en afbeeldingen:

- in Supabase Storage;
- metadata eventueel in `attachments`.

Geen grote blobs rechtstreeks in databasekolommen.

---

## 6.7 Planning / gastheer

Logisch domein:

### `host_assignments`

Niet alle planninghistorie in `bookings` drukken.

Mogelijke velden:

- id;
- booking_id;
- host_relation_id / host_user_id;
- status;
- assigned_at;
- confirmed_at.

Hiermee blijft vervanging/historie mogelijk.

Gebruik bestaand model als dat hetzelfde doel goed afdekt.

---

# 7. Workflow: het hart van 3.0

## 7.1 Workflowregels versus workflowstate

### Code bepaalt de regel

Bijvoorbeeld:

```text
definitieve publieke activiteit
+ content vereist
→ contentuitvraag op T-12 weken
```

Deze regels horen primair in de bestaande domain/platformlaag, bijvoorbeeld `src/platform/`.

### Database bewaart de concrete uitvoering

Bijvoorbeeld:

```text
booking: abc
task_type: content_request
due_at: 2027-01-24
status: open
```

Daarvoor gebruiken we logisch:

### `workflow_tasks`

Mogelijke velden:

- id;
- booking_id;
- application_id indien relevant;
- task_type;
- status;
- owner_type;
- owner_user_id indien relevant;
- due_at;
- priority;
- dedup_key / trigger_key;
- completed_at;
- created_at;
- updated_at.

### Waarom dit duurzamer is

Een boeking kan meerdere processen tegelijkertijd hebben:

```text
content aanleveren       klant       12 maart
gastheer koppelen        planning    19 maart
betaling controleren     finance     10 maart
```

Daaruit kan het systeem afleiden wie aan zet is, wat te laat is, wat eerst moet en wat wordt geëscaleerd.

### Geen BPM-platform bouwen

Geen generieke drag-and-drop workflow-engine. Dat creëert onnodige complexiteit.

---

# 8. De vijf continuïteitsvelden

Iedere actieve procesfase moet kunnen antwoorden:

1. **Status**
2. **Wie is aan zet / wacht op**
3. **Deadline**
4. **Volgende stap**
5. **Escalatie bij uitblijven**

Deze hoeven niet allemaal als duplicaatkolommen op `bookings` te staan.

Ze kunnen worden afgeleid uit:

- boekingsstatus;
- open workflowtaken;
- betalingen;
- contentstatus;
- planning;
- communicatie;
- eventdatum.

De uitkomst moet wel betrouwbaar, querybaar, testbaar en zichtbaar in dossier en dashboard zijn.

---

# 9. Communicatie-architectuur

## 9.1 Centrale communicatie

Logisch domein:

### `communications`

Mogelijke velden:

- id;
- booking_id;
- application_id;
- communication_type;
- template_key;
- ontvanger;
- kanaal;
- mode;
- scheduled_at;
- sent_at;
- status;
- onderwerp;
- error_message;
- dedup_key;
- created_at.

Status bijvoorbeeld:

- planned;
- draft;
- sending;
- sent;
- failed;
- cancelled.

### `communication_attempts`

Alleen indien nodig voor betrouwbare retry- en foutgeschiedenis.

## 9.2 Communicatiemodi

### Automatisch

Voor voorspelbare laag-risico handelingen.

### Concept / menselijke controle

Systeem maakt klaar, mens controleert.

### Handmatig / taak

Systeem bewaakt dát het gebeurt, mens neemt contact op.

## 9.3 Persistentie

Operationele communicatiestate mag niet duurzaam afhankelijk zijn van een lokaal JSON-bestand in een serverless omgeving.

Default templates mogen in code blijven. Dynamische state moet persistent in Supabase.

---

# 10. Conditionele workflow, niet alleen datumgestuurd

Een datumtrigger is nooit voldoende.

Voor iedere geplande actie geldt:

```text
triggerdatum bereikt
AND actuele conditie nog waar
→ uitvoeren
```

Voorbeelden:

```text
T-10 weken
AND content nog incompleet
→ contentreminder
```

```text
kritieke gastheergrens bereikt
AND gastheer ontbreekt
→ planningactie
```

```text
betaaldeadline verstreken
AND betaling ontbreekt
→ betaalreminder/escalatie
```

Geen reminder sturen voor iets dat al is opgelost.

---

# 11. Contentflow voor klant en website

Dit is een cruciale zichtbare 3.0-flow.

## 11.1 Gewenste flow

```text
boeking definitief
→ bepalen of publicatie/content vereist is
→ contentuitvraag plannen
→ klant ontvangt beveiligde link
→ klant levert gegevens aan
→ gegevens worden in centraal dossier opgeslagen
→ completeness-check
→ contentbeoordeling
→ akkoord of wijzigingsverzoek
→ website leest goedgekeurde data uit dezelfde bron
```

## 11.2 Timing

Bestaande timing is uitgangspunt waar correct:

- T-12 weken: initiële contentuitvraag;
- T-10 weken: reminder alleen als incompleet;
- T-8 weken: interne escalatie alleen als nog incompleet;
- T-4 weken: praktische informatie;
- T-4 weken: relevante gastheer/preparatie;
- T-2 dagen: laatste klantinformatie;
- T-1 dag: gastheer/daginformatie indien van toepassing;
- T+1 dag: reviewverzoek;
- T+1 dag: afloopcheck gastheer.

Exacte termijnen moeten uiteindelijk configureerbaar kunnen zijn, maar we bouwen niet direct een complexe configuratie-engine.

## 11.3 Niet hardcoderen op alleen “expositie”

Content is functioneel nodig voor **publieke activiteiten die gepubliceerd moeten worden**, niet puur omdat `type === expositie`.

Gebruik bestaande publicatieregels als bron. Geen nieuwe vlag toevoegen als het al betrouwbaar uit bestaande state is af te leiden.

---

# 12. Klanttoegang via magic link

Voor 3.0 is een volwaardig klantaccount niet noodzakelijk.

Voorkeursrichting:

### Beveiligde magic link

De klant krijgt een link voor precies één dossier en één toegestane context.

Logisch domein:

### `access_tokens`

Mogelijke velden:

- id;
- booking_id;
- purpose;
- token_hash;
- expires_at;
- revoked_at;
- eventueel used_at;
- created_at.

### Eisen

- cryptografisch veilige token;
- geen plain token duurzaam opslaan;
- server-side validatie;
- scope tot één dossier/actie;
- verloopdatum;
- intrekbaar;
- geen voorspelbare booking-ID toegang;
- geen beheerrechten;
- rate limiting/misbruikbeperking waar passend.

---

# 13. Contentbeoordeling door bestuur/stichting

Wanneer inhoudelijke beoordeling vereist is:

```text
content compleet
→ status contentbeoordeling
→ menselijke beoordeling
```

### Goedkeuren

- approval opslaan;
- audit;
- publicatie kan verder volgens beleid.

### Aanpassing vragen

- concrete feedback;
- klant ontvangt beveiligde link;
- wacht op klant;
- deadline/reminder;
- klant corrigeert;
- opnieuw beoordeling.

Geen losse e-mailketen als enige bron van waarheid.

---

# 14. Late boekingen: catch-up

Dit is verplicht.

Voorbeeld:

- contentuitvraag hoort T-12 weken;
- boeking wordt pas T-6 weken definitief.

De engine mag niet concluderen dat de trigger gemist is en dus niets meer hoeft te doen.

Regel:

> Als een verplichte stap nog niet voltooid is en de normale startdatum al voorbij is, bepaal de actuele eerstvolgende noodzakelijke actie en voer die direct of volgens veilige catch-up uit.

Dus:

```text
T-6 + content ontbreekt
→ direct contentuitvraag
```

Niet alle historische reminders tegelijk versturen.

---

# 15. Readiness

Readiness is een **afgeleide systeemfunctie**, geen handmatig bijgehouden statusset.

Controleer afhankelijk van activiteit:

### Finance

- betaling correct?

### Content

- content compleet?
- vereiste goedkeuring aanwezig?

### Publicatie

- publicatiestatus correct?

### Planning

- gastheer aanwezig indien vereist?

### Praktisch

- verplichte informatie compleet?

### Communicatie

- noodzakelijke dagcommunicatie gepland/verzonden?

### Documenten

- verplichte documenten aanwezig indien van toepassing?

Uitkomst:

- `Gereed`; of
- `Actie vereist`.

Bij ieder rood punt tonen:

- wat ontbreekt;
- wie eigenaar is;
- deadline;
- concrete vervolgactie.

Geen parallelle `payment_green`, `content_green`, `host_green`-waarheid opslaan als deze uit echte data kan worden berekend.

---

# 16. Dashboard

Het dashboard is een operationele cockpit.

Principe:

> **Groen werk hoeft niemand te openen.**

Gewenste blokken:

- Actie nodig
- Aandacht
- Op schema
- Mijn acties
- Komende activiteiten
- Technische signalen

Het dashboard gebruikt dezelfde procesberekening als het dossier. Geen tweede dashboardwaarheid creëren.

---

# 17. Kalender en agenda

Voorkom dat dezelfde datum op meerdere plekken als onafhankelijke waarheid wordt bijgehouden.

Idealiter:

```text
booking
→ veroorzaakt boekingsbezetting
```

Aparte kalenderrecords zijn alleen noodzakelijk voor zaken die **geen booking** zijn, zoals:

### `calendar_blocks`

- onderhoud;
- eigen gebruik;
- blokkade;
- gesloten dag.

Publieke agenda wordt afgeleid uit publiceerbare boekingen/content.

---

# 18. Audit en overrides

Logisch domein:

### `audit_log`

Minimaal:

- entity_type;
- entity_id;
- action;
- actor_type;
- actor_user_id indien mens;
- old_value;
- new_value;
- reason indien vereist;
- created_at.

Audit en communicatie zijn verschillende dingen.

### Overrides

Bij bewuste afwijking van een procesregel:

- wie;
- wat;
- wanneer;
- reden;
- oude situatie;
- nieuwe situatie.

Geen stille overrides.

---

# 19. Incidenten en nazorg

Bouw dit zo licht mogelijk.

Een activiteit kan na afloop:

- reviewflow krijgen;
- gastheer-afloopcheck krijgen;
- incident bevatten;
- open vervolgactie bevatten.

Bij incident of open actie:

**dossier niet automatisch afsluiten.**

Logische aparte entiteiten zoals `incidents` en `feedback` zijn verdedigbaar wanneer de functionaliteit daadwerkelijk wordt gebouwd. Geen tabellen “voor ooit” maken.

---

# 20. Databaseprincipes

## 20.1 Migrations zijn leidend

Alle schemawijzigingen via versioned migrations in Git.

Geen structurele “even in het Supabase Dashboard aangepast”-werkwijze.

Doel:

> een leeg Supabaseproject moet vanuit repository + migrations reproduceerbaar kunnen worden opgebouwd.

## 20.2 Generated TypeScript types

Na relevante schemawijzigingen:

```text
Supabase schema
→ generated database types
→ applicatie
```

Geen handmatig afwijkende database-interfaces onderhouden.

## 20.3 Constraints

Gebruik databaseconstraints waar ze ongeldige state veilig kunnen voorkomen:

- foreign keys;
- unique constraints;
- check constraints;
- NOT NULL waar functioneel correct;
- unieke dedup keys.

Niet alle businesslogica naar SQL verplaatsen.

## 20.4 Idempotentie

Iedere workflow-/scheduleractie moet veilig opnieuw kunnen draaien.

Geen dubbele:

- mails;
- taken;
- boekingen;
- workflowstate;
- audit-events voor hetzelfde event.

Gebruik waar passend dedup keys, unique indexes, upsert, gecontroleerde claim/statusovergang en transacties.

---

# 21. Omgevingen

Gewenste scheiding:

```text
LOCAL
↓
STAGING / PREVIEW
↓
PRODUCTION
```

## Local

- bouwen;
- migrations testen;
- unit/integratietests.

## Staging / preview

- echte 3.0 functionaliteit;
- echte Supabase database;
- testdata;
- echte workflow;
- veilige mailstrategie;
- bestuur ziet deze omgeving.

## Production

Tot GO:

- huidige productiebron / Sanity blijft leidend;
- geen productieverkeer naar nieuwe 3.0 write-path.

Na GO:

- gecontroleerde cutover.

### Geen dual-write als standaardstrategie

Vermijd tegelijk naar Sanity én Supabase schrijven tenzij er een expliciet migratiedoel is. Dual write creëert reconciliatieproblemen en onduidelijke waarheid.

---

# 22. RLS en security

Vanaf dag één.

Voor relevante tabellen:

- RLS;
- minimale policies;
- server-side autorisatie;
- service role uitsluitend server-side;
- secrets nooit client-side;
- publieke website krijgt alleen data die publiek mag zijn;
- magic-link klant krijgt geen directe generieke tabeltoegang.

Een verborgen UI-knop is geen security.

---

# 23. E-mailveiligheid staging

Staging mag nooit per ongeluk echte klanten mailen.

Veilige opties, passend bij bestaande Resend-architectuur:

- environment guard;
- allowlist;
- recipient override;
- `[STAGING]` prefix;
- blokkeer verzending naar niet-toegestane adressen.

Productielogica blijft inhoudelijk dezelfde.

Technische fout:

- log;
- retry volgens beleid;
- uiteindelijk zichtbaar technisch signaal;
- proces mag niet stilvallen.

---

# 24. Tijd en tijdzones

Activiteiten vinden in Nederland plaats.

Gebruik één consistente strategie:

- datum zonder tijd: PostgreSQL `date`;
- echte tijdstippen: `timestamptz`;
- UI/domein interpreteert eventtijd in `Europe/Amsterdam`;
- tests rond DST en datumgrenzen.

Nooit door onbedoelde UTC-conversie een activiteit één dag verschuiven.

---

# 25. Betrouwbaarheid en transacties

Samengestelde processen mogen niet half uitgevoerd blijven.

Voorbeelden:

- betaling geregistreerd, maar booking niet definitief;
- aanvraag goedgekeurd, maar geen optie aangemaakt;
- content goedgekeurd, maar workflow blijft “wacht op content”.

Gebruik de eenvoudigste betrouwbare oplossing:

- transactie;
- databasefunctie/RPC indien nodig;
- idempotente service;
- retry/compensatie.

Geen complexe event-sourcingarchitectuur zonder noodzaak.

---

# 26. Sanity-strategie

## Nu

Sanity blijft productiebron.

Nieuwe ontwikkeling:

- geen nieuwe onnodige Sanity-afhankelijkheden;
- Supabasepad volledig ontwikkelen;
- source adapters netjes scheiden.

## Voorbereiden

Idempotente Sanity → Supabase migratieroute.

### Dry run

- niets schrijven;
- aantallen;
- mapping;
- ontbrekende relaties;
- conflicts;
- assets;
- waarschuwingen.

### Staging run

- import;
- externe bron-ID bewaren waar nuttig;
- geen duplicaten bij tweede run;
- relaties behouden;
- assets correct migreren;
- rapport na afloop.

## Na bestuurlijke GO

1. export/backup;
2. dry run;
3. finale delta-import;
4. reconciliatie;
5. preview/smoke test;
6. bron-switch;
7. monitoring;
8. Sanity tijdelijk readonly/fallback;
9. pas na stabilisatie dependency verwijderen.

---

# 27. Wat we bewust niet nu bouwen

Buiten scope tenzij technisch noodzakelijk voor het gesloten proces:

- AI-assistent;
- complexe CRM;
- uitgebreide marketingautomation;
- groot klantportaal;
- workflow-designer/BPM-platform;
- volledig nieuw dashboard;
- redesign;
- gebouwbeheer 2.0;
- generieke key/value configuratiedatabase;
- tabellen voor hypothetische toekomstige functies.

---

# 28. Implementatiefasen

## Fase A — Fundering Supabase

- actuele schema-audit;
- migrations;
- repository/data access;
- auth/RLS;
- audit;
- persistent operationele communicatiestate;
- generated types;
- staging mailguard.

**Resultaat:** Supabase kan betrouwbaar operationele processen dragen.

## Fase B — Aanvraag tot definitief

- aanvraag schrijven;
- bestuurlijke beoordeling;
- aanvullende informatie;
- optie;
- betaling;
- definitief;
- kalender.

**Resultaat:** voorkant proces end-to-end gesloten.

## Fase C — Voorbereiding

- concrete workflowtasks;
- conditionele triggers;
- catch-up;
- content magic link;
- contentaanlevering;
- content review;
- websitepublicatie;
- gastheer;
- praktische informatie;
- readiness.

**Resultaat:** proces hoeft niet handmatig bewaakt te worden richting activiteit.

## Fase D — Dag en nazorg

- daginformatie;
- incident;
- review;
- gastheercheck;
- dossierafsluiting.

**Resultaat:** volledige cyclus.

## Fase E — Website op Supabase preview

- publieke reads;
- agenda;
- beschikbaarheid;
- content;
- aanvraag;
- assets.

**Resultaat:** bestuur ziet feitelijk de toekomstige websiteketen.

## Fase F — Dashboard/cockpit

- actie nodig;
- aandacht;
- op schema;
- mijn acties;
- komende activiteiten;
- technische signalen.

## Fase G — Migratiegereedheid

- importer;
- dry run;
- staging migratie;
- reconciliatie;
- cutoverchecklist.

---

# 29. Definition of Done per functie

Een functie is niet klaar omdat een scherm zichtbaar is.

Klaar betekent minimaal:

- data is persistent;
- status klopt;
- eigenaar / wacht-op is bekend;
- deadline bestaat waar relevant;
- volgende stap is gedefinieerd;
- gedrag bij overschrijding bestaat;
- audit bestaat waar relevant;
- rechten kloppen server-side;
- communicatie is conditioneel;
- foutpad bestaat;
- idempotentie is geborgd;
- tests bestaan;
- build is groen.

---

# 30. Definition of Done voor bestuurlijke 3.0-preview

De bestuurlijke preview is pas overtuigend wanneer de volgende flow echt werkt:

1. testklant dient aanvraag in;
2. bestuur ziet aanvraag;
3. bestuur kan goedkeuren, afwijzen of meer informatie vragen;
4. klant kan aanvullende informatie teruggeven;
5. goedkeuring maakt echte optie/boeking;
6. betaling kan echt in staging worden geregistreerd;
7. betaling maakt boeking definitief;
8. voorbereidingstijdlijn ontstaat;
9. klant krijgt veilige contentlink;
10. klant levert content aan;
11. bestuur keurt goed of vraagt wijziging;
12. previewwebsite leest goedgekeurde content uit Supabase;
13. gastheer kan worden gekoppeld;
14. readiness wordt berekend;
15. reminders stoppen zodra conditie niet meer waar is;
16. late-booking catch-up werkt;
17. nazorg wordt gepland;
18. incident voorkomt automatische afsluiting;
19. dashboard gebruikt dezelfde state;
20. audit toont besluiten en overrides;
21. productie blijft onaangeraakt op Sanity.

---

# 31. Verplichte testscenario's

Minimaal:

1. Normale expositie end-to-end.
2. Meer informatie gevraagd.
3. Afwijzing.
4. Betaling blijft uit.
5. Content tijdig → geen reminder.
6. Content te laat → juiste reminder/escalatie, geen duplicaten.
7. Late boeking T-6 → actuele actie, geen historische mailstorm.
8. Gastheer al aanwezig → geen ontbreektmelding.
9. Gastheer ontbreekt → planningactie.
10. Scheduler twee keer → geen dubbele taken/mails.
11. Betaling twee keer registreren → geen dubbele definitief-flow.
12. Content twee keer submitten → consistente versie/audit.
13. Mailfout → retry → technisch signaal.
14. Incident → dossier blijft open.
15. Unauthorized mutation → server-side geblokkeerd.
16. Verlopen magic link → geen data uitlekken.
17. Staging e-mail → niet-allowlisted adres geblokkeerd/omgeleid.
18. Productie-isolatie → staging heeft geen effect op productie/Sanity.

---

# 32. Beslislogboek

## Besluit 1 — Supabase nu bouwen

**Besluit:** ja.  
**Waarom:** het bestuur moet de werkelijke toekomstige omgeving ervaren.  
**Randvoorwaarde:** geen productie-cutover.

## Besluit 2 — Sanity nog niet verwijderen

**Besluit:** behouden tot GO en succesvolle cutover.  
**Waarom:** productiecontinuïteit, rollback en datamigratie.

## Besluit 3 — Geen demo-state-machine

**Besluit:** niet bouwen.  
**Waarom:** presentatie zonder productiewaarde.

## Besluit 4 — Bookings als kapstok

**Besluit:** booking is centrale dossieridentiteit.  
**Waarom:** één bron van waarheid zonder mega-tabel.

## Besluit 5 — Workflowregels in code, concrete state in database

**Besluit:** ja.  
**Waarom:** regels zijn versioneerbaar/testbaar; actuele taken zijn persistent/querybaar.

## Besluit 6 — Readiness afleiden

**Besluit:** niet als parallelle booleans onderhouden.  
**Waarom:** voorkomt stale data.

## Besluit 7 — Dashboard afleiden

**Besluit:** dashboard is projectie van dezelfde processtate.  
**Waarom:** geen tweede waarheid.

## Besluit 8 — Contentflow via veilige klantlink

**Besluit:** magic-link eerst, geen zwaar klantportaal.  
**Waarom:** laagdrempelig en minder support/contactdruk.

## Besluit 9 — Menselijke maat via communicatiemodus

**Besluit:** automatisch / concept / handmatig als kernmechanisme.  
**Waarom:** menselijke betrokkenheid blijft mogelijk zonder continuïteit op te geven.

## Besluit 10 — Geen dual write als standaard

**Besluit:** productie blijft Sanity, staging Supabase.  
**Waarom:** dual write creëert synchronisatieproblemen.

## Besluit 11 — Migrations zijn verplicht

**Besluit:** alle databasestructuur in Git.  
**Waarom:** reproduceerbaarheid, controle en betrouwbaarheid.

## Besluit 12 — Conditionele reminders

**Besluit:** iedere tijdtrigger hercontroleert actuele toestand.  
**Waarom:** voorkomt foutieve klantcommunicatie.

---

# 33. Open bestuurlijke/functionele beslissingen

Deze keuzes mogen niet stilzwijgend technisch worden ingevuld wanneer bestaand beleid geen antwoord geeft:

1. Hoe wordt een datum behandeld tijdens beoordeling: vrij, optie of tijdelijke reservering?
2. Volledige betaling of aanbetaling + restant per activiteitstype?
3. Definitieve remindertermijnen per proces.
4. Welke activiteiten vereisen publicatie/content?
5. Welke activiteiten vereisen een gastheer?
6. Wanneer mag een dossier automatisch afsluiten?
7. Welke rollen mogen overrides uitvoeren?
8. Welke contactmomenten moeten standaard menselijk blijven?
9. Welke klantgegevens/documenten zijn verplicht per activiteitstype?
10. Bewaartermijnen van persoonsgegevens en documenten.

Technische keuzes die veilig uit bestaande architectuur volgen hoeven niet steeds naar het bestuur.

---

# 34. No-brainers

1. **Niet opnieuw bouwen wat al bestaat.**
2. **Geen UI zonder echte backendflow.**
3. **Geen workflow zonder deadline en foutpad.**
4. **Geen reminder zonder actuele conditiecheck.**
5. **Geen databasewijziging buiten migrations.**
6. **Geen tweede waarheid voor dashboard/readiness/website.**
7. **Geen lokale JSON als duurzame operationele state.**
8. **Geen service-role secret in de client.**
9. **Geen productiecutover vóór expliciete GO.**
10. **Geen Sanity verwijderen vóór bewezen migratie en rollback.**
11. **Geen “groene build” door tests of typechecks uit te schakelen.**
12. **Geen extra architectuur alleen omdat het technisch interessant is.**

---

# 35. Aanbevolen repo-documentatie

Sla dit document in de repository op als:

```text
docs/KERKJE_3_0_MASTERPLAN.md
```

Gebruik het daarna als inhoudelijke bron bij alle verdere ontwikkeling.

Later kunnen uit de werkelijk gebouwde situatie volgen:

```text
docs/KERKJE_3_0_DATA_MODEL.md
docs/KERKJE_3_0_CUTOVER.md
```

maar alleen wanneer die actueel worden gehouden.

---

# 36. Bronnen en status

Dit masterplan is samengesteld uit:

- **Kerkje van Persingen 3.0 | Procesdocument — continuïteit van aanvraag tot afronding**;
- de eerdere Cursor delta-analyse van de huidige codebase;
- de besproken keuzes rondom Supabase, Sanity, workflow, content, communicatie en menselijke maat;
- eerdere inspectie van de publieke repository `Hoevenaars/KerkjevanPersingen`.

**Belangrijk:** repositorydetails zijn een momentopname. Voor implementatie moet Cursor de actuele codebase en actuele Supabase-migrations opnieuw verifiëren. Dit document bepaalt de **richting en principes**, niet dat een genoemde tabel blind opnieuw moet worden aangemaakt.

---

# 37. Eindbeeld

Het gewenste eindbeeld is niet “meer software”. Het gewenste eindbeeld is:

> Een bestuurder kan afwezig zijn zonder dat het proces stilvalt.  
> Een nieuwe bestuurder kan zien wat er loopt en wat er moet gebeuren.  
> De klant krijgt op het juiste moment duidelijke communicatie en kan eenvoudig zelf gegevens aanleveren.  
> Het bestuur houdt zeggenschap over inhoud, uitzonderingen en menselijke relaties.  
> Website, planning, finance, content en communicatie lezen uit dezelfde waarheid.  
> Het systeem bewaakt de continuïteit. De mens bewaakt de identiteit van het Kerkje.
