import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { kiesGepubliceerdeActiviteit } from '../src/lib/sanity-documenten.ts';
import { bezetteKalenderDagen } from '../src/lib/datum.ts';
import { eerstvolgendeVrijeWeekenden } from '../src/lib/week.ts';
import { SECOND_NATURE } from '../src/lib/second-nature.ts';

describe('kiesGepubliceerdeActiviteit', () => {
  test('ongepubliceerde datumwijziging wint niet van de gepubliceerde boeking', () => {
    const docs = [
      {
        _id: 'abc',
        start: '2026-10-09T09:00:00.000Z',
        zichtbaarheid: 'verborgen' as const,
      },
      {
        _id: 'drafts.abc',
        start: '2026-11-07T09:00:00.000Z',
        eind: '2026-11-08T16:00:00.000Z',
        zichtbaarheid: 'bezet' as const,
      },
    ];
    const gekozen = kiesGepubliceerdeActiviteit(docs);
    assert.equal(gekozen.length, 1);
    assert.equal(gekozen[0]._id, 'abc');
    assert.equal(gekozen[0].zichtbaarheid, 'verborgen');
  });

  test('een concept zonder gepubliceerde versie blijft staan', () => {
    const docs = [{ _id: 'drafts.nieuw', start: '2026-09-12T09:00:00.000Z', zichtbaarheid: 'publiek' as const }];
    const gekozen = kiesGepubliceerdeActiviteit(docs);
    assert.equal(gekozen[0]._id, 'drafts.nieuw');
  });
});

describe('agenda vs kalender — Second Nature en 7-8 november', () => {
  test('Second Nature blokkeert 3-4 oktober, 7-8 november blijft kiesbaar', () => {
    const september = [
      { start: '2026-09-12T09:00:00.000Z', eind: '2026-09-13T16:00:00.000Z', soort: 'expositie', zichtbaarheid: 'publiek' },
      { start: '2026-09-19T09:00:00.000Z', eind: '2026-09-20T16:00:00.000Z', soort: 'expositie', zichtbaarheid: 'publiek' },
      { start: '2026-09-26T09:00:00.000Z', eind: '2026-09-27T16:00:00.000Z', soort: 'expositie', zichtbaarheid: 'publiek' },
    ];
    const dagen = bezetteKalenderDagen([...september, SECOND_NATURE]);
    assert.equal(dagen.has('2026-10-03'), true);
    assert.equal(dagen.has('2026-10-04'), true);
    assert.equal(dagen.has('2026-11-07'), false);
    assert.equal(dagen.has('2026-11-08'), false);

    const weekenden = eerstvolgendeVrijeWeekenden(dagen, 3, new Date('2026-09-10T12:00:00Z'));
    assert.equal(weekenden[0].zaterdag, '2026-10-10');

    const oktoberVerderBezet = new Set(dagen);
    for (const dag of ['2026-10-10', '2026-10-11', '2026-10-17', '2026-10-18', '2026-10-24', '2026-10-25', '2026-10-31', '2026-11-01']) {
      oktoberVerderBezet.add(dag);
    }
    const naOktober = eerstvolgendeVrijeWeekenden(oktoberVerderBezet, 1, new Date('2026-09-10T12:00:00Z'));
    assert.equal(naOktober[0].zaterdag, '2026-11-07');
    assert.equal(naOktober[0].zondag, '2026-11-08');
  });

  test('concept-overlay van een verborgen boeking blokkeert 7-8 november niet', () => {
    const ruw = [
      {
        _id: 'jona',
        start: '2026-10-09T09:00:00.000Z',
        eind: '2026-10-09T16:00:00.000Z',
        zichtbaarheid: 'verborgen' as const,
      },
      {
        _id: 'drafts.jona',
        start: '2026-11-07T09:00:00.000Z',
        eind: '2026-11-08T16:00:00.000Z',
        zichtbaarheid: 'bezet' as const,
      },
      SECOND_NATURE,
    ];
    const voorKalender = kiesGepubliceerdeActiviteit(ruw).filter((a) => a.zichtbaarheid !== 'verborgen');
    const dagen = bezetteKalenderDagen(voorKalender);
    assert.equal(dagen.has('2026-10-03'), true);
    assert.equal(dagen.has('2026-11-07'), false);
    assert.equal(dagen.has('2026-11-08'), false);
  });
});
