import assert from 'node:assert/strict';
import test from 'node:test';
import { trekFaseTerug } from '../src/lib/operatie/fase-terug.ts';
import type { DossierSessie } from '../src/lib/operatie/dossier-sessie.ts';
import type { Actor } from '../src/lib/operatie/kern.ts';

const beheer: Actor = {
  id: '11111111-1111-1111-1111-111111111111',
  naam: 'Beheer',
  type: 'gebruiker',
  rechten: { isSuperAdmin: true, perModule: {} },
};

type Rij = Record<string, unknown>;

function geheugen(extra: Record<string, Rij[]> = {}): { client: DossierSessie; tabellen: Record<string, Rij[]> } {
  const tabellen: Record<string, Rij[]> = {
    aanvragen: [{ id: 12, status: 'goedgekeurd', boeking_id: 4 }],
    boekingen: [{ id: 4, status: 'optie', aanbetaling_ontvangen: false }],
    documenten: [{ id: 2, boeking_id: 4, type: 'contract', bestandsnaam: 'huurovereenkomst.pdf' }],
    contractversies: [{ versie: 1, boeking_id: 4, ondertekening: 'open' }],
    contract_tekeningen: [{ id: 1, boeking_id: 4, ondertekend_op: null, token_hash: 'oud', verloopt_op: '2027-01-01T00:00:00.000Z' }],
    contract_verzendingen: [{ id: 7, boeking_id: 4, soort: 'contract', status: 'verzonden' }],
    communicatie_verzendingen: [{
      id: 3, boeking_id: 4, aanvraag_id: 12, status: 'verzonden', template_sleutel: 'huurovereenkomst', test: false,
    }],
    communicatie_jobs: [],
    auditlog: [],
    ...extra,
  };
  const client = {
    from(tabel: string) {
      const filters: [string, unknown][] = [];
      let actie: 'select' | 'update' | 'insert' = 'select';
      let waarden: Rij = {};
      const past = (rij: Rij) => filters.every(([kolom, waarde]) => rij[kolom] === waarde);
      const q = {
        select() { return q; },
        update(nieuw: Rij) { actie = 'update'; waarden = nieuw; return q; },
        insert(nieuw: Rij) { actie = 'insert'; waarden = nieuw; return q; },
        eq(kolom: string, waarde: unknown) { filters.push([kolom, waarde]); return q; },
        neq() { return q; },
        in() { return q; },
        async maybeSingle() {
          return { data: (tabellen[tabel] ?? []).find(past) ?? null, error: null };
        },
        then(resolve: (waarde: { data: Rij[]; error: null; count: number }) => unknown) {
          if (actie === 'insert') tabellen[tabel].push(waarden);
          if (actie === 'update') {
            for (const rij of tabellen[tabel] ?? []) {
              if (past(rij)) Object.assign(rij, waarden);
            }
          }
          const data = (tabellen[tabel] ?? []).filter(past);
          return Promise.resolve(resolve({ data, error: null, count: data.length }));
        },
      };
      return q;
    },
  } as unknown as DossierSessie;
  return { client, tabellen };
}

test('een ongetekend contract gaat terug naar verzenden en de tekenlink vervalt', async () => {
  const { client, tabellen } = geheugen();
  const uit = await trekFaseTerug(client, 12, beheer);
  assert.equal(uit.ok, true);
  assert.match(uit.melding, /opnieuw genereren/);
  assert.equal(tabellen.contract_verzendingen[0]?.status, 'ingetrokken');
  assert.equal(tabellen.communicatie_verzendingen[0]?.status, 'geannuleerd');
  assert.equal(tabellen.documenten[0]?.type, 'overig');
  assert.notEqual(tabellen.contract_tekeningen[0]?.token_hash, 'oud');
  assert.equal(tabellen.contract_tekeningen[0]?.verloopt_op, '1970-01-01T00:00:00.000Z');
  assert.equal(tabellen.auditlog.length, 1);
});

test('een getekend contract en een lezer wijzigen niets', async () => {
  const getekend = geheugen();
  getekend.tabellen.contractversies[0]!.ondertekening = 'ontvangen';
  const geweigerd = await trekFaseTerug(getekend.client, 12, beheer);
  assert.equal(geweigerd.ok, false);
  assert.match(geweigerd.melding, /ondertekend/);
  assert.equal(getekend.tabellen.contract_verzendingen[0]?.status, 'verzonden');

  const { client, tabellen } = geheugen();
  const lezer: Actor = { naam: 'Lezer', type: 'gebruiker', rechten: { isSuperAdmin: false, perModule: { aanvragen: 'lezen' } } };
  const uit = await trekFaseTerug(client, 12, lezer);
  assert.equal(uit.ok, false);
  assert.equal(tabellen.contract_verzendingen[0]?.status, 'verzonden');
});
