import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  contentIsGoedgekeurd,
  detailTekst,
  tekstNaarParagrafen,
  publiekeFotoBron,
} from '../src/lib/activiteit-content.ts';

describe('contentIsGoedgekeurd', () => {
  test('alleen goedgekeurd telt', () => {
    assert.equal(contentIsGoedgekeurd('goedgekeurd'), true);
    assert.equal(contentIsGoedgekeurd('ontvangen'), false);
    assert.equal(contentIsGoedgekeurd(undefined), false);
  });
});

describe('detailTekst', () => {
  test('gebruikt aangeleverde tekst na goedkeuring', () => {
    assert.equal(
      detailTekst({
        omschrijving: 'Kort voor de agenda.',
        aangeleverdeTekst: 'Volledige tekst\n\nTweede alinea.',
        contentStatus: 'goedgekeurd',
      }),
      'Volledige tekst\n\nTweede alinea.',
    );
  });

  test('blijft bij omschrijving zolang content niet is goedgekeurd', () => {
    assert.equal(
      detailTekst({
        omschrijving: 'Kort voor de agenda.',
        aangeleverdeTekst: 'Nog concept.',
        contentStatus: 'ontvangen',
      }),
      'Kort voor de agenda.',
    );
  });
});

describe('tekstNaarParagrafen', () => {
  test('splitst op lege regels voor inline weergave', () => {
    assert.deepEqual(tekstNaarParagrafen('Eerste alinea.\n\nTweede alinea.'), [
      'Eerste alinea.',
      'Tweede alinea.',
    ]);
  });
});

describe('publiekeFotoBron', () => {
  test('kiest aangeleverde foto na goedkeuring', () => {
    const aangeleverd = { _ref: 'img-concept' };
    const publiek = { _ref: 'img-publiek' };
    assert.equal(
      publiekeFotoBron({
        foto: publiek,
        aangeleverdeFoto: aangeleverd,
        contentStatus: 'goedgekeurd',
      }),
      aangeleverd,
    );
  });

  test('valt terug op publieke foto', () => {
    const publiek = { _ref: 'img-publiek' };
    assert.equal(
      publiekeFotoBron({
        foto: publiek,
        aangeleverdeFoto: { _ref: 'img-concept' },
        contentStatus: 'ontvangen',
      }),
      publiek,
    );
  });
});
