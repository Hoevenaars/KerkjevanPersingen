import assert from 'node:assert/strict';
import test from 'node:test';
import { beoordeelStukViaSessie, type StukBeoordelingSessie } from '../src/lib/operatie/stuk-beoordeling.ts';
import type { Actor } from '../src/lib/operatie/kern.ts';

const beheerder: Actor = {
  type: 'gebruiker',
  id: '11111111-1111-1111-1111-111111111111',
  naam: 'Ans',
  rechten: { isSuperAdmin: false, perModule: { boekingen: 'schrijven' } },
};

const kijker: Actor = {
  type: 'gebruiker',
  naam: 'Kijker',
  rechten: { isSuperAdmin: false, perModule: { boekingen: 'lezen' } },
};

function client(opties: { rijen?: { status: string; reden: string; beoordeeld_op: string }[]; fout?: { message: string; code?: string } | null } = {}) {
  const tabellen: string[] = [];
  const inserts: { tabel: string; rij: Record<string, unknown> }[] = [];
  const sessi: StukBeoordelingSessie = {
    from(tabel) {
      tabellen.push(tabel);
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        insert(rij: Record<string, unknown>) {
          inserts.push({ tabel, rij });
          return Promise.resolve({ error: opties.fout ?? null });
        },
        then(resolve: (waarde: { data: typeof opties.rijen; error: { message: string; code?: string } | null }) => unknown) {
          return Promise.resolve({ data: opties.rijen ?? [], error: opties.fout && tabel === 'stuk_beoordelingen' && inserts.length === 0 ? opties.fout : null }).then(resolve);
        },
      };
      return query;
    },
  };
  return { sessi, tabellen, inserts };
}

test('goedkeuren schrijft alleen de beoordeling en het logboek', async () => {
  const omgeving = client();
  const uit = await beoordeelStukViaSessie(omgeving.sessi, {
    boekingId: '12',
    bron: 'aanvraag_foto',
    bronId: '4',
    versie: 'pad-a',
    besluit: 'goedgekeurd',
  }, beheerder);
  assert.equal(uit.ok, true);
  assert.match(uit.melding, /geen e-mail/i);
  assert.match(uit.melding, /niets gepubliceerd/i);
  assert.deepEqual(omgeving.tabellen, ['stuk_beoordelingen', 'stuk_beoordelingen', 'auditlog']);
  assert.equal(omgeving.inserts[0].rij.status, 'goedgekeurd');
  assert.equal(omgeving.inserts[0].rij.reden, null);
  assert.equal(omgeving.inserts[1].rij.actie, 'stuk_goedgekeurd');
  assert.equal(omgeving.tabellen.includes('betalingen'), false);
  assert.equal(omgeving.tabellen.includes('communicatie_jobs'), false);
  assert.equal(omgeving.tabellen.includes('publieke_activiteiten'), false);
});

test('afkeuren zonder reden en een kijkrol wijzigen niets', async () => {
  const zonderReden = client();
  const afkeuren = await beoordeelStukViaSessie(zonderReden.sessi, {
    boekingId: '12',
    bron: 'content_intake',
    bronId: '4',
    versie: 'pad-a',
    besluit: 'afgekeurd',
    reden: '   ',
  }, beheerder);
  assert.equal(afkeuren.ok, false);
  assert.equal(zonderReden.inserts.length, 0);
  const lezen = client();
  const geweigerd = await beoordeelStukViaSessie(lezen.sessi, {
    boekingId: '12',
    bron: 'aanvraag_foto',
    bronId: '4',
    versie: 'pad-a',
    besluit: 'goedgekeurd',
  }, kijker);
  assert.equal(geweigerd.ok, false);
  assert.equal(lezen.inserts.length, 0);
});

test('dezelfde goedkeuring wordt niet nog eens opgeslagen', async () => {
  const omgeving = client({ rijen: [{ status: 'goedgekeurd', reden: '', beoordeeld_op: '2026-11-08T10:00:00Z' }] });
  const uit = await beoordeelStukViaSessie(omgeving.sessi, {
    boekingId: '12',
    bron: 'document',
    bronId: '4',
    versie: '4',
    besluit: 'goedgekeurd',
  }, beheerder);
  assert.equal(uit.ok, true);
  assert.equal(omgeving.inserts.length, 0);
});

test('afkeuren bewaart de reden', async () => {
  const omgeving = client();
  const uit = await beoordeelStukViaSessie(omgeving.sessi, {
    boekingId: '12',
    bron: 'activiteit_tekst',
    bronId: '12',
    versie: '1:abc',
    besluit: 'afgekeurd',
    reden: 'De foto is onscherp.',
  }, beheerder);
  assert.equal(uit.ok, true);
  assert.equal(omgeving.inserts[0].rij.reden, 'De foto is onscherp.');
  assert.equal(omgeving.inserts[1].rij.actie, 'stuk_afgekeurd');
});

test('een ontbrekende tabel wordt niet als succes gezien', async () => {
  const omgeving = client({ fout: { message: 'relation "public.stuk_beoordelingen" does not exist', code: '42P01' } });
  const uit = await beoordeelStukViaSessie(omgeving.sessi, {
    boekingId: '12',
    bron: 'aanvraag_foto',
    bronId: '4',
    versie: 'pad-a',
    besluit: 'goedgekeurd',
  }, beheerder);
  assert.equal(uit.ok, false);
  assert.match(uit.melding, /niets gewijzigd/i);
  assert.equal(omgeving.inserts.length, 0);
});
