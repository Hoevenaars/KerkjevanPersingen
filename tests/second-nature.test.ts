import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SECOND_NATURE_POSTER,
  SECOND_NATURE_POSTER_ABSOLUUT,
  isSecondNature,
  secondNaturePoster,
} from '../src/lib/second-nature.ts';

describe('secondNaturePoster', () => {
  test('geeft de lokale poster voor Second Nature, ook als Sanity een foto heeft', () => {
    const uitSanity = { slug: 'second-nature', foto: { _ref: 'image-oud' } };
    assert.equal(isSecondNature(uitSanity), true);
    assert.equal(secondNaturePoster(uitSanity), SECOND_NATURE_POSTER);
    assert.equal(
      secondNaturePoster(uitSanity, { absoluut: true }),
      SECOND_NATURE_POSTER_ABSOLUUT,
    );
  });

  test('laat andere activiteiten met rust', () => {
    assert.equal(isSecondNature({ slug: 'muren-spreken' }), false);
    assert.equal(secondNaturePoster({ slug: 'muren-spreken' }), null);
    assert.equal(secondNaturePoster(null), null);
  });
});
