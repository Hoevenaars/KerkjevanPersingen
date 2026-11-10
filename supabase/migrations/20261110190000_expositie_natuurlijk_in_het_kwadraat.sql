-- Expositie 14 en 15 november 2026.
-- De titel stond op de namen van de kunstenaars en de teksten waren leeg.
-- Elke aangeleverde soort informatie hoort in het veld dat de site daarvoor toont:
-- titel, exposanten, korte tekst (agenda, homepage, nieuwsbrief),
-- volledige tekst (detailpagina) en praktische informatie.
-- De flyer staat in de site en wordt getoond zolang deze activiteit nog geen eigen foto_pad heeft.
-- Het pad wordt niet vastgezet voordat het bestand online staat: een ontbrekende
-- /foto/-url wordt een jaar gecachet.

update public.publieke_activiteiten
set
  titel = 'Natuurlijk in het kwadraat',
  exposanten = $namen$Marjon Meulenbrugge
Petra Crielaard$namen$,
  korte_omschrijving = $kort$Marjon Meulenbrugge en Petra Crielaard laten hun nieuwste werk zien: natuurlijke objecten en kleurrijke, sprookjesachtige schilderijen.$kort$,
  omschrijving = $kort$Marjon Meulenbrugge en Petra Crielaard laten hun nieuwste werk zien: natuurlijke objecten en kleurrijke, sprookjesachtige schilderijen.$kort$,
  volledige_omschrijving = $volledig$Marjon maakt 2D- en 3D-objecten met de natuur, waarbij ze meerdere technieken gebruikt. Dat kan verfijnd zijn, met 1 à 2 materialen, om de puurheid, schoonheid en eenvoud ervan tot zijn recht te laten komen. Andere werken hebben een grote verscheidenheid aan natuurlijke materialen en zijn gevarieerd in vorm en afmeting. Werken van Marjon raken niet alleen visueel, maar vertellen ook een verhaal over vergankelijkheid, kwetsbaarheid, herinnering en de kracht van de natuur. Natuurlijke objecten in 2D en 3D: www.floremetart.nl.

Petra maakt kleurrijke, sprookjesachtige werken. Ze schildert met acrylverf en met allerlei materialen. De werken op papier of doek zijn van heel klein tot heel groot en laten een sprookjesachtige wereld zien. In grove, snelle bewegingen wordt met acrylverf de ondergrond opgebracht. Daarna wordt laag over laag toegewerkt naar een fijne detaillering. Kleurrijke schilderijen met acrylverf en mixed media: www.petracrielaard-lohuis.nl.

Beide kunstenaars laten hun nieuwste werken zien en een doorsnee uit hun oeuvre. Petra en Marjon exposeerden al eerder samen in Huis Kernhem te Ede, in het voorjaar van 2026.

De titel Natuurlijk in het kwadraat is gekozen omdat hun kunst over de natuur gaat, als onderwerp en als inspiratiebron. Het werk van hen samen versterkt dat: de natuur in al haar schoonheid.

Ook vanwege de vanzelfsprekendheid dat wij onderdeel zijn van de natuur en die graag voor volgende generaties willen behouden.

En omdat kunst natuurlijk onderdeel uitmaakt van onze cultuur. Fijn dat er expositieruimtes zijn zodat iedereen van kunst kan genieten.

Marjon. Na zo'n 10 jaar als analiste in het bodemonderzoek werkzaam te zijn geweest, heeft ze zich omgeschoold tot bloemsierkunstenaar en als zodanig een aantal jaren gewerkt. Sinds 2015 is ze haar eigen bedrijf gestart om haar affiniteit met natuurlijke materialen in kunst weer te geven, waarin haar liefde voor de natuur tot leven komt. Ze werkt ook in opdracht voor bedrijven en particulieren en geeft workshops. Enkele keren per jaar exposeert ze met haar Natural Art. Marjon is lid van het Kunstcollectief Gelderse Poort.

Petra. Na haar studie rechten en de PABO deed ze alsnog de kunstacademie in Utrecht. In 2015 studeerde ze af en heeft sindsdien een eigen atelier. Eerst in Arnhem, momenteel in Wageningen in De Kunstfabriek. Ze heeft een kunstuitleen in eigen beheer. In 2025 verscheen haar eerste geschreven en geïllustreerde prentenboek "Vlinder en Hert helpen Ridder Remco". Petra heeft jaarlijks exposities en/of open atelier. Ze is lid van Platform Beroepskunstenaars Wageningen.

Deze expositie is een uitnodiging om stil te staan, te kijken en opnieuw verbinding te voelen met de natuur in al haar vormen.

Kom kijken, laat je inspireren en beleef kunst die groeit, ademt en raakt.$volledig$,
  praktische_informatie = 'Te bezoeken op zaterdag en zondag, van 11.00 tot 17.00 uur. Toegang is gratis.',
  foto_alt = 'Flyer van de expositie Natuurlijk in het kwadraat, met werk van Marjon Meulenbrugge en Petra Crielaard',
  contentstatus = 'goedgekeurd'
where slug = 'petra-crielaard-en-marjon-meulenbrugge'
  and start_datum = date '2026-11-14'
  and eind_datum = date '2026-11-15'
  and coalesce(levenscyclus, 'actief') <> 'geannuleerd';

update public.boekingen
set mede_exposanten = 'Marjon Meulenbrugge'
where nummer = 'BKG-2026-073'
  and start_datum = date '2026-11-14'
  and eind_datum = date '2026-11-15'
  and mede_exposanten = 'MarjonMeulenbrugge';
