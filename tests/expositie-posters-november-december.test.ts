import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activiteitVanAgendaRij, type AgendaRij } from '../src/lib/publiek-lezen.ts';
import { detailTekst, kaartTekst, teaserTekst } from '../src/lib/activiteit-content.ts';
import { formatActiviteitTitel } from '../src/platform/activiteit-titel.ts';
import { formatExposantenWeergave } from '../src/platform/exposanten.ts';
import { toonFotoInHetGeheel } from '../src/lib/publicatie-foto.ts';

const fotosql = readFileSync(
  new URL('../supabase/migrations/20261113133000_expositie_poster_fotos.sql', import.meta.url),
  'utf8',
);

const POSTERS = {
  wybe: 'https://xskqpefeumylrticrphp.supabase.co/storage/v1/object/public/public-media/publicaties/16-1794526435674.jpg',
  cillessen: 'https://xskqpefeumylrticrphp.supabase.co/storage/v1/object/public/public-media/publicaties/17-1794526435675.jpg',
  fusion: 'https://xskqpefeumylrticrphp.supabase.co/storage/v1/object/public/public-media/publicaties/18-1794526435676.jpg',
  verbeelding: 'https://xskqpefeumylrticrphp.supabase.co/storage/v1/object/public/public-media/publicaties/19-1794526435677.jpg',
};

const sql = readFileSync(
  new URL('../supabase/migrations/20261113120000_expositie_posters_november_december.sql', import.meta.url),
  'utf8',
);

const WYBE_KORT = 'Wybe de Greef. Expositie van schilderijen. Licht, leven en landschap.';
const CILLESSEN_KORT = 'Lindsay Cillessen (fotografie) & Nick Cillessen (schilderkunst) nodigen u uit voor de expositie in het kerkje van Persingen.';
const FUSION_KORT = 'Marion Groenenberg, Elin Bennaars en Sientje Menheere. Ontdek het werk van de drie kunstenaars ieder met hun eigen materiaal, techniek en signatuur.';
const VERBEELDING_KORT = "Ilse Aarsman: schilderijen. Nienke Faber: keramische sculpturen. Piet van der Horst: sculpturen van staal en foto's.";
const UREN = 'Te bezoeken op zaterdag en zondag, van 11.00 tot 17.00 uur.';

function rij(deel: Partial<AgendaRij> & Pick<AgendaRij, 'id' | 'slug' | 'titel' | 'start_datum' | 'eind_datum'>): AgendaRij {
  return {
    omschrijving: null,
    foto_pad: null,
    foto_alt: null,
    publicatie_trigger: 'direct',
    zichtbaarheid: 'publiek',
    inhoud_status: 'niet_gestart',
    soort: 'expositie',
    contentstatus: 'goedgekeurd',
    ...deel,
  };
}

test('de posterteksten staan in de kolommen die de site toont', () => {
  assert.match(sql, /titel = 'Gedroomde realiteit'/);
  assert.match(sql, /titel = 'Lindsay Cillessen & Nick Cillessen'/);
  assert.match(sql, /titel = 'Fusion'/);
  assert.match(sql, /titel = 'Verbeelding in verf, klei en staal'/);

  assert.match(sql, /Wybe de Greef/);
  assert.match(sql, /Lindsay Cillessen\nNick Cillessen/);
  assert.match(sql, /Marion Groenenberg\nElin Bennaars\nSientje Menheere/);
  assert.match(sql, /Ilse Aarsman\nNienke Faber\nPiet van der Horst/);

  assert.match(sql, /Licht, leven en landschap/);
  assert.match(sql, /fotografie\) & Nick Cillessen \(schilderkunst\)/);
  assert.match(sql, /beelden en re-used glas: www\.mg-art\.nl/i);
  assert.match(sql, /www\.vilt-vlow\.nl/);
  assert.match(sql, /www\.sientjemenheere\.nl/);
  assert.match(sql, /paperpulp, herinneringskunst/);
  assert.match(sql, /Sculpturen van staal en foto's/);
  assert.match(sql, /Feestelijke opening: zaterdag 12 december om 15\.00 uur/);
  assert.match(sql, /Rita Lusing en Jacco van der Horst/);
  assert.match(sql, /Toegang is gratis/);

  assert.equal(sql.split('Toegang is gratis').length - 1, 1);
  assert.equal(sql.includes('foto_pad ='), false);
  assert.equal(sql.includes('Persingsestraat'), false);
  assert.equal(sql.includes('Persingenenstraat'), false);
  assert.equal(sql.includes('Persingensestraat'), false);
  assert.equal(sql.includes('Piet vd Horst'), true);

  assert.match(sql, /slug = 'expositie-wybe-de-greef'/);
  assert.match(sql, /date '2026-11-21'/);
  assert.match(sql, /slug = 'expositie-nick-cillessen'/);
  assert.match(sql, /date '2026-11-28'/);
  assert.match(sql, /slug = 'expositie-elin-bennaars'/);
  assert.match(sql, /date '2026-12-05'/);
  assert.match(sql, /slug = 'expositie-ilse-aarsman'/);
  assert.match(sql, /date '2026-12-12'/);
  assert.match(sql, /mede_exposanten = 'Marion Groenenberg en Sientje Menheere'/);
  assert.match(sql, /mede_exposanten = 'Nienke Faber en Piet van der Horst'/);
  assert.match(sql, /nummer = 'BKG-2026-079'/);
  assert.match(sql, /nummer = 'BKG-2026-080'/);
});

test('elke poster staat als foto_pad bij de bijbehorende activiteit', () => {
  assert.match(fotosql, /publicaties\/16-1794526435674\.jpg/);
  assert.match(fotosql, /slug = 'expositie-wybe-de-greef'/);
  assert.match(fotosql, /publicaties\/17-1794526435675\.jpg/);
  assert.match(fotosql, /slug = 'expositie-nick-cillessen'/);
  assert.match(fotosql, /publicaties\/18-1794526435676\.jpg/);
  assert.match(fotosql, /slug = 'expositie-elin-bennaars'/);
  assert.match(fotosql, /publicaties\/19-1794526435677\.jpg/);
  assert.match(fotosql, /slug = 'expositie-ilse-aarsman'/);
  assert.match(fotosql, /foto_alt = 'Poster van de expositie Gedroomde realiteit/);
  assert.match(fotosql, /foto_alt = 'Poster van de expositie Fusion/);
  for (const url of Object.values(POSTERS)) {
    assert.equal(toonFotoInHetGeheel(url), true);
  }
  const activiteit = activiteitVanAgendaRij(rij({
    id: 18,
    slug: 'expositie-elin-bennaars',
    titel: 'Fusion',
    start_datum: '2026-12-05',
    eind_datum: '2026-12-06',
    foto_pad: POSTERS.fusion,
    foto_alt: 'Poster van de expositie Fusion, met werk van Marion Groenenberg, Elin Bennaars en Sientje Menheere',
  }));
  assert.equal(activiteit.foto, POSTERS.fusion);
  assert.equal(activiteit.fotoAlt, 'Poster van de expositie Fusion, met werk van Marion Groenenberg, Elin Bennaars en Sientje Menheere');
});

test('korte teksten passen op de agenda en de volledige tekst blijft op de detailpagina', () => {
  for (const kort of [WYBE_KORT, CILLESSEN_KORT, FUSION_KORT, VERBEELDING_KORT]) {
    assert.equal(kort.length <= 160, true, kort);
  }

  const wybe = activiteitVanAgendaRij(rij({
    id: 16,
    slug: 'expositie-wybe-de-greef',
    titel: 'Gedroomde realiteit',
    start_datum: '2026-11-21',
    eind_datum: '2026-11-22',
    omschrijving: WYBE_KORT,
    korte_omschrijving: WYBE_KORT,
    volledige_omschrijving: 'Expositie van schilderijen.\n\nLicht, leven en landschap.',
    exposanten: 'Wybe de Greef',
    praktische_informatie: `${UREN} Toegang is gratis.`,
  }));
  assert.equal(wybe.publiekeTitel, 'Expositie: Gedroomde realiteit');
  assert.equal(formatActiviteitTitel('expositie', 'Gedroomde realiteit'), wybe.publiekeTitel);
  assert.equal(wybe.kunstenaars, 'Wybe de Greef');
  assert.equal(kaartTekst(wybe).tekst, WYBE_KORT);
  assert.equal(kaartTekst(wybe).letterlijk, true);
  assert.equal(teaserTekst(wybe), WYBE_KORT);
  assert.match(detailTekst(wybe) ?? '', /Expositie van schilderijen/);
  assert.match(detailTekst(wybe) ?? '', /Licht, leven en landschap/);
  assert.equal(detailTekst(wybe)?.includes('Toegang is gratis'), false);

  const cillessen = activiteitVanAgendaRij(rij({
    id: 17,
    slug: 'expositie-nick-cillessen',
    titel: 'Lindsay Cillessen & Nick Cillessen',
    start_datum: '2026-11-28',
    eind_datum: '2026-11-29',
    omschrijving: CILLESSEN_KORT,
    korte_omschrijving: CILLESSEN_KORT,
    volledige_omschrijving: CILLESSEN_KORT,
    exposanten: 'Lindsay Cillessen\nNick Cillessen',
    praktische_informatie: UREN,
  }));
  assert.equal(cillessen.publiekeTitel, 'Expositie: Lindsay Cillessen & Nick Cillessen');
  assert.equal(cillessen.kunstenaars, 'Lindsay Cillessen, Nick Cillessen');
  assert.equal(formatExposantenWeergave('Lindsay Cillessen\nNick Cillessen'), cillessen.kunstenaars);
  assert.equal(teaserTekst(cillessen), CILLESSEN_KORT);
  assert.equal(detailTekst(cillessen), CILLESSEN_KORT);
  assert.equal(cillessen.praktischeInformatie, UREN);

  const fusion = activiteitVanAgendaRij(rij({
    id: 18,
    slug: 'expositie-elin-bennaars',
    titel: 'Fusion',
    start_datum: '2026-12-05',
    eind_datum: '2026-12-06',
    omschrijving: FUSION_KORT,
    korte_omschrijving: FUSION_KORT,
    volledige_omschrijving: 'Marion Groenenberg. Beelden en re-used glas: www.mg-art.nl\n\nElin Bennaars. Vilt, paperpulp, herinneringskunst: www.vilt-vlow.nl\n\nSientje Menheere. Schilderijen en tekeningen: www.sientjemenheere.nl\n\nOntdek het werk van de drie kunstenaars ieder met hun eigen materiaal, techniek en signatuur.',
    exposanten: 'Marion Groenenberg\nElin Bennaars\nSientje Menheere',
    praktische_informatie: UREN,
  }));
  assert.equal(fusion.publiekeTitel, 'Expositie: Fusion');
  assert.equal(fusion.kunstenaars, 'Marion Groenenberg, Elin Bennaars, Sientje Menheere');
  assert.equal(teaserTekst(fusion), FUSION_KORT);
  assert.match(detailTekst(fusion) ?? '', /www\.mg-art\.nl/);
  assert.match(detailTekst(fusion) ?? '', /www\.vilt-vlow\.nl/);
  assert.match(detailTekst(fusion) ?? '', /www\.sientjemenheere\.nl/);
  assert.match(detailTekst(fusion) ?? '', /re-used glas/);
  assert.equal(detailTekst(fusion)?.includes(FUSION_KORT), false);

  const verbeelding = activiteitVanAgendaRij(rij({
    id: 19,
    slug: 'expositie-ilse-aarsman',
    titel: 'Verbeelding in verf, klei en staal',
    start_datum: '2026-12-12',
    eind_datum: '2026-12-13',
    omschrijving: VERBEELDING_KORT,
    korte_omschrijving: VERBEELDING_KORT,
    volledige_omschrijving: "Ilse Aarsman. Schilderijen.\n\nNienke Faber. Keramische sculpturen.\n\nPiet van der Horst. Sculpturen van staal en foto's.",
    exposanten: 'Ilse Aarsman\nNienke Faber\nPiet van der Horst',
    praktische_informatie: `${UREN} Feestelijke opening: zaterdag 12 december om 15.00 uur. Met muziek van Rita Lusing en Jacco van der Horst.`,
  }));
  assert.equal(verbeelding.publiekeTitel, 'Expositie: Verbeelding in verf, klei en staal');
  assert.equal(verbeelding.kunstenaars, 'Ilse Aarsman, Nienke Faber, Piet van der Horst');
  assert.equal(kaartTekst(verbeelding).tekst, VERBEELDING_KORT);
  assert.match(detailTekst(verbeelding) ?? '', /Keramische sculpturen/);
  assert.match(verbeelding.praktischeInformatie ?? '', /Rita Lusing/);
  assert.equal(detailTekst(verbeelding)?.includes('Feestelijke opening'), false);
});
