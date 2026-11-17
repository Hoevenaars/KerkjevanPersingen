import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MODULES } from '../src/platform/modules.ts';
import { hoofditems, subitems } from '../src/platform/beheer-hoofdnav.ts';
import { rechtVoor } from '../src/platform/rechten.ts';
import {
  MEELOPENDE_MODULES,
  RECHTEN_SECTIES,
  matrixVanFormulier,
  modulesVanSectie,
  niveauVanKop,
} from '../src/platform/rechten-indeling.ts';
import type { GebruikerRechten } from '../src/platform/types.ts';

describe('rechten volgen de secties', () => {
  test('elke module staat in de editor of loopt mee met Algemeen', () => {
    const zichtbaar = new Set(RECHTEN_SECTIES.flatMap((sectie) => modulesVanSectie(sectie)));
    for (const module of MODULES) {
      assert.equal(
        zichtbaar.has(module) || module in MEELOPENDE_MODULES,
        true,
        module,
      );
    }
  });

  test('een gekozen kop zet elk onderdeel, verborgen laat ze los', () => {
    const heel = matrixVanFormulier([
      ['kop_verhuur', 'lezen'],
      ['recht_aanvragen', 'schrijven'],
      ['recht_boekingen', 'verborgen'],
      ['recht_instellingen', 'schrijven'],
    ]);
    assert.equal(heel.aanvragen, 'lezen');
    assert.equal(heel.boekingen, 'lezen');
    assert.equal(heel.handmatige_boeking, 'lezen');
    assert.equal(heel.planning, 'lezen');
    assert.equal(heel.kalender, 'lezen');
    assert.equal(heel.algemene_instellingen, 'schrijven');
    assert.equal(heel.bridge, 'schrijven');

    const delen = matrixVanFormulier([
      ['kop_website', 'verborgen'],
      ['recht_agenda', 'schrijven'],
      ['recht_website_banner', 'lezen'],
      ['recht_website_extra_balk', 'verborgen'],
    ]);
    assert.equal(delen.agenda, 'schrijven');
    assert.equal(delen.website_banner, 'lezen');
    assert.equal(delen.website_extra_balk, 'verborgen');
    assert.equal(niveauVanKop(['lezen', 'lezen']), 'lezen');
    assert.equal(niveauVanKop(['lezen', 'verborgen']), null);
  });

  test('een ontbrekend onderdeel erft, een expliciete rij wint', () => {
    const agenda: GebruikerRechten = { isSuperAdmin: false, perModule: { agenda: 'lezen' } };
    assert.equal(rechtVoor(agenda, 'website_banner'), 'lezen');
    assert.equal(rechtVoor(agenda, 'website_extra_balk'), 'lezen');
    const dicht: GebruikerRechten = {
      isSuperAdmin: false,
      perModule: { agenda: 'schrijven', website_banner: 'verborgen' },
    };
    assert.equal(rechtVoor(dicht, 'website_banner'), 'verborgen');
    assert.equal(rechtVoor(dicht, 'website_extra_balk'), 'schrijven');

    const bestuur: GebruikerRechten = { isSuperAdmin: false, perModule: { instellingen: 'schrijven' } };
    assert.equal(rechtVoor(bestuur, 'handmatige_boeking'), 'schrijven');
    assert.equal(rechtVoor(bestuur, 'verhuur_instellingen'), 'schrijven');
    const lezer: GebruikerRechten = { isSuperAdmin: false, perModule: { instellingen: 'lezen' } };
    assert.equal(rechtVoor(lezer, 'handmatige_boeking'), 'verborgen');
    assert.equal(rechtVoor(lezer, 'contractsjabloon'), 'lezen');
    const zonderBoeking: GebruikerRechten = {
      isSuperAdmin: false,
      perModule: { instellingen: 'schrijven', handmatige_boeking: 'verborgen' },
    };
    assert.equal(rechtVoor(zonderBoeking, 'handmatige_boeking'), 'verborgen');
  });

  test('alleen een onderdeel opent de kop, niet de rest', () => {
    const banner: GebruikerRechten = { isSuperAdmin: false, perModule: { website_banner: 'lezen' } };
    const opties = { verhuurAgenda: true };
    assert.deepEqual(hoofditems(banner, opties).map((item) => item.sleutel), ['website']);
    assert.deepEqual(subitems('website', banner, opties).map((item) => item.label), ['Banner']);

    const boeking: GebruikerRechten = { isSuperAdmin: false, perModule: { handmatige_boeking: 'schrijven' } };
    assert.deepEqual(subitems('verhuur', boeking, opties).map((item) => item.label), ['Handmatige boeking']);
  });
});
