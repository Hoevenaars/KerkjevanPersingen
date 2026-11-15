import assert from 'node:assert/strict';
import test from 'node:test';
import { beoordeelAanvraag, type FaseWereld } from '../src/platform/aanvraag-fase.ts';
import { planFaseTerug } from '../src/platform/fase-terug.ts';
import { voerFaseTerug } from '../src/lib/operatie/fase-terug.ts';
import type { DossierSessie } from '../src/lib/operatie/dossier-sessie.ts';
import type { Actor } from '../src/lib/operatie/kern.ts';

const beheer: Actor = {
  id: '11111111-1111-1111-1111-111111111111',
  naam: 'Nick',
  type: 'gebruiker',
  rechten: { isSuperAdmin: true, perModule: {} },
};

type Rij = Record<string, unknown>;

function geheugen(tabellen: Record<string, Rij[]>): DossierSessie {
  return {
    from(tabel: string) {
      if (!tabellen[tabel]) tabellen[tabel] = [];
      const q = {
        actie: 'select' as 'select' | 'update' | 'insert',
        waarden: {} as Rij,
        filters: [] as { kolom: string; waarde: unknown; neq: boolean }[],
        head: false,
        select(_kolommen: string, opties?: { head?: boolean }) {
          if (opties?.head) q.head = true;
          return q;
        },
        update(waarden: Rij) {
          q.actie = 'update';
          q.waarden = waarden;
          return q;
        },
        insert(rij: Rij) {
          q.actie = 'insert';
          q.waarden = rij;
          tabellen[tabel].push({ id: tabellen[tabel].length + 1, ...rij });
          return q;
        },
        eq(kolom: string, waarde: unknown) {
          q.filters.push({ kolom, waarde, neq: false });
          return q;
        },
        neq(kolom: string, waarde: unknown) {
          q.filters.push({ kolom, waarde, neq: true });
          return q;
        },
        in() {
          return q;
        },
        pas() {
          return tabellen[tabel].filter((rij) => q.filters.every((filter) => {
            const gelijk = rij[filter.kolom] === filter.waarde || String(rij[filter.kolom]) === String(filter.waarde);
            return filter.neq ? !gelijk : gelijk;
          }));
        },
        async maybeSingle() {
          if (q.actie === 'update') {
            const treffers = q.pas();
            for (const rij of treffers) Object.assign(rij, q.waarden);
            return { data: treffers[0] ? { ...treffers[0] } : null, error: null };
          }
          const treffers = q.pas();
          return { data: treffers[0] ? { ...treffers[0] } : null, error: null };
        },
        then(resolve: (waarde: { data: Rij[] | null; error: null; count: number | null }) => unknown) {
          if (q.actie === 'update') {
            const treffers = q.pas();
            for (const rij of treffers) Object.assign(rij, q.waarden);
            return Promise.resolve(resolve({ data: treffers.map((rij) => ({ ...rij })), error: null, count: treffers.length }));
          }
          const treffers = q.pas();
          return Promise.resolve(resolve({
            data: q.head ? null : treffers.map((rij) => ({ ...rij })),
            error: null,
            count: treffers.length,
          }));
        },
      };
      return q as unknown as ReturnType<DossierSessie['from']>;
    },
  };
}

function concert(): Record<string, Rij[]> {
  return {
    aanvragen: [{
      id: 15,
      status: 'goedgekeurd',
      naam: 'Nick Hoevenaars',
      start_datum: '2027-02-12',
      eind_datum: '2027-02-14',
      boeking_id: 8,
    }],
    boekingen: [{
      id: 8,
      nummer: 'KVP-20270212-15',
      status: 'optie',
      start_datum: '2027-02-12',
      eind_datum: '2027-02-14',
      interne_titel: 'Concert',
      huurder_naam_snapshot: 'Nick Hoevenaars',
      aanbetaling_ontvangen: false,
      aanvraag_id: 15,
    }],
    documenten: [{
      id: 3,
      boeking_id: 8,
      type: 'contract',
      bestandsnaam: 'KVP-20270212-15.pdf',
      ingetrokken_op: null,
    }],
    communicatie_jobs: [],
    communicatie_verzendingen: [{
      id: 4,
      boeking_id: 8,
      template_sleutel: 'huurovereenkomst',
      status: 'verzonden',
      test: false,
    }],
    contract_verzendingen: [{
      id: 5,
      boeking_id: 8,
      soort: 'contract',
      status: 'verzonden',
    }],
    contract_tekeningen: [{
      id: 6,
      boeking_id: 8,
      ondertekend_op: null,
      vrijgegeven: true,
      verloopt_op: '2027-03-01T00:00:00.000Z',
    }],
    contractversies: [],
    betalingen: [],
    publieke_activiteiten: [],
    auditlog: [],
  };
}

test('wachten op ondertekening gaat terug naar contract verzenden', async () => {
  const tabellen = concert();
  const uit = await voerFaseTerug(geheugen(tabellen), 15, 'Fout in het contract', beheer);
  assert.equal(uit.ok, true);
  assert.match(uit.melding, /Contract verzenden/);
  assert.equal(tabellen.documenten[0].ingetrokken_op == null, false);
  assert.equal(tabellen.communicatie_verzendingen[0].status, 'geannuleerd');
  assert.equal(tabellen.contract_verzendingen[0].status, 'ingetrokken');
  assert.equal(tabellen.contract_tekeningen[0].vrijgegeven, false);
  assert.equal(tabellen.boekingen[0].status, 'optie');
  assert.equal(tabellen.aanvragen[0].status, 'goedgekeurd');
  assert.equal(tabellen.auditlog.some((rij) => rij.actie === 'fase_terug'), true);
});

test('een tweede fase terug haalt daarna de optie weg', async () => {
  const tabellen = concert();
  const client = geheugen(tabellen);
  const eerste = await voerFaseTerug(client, 15, 'Fout in het contract', beheer);
  assert.equal(eerste.ok, true);
  const tweede = await voerFaseTerug(client, 15, 'Optie nog niet rond', beheer);
  assert.equal(tweede.ok, true);
  assert.match(tweede.melding, /Goedkeuren/);
  assert.equal(tabellen.boekingen[0].status, 'geannuleerd');
  assert.equal(tabellen.aanvragen[0].status, 'in_behandeling');
  assert.equal(tabellen.aanvragen[0].boeking_id, null);
});

test('een ondertekend contract gaat eerst terug naar wachten op ondertekening', async () => {
  const tabellen = concert();
  tabellen.documenten.push({
    id: 9,
    boeking_id: 8,
    type: 'getekend_contract',
    bestandsnaam: 'getekend.pdf',
    ingetrokken_op: null,
  });
  tabellen.contractversies.push({ id: 2, boeking_id: 8, ondertekening: 'ontvangen' });
  const uit = await voerFaseTerug(geheugen(tabellen), 15, 'Handtekening op de foute versie', beheer);
  assert.equal(uit.ok, true);
  assert.match(uit.melding, /Wachten op ondertekening/);
  assert.equal(tabellen.contractversies[0].ondertekening, 'open');
  assert.equal(tabellen.documenten[1].ingetrokken_op == null, false);
  assert.equal(tabellen.communicatie_verzendingen[0].status, 'verzonden');
});

test('een nieuwe aanvraag en een betaalde boeking gaan niet terug', () => {
  const leeg: FaseWereld = {
    aanvragen: [],
    boekingen: [],
    documenten: [],
    mails: [],
    betalingen: [],
    blokkades: [],
    activiteiten: [],
  };
  const nieuw = beoordeelAanvraag({
    id: '1',
    status: 'nieuw',
    naam: 'Nieuw',
    start: '2027-02-12',
    eind: '2027-02-14',
  }, leeg);
  assert.equal(planFaseTerug('nieuw', nieuw).kan, false);

  const betaald = beoordeelAanvraag({
    id: '1',
    status: 'goedgekeurd',
    naam: 'Betaald',
    start: '2027-02-12',
    eind: '2027-02-14',
    boekingId: '8',
  }, {
    ...leeg,
    boekingen: [{
      id: '8',
      nummer: '8',
      status: 'optie',
      start: '2027-02-12',
      eind: '2027-02-14',
      titel: 'Concert',
      huurder: 'Nick Hoevenaars',
      aanbetalingBinnen: true,
    }],
    documenten: [{ boekingId: '8', soort: 'getekend_contract', naam: 'getekend.pdf' }],
  });
  assert.equal(planFaseTerug('goedgekeurd', betaald).kan, false);
});

test('geschikt zonder boeking gaat terug naar nieuw', async () => {
  const tabellen: Record<string, Rij[]> = {
    aanvragen: [{
      id: 15,
      status: 'in_behandeling',
      naam: 'Nick Hoevenaars',
      start_datum: '2027-02-12',
      eind_datum: '2027-02-14',
      boeking_id: null,
    }],
    auditlog: [],
  };
  const uit = await voerFaseTerug(geheugen(tabellen), 15, 'Nog een keer beoordelen', beheer);
  assert.equal(uit.ok, true);
  assert.match(uit.melding, /Geschiktheid/);
  assert.equal(tabellen.aanvragen[0].status, 'nieuw');
});

test('zonder reden wijzigt een fase terug niets', async () => {
  const tabellen = concert();
  const uit = await voerFaseTerug(geheugen(tabellen), 15, '   ', beheer);
  assert.equal(uit.ok, false);
  assert.equal(tabellen.documenten[0].ingetrokken_op, null);
  assert.equal(tabellen.boekingen[0].status, 'optie');
});
