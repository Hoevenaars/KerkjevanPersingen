import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isoWeekNummer,
  isEersteWoensdagVanMaand,
  ontvangtDezeVerzending,
  isGeldigeFrequentie,
  programmaPeriode,
  mailMeta,
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

describe('isEersteWoensdagVanMaand', () => {
  test('4 maart 2026 is de eerste woensdag van maart', () => {
    assert.equal(isEersteWoensdagVanMaand(new Date('2026-03-04T10:30:00Z')), true);
  });

  test('11 maart 2026 is de tweede woensdag', () => {
    assert.equal(isEersteWoensdagVanMaand(new Date('2026-03-11T10:30:00Z')), false);
  });
});

describe('programmaPeriode', () => {
  test('wekelijks loopt t/m komende zondag', () => {
    const periode = programmaPeriode('wekelijks', new Date('2026-08-14T09:30:00Z'));
    assert.equal(periode.start, '2026-08-14');
    assert.equal(periode.eind, '2026-08-16');
  });

  test('tweewekelijks dekt 14 dagen', () => {
    const periode = programmaPeriode('tweewekelijks', new Date('2026-08-21T09:30:00Z'));
    assert.equal(periode.start, '2026-08-21');
    assert.equal(periode.eind, '2026-09-03');
  });

  test('maandelijks loopt t/m einde van de maand', () => {
    const periode = programmaPeriode('maandelijks', new Date('2026-03-06T09:30:00Z'));
    assert.equal(periode.start, '2026-03-06');
    assert.equal(periode.eind, '2026-03-31');
  });
});

describe('mailMeta', () => {
  test('houdt dezelfde groet en past de agenda aan per frequentie', () => {
    assert.equal(mailMeta('wekelijks').kop, 'Een groet uit Persingen');
    assert.equal(mailMeta('wekelijks').onderwerp, 'Een groet uit Persingen');
    assert.equal(mailMeta('tweewekelijks').kop, 'Een groet uit Persingen');
    assert.equal(mailMeta('tweewekelijks').agendaKop, 'Agenda komende twee weken');
    assert.equal(mailMeta('maandelijks', new Date('2026-03-06T09:30:00Z')).agendaKop, 'Agenda in maart');
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

  test('maandelijks op de maandag van de week met de eerste woensdag', () => {
    assert.equal(ontvangtDezeVerzending('maandelijks', new Date('2026-03-02T09:30:00Z')), true);
    assert.equal(ontvangtDezeVerzending('maandelijks', new Date('2026-03-04T10:30:00Z')), true);
    assert.equal(ontvangtDezeVerzending('maandelijks', new Date('2026-03-09T09:30:00Z')), false);
  });

  test('ontbrekende frequentie valt terug op wekelijks', () => {
    assert.equal(ontvangtDezeVerzending(undefined, new Date('2026-03-13T09:30:00Z')), true);
  });
});
