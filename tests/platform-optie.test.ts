import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { magStatusZetten, gevolgGoedkeuring } from '../src/platform/aanvraag.ts';
import {
  kanOptieAanmaken,
  optieSnapshot,
  isOptieVerlopen,
  actiesBijVerlopen,
  doorLatenLopen,
  optieAfwijzen,
  magHandmatigDefinitiefMaken,
} from '../src/platform/optie.ts';
import type { GebruikerRechten } from '../src/platform/types.ts';

const schrijver: GebruikerRechten = { isSuperAdmin: false, perModule: { aanvragen: 'schrijven', boekingen: 'schrijven' } };
const lezer: GebruikerRechten = { isSuperAdmin: false, perModule: { aanvragen: 'lezen', boekingen: 'lezen' } };

describe('aanvraag', () => {
  test('tweede aanvraag zelfde periode mag, sluiten alleen met schrijfrecht', () => {
    assert.equal(magStatusZetten('nieuw', 'gesloten', schrijver).ok, true);
    assert.equal(magStatusZetten('nieuw', 'gesloten', lezer).ok, false);
  });

  test('goedkeuring maakt optie en laat aanvraag open', () => {
    const gevolg = gevolgGoedkeuring();
    assert.equal(gevolg.boekingStatus, 'optie');
    assert.equal(gevolg.aanvraagBlijftOpen, true);
  });
});

describe('optie', () => {
  test('termijn wordt als snapshot vastgelegd', () => {
    const snap = optieSnapshot('2026-09-01', 14);
    assert.equal(snap.optieEinddatum, '2026-09-15');
    assert.equal(snap.optietermijnDagen, 14);
  });

  test('tweede optie zelfde periode wordt geblokkeerd, verlopen optie niet', () => {
    const actief = [{ id: '1', periode: { start: '2026-09-12', eind: '2026-09-13' }, status: 'optie' as const }];
    assert.equal(kanOptieAanmaken({ start: '2026-09-12', eind: '2026-09-13' }, actief).ok, false);
    const verlopen = [{ id: '1', periode: { start: '2026-09-12', eind: '2026-09-13' }, status: 'optie_verlopen' as const }];
    assert.equal(kanOptieAanmaken({ start: '2026-09-12', eind: '2026-09-13' }, verlopen).ok, true);
  });

  test('verlopen sluit niets automatisch en mailt contractbeheerder', () => {
    assert.equal(isOptieVerlopen('2026-09-15', '2026-09-16'), true);
    const actie = actiesBijVerlopen();
    assert.equal(actie.automatischSluiten, false);
    assert.equal(actie.mailNaar, 'contractbeheerder');
    assert.equal(actie.nieuweStatus, 'optie_verlopen');
  });

  test('door laten lopen stelt +14 dagen voor, andere termijn mag', () => {
    assert.equal(doorLatenLopen('2026-09-16', 14).nieuweEinddatum, '2026-09-30');
    assert.equal(doorLatenLopen('2026-09-16', 14, 7).nieuweEinddatum, '2026-09-23');
  });

  test('afwijzen maakt periode vrij en laat aanvraag open', () => {
    const afwijs = optieAfwijzen();
    assert.equal(afwijs.periodeVrijVoorNieuweOptie, true);
    assert.equal(afwijs.aanvraagBlijftOpen, true);
    assert.equal(afwijs.annuleerToekomstigeCommunicatie, true);
  });

  test('handmatig definitief mag voor domeinverantwoordelijke, niet voor lezer', () => {
    assert.equal(magHandmatigDefinitiefMaken(schrijver), true);
    assert.equal(magHandmatigDefinitiefMaken(lezer), false);
  });
});
