import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  VRIJGEKOMEN_EXPOSITIE_WEEKEND,
  aanvraagPadVrijgekomenWeekend,
  toonVrijgekomenWeekendBanner,
} from '../src/lib/vrijgekomen-weekend.ts';

describe('aanvraagPadVrijgekomenWeekend', () => {
  test('linkt naar het aanvraagformulier met dit weekend en soort expositie', () => {
    const pad = aanvraagPadVrijgekomenWeekend();
    assert.equal(
      pad,
      '/verhuur/aanvragen/?datum=2026-11-07&datumTot=2026-11-08&soort=expositie',
    );
    assert.equal(VRIJGEKOMEN_EXPOSITIE_WEEKEND.zaterdag, '2026-11-07');
    assert.equal(VRIJGEKOMEN_EXPOSITIE_WEEKEND.zondag, '2026-11-08');
  });
});

describe('toonVrijgekomenWeekendBanner', () => {
  test('blijft zichtbaar tot en met zondag 8 november (Nederlandse tijd)', () => {
    assert.equal(toonVrijgekomenWeekendBanner(new Date('2026-09-10T12:00:00Z')), true);
    assert.equal(toonVrijgekomenWeekendBanner(new Date('2026-11-07T12:00:00Z')), true);
    // 22:30 UTC = 23:30 Amsterdam (wintertijd) — nog steeds 8 november
    assert.equal(toonVrijgekomenWeekendBanner(new Date('2026-11-08T22:30:00Z')), true);
  });

  test('verdwijnt vanaf maandag 9 november Nederlandse tijd', () => {
    // 23:30 UTC op 8 november = 00:30 Amsterdam op 9 november
    assert.equal(toonVrijgekomenWeekendBanner(new Date('2026-11-08T23:30:00Z')), false);
    assert.equal(toonVrijgekomenWeekendBanner(new Date('2026-11-09T12:00:00Z')), false);
  });
});
