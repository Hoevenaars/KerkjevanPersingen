import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterActiviteitenInPeriode,
  programmaPeriode,
} from '../src/lib/nieuwsbrief-frequentie.ts';

describe('filterActiviteitenInPeriode', () => {
  const nu = new Date('2026-08-21T09:30:00Z');

  const lijst = [
    { start: '2026-08-22T09:00:00.000Z', eind: '2026-08-23T17:00:00.000Z', titel: 'dit-weekend' },
    { start: '2026-08-29T09:00:00.000Z', eind: '2026-08-30T17:00:00.000Z', titel: 'volgend-weekend' },
    { start: '2026-09-10T09:00:00.000Z', eind: '2026-09-11T17:00:00.000Z', titel: 'buiten-periode' },
  ];

  test('tweewekelijks pakt activiteiten binnen 14 dagen', () => {
    const gekozen = filterActiviteitenInPeriode(lijst, 'tweewekelijks', nu);
    assert.equal(gekozen.length, 2);
    assert.equal(gekozen.map((item) => item.titel).join(','), 'dit-weekend,volgend-weekend');
    assert.equal(programmaPeriode('tweewekelijks', nu).eind, '2026-09-03');
  });

  test('maandelijks pakt activiteiten tot einde maand', () => {
    const maart = new Date('2026-03-06T09:30:00Z');
    const maartLijst = [
      { start: '2026-03-07T09:00:00.000Z', eind: '2026-03-08T17:00:00.000Z', titel: 'begin-maart' },
      { start: '2026-03-28T09:00:00.000Z', eind: '2026-03-29T17:00:00.000Z', titel: 'later-maart' },
      { start: '2026-04-04T09:00:00.000Z', eind: '2026-04-05T17:00:00.000Z', titel: 'april' },
    ];
    const gekozen = filterActiviteitenInPeriode(maartLijst, 'maandelijks', maart);
    assert.equal(gekozen.length, 2);
    assert.equal(gekozen.map((item) => item.titel).join(','), 'begin-maart,later-maart');
  });
});
