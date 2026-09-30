import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  beoordeelReconciliatie,
  bridgeBezetting,
  legeSnapshot,
  planBridge,
  webhookGeheimGeldig,
  type BridgePlan,
  type SanityDocument,
  type SchaduwRij,
} from '../src/platform/sanity-bridge.ts';
import { kanExternVersturen, STANDAARD_AUTOMATISERINGEN } from '../src/platform/automatisering.ts';

function pasToe(schaduw: SchaduwRij[], plan: BridgePlan): { schaduw: SchaduwRij[]; mail: number; jobs: number; boekingen: number } {
  assert.equal(plan.mail, false);
  assert.equal(plan.workflow, false);
  assert.ok(plan.stappen.every((stap) => !['mail', 'job', 'token', 'workflow'].includes(stap.soort)));
  let volgende = schaduw.map((rij) => ({ ...rij }));
  let boekingen = 0;
  for (const stap of plan.stappen) {
    if (stap.soort !== 'shadow') continue;
    const velden = stap.velden;
    const bestaand = volgende.find((rij) => rij.sanityId === stap.sanityId);
    const rij: SchaduwRij = {
      sanityId: stap.sanityId,
      start: (velden.start as string | null) ?? bestaand?.start ?? null,
      eind: (velden.eind as string | null) ?? bestaand?.eind ?? null,
      actief: Boolean(velden.actief),
      blokkeert: Boolean(velden.blokkeert),
      zichtbaarheid: String(velden.zichtbaarheid ?? ''),
    };
    volgende = volgende.filter((item) => item.sanityId !== stap.sanityId);
    volgende.push(rij);
  }
  return { schaduw: volgende, mail: 0, jobs: 0, boekingen };
}

test('nieuw bezet Sanity-item blokkeert alleen via de schaduw', () => {
  const plan = planBridge('create', {
    _id: 'nieuw-bezet',
    _type: 'activiteit',
    _updatedAt: '2026-09-30T10:00:00.000Z',
    start: '2028-05-01T09:00:00.000Z',
    eind: '2028-05-02T17:00:00.000Z',
    zichtbaarheid: 'bezet',
    soort: 'expositie',
    interneTitel: 'Nieuw',
  });
  const uit = pasToe([], plan);
  assert.equal(plan.status, 'success');
  assert.equal(plan.targetTable, 'sanity_bridge_agenda');
  assert.equal(uit.boekingen, 0);
  assert.equal(uit.mail, 0);
  assert.equal(bridgeBezetting(uit.schaduw).length, 1);
});

test('datumwijziging verplaatst de schaduw zonder duplicaat', () => {
  const eerste = planBridge('create', activiteit('datum', '2028-06-01', '2028-06-02'));
  const staat = pasToe([], eerste);
  const tweede = planBridge('update', activiteit('datum', '2028-07-01', '2028-07-02', eerste.sourceHash), {
    ...legeSnapshot(),
    heeftShadow: true,
    hash: 'andere',
  });
  const uit = pasToe(staat.schaduw, tweede);
  const bezet = bridgeBezetting(uit.schaduw);
  assert.equal(uit.schaduw.length, 1);
  assert.equal(bezet.length, 1);
  assert.equal(bezet[0]?.start, '2028-07-01');
  assert.equal(bezet.some((rij) => rij.start === '2028-06-01'), false);
});

test('verwijderen deactiveert de schaduw', () => {
  const gemaakt = planBridge('create', activiteit('weg', '2028-08-01', '2028-08-02'));
  const staat = pasToe([], gemaakt);
  const weg = planBridge('delete', { _id: 'weg', _type: 'activiteit' }, { ...legeSnapshot(), heeftShadow: true });
  const uit = pasToe(staat.schaduw, weg);
  assert.equal(bridgeBezetting(uit.schaduw).length, 0);
});

test('publieke activiteit werkt de publieke rij bij en houdt zichtbaarheid', () => {
  const plan = planBridge('update', {
    ...activiteit('publiek-1', '2028-09-01', '2028-09-02'),
    zichtbaarheid: 'publiek',
    publiekeTitel: 'Zichtbaar',
    slug: { current: 'zichtbaar' },
  }, { ...legeSnapshot(), heeftPubliek: true, heeftBron: true });
  assert.equal(plan.stappen.some((stap) => stap.soort === 'publiek'), true);
  assert.equal(plan.stappen.find((stap) => stap.soort === 'publiek')?.velden.zichtbaarheid, 'publiek');
  assert.equal(plan.stappen.some((stap) => stap.soort === 'shadow'), false);
  assert.equal(plan.mail, false);
});

test('vriend, nieuwsbrief en aanvraag schrijven hun tabel en geen mail', () => {
  const vriend = planBridge('update', { _id: 'v1', _type: 'vriend', email: 'a@example.nl', naam: 'A', actief: true }, { ...legeSnapshot(), heeftVriend: true });
  const brief = planBridge('update', { _id: 'n1', _type: 'nieuwsbrief', week: '2026-09-28', kortNieuws: 'Hallo' }, { ...legeSnapshot(), heeftNieuwsbrief: true });
  const aanvraag = planBridge('update', { _id: 'a1', _type: 'aanvraag', email: 'b@example.nl', naam: 'B', status: 'ja' }, { ...legeSnapshot(), heeftAanvraag: true });
  for (const plan of [vriend, brief, aanvraag]) {
    assert.equal(plan.mail, false);
    assert.equal(plan.workflow, false);
    assert.equal(plan.domeinMutaties, 1);
  }
  assert.equal(brief.stappen[0]?.velden.verstuurd, false);
  assert.equal(aanvraag.stappen[0]?.velden.status, 'goedgekeurd');
});

test('hetzelfde event een tweede keer geeft geen mutatie', () => {
  const document = activiteit('dubbel', '2028-01-01', '2028-01-02');
  const eerste = planBridge('create', document);
  const tweede = planBridge('update', document, { ...legeSnapshot(), hash: eerste.sourceHash, heeftShadow: true });
  assert.equal(tweede.status, 'skipped');
  assert.equal(tweede.domeinMutaties, 0);
  assert.equal(tweede.stappen.length, 0);
});

test('onbekend type en een mappingfout schrijven niets', () => {
  const onbekend = planBridge('create', { _id: 'x', _type: 'persoon', naam: 'P' });
  const fout = planBridge('create', { _id: 'y', _type: 'activiteit', zichtbaarheid: 'bezet' });
  assert.equal(onbekend.status, 'skipped');
  assert.equal(onbekend.domeinMutaties, 0);
  assert.equal(fout.status, 'error');
  assert.equal(fout.stappen.length, 0);
  assert.equal(fout.domeinMutaties, 0);
});

test('reconciliatie schrijft een bestaand legacy-record zonder hash niet', () => {
  const document = activiteit('legacy-1', '2028-04-01', '2028-04-02');
  const metRecord = beoordeelReconciliatie(document, { ...legeSnapshot(), heeftBron: true });
  assert.equal(metRecord.oordeel, 'review');
  assert.equal(metRecord.plan.stappen.length, 0);
  assert.equal(metRecord.plan.domeinMutaties, 0);
  const ontbrekend = beoordeelReconciliatie(document, legeSnapshot());
  assert.equal(ontbrekend.oordeel, 'ontbrekend');
  assert.equal(ontbrekend.plan.mail, false);
  const gelijk = beoordeelReconciliatie(document, { ...legeSnapshot(), heeftBron: true, hash: planBridge('update', document).sourceHash });
  assert.equal(gelijk.oordeel, 'gelijk');
  assert.equal(gelijk.plan.stappen.length, 0);
});

test('zonder event blijft de bridge-bezetting leeg', () => {
  assert.equal(bridgeBezetting([]).length, 0);
});

test('webhookgeheim en testmodus blijven dicht', () => {
  const body = '{"_id":"1","_type":"activiteit"}';
  const geheim = 'brug-geheim';
  const tijdstip = Date.now();
  const handtekening = createHmac('sha256', geheim).update(`${tijdstip}.${body}`).digest('base64');
  assert.equal(webhookGeheimGeldig(`t=${tijdstip},v1=${handtekening}`, body, geheim, tijdstip), true);
  assert.equal(webhookGeheimGeldig('Bearer onjuist', body, geheim, tijdstip), false);
  assert.equal(webhookGeheimGeldig(`t=${tijdstip},v1=${handtekening}`, body, '', tijdstip), false);
  const contact = STANDAARD_AUTOMATISERINGEN.find((item) => item.sleutel === 'contact_bestuur');
  const aanvraag = STANDAARD_AUTOMATISERINGEN.find((item) => item.sleutel === 'aanvraag_bestuur');
  assert.equal(contact && kanExternVersturen(contact), false);
  assert.equal(aanvraag && kanExternVersturen(aanvraag), true);
});

function activiteit(id: string, start: string, eind: string, hash?: string): SanityDocument {
  return {
    _id: id,
    _type: 'activiteit',
    _updatedAt: '2026-09-30T12:00:00.000Z',
    start: `${start}T09:00:00.000Z`,
    eind: `${eind}T17:00:00.000Z`,
    zichtbaarheid: 'bezet',
    soort: 'expositie',
    interneTitel: id,
    _rev: hash,
  };
}
