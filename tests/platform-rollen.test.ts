import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isRolSlug,
  legeMatrix,
  nieuweRol,
  rolUitWeergave,
  slugVanNaam,
  standaardRollen,
  voerRolActieUit,
} from '../src/platform/rollen.ts';
import { rollenUitRuweLijst } from '../src/lib/rollen-opslag.ts';

describe('rolcatalogus', () => {
  test('een naam wordt een stabiele slug', () => {
    assert.equal(slugVanNaam('Nelleke'), 'nelleke');
    assert.equal(slugVanNaam('Jan-Willem'), 'jan-willem');
    assert.equal(slugVanNaam('  Zoë  '), 'zoe');
    assert.equal(isRolSlug(slugVanNaam('Hans')), true);
    assert.equal(isRolSlug('Geen rol!'), false);
    assert.equal(rolUitWeergave('rol:jan-willem'), 'jan-willem');
    assert.equal(rolUitWeergave('rol:Geen rol'), null);
  });

  test('nieuwe rol is leeg en een bestaande naam kan niet nog eens', () => {
    const start = standaardRollen();
    assert.equal(start.length, 3);
    assert.equal(legeMatrix().dashboard, 'lezen');
    assert.equal(legeMatrix().finance, 'verborgen');
    const extra = nieuweRol('Maaike', start);
    assert.ok('rol' in extra);
    if ('rol' in extra) {
      assert.equal(extra.rol.slug, 'maaike');
      assert.equal(extra.rol.rechten.dashboard, 'lezen');
    }
    assert.ok('fout' in nieuweRol('Hans', start));
    assert.ok('fout' in nieuweRol('!!!', start));
  });

  test('opslaan houdt de slug, hernoemt en bewaart de matrix', () => {
    const start = standaardRollen();
    const opgeslagen = voerRolActieUit(start, {
      soort: 'opslaan',
      slug: 'hans',
      naam: 'Hans Maas',
      rechten: { dashboard: 'lezen', finance: 'schrijven', aanvragen: 'lezen' },
    });
    assert.ok('rollen' in opgeslagen);
    if (!('rollen' in opgeslagen)) return;
    const hans = opgeslagen.rollen.find((rol) => rol.slug === 'hans');
    assert.equal(hans?.naam, 'Hans Maas');
    assert.equal(hans?.rechten.finance, 'schrijven');
    assert.equal(hans?.rechten.aanvragen, 'lezen');
    assert.equal(hans?.rechten.boekingen, 'verborgen');
    const weg = voerRolActieUit(opgeslagen.rollen, { soort: 'verwijder', slug: 'paul' });
    assert.ok('rollen' in weg && weg.rollen.every((rol) => rol.slug !== 'paul'));
    assert.ok('fout' in voerRolActieUit(start, { soort: 'verwijder', slug: 'onbekend' }));
  });

  test('een bestand zonder rollen blijft leeg, ongeldige slugs vallen weg', () => {
    assert.equal(rollenUitRuweLijst({ rollen: [] })?.length, 0);
    const gelezen = rollenUitRuweLijst({
      rollen: [
        { slug: 'maaike', naam: 'Maaike', rechten: { finance: 'lezen', hack: 'schrijven' } },
        { slug: 'Geen rol', naam: 'Fout', rechten: {} },
      ],
    });
    assert.equal(gelezen?.length, 1);
    assert.equal(gelezen?.[0].rechten.finance, 'lezen');
    assert.equal(gelezen?.[0].rechten.dashboard, 'lezen');
    assert.equal(Object.prototype.hasOwnProperty.call(gelezen?.[0].rechten, 'hack'), false);
  });
});
