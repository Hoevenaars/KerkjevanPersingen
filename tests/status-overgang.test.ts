import assert from 'node:assert/strict';
import test from 'node:test';
import { statusActieToegestaan, statusTeltVoorOverlap } from '../src/platform/status-overgang.ts';
import { classificeerVerhuurtype, gastbegeleiderOntbreekt, gastbegeleiderRelevant, leesbareTitel } from '../src/platform/verhuur-classificatie.ts';
import { voerDossierViaSessie, type DossierSessie } from '../src/lib/operatie/dossier-sessie.ts';
import type { Actor } from '../src/lib/operatie/kern.ts';
import { stelPlanning, type PlanningInvoer } from '../src/platform/planning.ts';

const beheer: Actor = {
  type: 'gebruiker',
  naam: 'Nelleke',
  rechten: { isSuperAdmin: true, perModule: {} },
};

test('migratie_vastgelegd heeft geen verleng of definitief', () => {
  assert.equal(statusActieToegestaan('migratie_vastgelegd', 'verleng').ok, false);
  assert.equal(statusActieToegestaan('migratie_vastgelegd', 'definitief').ok, false);
  assert.equal(statusActieToegestaan('migratie_vastgelegd', 'afronden').ok, false);
  assert.equal(statusActieToegestaan('migratie_vastgelegd', 'annuleer').ok, true);
  assert.equal(statusActieToegestaan('optie', 'verleng').ok, true);
  assert.equal(statusActieToegestaan('optie', 'definitief').ok, true);
});

test('overlap telt migratie_vastgelegd niet mee', () => {
  assert.equal(statusTeltVoorOverlap('migratie_vastgelegd'), false);
  assert.equal(statusTeltVoorOverlap('optie'), true);
  assert.equal(statusTeltVoorOverlap('definitief'), true);
});

test('classificatie raadt geen weekend en houdt pasen leeg', () => {
  assert.equal(classificeerVerhuurtype('Oktober 3/4').uitkomst, 'review');
  assert.equal(classificeerVerhuurtype('April 15/16/17 Pasen').uitkomst, 'review');
  assert.equal(classificeerVerhuurtype('Juli 3. huwelijk').uitkomst, 'zeker');
  if (classificeerVerhuurtype('Juli 3. huwelijk').uitkomst === 'zeker') {
    assert.equal(classificeerVerhuurtype('Juli 3. huwelijk').type, 'bruiloft');
  }
  assert.equal(leesbareTitel('Oktober 3/4', 'Monika Loster'), 'Monika Loster');
  assert.equal(leesbareTitel('Second Nature', 'Monika'), 'Second Nature');
});

test('gastbegeleider alleen bij expositie of bestaande koppeling', () => {
  assert.equal(gastbegeleiderRelevant({ soort: '', heeftKoppeling: false }), false);
  assert.equal(gastbegeleiderRelevant({ soort: 'expositie', heeftKoppeling: false }), true);
  assert.equal(gastbegeleiderRelevant({ soort: '', heeftKoppeling: true }), true);
  assert.equal(gastbegeleiderOntbreekt({ soort: 'expositie', heeftKoppeling: false }), true);
  assert.equal(gastbegeleiderOntbreekt({ soort: '', heeftKoppeling: false }), false);
});

test('filter zonder type raakt alleen lege types', () => {
  const items: PlanningInvoer[] = [
    { sleutel: 'a', href: '/a', start: '2026-10-03', eind: '2026-10-04', titel: 'Oktober 3/4', type: '', status: 'migratie_vastgelegd', publicatiestatus: null, zichtbaarOpWebsite: false, bron: 'boeking' },
    { sleutel: 'b', href: '/b', start: '2026-10-10', eind: '2026-10-11', titel: 'Concert', type: 'concert', status: 'definitief', publicatiestatus: null, zichtbaarOpWebsite: false, bron: 'boeking' },
  ];
  assert.equal(stelPlanning(items, { vandaag: '2026-10-01', type: 'onbekend' }).length, 1);
  assert.equal(stelPlanning(items, { vandaag: '2026-10-01', type: 'concert' })[0]?.titel, 'Concert');
  assert.equal(stelPlanning(items, { vandaag: '2026-10-01' })[0]?.start, '2026-10-03');
});

function geheugen(status = 'migratie_vastgelegd') {
  const staat = {
    status,
    jobs: 0,
    audits: 0,
    updates: [] as Record<string, unknown>[],
  };
  const rij = {
    id: 48,
    status,
    start_datum: '2026-11-07',
    eind_datum: '2026-11-08',
    nummer: 'BKG-48',
  };
  const builder = (tabel: string) => {
    const q: {
      actie: string;
      waarden?: Record<string, unknown>;
      select: (kolommen: string) => typeof q;
      update: (waarden: Record<string, unknown>) => typeof q;
      insert: (waarden: Record<string, unknown>) => typeof q;
      eq: () => typeof q;
      neq: () => typeof q;
      in: () => typeof q;
      maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: null }>;
      then: (resolve: (waarde: { data: Record<string, unknown>[] | null; error: null; count: number | null }) => unknown) => Promise<unknown>;
    } = {
      actie: 'select',
      select() {
        return q;
      },
      update(waarden) {
        q.actie = 'update';
        q.waarden = waarden;
        return q;
      },
      insert(waarden) {
        q.actie = 'insert';
        q.waarden = waarden;
        if (tabel === 'communicatie_jobs') staat.jobs += 1;
        return q;
      },
      eq() {
        return q;
      },
      neq() {
        return q;
      },
      in() {
        return q;
      },
      async maybeSingle() {
        if (tabel === 'boekingen' && q.actie === 'select') return { data: { ...rij, status: staat.status }, error: null };
        if (tabel === 'boekingen' && q.actie === 'update') {
          staat.updates.push(q.waarden ?? {});
          if (typeof q.waarden?.status === 'string') staat.status = q.waarden.status;
          return { data: { id: 48, status: staat.status }, error: null };
        }
        if (tabel === 'auditlog') {
          staat.audits += 1;
          return { data: { id: 1 }, error: null };
        }
        return { data: { id: 1 }, error: null };
      },
      then(resolve) {
        if (tabel === 'boekingen') return Promise.resolve(resolve({ data: [], error: null, count: 0 }));
        if (tabel === 'incidenten') return Promise.resolve(resolve({ data: [], error: null, count: 0 }));
        return Promise.resolve(resolve({ data: [], error: null, count: 0 }));
      },
    };
    return q;
  };
  return { staat, client: { from: builder } as unknown as DossierSessie };
}

test('verleng op migratie schrijft niets en maakt geen job', async () => {
  const { staat, client } = geheugen();
  const uit = await voerDossierViaSessie(client, { soort: 'verleng', boekingId: '48' }, beheer);
  assert.equal(uit.ok, false);
  assert.match(uit.melding, /niet terug naar optie/);
  assert.equal(staat.status, 'migratie_vastgelegd');
  assert.equal(staat.jobs, 0);
  assert.equal(staat.updates.length, 0);
});

test('definitief op migratie blijft staan, ook bij overlap met een andere migratie', async () => {
  const { staat, client } = geheugen();
  const uit = await voerDossierViaSessie(
    client,
    { soort: 'handmatig_definitief', boekingId: '48', reden: 'toch' },
    beheer,
  );
  assert.equal(uit.ok, false);
  assert.match(uit.melding, /overlapcontrole/);
  assert.equal(staat.status, 'migratie_vastgelegd');
  assert.equal(staat.jobs, 0);
});

test('definitief van een optie kijkt niet naar aanbetaling en maakt geen job', async () => {
  const { staat, client } = geheugen('optie');
  const uit = await voerDossierViaSessie(
    client,
    { soort: 'handmatig_definitief', boekingId: '48', reden: 'bevestigd' },
    beheer,
  );
  assert.equal(uit.ok, true);
  assert.match(uit.melding, /geen voorwaarde/);
  assert.equal(staat.status, 'definitief');
  assert.equal(staat.jobs, 0);
});

test('aanbetaling vanuit de browser wijzigt niets', async () => {
  const { staat, client } = geheugen('optie');
  const uit = await voerDossierViaSessie(client, { soort: 'betaling', boekingId: '48' }, beheer);
  assert.equal(uit.ok, false);
  assert.equal(staat.status, 'optie');
  assert.equal(staat.jobs, 0);
});
