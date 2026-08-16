# Kerkje van Persingen

Website van Stichting Het Kerkje van Persingen. Astro + Sanity, gehost op Vercel.

- Canoniek domein: **kerkjepersingen.nl**
- Redirects (308): `www.kerkjepersingen.nl`, `kerkjevanpersingen.com`, `persingen-verhuur.nl`,
  `persingen-cultuur.nl`, `hetkerkjevanpersingen.nl` — alle inclusief www-variant

---

## Aan de slag

```bash
npm install
cp .env.example .env      # vul de waarden in
npm run dev
npm test                  # validatie van het aanvraagformulier
```

## Beschikbaarheidskalender

Maandkalender op `/verhuur/`, server-gerenderd. Navigeren gaat met gewone links
(`?maand=2027-05`), dus zonder JavaScript, en elke maand heeft een deelbare URL. Naast
maandnavigatie zit er een jaarrij in, omdat het bestuur tot in 2028 plant.

Een vrije dag linkt door naar `/verhuur/aanvragen/?datum=YYYY-MM-DD`, waarmee de datum
in het formulier al is ingevuld. Meerdaagse boekingen (start plus eind) worden over alle
tussenliggende dagen als bezet getoond.

## Formulier

Verwerking gebeurt in `src/pages/verhuur/aanvragen/index.astro` met een gewone POST, met
redirect naar de bedankpagina bij succes. **JavaScript is nergens voor nodig.** Bij een
fout blijven ingevulde waarden staan en verschijnt bovenaan een samenvatting met links
naar de betreffende velden.

Validatie staat in `src/lib/validatie.ts` en is bewust vrij van imports, zodat die zonder
mocks te testen is. `src/lib/aanvraag.ts` doet alleen de verzending.

De site draait op `http://localhost:4321`. Staat `SITE_PASSWORD` gevuld, dan vraagt de
browser om gebruikersnaam `kerkje` en dat wachtwoord.

---

## DNS staat bij Vercel, niet bij mijndomein

De nameservers van kerkjepersingen.nl wijzen naar Vercel. **Records die je bij mijndomein
aanpast hebben geen werking.** Alle DNS-wijzigingen gaan via
Vercel → Domains → kerkjepersingen.nl → DNS Records.

**Wil de stichting later e-mail op dit domein:** vraag bij mijndomein de MX- en SPF-records
van hun mailpakket op en voeg die handmatig toe in Vercel DNS. Zonder die stap komt er geen
mail aan. Dit is de meest waarschijnlijke toekomstige valkuil.

**Terugvalscenario:** de stichting kan bij mijndomein de nameservers terugzetten naar
`nsn1.mijndomein.nl` en `nsn2.mijndomein.nl`. De site is dan onbereikbaar tot er nieuwe
records staan.

### Mailrecords

Formuliermail gaat via Resend vanaf het subdomein `send.kerkjepersingen.nl`. Dat subdomein
heeft eigen DKIM-, SPF- en MX-records, zodat de configuratie van het hoofddomein
ongemoeid blijft.

DMARC staat op twee plekken:

| Naam | Waarde |
| --- | --- |
| `_dmarc` | `v=DMARC1; p=none; rua=mailto:…` |
| `_dmarc.send` | `v=DMARC1; p=none;` |

**Openstaande taak (rond 29 augustus 2026):** rapporten controleren en beide records
verscherpen van `p=none` naar `p=reject`. Blijft dit op `p=none` staan, dan biedt DMARC
geen bescherming tegen misbruik van de domeinnaam.

---

## Omgevingsvariabelen

| Variabele | Verplicht | Toelichting |
| --- | --- | --- |
| `SITE_PASSWORD` | nee | Gevuld = site afgeschermd én `noindex`. Leeg = openbaar. |
| `RESEND_API_KEY` | ja | Zonder deze sleutel wordt geen aanvraag verstuurd. |
| `CONTACT_FALLBACK_EMAIL` | ja | Terugval als het Sanity-veld leeg of ongeldig is. |
| `CONTACT_BCC_EMAIL` | nee | Vangnet-kopie van elke aanvraag. |
| `SANITY_PROJECT_ID` | ja | Zonder dit blijft de agenda leeg (site blijft werken). |
| `SANITY_DATASET` | ja | `production` |
| `SANITY_API_TOKEN` | ja | **Schrijfrechten (Editor)** — nodig om vrienden aan te maken en verzendstatus te zetten. Alleen lezen is niet genoeg. |
| `CRON_SECRET` | ja | Zelfde waarde als Vercel Cron meestuurt. Zonder deze variabele weigeren de cron-routes elke aanroep. |
| `NIEUWSBRIEF_PREVIEW_ADRES` | nee | Ontvanger van de donderdag-conceptmail. Standaard het adres van de webmaster. |

---

## Afscherming en livegang

De afscherming zit in `src/middleware.ts` en draait server-side. Dat verving een eerdere
opzet met een wachtwoord in client-side JavaScript, waar het wachtwoord leesbaar in de
paginabron stond.

Eén variabele stuurt drie dingen tegelijk: de basic auth, de `X-Robots-Tag: noindex`-header
en de inhoud van `robots.txt`. Dat is bewust gekoppeld — een achtergebleven `noindex` na
livegang is de duurste en meest voorkomende fout.

### Livegang-checklist

- [ ] `SITE_PASSWORD` verwijderd in Vercel
- [ ] Controleren: `robots.txt` toont `Allow: /`, geen `X-Robots-Tag` in de response
- [ ] Per contentpagina `export const prerender = true` zetten voor statische HTML
      (zie `astro.config.mjs`); `/verhuur/aanvragen/` en `/api/*` blijven server-side
- [ ] `sitemap.xml` indienen bij Google Search Console
- [ ] Testaanvraag via het formulier: komt aan, niet in spam, BCC ontvangen,
      beantwoorden gaat naar de aanvrager
- [ ] Foto's aanwezig in `public/foto/` (zie hieronder)
- [ ] Favicon-set compleet: `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`,
      `og-default.jpg`
- [ ] Vercel-project verplaatst naar een team op naam van de stichting
- [ ] Automatische verlenging aan op alle vijf domeinen

---

## Blokkerend voor livegang

**1. ANBI-publicatieplicht.** Op `/organisatie/` ontbreken nog:

- Contactgegevens bestuur
- Bestuurssamenstelling
- Beleidsplan op hoofdlijnen
- Beloningsbeleid
- Doelstelling
- Verslag van de uitgeoefende activiteiten
- Financiële verantwoording (balans, staat van baten en lasten)

Aan te leveren door het bestuur; penningmeester voor het financiële deel. Zonder deze
gegevens voldoet de stichting niet aan de wettelijke publicatieplicht.

**2. Privacyverklaring.** Zodra het formulier live persoonsgegevens verwerkt, is een
privacyverklaring wettelijk verplicht. `/privacyverklaring/` bevat nu alleen een
structuurvoorstel. Twee punten vragen een besluit: de bewaartermijn, en of de BCC naar een
persoonlijk e-mailadres wordt vermeld. Beide zijn nodig voor een complete verklaring.

---

## Merk en iconen

| Bestand | Waar |
| --- | --- |
| `favicon.svg` | Tabblad en header — vereenvoudigd beeldmerk |
| `favicon.ico` | Tabblad, oudere browsers (16/32/48) |
| `apple-touch-icon.png` | iOS-startscherm, 180px |
| `icon-192.png`, `icon-512.png` | Webmanifest, `purpose: any maskable` |
| `og-default.jpg` | Social preview, 1200×630 |
| `logo.png`, `logo-klein.png` | Volledig zegel, transparant |

**Twee beeldmerken, bewust.** Het volledige zegel met cirkeltekst is onleesbaar onder
ongeveer 100 pixels: de ring wordt een grijze vlek. Daarom is er een vereenvoudigde
silhouet — toren met spits en kruis, schip met zadeldak — voor tabblad, header en app-icoon.
Het volledige zegel verschijnt waar het ruimte heeft: de band boven de footer, de
404-pagina en de social preview.

Wijzigt het zegel, dan moet `public/favicon.svg` handmatig mee. Die is nagetekend, niet
automatisch afgeleid.

**Metseltekens.** `MasonMark.astro` blijft in gebruik als ondergeschikte structuurmarkering
bij de eyebrows boven paginakoppen. Ze vullen het zegel aan en concurreren er niet mee.

## Foto's

Plaats in `public/foto/`:

| Bestand | Gebruikt op |
| --- | --- |
| `nieuwe-vlag.jpg` | Home, hero |
| `doorzicht-toren.jpg` | Het kerkje, Verhuur, Home |
| `bijenhotel.jpg` | Omgeving |
| `gevelrestauratie.jpg` | Geschiedenis, Steun ons |
| `muren-spreken-1.jpg`, `muren-spreken-2.jpg` | Geschiedenis |
| `parkeerplaats.jpg` | Contact |

Elke `.frame` heeft een vaste beeldverhouding met `object-fit: cover`. Dat is een bewuste
keuze: het bestuur wil geen professionele fotoshoot, dus het ontwerp moet wisselende
fotokwaliteit opvangen in plaats van erop leunen. Lever de foto's zo groot mogelijk aan;
bijsnijden gebeurt in de layout.

Foto's uit het CMS worden door Sanity automatisch verkleind en naar WebP omgezet.

---

## Content beheren

Het bestuur beheert de agenda via Sanity Studio. Eén contenttype, `Activiteit`, voedt drie
weergaven:

| Zichtbaarheid | Beschikbaarheidskalender | Agenda | Home |
| --- | --- | --- | --- |
| `verborgen` | nee | nee | nee |
| `bezet` (standaard) | ja, als "Bezet" | nee | nee |
| `publiek` | ja | ja | ja, als eerstvolgende |

Standaard is `bezet`: de datum wordt geblokkeerd zonder dat er details naar buiten gaan.
Gevolg van deze opzet: **het CMS is tegelijk de boekingsadministratie.** Elke reservering
moet erin, ook die zonder publiciteit. Wordt er daarnaast een eigen agenda bijgehouden,
dan wordt de kalender op de site onbetrouwbaar.

Het e-mailadres voor aanvragen staat onder **Instellingen** en is te wijzigen door iedereen
met CMS-toegang, zonder deploy.

Onder Instellingen zitten ook (ingeklapt, nog niet live): tarieven voor een later
contract, het adres van de penningmeester, termijnen voor aanbetaling en content, en
sjablonen voor de automatische mails. Aanvragen vanaf de site worden naast de mail ook
als document bewaard onder **Agenda en boekingen → Aanvragen**. Ja/nee koppelt nog geen
boeking; dat blijft handmatig tot het proces live gaat.

Op elke activiteit staat het veld **E-mailadres huurder** (niet publiek). Daar gaan later
de voorbereidingsmails en het review-verzoek heen. Bestaande boekingen hebben dat veld
nog leeg; dat is één keer aan te vullen. Nieuwe website-aanvragen nemen het adres mee.

### Vriendenmail

Wekelijkse mail naar aangemelde vrienden. Inhoud (kort nieuws, donatie-update) en de
ontvangerslijst staan in Sanity onder **Vrienden van het kerkje**.

- Aanmelden: `/vrienden/aanmelden/` — bewust niet in navigatie of footer, alleen via
  een gedeelde link. Of dat zo blijft, is nog een bestuursbesluit.
- Uitschrijven: persoonlijke link in elke mail (`/vrienden/afmelden/?token=…`).
- Donderdag (16:00 Nederlandse wintertijd / 17:00 zomertijd): concept naar de webmaster.
- Vrijdagochtend (10:30 wintertijd / 11:30 zomertijd): verzending naar actieve vrienden.
  Die uurverschuiving rond de zomertijdovergang is een bewust geaccepteerd Hobby-plan-risico.

Zonder ingevuld nieuwsbrief-document gaat de mail tóch, met alleen het agenda-blok. Zet
"Deze week niet versturen" aan om een week over te slaan.

### Back-up

```bash
npm run sanity:export
```

Content staat bij Sanity, niet in deze repo. Draai deze export periodiek, zodat je bij een
storing of prijswijziging niet zonder content zit.

---

## Bekende beperkingen

- **Rate limiting op het formulier** werkt in het geheugen van één serverless-instantie en
  houdt geen verdeelde aanval tegen. Bewust geaccepteerd; bij daadwerkelijke spam is Vercel
  Firewall of Upstash de volgende stap.
- **De kalender haalt alle boekingen op**, zonder filter per periode. Bij een paar honderd
  boekingen verwaarloosbaar; loopt dat op, dan wordt een query per zichtbare maand nodig.
- **Er is nog geen manier om te doneren.** "Word Vriend" en "Doneer eenmalig" wijzen naar
  het contactformulier omdat er geen IBAN is aangeleverd.
- **Fonts komen van Google Fonts.** Zelf hosten scheelt een externe verbinding en is beter
  voor privacy en laadtijd. Nog niet gedaan.
- **Het zegel is niet vectorieel.** Het logo is een PNG. Voor drukwerk en scherpe weergave
  op grote formaten is een SVG of AI-bestand nodig. Voor de site volstaat de huidige PNG.
