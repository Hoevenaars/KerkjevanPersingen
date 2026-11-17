import assert from 'node:assert/strict';
import test from 'node:test';
import { WINTERSTOP_TEKST } from '../src/lib/winterstop.ts';
import { nieuwsbriefVoorbeeldHtml, type VoorbeeldBron } from '../src/lib/nieuwsbrief-voorbeeld.ts';

const BRONNEN: VoorbeeldBron[] = [
  {
    titel: 'Gedroomde realiteit',
    slug: 'expositie-wybe-de-greef',
    start: '2026-11-21',
    eind: '2026-11-22',
    soort: 'expositie',
    korteTekst: 'Wybe de Greef. Expositie van schilderijen.',
    publiek: true,
  },
  {
    titel: 'Winterstop',
    start: '2026-12-19',
    eind: '2027-02-11',
    soort: 'winterstop',
    publiek: true,
  },
  {
    titel: 'Verborgen expositie',
    start: '2026-11-21',
    eind: '2026-11-22',
    publiek: false,
  },
];

test('de preview van een expositieweek toont die expositie en het korte nieuws', () => {
  const uit = nieuwsbriefVoorbeeldHtml({
    weekMaandag: '2026-11-16',
    inhoud: { kortNieuws: 'Gedroomde realiteit. Wybe de Greef.' },
    bronnen: BRONNEN,
  });
  assert.equal(uit.onderwerp, 'Een groet uit Persingen');
  assert.match(uit.html, /Gedroomde realiteit/);
  assert.match(uit.html, /Wybe de Greef/);
  assert.match(uit.html, /token=preview/);
  assert.doesNotMatch(uit.html, /Verborgen expositie/);
});

test('de preview van een winterstopweek toont de winterstop', () => {
  const uit = nieuwsbriefVoorbeeldHtml({
    weekMaandag: '2026-12-14',
    inhoud: { kortNieuws: WINTERSTOP_TEKST },
    bronnen: BRONNEN,
  });
  assert.match(uit.html, /Winterstop/);
  assert.match(uit.html, /onderhoud en behoud/);
});
