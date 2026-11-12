-- De vier posters zijn de hoofdafbeelding van de bijbehorende expositie.
-- Ze staan in de publieke bucket public-media, op het pad publicaties/{id}-{tijdstip}.jpg
-- dat een geüploade publicatiefoto krijgt. foto_pad bewaart de publieke url.

update public.publieke_activiteiten
set
  foto_pad = 'https://xskqpefeumylrticrphp.supabase.co/storage/v1/object/public/public-media/publicaties/16-1794526435674.jpg',
  foto_alt = 'Poster van de expositie Gedroomde realiteit, met een schilderij van Wybe de Greef'
where slug = 'expositie-wybe-de-greef'
  and start_datum = date '2026-11-21'
  and eind_datum = date '2026-11-22'
  and coalesce(levenscyclus, 'actief') <> 'geannuleerd';

update public.publieke_activiteiten
set
  foto_pad = 'https://xskqpefeumylrticrphp.supabase.co/storage/v1/object/public/public-media/publicaties/17-1794526435675.jpg',
  foto_alt = 'Poster van de expositie van Lindsay Cillessen en Nick Cillessen'
where slug = 'expositie-nick-cillessen'
  and start_datum = date '2026-11-28'
  and eind_datum = date '2026-11-29'
  and coalesce(levenscyclus, 'actief') <> 'geannuleerd';

update public.publieke_activiteiten
set
  foto_pad = 'https://xskqpefeumylrticrphp.supabase.co/storage/v1/object/public/public-media/publicaties/18-1794526435676.jpg',
  foto_alt = 'Poster van de expositie Fusion, met werk van Marion Groenenberg, Elin Bennaars en Sientje Menheere'
where slug = 'expositie-elin-bennaars'
  and start_datum = date '2026-12-05'
  and eind_datum = date '2026-12-06'
  and coalesce(levenscyclus, 'actief') <> 'geannuleerd';

update public.publieke_activiteiten
set
  foto_pad = 'https://xskqpefeumylrticrphp.supabase.co/storage/v1/object/public/public-media/publicaties/19-1794526435677.jpg',
  foto_alt = 'Poster van de expositie Verbeelding in verf, klei en staal, met werk van Ilse Aarsman, Nienke Faber en Piet van der Horst'
where slug = 'expositie-ilse-aarsman'
  and start_datum = date '2026-12-12'
  and eind_datum = date '2026-12-13'
  and coalesce(levenscyclus, 'actief') <> 'geannuleerd';
