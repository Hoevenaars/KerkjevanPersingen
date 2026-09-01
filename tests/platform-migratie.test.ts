import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mappingVoorType, SANITY_MAPPING, sanityAanvraagStatus, sanityBoekingStatus } from '../src/platform/migratie.ts';

describe('Sanity-mapping is compleet voor bestaande types', () => {
  for (const type of ['aanvraag', 'activiteit', 'persoon', 'vriend', 'nieuwsbrief', 'instellingen']) {
    test(`${type} heeft veldmapping`, () => {
      assert.ok(mappingVoorType(type).length > 0, type);
    });
  }

  test('elk doel heeft een tabel', () => {
    for (const rij of SANITY_MAPPING) {
      assert.ok(rij.doelTabel.length > 0);
      assert.ok(rij.doelVeld.length > 0);
    }
  });

  test('statusvertaling', () => {
    assert.equal(sanityAanvraagStatus('ja'), 'goedgekeurd');
    assert.equal(sanityBoekingStatus('vastgelegd'), 'migratie_vastgelegd');
    assert.equal(sanityBoekingStatus('optie'), 'optie');
  });
});
