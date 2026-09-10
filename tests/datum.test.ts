import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatDatum, formatDatumBereik, bezetteKalenderDagen } from '../src/lib/datum.ts';

describe('formatDatum', () => {
  test('toont datum en tijd in Nederlandse tijd', () => {
    assert.equal(
      formatDatum('2026-08-15T09:00:00.000Z'),
      'zaterdag 15 augustus 2026, 11:00 uur',
    );
  });

  test('laat de tijd weg als dat gevraagd is', () => {
    assert.equal(formatDatum('2026-08-15T09:00:00.000Z', false), 'zaterdag 15 augustus 2026');
  });
});

describe('formatDatumBereik', () => {
  test('een weekend-expositie toont zaterdag en zondag, zonder tijd', () => {
    assert.equal(
      formatDatumBereik({
        start: '2026-08-15T09:00:00.000Z',
        eind: '2026-08-16T15:00:00.000Z',
        soort: 'expositie',
      }),
      'zaterdag 15 en zondag 16 augustus 2026',
    );
  });

  test('een expositie met alleen zaterdag als eindtijd toont alsnog zondag', () => {
    assert.equal(
      formatDatumBereik({
        start: '2026-08-15T09:00:00.000Z',
        eind: '2026-08-15T15:00:00.000Z',
        soort: 'expositie',
      }),
      'zaterdag 15 en zondag 16 augustus 2026',
    );
  });

  test('een expositie zonder einddatum toont het hele weekend', () => {
    assert.equal(
      formatDatumBereik({
        start: '2026-08-15T09:00:00.000Z',
        soort: 'expositie',
      }),
      'zaterdag 15 en zondag 16 augustus 2026',
    );
  });

  test('een expositie alleen op zondag blijft één dag', () => {
    assert.equal(
      formatDatumBereik({
        start: '2026-08-16T09:00:00.000Z',
        eind: '2026-08-16T15:00:00.000Z',
        soort: 'expositie',
      }),
      'zondag 16 augustus 2026',
    );
  });

  test('een concert op één dag toont die dag één keer, zonder tijd', () => {
    assert.equal(
      formatDatumBereik({
        start: '2026-08-15T18:00:00.000Z',
        eind: '2026-08-15T20:00:00.000Z',
        soort: 'concert',
      }),
      'zaterdag 15 augustus 2026',
    );
  });

  test('een periode over een maandgrens gebruikt t/m', () => {
    assert.equal(
      formatDatumBereik({
        start: '2026-01-31T09:00:00.000Z',
        eind: '2026-02-01T15:00:00.000Z',
      }),
      'zaterdag 31 januari 2026 t/m zondag 1 februari 2026',
    );
  });
});

describe('bezetteKalenderDagen', () => {
  test('Second Nature 3-4 oktober blokkeert beide kalenderdagen', () => {
    const dagen = bezetteKalenderDagen([
      {
        start: '2026-10-03T09:00:00.000Z',
        eind: '2026-10-04T16:00:00.000Z',
        soort: 'expositie',
        zichtbaarheid: 'publiek',
      },
    ]);
    assert.equal(dagen.has('2026-10-03'), true);
    assert.equal(dagen.has('2026-10-04'), true);
    assert.equal(dagen.has('2026-10-02'), false);
    assert.equal(dagen.has('2026-10-05'), false);
  });

  test('middernacht Amsterdam blokkeert die Nederlandse dag, niet de UTC-avond ervoor', () => {
    // 8 november 2026 00:00 CET = 7 november 23:00 UTC
    const dagen = bezetteKalenderDagen([
      {
        start: '2026-11-07T23:00:00.000Z',
        eind: '2026-11-08T16:00:00.000Z',
        zichtbaarheid: 'bezet',
      },
    ]);
    assert.equal(dagen.has('2026-11-06'), false);
    assert.equal(dagen.has('2026-11-07'), false);
    assert.equal(dagen.has('2026-11-08'), true);
  });

  test('zomertijd: 10 oktober 00:00 Amsterdam is niet 9 oktober', () => {
    // 10 oktober 2026 00:00 CEST = 9 oktober 22:00 UTC
    const dagen = bezetteKalenderDagen([
      {
        start: '2026-10-09T22:00:00.000Z',
        eind: '2026-10-11T15:00:00.000Z',
        zichtbaarheid: 'bezet',
      },
    ]);
    assert.equal(dagen.has('2026-10-09'), false);
    assert.equal(dagen.has('2026-10-10'), true);
    assert.equal(dagen.has('2026-10-11'), true);
  });

  test('zaterdag-expositie zonder zondag in het CMS blokkeert toch zondag', () => {
    const dagen = bezetteKalenderDagen([
      {
        start: '2026-10-03T09:00:00.000Z',
        eind: '2026-10-03T15:00:00.000Z',
        soort: 'expositie',
        zichtbaarheid: 'publiek',
      },
    ]);
    assert.equal(dagen.has('2026-10-03'), true);
    assert.equal(dagen.has('2026-10-04'), true);
  });

  test('zichtbaarheid verborgen telt niet', () => {
    const dagen = bezetteKalenderDagen([
      {
        start: '2026-11-07T09:00:00.000Z',
        eind: '2026-11-08T16:00:00.000Z',
        zichtbaarheid: 'verborgen',
      },
    ]);
    assert.equal(dagen.size, 0);
  });
});
