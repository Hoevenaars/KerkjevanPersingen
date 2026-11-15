-- 12, 13 en 14 februari 2027 horen bij de winterstop (het seizoen loopt
-- t/m 14 februari, en 13-14 februari staat ook als los weekend geblokkeerd).
-- Die drie dagen gaan eruit zodat er een boeking op gezet kan worden.
-- De site biedt dit weekend niet aan bij de eerstvolgende vrije weekenden;
-- dat zit in de code, niet in deze blokkade.

-- Losse blokkade die helemaal in dit weekend valt (13 en 14 februari).
delete from public.interne_activiteiten
where blokkeert_verhuurkalender
  and start_datum >= date '2027-02-12'
  and eind_datum <= date '2027-02-14';

-- Seizoen dat op dit weekend eindigt, inkorten tot en met donderdag 11 februari.
update public.interne_activiteiten
set
  eind_datum = date '2027-02-11',
  notities = concat_ws(
    E'\n',
    nullif(btrim(notities), ''),
    'Weekend 12, 13 en 14 februari 2027 is uit de winterstop gehaald zodat daar een boeking kan worden gezet.'
  )
where blokkeert_verhuurkalender
  and start_datum < date '2027-02-12'
  and eind_datum between date '2027-02-12' and date '2027-02-14';
