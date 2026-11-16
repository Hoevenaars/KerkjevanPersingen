import assert from 'node:assert/strict';
import test from 'node:test';
import { legAanbetalingVast, legOndertekeningVast, verwerkOntvangst } from '../src/lib/operatie/ontvangst.ts';
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
    boekingen: [{ id: 4, status: 'optie', aanbetaling_bedrag: 100, aanbetaling_ontvangen: false }],
    betalingen: [
      { id: 8, boeking_id: 4, soort: 'aanbetaling', bedrag: 100, status: 'open' },
      { id: 9, boeking_id: 4, soort: 'restant', bedrag: 390, status: 'open' },
    ],
    contractversies: [{ versie: 1, boeking_id: 4, contractnummer: 'KVP-4-1', ondertekening: 'open' }],
    documenten: [],
    auditlog: [],
    ...extra,
  };
  const client = {
    from(tabel: string) {
      const filters: [string, unknown][] = [];
      let actie: 'select' | 'update' | 'insert' = 'select';
      let waarden: Rij = {};
      const past = (rij: Rij) => filters.every(([kolom, waarde]) => {
        if (String(kolom).startsWith('neq:')) return rij[String(kolom).slice(4)] !== waarde;
        if (Array.isArray(waarde)) return waarde.includes(rij[kolom]);
        return rij[kolom] === waarde;
      });
      const q = {
        select() { return q; },
        update(nieuw: Rij) { actie = 'update'; waarden = nieuw; return q; },
        insert(nieuw: Rij) { actie = 'insert'; waarden = nieuw; return q; },
        eq(kolom: string, waarde: unknown) { filters.push([kolom, waarde]); return q; },
        neq(kolom: string, waarde: unknown) { filters.push([`neq:${kolom}`, waarde]); return q; },
        in(kolom: string, waarden: unknown[]) { filters.push([kolom, waarden]); return q; },
        pasSchrijfToe() {
          if (actie === 'insert') (tabellen[tabel] ??= []).push({ ...waarden });
          if (actie === 'update') {
            for (const rij of tabellen[tabel] ?? []) {
              if (past(rij)) Object.assign(rij, waarden);
            }
          }
          actie = 'select';
        },
        async maybeSingle() {
          q.pasSchrijfToe();
          return { data: (tabellen[tabel] ?? []).find(past) ?? null, error: null };
        },
        then(resolve: (waarde: { data: Rij[]; error: null }) => unknown) {
          q.pasSchrijfToe();
          return Promise.resolve(resolve({ data: (tabellen[tabel] ?? []).filter(past), error: null }));
        },
      };
      return q;
    },
  } as unknown as DossierSessie;
  return { client, tabellen };
}

test('een open aanbetaling wordt ontvangen en de restbetaling en status blijven staan', async () => {
  const { client, tabellen } = geheugen();
  const uit = await legAanbetalingVast(client, 4, beheer);
  assert.equal(uit.ok, true);
  assert.match(uit.melding, /ontvangen/);
  assert.match(uit.melding, /geen mail/i);
  assert.equal(tabellen.betalingen.find((rij) => rij.id === 8)?.status, 'ontvangen');
  assert.equal(tabellen.betalingen.find((rij) => rij.id === 9)?.status, 'open');
  assert.equal(tabellen.boekingen[0]?.status, 'optie');
  assert.equal(tabellen.boekingen[0]?.aanbetaling_ontvangen, true);
  assert.equal(tabellen.auditlog.length, 1);

  const opnieuw = await legAanbetalingVast(client, 4, beheer);
  assert.equal(opnieuw.ok, true);
  assert.match(opnieuw.melding, /al ontvangen/);
  assert.equal(tabellen.betalingen.filter((rij) => rij.soort === 'aanbetaling').length, 1);
});

test('zonder betaalregel ontstaat de aanbetaling uit het bedrag op de boeking', async () => {
  const { client, tabellen } = geheugen({ betalingen: [] });
  const uit = await legAanbetalingVast(client, 4, beheer);
  assert.equal(uit.ok, true);
  assert.equal(tabellen.betalingen[0]?.status, 'ontvangen');
  assert.equal(tabellen.betalingen[0]?.bedrag, 100);
  assert.equal(tabellen.boekingen[0]?.status, 'optie');
});

test('een tegenstrijdige of ontbrekend bedrag en een stopgezette boeking wijzigen niets', async () => {
  const tegen = geheugen({
    betalingen: [
      { id: 1, boeking_id: 4, soort: 'aanbetaling', bedrag: 100, status: 'open' },
      { id: 2, boeking_id: 4, soort: 'aanbetaling', bedrag: 100, status: 'ontvangen' },
    ],
  });
  const fout = await legAanbetalingVast(tegen.client, 4, beheer);
  assert.equal(fout.ok, false);
  assert.equal(tegen.tabellen.betalingen[0]?.status, 'open');

  const leeg = geheugen({
    boekingen: [{ id: 4, status: 'optie', aanbetaling_bedrag: null, aanbetaling_ontvangen: false }],
    betalingen: [],
  });
  const zonder = await legAanbetalingVast(leeg.client, 4, beheer);
  assert.equal(zonder.ok, false);
  assert.equal(leeg.tabellen.betalingen.length, 0);

  const stop = geheugen({
    boekingen: [{ id: 4, status: 'geannuleerd', aanbetaling_bedrag: 100, aanbetaling_ontvangen: false }],
  });
  const geblokkeerd = await legAanbetalingVast(stop.client, 4, beheer);
  assert.equal(geblokkeerd.ok, false);
  assert.equal(stop.tabellen.betalingen.find((rij) => rij.id === 8)?.status, 'open');
});

test('een lezer legt niets vast en finance mag alleen de aanbetaling', async () => {
  const { client, tabellen } = geheugen();
  const lezer: Actor = { naam: 'Lezer', type: 'gebruiker', rechten: { isSuperAdmin: false, perModule: { aanvragen: 'lezen', finance: 'lezen' } } };
  const geweigerd = await legAanbetalingVast(client, 4, lezer);
  assert.equal(geweigerd.ok, false);
  assert.equal(tabellen.betalingen.find((rij) => rij.id === 8)?.status, 'open');

  const penning: Actor = { naam: 'Penning', type: 'gebruiker', rechten: { isSuperAdmin: false, perModule: { finance: 'schrijven' } } };
  const betaald = await legAanbetalingVast(client, 4, penning);
  assert.equal(betaald.ok, true);
  const tekening = await legOndertekeningVast(client, 4, penning, null);
  assert.equal(tekening.ok, false);
  assert.equal(tabellen.contractversies[0]?.ondertekening, 'open');
});

test('ondertekening zet de laatste versie en een dossierstuk, zonder de boeking definitief te maken', async () => {
  const { client, tabellen } = geheugen();
  const uit = await legOndertekeningVast(client, 4, beheer, null);
  assert.equal(uit.ok, true);
  assert.match(uit.melding, /geen mail/i);
  assert.equal(tabellen.contractversies[0]?.ondertekening, 'ontvangen');
  assert.equal(tabellen.contractversies[0]?.ondertekening_nummer, 'KVP-4-1');
  assert.equal(tabellen.documenten[0]?.type, 'getekend_contract');
  assert.equal(tabellen.boekingen[0]?.status, 'optie');

  const rommel = await legOndertekeningVast(client, 4, beheer, { naam: 'brief.txt', bytes: new Uint8Array([1, 2, 3]) });
  assert.equal(rommel.ok, false);
  assert.equal(tabellen.documenten.length, 1);

  const opnieuw = await legOndertekeningVast(client, 4, beheer, null);
  assert.equal(opnieuw.ok, true);
  assert.match(opnieuw.melding, /al als ondertekend/);
  assert.equal(tabellen.documenten.length, 1);
});

test('een complete checklist maakt de boeking definitief zonder tweede audit of mail', async () => {
  const { client, tabellen } = geheugen({
    boekingen: [{
      id: 4,
      nummer: 'KVP-20270212-41',
      status: 'optie',
      start_datum: '2027-02-12',
      eind_datum: '2027-02-14',
      aanvraag_id: 41,
      aanbetaling_bedrag: 1,
      aanbetaling_ontvangen: false,
      optie_einddatum: '2026-11-29',
      interne_titel: 'Kaarslicht',
      huurder_naam_snapshot: 'Nick Hoevenaars',
    }],
    betalingen: [
      { id: 8, boeking_id: 4, soort: 'aanbetaling', bedrag: 1, status: 'open' },
      { id: 9, boeking_id: 4, soort: 'restant', bedrag: 10, status: 'open' },
    ],
    contractversies: [{
      versie: 4,
      boeking_id: 4,
      contractnummer: 'KVP-20270212-284-v4',
      ondertekening: 'ontvangen',
      bestuur: 'akkoord',
      bestuur_verplicht: true,
    }],
    aanvragen: [{ id: 41, status: 'goedgekeurd' }],
  });
  const uit = await legAanbetalingVast(client, 4, beheer);
  assert.equal(uit.ok, true);
  assert.match(uit.melding, /definitief/);
  assert.match(uit.melding, /geen mail/i);
  assert.equal(tabellen.boekingen[0]?.status, 'definitief');
  assert.equal(tabellen.boekingen[0]?.optie_einddatum, null);
  assert.equal(tabellen.betalingen.find((rij) => rij.id === 9)?.status, 'open');
  assert.equal(tabellen.auditlog.filter((rij) => rij.actie === 'automatisch_definitief').length, 1);

  const opnieuw = await legAanbetalingVast(client, 4, beheer);
  assert.equal(opnieuw.ok, true);
  assert.equal(tabellen.auditlog.filter((rij) => rij.actie === 'automatisch_definitief').length, 1);
});

test('overlap of een ontbrekende goedkeuring houdt de optie', async () => {
  const overlap = geheugen({
    boekingen: [
      {
        id: 4,
        status: 'optie',
        start_datum: '2027-02-12',
        eind_datum: '2027-02-14',
        aanvraag_id: 41,
        aanbetaling_bedrag: 1,
        aanbetaling_ontvangen: false,
      },
      { id: 5, status: 'definitief', start_datum: '2027-02-13', eind_datum: '2027-02-13', nummer: 'BKG-5' },
    ],
    contractversies: [{ versie: 1, boeking_id: 4, ondertekening: 'ontvangen', bestuur: 'akkoord', bestuur_verplicht: true }],
    aanvragen: [{ id: 41, status: 'goedgekeurd' }],
  });
  const geblokkeerd = await legAanbetalingVast(overlap.client, 4, beheer);
  assert.equal(geblokkeerd.ok, true);
  assert.equal(overlap.tabellen.boekingen.find((rij) => rij.id === 4)?.status, 'optie');

  const zonder = geheugen({
    boekingen: [{
      id: 4,
      status: 'optie',
      start_datum: '2027-02-12',
      eind_datum: '2027-02-14',
      aanvraag_id: null,
      aanbetaling_bedrag: 550,
      aanbetaling_ontvangen: false,
    }],
  });
  const open = await legAanbetalingVast(zonder.client, 4, beheer);
  assert.equal(open.ok, true);
  assert.equal(zonder.tabellen.boekingen[0]?.status, 'optie');
});

test('een andere actie gaat niet door de ontvangst', async () => {
  const uit = await verwerkOntvangst('df_gereed', {
    client: null,
    actor: beheer,
    boekingId: '4',
    bestand: null,
    schrijven: true,
  });
  assert.equal(uit, null);
});
