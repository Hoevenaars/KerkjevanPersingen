/**
 * Voorstelteksten voor latere automatische mails. Nog niet verstuurd.
 *
 * Twee registers, één huisstijl (pine/brick/cream, zelfde omlijsting als
 * aanvraag.ts en nieuwsbrief.ts):
 *   u  — huurder, exposant, contract
 *   je — vriendenmail (bestaat al) en gastheren (vrijwilligers)
 * Intern (Paul, bestuur) — kort, zonder aanhef-sier, wél dezelfde footer.
 *
 * Plaatshouders vult het systeem later in.
 */
export const MAILTEKSTEN = {
  afwijzing: `Beste {naam},

Hartelijk dank voor uw aanvraag voor {soort} op {datum}.

Helaas kunnen we deze datum niet toewijzen. De ruimte is dan niet beschikbaar, of de aanvraag past niet binnen onze verhuurvoorwaarden.

U bent van harte welkom een andere datum voor te stellen via kerkjepersingen.nl/verhuur/aanvragen/.

Met vriendelijke groet,
Bestuur Het Kerkje van Persingen`,

  volgendeStappen: `Beste {naam},

Goed nieuws: uw boeking voor {soort} op {datum} is definitief. De aanbetaling is ontvangen.

Wat nu:
• U ontvangt van ons de praktische informatie tijdig voor de datum.
• Voor een expositie vragen we u later om een korte tekst en een foto voor de website.
• Parkeren kan op het terrein aan de overkant van de straat.
• Vragen? Bel 06 52 66 84 49.

Het afgesproken tarief is {tarief}.

Met vriendelijke groet,
Bestuur Het Kerkje van Persingen`,

  contentVerzoek: `Beste {naam},

Uw {soort} in het kerkje is op {datum}. We zetten het graag op tijd op de website, zodat bezoekers het kunnen vinden.

Wilt u ons vóór {uitersteDatum} sturen:
• een korte tekst (een paar zinnen is genoeg)
• één foto die we mogen publiceren
• of we de foto mogen gebruiken (kort bevestigen is voldoende)

Stuur dit naar {contactpersoon} of antwoord op deze mail.

Zonder tekst en foto blijft de datum op de kalender op “bezet” staan, zonder verdere toelichting. Dat is geen probleem — het is alleen zonde als bezoekers het event niet kunnen vinden.

Met vriendelijke groet,
Bestuur Het Kerkje van Persingen`,

  contentTerBeoordeling: `Er is content binnengekomen voor {soort} op {datum} ({naam}).

Bekijk tekst en foto in Sanity, onder de boeking, bij “Aangeleverde website-content”.
Akkoord? Zet de status op Goedgekeurd. Afgewezen? Zet Afgewezen en laat kort weten wat er anders moet.`,

  praktisch4w: `Beste {naam},

Over vier weken is het zover: {soort} op {datum} in het kerkje van Persingen.

Praktisch:
• Adres: Persingensestraat 7, 6575 JA Persingen.
• Parkeren: alleen op het terrein aan de overkant van de straat.
• Geen entree heffen, bij geen enkele activiteit.
• Geen horeca verkopen. Iets aanbieden uit gastvrijheid mag wel.
• Schade tijdens de huurperiode is voor rekening van de huurder.

Voor exposities:
• In principe het hele weekend, zaterdag én zondag, 11.00–17.00 uur.
• Werk ophangen alleen aan de aanwezige systemen, max. 10 kg per houder.
• Staat er op vrijdag al iets anders, dan inrichten vanaf circa 16.30 uur.

Uw contactpersoon vanuit het bestuur is {contactpersoon}.
De gastheer of gastvrouw die dienst heeft: {gastheer}.
Telefonisch: 06 52 66 84 49.

De volledige voorwaarden staan op kerkjepersingen.nl/verhuur/voorwaarden/.

Met vriendelijke groet,
Bestuur Het Kerkje van Persingen`,

  praktischGastheer: `Hallo {gastheer},

Je hebt dienst bij {soort} op {datum}.

Huurder: {naam}
Contact vanuit het bestuur: {contactpersoon}
Telefoon kerkje: 06 52 66 84 49

De huurder krijgt dezelfde praktische info (parkeren overkant, geen entree, geen horeca verkopen, tijden bij een expositie 11.00–17.00).

Kun je er niet bij zijn? Laat het {contactpersoon} zo snel mogelijk weten.

Dank je wel,
Bestuur Het Kerkje van Persingen`,

  herinnering1d: `Beste {naam},

Morgen is het zover: {soort} in het kerkje van Persingen ({datum}).

Even ter herinnering:
• Persingensestraat 7, 6575 JA Persingen
• Parkeren aan de overkant van de straat
• Contact: {contactpersoon} of 06 52 66 84 49
• Gastheer/gastvrouw: {gastheer}

Fijne dag, en tot morgen.

Met vriendelijke groet,
Bestuur Het Kerkje van Persingen`,

  herinneringGastheer: `Hallo {gastheer},

Morgen heb je dienst: {soort} op {datum}.
Huurder: {naam}. Bij vragen: {contactpersoon} of 06 52 66 84 49.

Dank je wel,
Bestuur Het Kerkje van Persingen`,

  reviewVerzoek: `Beste {naam},

We hopen dat {soort} op {datum} in het kerkje goed is bevallen.

Als u een moment heeft: een korte Google-review helpt anderen dit kerkje te vinden. Dat mag in een paar zinnen.

{googleReviewUrl}

Hartelijk dank, ook namens de vrijwilligers.

Met vriendelijke groet,
Bestuur Het Kerkje van Persingen`,

  aanbetalingCheckPaul: `Paul, korte check.

Boeking: {soort} op {datum}, {naam}.
Afgesproken tarief: {tarief}.
De termijn voor de aanbetaling is voorbij.

Is de aanbetaling binnen?
• Ja — zet in Sanity bij de boeking “Aanbetaling binnen” aan. De huurder krijgt dan automatisch de volgende stappen.
• Nee — laat het Nelleke (contractbeheer) weten. De boeking blijft een optie tot het is afgehandeld.

Deze mail is intern; de huurder ziet hem niet.`,

  reservelijst: `Beste {naam},

Er is een expositie-weekend vrijgekomen in het kerkje van Persingen: {datum}.

Als u wilt exposeren, reageer dan op deze mail of bel 06 52 66 84 49. We kijken in volgorde van binnenkomst, en houden de gewone verhuurvoorwaarden aan (onder meer: in principe een heel weekend, en niet binnen 18 maanden opnieuw).

Geen interesse meer in dit soort berichten? Zeg het even terug, dan halen we u van de reservelijst.

Met vriendelijke groet,
Bestuur Het Kerkje van Persingen`,

  contractBegeleiding: `Beste {naam},

Bij deze het contract voor uw {soort} op {datum}. Het tarief is {tarief}.

Wilt u het ondertekend terugsturen? Daarna volgt de aanbetaling. Zodra die binnen is, is de boeking definitief. U hoort dat van ons.

Vragen over het contract: Nelleke van der Pol, contractbeheer, of bel 06 52 66 84 49.

Met vriendelijke groet,
Bestuur Het Kerkje van Persingen`,

  contractSjabloon: `CONTRACT — Stichting Het Kerkje van Persingen

Huurder: {naam}
Activiteit: {soort}
Datum: {datum}
Tarief: {tarief}
Adres locatie: Persingensestraat 7, 6575 JA Persingen

Dit is een voorzet. De bindende tekst blijft het officiële document “Voorwaarden voor verhuur, Kerkje van Persingen” plus het huishoudelijk reglement, zoals Nelleke die hanteert.

Aanvullen vóór livegang:
• Aanbetalingsbedrag en termijn
• Restantbetaling
• Annuleringsregeling
• Handtekening huurder en bestuur

Verwijzing: kerkjepersingen.nl/verhuur/voorwaarden/`,
} as const;
