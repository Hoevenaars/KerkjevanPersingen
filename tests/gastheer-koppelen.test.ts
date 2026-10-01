import assert from 'node:assert/strict';
import test from 'node:test';
import { koppelGastheerViaSessie, type GastheerSessie } from '../src/lib/operatie/gastheer-koppelen.ts';

function client(opties: { relatie?: boolean } = {}): GastheerSessie & { status: { gastheer: number | null } } {
  const status = { gastheer: 9 as number | null };
  return {
    status,
    from(tabel) {
      const stappen = { tabel, waarden: {} as Record<string, unknown> };
      const query = {
        select() {
          return query;
        },
        update(waarden: Record<string, unknown>) {
          stappen.waarden = waarden;
          if (tabel === 'boekingen') status.gastheer = (waarden.gastheer_relatie_id as number | null) ?? null;
          return query;
        },
        insert() {
          return Promise.resolve({ error: null });
        },
        eq() {
          return query;
        },
        maybeSingle() {
          if (tabel === 'relaties') {
            return Promise.resolve(opties.relatie === false ? { data: null, error: null } : { data: { id: 3, naam: 'Hans' }, error: null });
          }
          return Promise.resolve({ data: { id: 48 }, error: null });
        },
        then(resolve: (waarde: { data: { id: number }; error: null }) => unknown) {
          return Promise.resolve({ data: { id: 48 }, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
}

test('een gekozen gastheer wordt op de boeking gezet', async () => {
  const db = client();
  const uit = await koppelGastheerViaSessie(db, 48, '3', { type: 'gebruiker', naam: 'Nelleke' });
  assert.equal(uit.ok, true);
  assert.equal(uit.melding, 'Gastheer gekoppeld.');
  assert.equal(db.status.gastheer, 3);
});

test('een lege keuze koppelt de gastheer los', async () => {
  const db = client();
  const uit = await koppelGastheerViaSessie(db, 48, '', { type: 'gebruiker', naam: 'Nelleke' });
  assert.equal(uit.ok, true);
  assert.equal(uit.melding, 'Gastheer losgekoppeld.');
  assert.equal(db.status.gastheer, null);
});

test('een onbekende gastheer wijzigt de boeking niet', async () => {
  const db = client({ relatie: false });
  const uit = await koppelGastheerViaSessie(db, 48, '3', { type: 'gebruiker', naam: 'Nelleke' });
  assert.equal(uit.ok, false);
  assert.equal(db.status.gastheer, 9);
});
