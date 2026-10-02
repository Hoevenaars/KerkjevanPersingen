import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STANDAARD_WEBSITE_MELDING,
  meldingUitFormulier,
  meldingUitRpc,
  meldingZichtbaar,
  parseWebsiteMelding,
  websiteMeldingRij,
  zichtbareWeergave,
} from '../src/lib/website-melding.ts';

const tijdensWerkzaamheden = new Date('2026-10-12T10:00:00+02:00');
const naAfloop = new Date('2026-10-31T10:00:00+02:00');

test('de standaardmelding is actief tijdens de afsluiting en daarna weg', () => {
  assert.equal(meldingZichtbaar(STANDAARD_WEBSITE_MELDING, tijdensWerkzaamheden), true);
  assert.equal(meldingZichtbaar(STANDAARD_WEBSITE_MELDING, new Date('2026-10-02T12:00:00+02:00')), true);
  assert.equal(meldingZichtbaar(STANDAARD_WEBSITE_MELDING, new Date('2026-10-30T22:00:00+02:00')), true);
  assert.equal(meldingZichtbaar(STANDAARD_WEBSITE_MELDING, naAfloop), false);
});

test('uitzetten of een lege tekst verbergt de melding', () => {
  assert.equal(meldingZichtbaar({ ...STANDAARD_WEBSITE_MELDING, actief: false }, tijdensWerkzaamheden), false);
  assert.equal(
    meldingZichtbaar({ ...STANDAARD_WEBSITE_MELDING, titel: '  ', tekst: '' }, tijdensWerkzaamheden),
    false,
  );
  const weergave = zichtbareWeergave(STANDAARD_WEBSITE_MELDING, tijdensWerkzaamheden);
  assert.equal(weergave?.alinea.length, 3);
  assert.match(weergave?.alinea[1] ?? '', /Hubertusweg/);
});

test('een begindatum houdt de melding nog even weg', () => {
  const later = { ...STANDAARD_WEBSITE_MELDING, geldigVan: '2026-10-05', geldigTot: '2026-10-30' };
  assert.equal(meldingZichtbaar(later, new Date('2026-10-04T12:00:00+02:00')), false);
  assert.equal(meldingZichtbaar(later, new Date('2026-10-05T00:30:00+02:00')), true);
});

test('opgeslagen json komt terug als melding', () => {
  const rij = websiteMeldingRij({
    actief: false,
    titel: '  Wegwerk ',
    tekst: 'Eerste alinea.\n\nTweede alinea.',
    geldigVan: '',
    geldigTot: '2026-10-30',
  });
  assert.equal(rij.sleutel, 'website_melding');
  assert.equal(rij.waarde.actief, false);
  assert.equal(rij.waarde.titel, 'Wegwerk');
  assert.equal(rij.waarde.geldig_van, null);
  const terug = parseWebsiteMelding(rij.waarde);
  assert.equal(terug?.actief, false);
  assert.equal(terug?.geldigTot, '2026-10-30');
  assert.equal(terug?.geldigVan, '');
});

test('het formulier leest de checkbox en weigert een omgekeerde periode', () => {
  const aan = meldingUitFormulier({
    get: (naam) => ({ titel: 'Let op', tekst: 'Omrijden.', geldigVan: '', geldigTot: '2026-10-30' })[naam] ?? null,
    getAll: () => ['0', '1'],
  });
  assert.equal(aan.actief, true);
  assert.throws(
    () =>
      meldingUitFormulier({
        get: (naam) => ({ titel: 'Let op', tekst: '', geldigVan: '2026-10-30', geldigTot: '2026-10-05' })[naam] ?? null,
        getAll: () => ['0'],
      }),
    /begindatum/i,
  );
});

test('een databasefout toont de standaardmelding, een lege respons verbergt hem', () => {
  const fallback = meldingUitRpc(null, { message: 'function ontbreekt' }, tijdensWerkzaamheden);
  assert.match(fallback?.titel ?? '', /GEWIJZIGDE BEREIKBAARHEID/);
  assert.equal(meldingUitRpc(null, null, tijdensWerkzaamheden), null);
  assert.equal(meldingUitRpc(null, { message: 'function ontbreekt' }, naAfloop), null);
  const live = meldingUitRpc(
    { titel: 'Andere kop', tekst: 'Alleen via de dijk.\n\nTot later.' },
    null,
    tijdensWerkzaamheden,
  );
  assert.equal(live?.titel, 'Andere kop');
  assert.deepEqual(live?.alinea, ['Alleen via de dijk.', 'Tot later.']);
});
