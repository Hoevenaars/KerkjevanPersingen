import assert from 'node:assert/strict';
import test from 'node:test';
import { koppelGastheerViaSessie, koppelGastherenViaSessie, leesBegeleiderKeuzes, type GastheerSessie } from '../src/lib/operatie/gastheer-koppelen.ts';

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
  assert.equal(uit.melding, 'Expositiebegeleider gekoppeld.');
  assert.equal(db.status.gastheer, 3);
});

test('een lege keuze koppelt de gastheer los', async () => {
  const db = client();
  const uit = await koppelGastheerViaSessie(db, 48, '', { type: 'gebruiker', naam: 'Nelleke' });
  assert.equal(uit.ok, true);
  assert.equal(uit.melding, 'Expositiebegeleider losgekoppeld.');
  assert.equal(db.status.gastheer, null);
});

test('een onbekende gastheer wijzigt de boeking niet', async () => {
  const db = client({ relatie: false });
  const uit = await koppelGastheerViaSessie(db, 48, '3', { type: 'gebruiker', naam: 'Nelleke' });
  assert.equal(uit.ok, false);
  assert.equal(db.status.gastheer, 9);
});

function lijstClient(start: Record<number, number | null>) {
  const gastheer = { ...start };
  let updates = 0;
  const db: GastheerSessie & { updates: number; gastheer: Record<number, number | null> } = {
    gastheer,
    updates: 0,
    from(tabel) {
      let id = 0;
      let schrijven: Record<string, unknown> | null = null;
      const query = {
        select() {
          return query;
        },
        update(waarden: Record<string, unknown>) {
          schrijven = waarden;
          return query;
        },
        insert() {
          return Promise.resolve({ error: null });
        },
        eq(_kolom: string, waarde: unknown) {
          id = Number(waarde);
          return query;
        },
        maybeSingle() {
          if (tabel === 'relaties') return Promise.resolve({ data: { id, naam: 'Hans' }, error: null });
          if (schrijven && tabel === 'boekingen') {
            gastheer[id] = (schrijven.gastheer_relatie_id as number | null) ?? null;
            updates += 1;
            db.updates = updates;
          }
          if (tabel === 'boekingen' && !Object.hasOwn(gastheer, id)) return Promise.resolve({ data: null, error: null });
          return Promise.resolve({ data: { id, gastheer_relatie_id: gastheer[id] ?? null }, error: null });
        },
        then(resolve: (waarde: { data: { id: number }; error: null }) => unknown) {
          return Promise.resolve({ data: { id }, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  return db;
}

const planner = {
  type: 'gebruiker',
  naam: 'Nick',
  rechten: { isSuperAdmin: false, perModule: { planning: 'schrijven' as const } },
};

test('bewaar slaat alleen gewijzigde begeleiders op', async () => {
  const formulier = new FormData();
  formulier.append('begeleider:10', '3');
  formulier.append('begeleider:10', '5');
  formulier.set('begeleider:11', '3');
  formulier.set('gastheerId', '9');
  const keuzes = leesBegeleiderKeuzes(formulier);
  assert.deepEqual(keuzes, [
    { boekingId: '10', gastheerId: '5' },
    { boekingId: '11', gastheerId: '3' },
  ]);

  const db = lijstClient({ 10: 3, 11: null, 12: 5 });
  const uit = await koppelGastherenViaSessie(db, [
    { boekingId: '10', gastheerId: '5' },
    { boekingId: '11', gastheerId: '3' },
    { boekingId: '12', gastheerId: '5' },
  ], planner);
  assert.equal(uit.ok, true);
  assert.equal(uit.melding, '2 expositiebegeleiders opgeslagen.');
  assert.equal(db.updates, 2);
  assert.equal(db.gastheer[10], 5);
  assert.equal(db.gastheer[11], 3);
  assert.equal(db.gastheer[12], 5);
});

test('bewaar zonder verschil en zonder recht wijzigt niets', async () => {
  const db = lijstClient({ 10: 3 });
  const gelijk = await koppelGastherenViaSessie(db, [{ boekingId: '10', gastheerId: '3' }], planner);
  assert.equal(gelijk.melding, 'Niets gewijzigd.');
  assert.equal(db.updates, 0);
  const geenRecht = await koppelGastherenViaSessie(db, [{ boekingId: '10', gastheerId: '5' }], {
    type: 'gebruiker',
    naam: 'Lezer',
    rechten: { isSuperAdmin: false, perModule: { planning: 'lezen' } },
  });
  assert.equal(geenRecht.ok, false);
  assert.equal(db.updates, 0);
  assert.equal(db.gastheer[10], 3);
});
