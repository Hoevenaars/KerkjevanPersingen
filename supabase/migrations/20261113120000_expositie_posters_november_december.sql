-- Teksten van de vier aankomende exposities, overgenomen van de posters.
-- Elke soort informatie staat in het veld dat de site daarvoor toont:
-- titel, exposanten, korte tekst (agenda, homepage, nieuwsbrief),
-- volledige tekst (detailpagina) en praktische informatie.
-- De slugs en data blijven staan. Het adres van het kerkje staat al op de site;
-- afwijkende straatnamen op de posters worden niet overgenomen.
-- Een poster zonder foto-upload krijgt geen foto_pad: een ontbrekend pad
-- zou een jaar gecachet worden.

-- 21 en 22 november 2026. Wybe de Greef. Poster: Gedroomde realiteit.
update public.publieke_activiteiten
set
  titel = 'Gedroomde realiteit',
  exposanten = 'Wybe de Greef',
  korte_omschrijving = $kort$Wybe de Greef. Expositie van schilderijen. Licht, leven en landschap.$kort$,
  omschrijving = $kort$Wybe de Greef. Expositie van schilderijen. Licht, leven en landschap.$kort$,
  volledige_omschrijving = $volledig$Expositie van schilderijen.

Licht, leven en landschap.$volledig$,
  praktische_informatie = 'Te bezoeken op zaterdag en zondag, van 11.00 tot 17.00 uur. Toegang is gratis.',
  contentstatus = 'goedgekeurd'
where slug = 'expositie-wybe-de-greef'
  and start_datum = date '2026-11-21'
  and eind_datum = date '2026-11-22'
  and coalesce(levenscyclus, 'actief') <> 'geannuleerd';

-- 28 en 29 november 2026. Lindsay Cillessen en Nick Cillessen.
-- De poster heeft geen tentoonstellingstitel, wel beide namen en hun discipline.
update public.publieke_activiteiten
set
  titel = 'Lindsay Cillessen & Nick Cillessen',
  exposanten = $namen$Lindsay Cillessen
Nick Cillessen$namen$,
  korte_omschrijving = $kort$Lindsay Cillessen (fotografie) & Nick Cillessen (schilderkunst) nodigen u uit voor de expositie in het kerkje van Persingen.$kort$,
  omschrijving = $kort$Lindsay Cillessen (fotografie) & Nick Cillessen (schilderkunst) nodigen u uit voor de expositie in het kerkje van Persingen.$kort$,
  volledige_omschrijving = $volledig$Lindsay Cillessen (fotografie) & Nick Cillessen (schilderkunst) nodigen u uit voor de expositie in het kerkje van Persingen.$volledig$,
  praktische_informatie = 'Te bezoeken op zaterdag en zondag, van 11.00 tot 17.00 uur.',
  contentstatus = 'goedgekeurd'
where slug = 'expositie-nick-cillessen'
  and start_datum = date '2026-11-28'
  and eind_datum = date '2026-11-29'
  and coalesce(levenscyclus, 'actief') <> 'geannuleerd';

-- 5 en 6 december 2026. Poster: Fusion.
-- Sientje Menheere staat op de poster en ontbrak nog bij de exposanten.
update public.publieke_activiteiten
set
  titel = 'Fusion',
  exposanten = $namen$Marion Groenenberg
Elin Bennaars
Sientje Menheere$namen$,
  korte_omschrijving = $kort$Marion Groenenberg, Elin Bennaars en Sientje Menheere. Ontdek het werk van de drie kunstenaars ieder met hun eigen materiaal, techniek en signatuur.$kort$,
  omschrijving = $kort$Marion Groenenberg, Elin Bennaars en Sientje Menheere. Ontdek het werk van de drie kunstenaars ieder met hun eigen materiaal, techniek en signatuur.$kort$,
  volledige_omschrijving = $volledig$Marion Groenenberg. Beelden en re-used glas: www.mg-art.nl

Elin Bennaars. Vilt, paperpulp, herinneringskunst: www.vilt-vlow.nl

Sientje Menheere. Schilderijen en tekeningen: www.sientjemenheere.nl

Ontdek het werk van de drie kunstenaars ieder met hun eigen materiaal, techniek en signatuur.$volledig$,
  praktische_informatie = 'Te bezoeken op zaterdag en zondag, van 11.00 tot 17.00 uur.',
  contentstatus = 'goedgekeurd'
where slug = 'expositie-elin-bennaars'
  and start_datum = date '2026-12-05'
  and eind_datum = date '2026-12-06'
  and coalesce(levenscyclus, 'actief') <> 'geannuleerd';

update public.boekingen
set mede_exposanten = 'Marion Groenenberg en Sientje Menheere'
where nummer = 'BKG-2026-079'
  and start_datum = date '2026-12-05'
  and eind_datum = date '2026-12-06'
  and mede_exposanten = 'Marion Groenenberg';

-- 12 en 13 december 2026. Poster: Verbeelding in verf, klei en staal.
update public.publieke_activiteiten
set
  titel = 'Verbeelding in verf, klei en staal',
  exposanten = $namen$Ilse Aarsman
Nienke Faber
Piet van der Horst$namen$,
  korte_omschrijving = $kort$Ilse Aarsman: schilderijen. Nienke Faber: keramische sculpturen. Piet van der Horst: sculpturen van staal en foto's.$kort$,
  omschrijving = $kort$Ilse Aarsman: schilderijen. Nienke Faber: keramische sculpturen. Piet van der Horst: sculpturen van staal en foto's.$kort$,
  volledige_omschrijving = $volledig$Ilse Aarsman. Schilderijen.

Nienke Faber. Keramische sculpturen.

Piet van der Horst. Sculpturen van staal en foto's.$volledig$,
  praktische_informatie = 'Te bezoeken op zaterdag en zondag, van 11.00 tot 17.00 uur. Feestelijke opening: zaterdag 12 december om 15.00 uur. Met muziek van Rita Lusing en Jacco van der Horst.',
  contentstatus = 'goedgekeurd'
where slug = 'expositie-ilse-aarsman'
  and start_datum = date '2026-12-12'
  and eind_datum = date '2026-12-13'
  and coalesce(levenscyclus, 'actief') <> 'geannuleerd';

update public.boekingen
set mede_exposanten = 'Nienke Faber en Piet van der Horst'
where nummer = 'BKG-2026-080'
  and start_datum = date '2026-12-12'
  and eind_datum = date '2026-12-13'
  and mede_exposanten = 'Nienke Faber en Piet vd Horst';
