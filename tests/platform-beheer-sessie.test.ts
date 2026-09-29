import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  effectieveRechten,
  lastActiveMoetBijwerken,
  magSuperAdminVlagZetten,
  magViewAsStarten,
  nieuweStatusNaDeactiveren,
  nieuweStatusNaReactiveren,
  pasRolWeergaveToe,
  rechtenVanRijen,
  type BeheerSessie,
} from '../src/platform/beheer-sessie.ts';
import { inviteRechten, matrixVanFormulier, valideerInvite } from '../src/lib/beheer-gebruikers.ts';
import { REFERENTIE_RECHTEN, rolWeergaveId } from '../src/platform/referentie-gebruikers.ts';

describe('sessie en view-as', () => {
  test('alleen Super Admin mag View as User starten', () => {
    assert.equal(magViewAsStarten({ isSuperAdmin: true, perModule: {} }), true);
    assert.equal(magViewAsStarten({ isSuperAdmin: false, perModule: { gebruikers: 'schrijven' } }), false);
  });

  test('effectieve rechten komen van het doel, actor blijft Super Admin', () => {
    const nick = { isSuperAdmin: true, perModule: {} };
    const nelleke = { isSuperAdmin: false, perModule: REFERENTIE_RECHTEN.nelleke };
    assert.deepEqual(effectieveRechten(nick, nelleke), nelleke);
    assert.equal(nick.isSuperAdmin, true);
  });

  test('super admin schakelt naar een benoemde rol, een ander account niet', () => {
    const nick: BeheerSessie = {
      gebruiker: {
        id: 'nick',
        email: 'nick@example.com',
        naam: 'Nick',
        functie: null,
        status: 'active',
        isSuperAdmin: true,
        actief: true,
        lastActiveAt: null,
      },
      rechten: { isSuperAdmin: true, perModule: {} },
      effectieveRechten: { isSuperAdmin: true, perModule: {} },
      viewAs: null,
      bron: 'supabase',
    };
    const alsHans = pasRolWeergaveToe(nick, rolWeergaveId('hans'));
    assert.equal(alsHans.viewAs?.naam, 'Hans');
    assert.equal(alsHans.viewAs?.functie, 'hans');
    assert.equal(alsHans.rechten.isSuperAdmin, true);
    assert.equal(alsHans.effectieveRechten.isSuperAdmin, false);
    assert.equal(alsHans.effectieveRechten.perModule.dashboard, 'lezen');
    assert.equal(alsHans.effectieveRechten.perModule.finance, 'verborgen');
    assert.equal(pasRolWeergaveToe(nick, 'geen-rol').viewAs, null);
    const nelleke: BeheerSessie = {
      ...nick,
      rechten: { isSuperAdmin: false, perModule: {} },
      effectieveRechten: { isSuperAdmin: false, perModule: {} },
    };
    assert.equal(pasRolWeergaveToe(nelleke, rolWeergaveId('paul')).viewAs, null);
  });

  test('last active wordt hooguit eens per vijf minuten ververst', () => {
    const nu = Date.parse('2026-09-21T20:00:00Z');
    assert.equal(lastActiveMoetBijwerken(null, nu), true);
    assert.equal(lastActiveMoetBijwerken('2026-09-21T19:54:00Z', nu), true);
    assert.equal(lastActiveMoetBijwerken('2026-09-21T19:56:00Z', nu), false);
  });

  test('deactiveren bewaart het account, reactiveren hangt af van eerdere sessie', () => {
    assert.equal(nieuweStatusNaDeactiveren(), 'disabled');
    assert.equal(nieuweStatusNaReactiveren(true), 'active');
    assert.equal(nieuweStatusNaReactiveren(false), 'invited');
  });

  test('gewone gebruiker kan zichzelf geen Super Admin maken', () => {
    const nelleke = { isSuperAdmin: false, perModule: REFERENTIE_RECHTEN.nelleke };
    assert.equal(magSuperAdminVlagZetten(nelleke, true, false), false);
    assert.equal(magSuperAdminVlagZetten({ isSuperAdmin: true, perModule: {} }, true, false), true);
  });
});

describe('uitnodigen', () => {
  test('weigert ongeldige invoer', () => {
    assert.ok(valideerInvite({ naam: '', email: 'a@b.nl', redirectTo: '/' }));
    assert.ok(valideerInvite({ naam: 'Paul', email: 'geen-mail', redirectTo: '/' }));
    assert.ok(valideerInvite({ naam: 'Paul', email: 'paul@kerkje.nl', functie: 'finance', redirectTo: '/' }));
    assert.equal(valideerInvite({ naam: 'Paul', email: 'paul@kerkje.nl', functie: 'paul', redirectTo: '/' }), null);
  });

  test('rol vult de lege startmatrix, zelf ingevulde rechten blijven leidend', () => {
    assert.deepEqual(
      inviteRechten({ naam: 'Nelleke', email: 'n@x.nl', functie: 'nelleke', redirectTo: '/' }),
      REFERENTIE_RECHTEN.nelleke,
    );
    const eigen = { finance: 'schrijven' as const };
    assert.deepEqual(
      inviteRechten({ naam: 'Paul', email: 'p@x.nl', functie: 'paul', rechten: eigen, redirectTo: '/' }),
      eigen,
    );
  });

  test('formuliermatrix leest alleen bekende modules en niveaus', () => {
    const matrix = matrixVanFormulier([
      ['recht_finance', 'schrijven'],
      ['recht_aanvragen', 'verborgen'],
      ['recht_onbekend', 'schrijven'],
      ['naam', 'Paul'],
    ]);
    assert.equal(matrix.finance, 'schrijven');
    assert.equal(matrix.aanvragen, 'verborgen');
    assert.equal(Object.prototype.hasOwnProperty.call(matrix, 'onbekend'), false);
  });

  test('rijen uit de database worden het bestaande GebruikerRechten-model', () => {
    const rechten = rechtenVanRijen(false, [
      { module: 'finance', niveau: 'schrijven' },
      { module: 'boekingen', niveau: 'lezen' },
      { module: 'hack', niveau: 'schrijven' },
    ]);
    assert.equal(rechten.isSuperAdmin, false);
    assert.equal(rechten.perModule.finance, 'schrijven');
    assert.equal(rechten.perModule.boekingen, 'lezen');
    assert.equal(Object.prototype.hasOwnProperty.call(rechten.perModule, 'hack'), false);
  });
});
