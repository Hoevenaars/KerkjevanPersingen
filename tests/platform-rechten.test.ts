import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  magZien,
  magSchrijven,
  isDomeinVerantwoordelijke,
  zichtbareModules,
  magVriendenExporteren,
  magRechtWijzigen,
  rechtVoor,
} from '../src/platform/rechten.ts';
import type { GebruikerRechten } from '../src/platform/types.ts';

const nick: GebruikerRechten = { isSuperAdmin: true, perModule: {} };
const nelleke: GebruikerRechten = {
  isSuperAdmin: false,
  perModule: {
    dashboard: 'lezen',
    aanvragen: 'schrijven',
    boekingen: 'schrijven',
    kalender: 'schrijven',
    agenda: 'schrijven',
    finance: 'lezen',
    nieuwsbrief: 'schrijven',
    vrienden: 'schrijven',
    relaties: 'schrijven',
    templates: 'schrijven',
    gebruikers: 'verborgen',
  },
};
const paul: GebruikerRechten = {
  isSuperAdmin: false,
  perModule: {
    dashboard: 'lezen',
    aanvragen: 'verborgen',
    boekingen: 'lezen',
    kalender: 'lezen',
    finance: 'schrijven',
  },
};

describe('rechten', () => {
  test('Super Admin ziet en schrijft alles, ook zonder rijen', () => {
    assert.equal(rechtVoor(nick, 'gebruikers'), 'schrijven');
    assert.equal(magSchrijven(nick, 'vrienden'), true);
    assert.equal(magVriendenExporteren(nick), true);
  });

  test('Nelleke mag aanvragen schrijven maar gebruikers niet zien', () => {
    assert.equal(magSchrijven(nelleke, 'aanvragen'), true);
    assert.equal(magZien(nelleke, 'gebruikers'), false);
    assert.equal(zichtbareModules(nelleke).includes('gebruikers'), false);
  });

  test('Paul ziet aanvragen niet en mag finance schrijven', () => {
    assert.equal(magZien(paul, 'aanvragen'), false);
    assert.equal(magSchrijven(paul, 'finance'), true);
    assert.equal(magSchrijven(paul, 'boekingen'), false);
    assert.equal(isDomeinVerantwoordelijke(paul, 'boekingen'), false);
    assert.equal(isDomeinVerantwoordelijke(nelleke, 'boekingen'), true);
  });

  test('alleen Super Admin mag vrienden exporteren', () => {
    assert.equal(magVriendenExporteren(nelleke), false);
    assert.equal(magVriendenExporteren(paul), false);
  });

  test('niemand anders kan Super Admin beperken', () => {
    assert.equal(magRechtWijzigen(nelleke, nick), false);
    assert.equal(magRechtWijzigen(nick, nelleke), true);
  });

  test('lezen is geen domeinverantwoordelijkheid', () => {
    assert.equal(isDomeinVerantwoordelijke(paul, 'kalender'), false);
  });
});
