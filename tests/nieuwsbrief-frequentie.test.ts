import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isoWeekNummer,
  isEersteVrijdagVanMaand,
  ontvangtDezeVerzending,
  isGeldigeFrequentie,
} from '../src/lib/nieuwsbrief-frequentie.ts';

describe('isGeldigeFrequentie', () => {
  test('accepteert de drie keuzes', () => {
    assert.equal(isGeldigeFrequentie('wekelijks'), true);
    assert.equal(isGeldigeFrequentie('tweewekelijks'), true);
    assert.equal(isGeldigeFrequentie('maandelijks'), true);
    assert.equal(isGeldigeFrequentie('dagelijks'), false);
  });
});

describe('isoWeekNummer', () => {
  test('vrijdag 14 augustus 2026 valt in ISO-week 33', () => {
    assert.equal(isoWeekNummer(new Date('2026-08-14T12:00:00Z')), 33);
  });
});

describe('isEersteVrijdagVanMaand', () => {
  test('6 maart 2026 is de eerste vrijdag van maart', () => {
    assert.equal(isEersteVrijdagVanMaand(new Date('2026-03-06T09:30:00Z')), true);
  });

  test('13 maart 2026 is de tweede vrijdag', () => {
    assert.equal(isEersteVrijdagVanMaand(new Date('2026-03-13T09:30:00Z')), false);
  });
});

describe('ontvangtDezeVerzending', () => {
  test('wekelijks ontvangt altijd', () => {
    assert.equal(ontvangtDezeVerzending('wekelijks', new Date('2026-08-14T09:30:00Z')), true);
    assert.equal(ontvangtDezeVerzending('wekelijks', new Date('2026-03-13T09:30:00Z')), true);
  });

  test('tweewekelijks volgt even ISO-weken', () => {
    // week 33 is oneven
    assert.equal(ontvangtDezeVerzending('tweewekelijks', new Date('2026-08-14T09:30:00Z')), false);
    // week 34 is even
    assert.equal(ontvangtDezeVerzending('tweewekelijks', new Date('2026-08-21T09:30:00Z')), true);
  });

  test('maandelijks alleen op de eerste vrijdag', () => {
    assert.equal(ontvangtDezeVerzending('maandelijks', new Date('2026-03-06T09:30:00Z')), true);
    assert.equal(ontvangtDezeVerzending('maandelijks', new Date('2026-03-13T09:30:00Z')), false);
  });

  test('ontbrekende frequentie valt terug op wekelijks', () => {
    assert.equal(ontvangtDezeVerzending(undefined, new Date('2026-03-13T09:30:00Z')), true);
  });
});
