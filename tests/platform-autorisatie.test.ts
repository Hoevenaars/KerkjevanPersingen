import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  beheerToegang,
  isBeheerAuthPad,
  moduleVoorPad,
} from '../src/platform/autorisatie.ts';
import { MODULES } from '../src/platform/modules.ts';
import { REFERENTIE_RECHTEN } from '../src/platform/referentie-gebruikers.ts';
import type { GebruikerRechten } from '../src/platform/types.ts';

const nick: GebruikerRechten = { isSuperAdmin: true, perModule: {} };
const nelleke: GebruikerRechten = { isSuperAdmin: false, perModule: REFERENTIE_RECHTEN.operationeel };
const paul: GebruikerRechten = { isSuperAdmin: false, perModule: REFERENTIE_RECHTEN.finance };
const hans: GebruikerRechten = { isSuperAdmin: false, perModule: REFERENTIE_RECHTEN.planning };

describe('centrale module-registry', () => {
  test('iedere bekende module heeft een href en label', () => {
    for (const sleutel of MODULES) {
      assert.ok(sleutel.length > 0);
    }
    assert.ok(MODULES.includes('gebruikers'));
    assert.ok(MODULES.includes('planning'));
    assert.ok(MODULES.includes('instellingen'));
  });
});

describe('route → module', () => {
  test('auth-paden blijven open', () => {
    assert.equal(moduleVoorPad('/beheer/login'), 'auth');
    assert.equal(moduleVoorPad('/beheer/wachtwoord/'), 'auth');
    assert.equal(moduleVoorPad('/beheer/auth/callback'), 'auth');
    assert.equal(isBeheerAuthPad('/beheer/uitloggen'), true);
  });

  test('instellingen-subpaden gaan naar de juiste module', () => {
    assert.equal(moduleVoorPad('/beheer/instellingen/gebruikers/'), 'gebruikers');
    assert.equal(moduleVoorPad('/api/beheer/gebruikers'), 'gebruikers');
    assert.equal(moduleVoorPad('/api/beheer/view-as'), 'gebruikers');
    assert.equal(moduleVoorPad('/beheer/instellingen/templates/abc/'), 'templates');
    assert.equal(moduleVoorPad('/beheer/instellingen/verhuur/'), 'instellingen');
    assert.equal(moduleVoorPad('/beheer/finance/'), 'finance');
    assert.equal(moduleVoorPad('/beheer/'), 'dashboard');
  });
});

describe('server-side toegang', () => {
  test('niet ingelogd wordt naar login gestuurd', () => {
    assert.equal(
      beheerToegang({
        methode: 'GET',
        module: 'finance',
        ingelogd: false,
        actief: true,
        rechten: paul,
        viewAsActief: false,
      }),
      'login',
    );
  });

  test('disabled gebruiker komt er niet in', () => {
    assert.equal(
      beheerToegang({
        methode: 'GET',
        module: 'dashboard',
        ingelogd: true,
        actief: false,
        rechten: nick,
        viewAsActief: false,
      }),
      'disabled',
    );
  });

  test('verborgen module is geblokkeerd, ook via directe URL', () => {
    assert.equal(
      beheerToegang({
        methode: 'GET',
        module: 'aanvragen',
        ingelogd: true,
        actief: true,
        rechten: paul,
        viewAsActief: false,
      }),
      'verborgen',
    );
    assert.equal(
      beheerToegang({
        methode: 'GET',
        module: 'gebruikers',
        ingelogd: true,
        actief: true,
        rechten: nelleke,
        viewAsActief: false,
      }),
      'verborgen',
    );
  });

  test('lezen blokkeert mutaties, schrijven niet', () => {
    assert.equal(
      beheerToegang({
        methode: 'POST',
        module: 'boekingen',
        ingelogd: true,
        actief: true,
        rechten: paul,
        viewAsActief: false,
      }),
      'alleen_lezen',
    );
    assert.equal(
      beheerToegang({
        methode: 'POST',
        module: 'finance',
        ingelogd: true,
        actief: true,
        rechten: paul,
        viewAsActief: false,
      }),
      'ok',
    );
  });

  test('View as User blokkeert mutaties ook bij schrijfrechten van het doel', () => {
    assert.equal(
      beheerToegang({
        methode: 'POST',
        module: 'aanvragen',
        ingelogd: true,
        actief: true,
        rechten: nelleke,
        viewAsActief: true,
      }),
      'preview',
    );
    assert.equal(
      beheerToegang({
        methode: 'GET',
        module: 'aanvragen',
        ingelogd: true,
        actief: true,
        rechten: nelleke,
        viewAsActief: true,
      }),
      'ok',
    );
  });

  test('Super Admin ziet en schrijft alles', () => {
    for (const module of MODULES) {
      assert.equal(
        beheerToegang({
          methode: 'POST',
          module,
          ingelogd: true,
          actief: true,
          rechten: nick,
          viewAsActief: false,
        }),
        'ok',
      );
    }
  });

  test('referentierechten van Hans laten planning schrijven en finance verborgen', () => {
    assert.equal(
      beheerToegang({
        methode: 'POST',
        module: 'planning',
        ingelogd: true,
        actief: true,
        rechten: hans,
        viewAsActief: false,
      }),
      'ok',
    );
    assert.equal(
      beheerToegang({
        methode: 'GET',
        module: 'finance',
        ingelogd: true,
        actief: true,
        rechten: hans,
        viewAsActief: false,
      }),
      'verborgen',
    );
  });
});
