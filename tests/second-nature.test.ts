import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SECOND_NATURE_POSTER,
  SECOND_NATURE_POSTER_ABSOLUUT,
  isSecondNature,
  secondNaturePoster,
} from '../src/lib/second-nature.ts';

describe('secondNaturePoster', () => {
  test('geeft de lokale poster voor Second Nature', () => {
    const activiteit = { slug: 'second-nature', foto: '/foto/anders.jpg' };
    assert.equal(isSecondNature(activiteit), true);
    assert.equal(secondNaturePoster(activiteit), SECOND_NATURE_POSTER);
    assert.equal(
      secondNaturePoster(activiteit, { absoluut: true }),
      SECOND_NATURE_POSTER_ABSOLUUT,
    );
  });

  test('laat andere activiteiten met rust', () => {
    assert.equal(isSecondNature({ slug: 'muren-spreken' }), false);
    assert.equal(secondNaturePoster({ slug: 'muren-spreken' }), null);
    assert.equal(secondNaturePoster(null), null);
  });
});
