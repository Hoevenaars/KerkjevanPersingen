import assert from 'node:assert/strict';
import test from 'node:test';
import type { Actor } from '../src/lib/operatie/kern.ts';
import {
  emailGelijkPatroon,
  zetReservelijstViaAanvraag,
  type ReservelijstQuery,
  type ReservelijstSessie,
} from '../src/lib/operatie/aanvraag-reservelijst.ts';

const nelleke: Actor = {
  type: 'gebruiker',
  naam: 'Nelleke',
  rechten: { isSuperAdmin: false, perModule: { relaties: 'schrijven', aanvragen: 'schrijven' } },
};

type Rij = Record<string, unknown>;

function maakDb(input: { aanvragen: Rij[]; relaties: Rij[] }): ReservelijstSessie & {
  tabellen: { aanvragen: Rij[]; relaties: Rij[]; auditlog: Rij[] };
  updates: { tabel: string; waarden: Rij }[];
} {
  const tabellen = {
    aanvragen: input.aanvragen.map((rij) => ({ ...rij })),
    relaties: input.relaties.map((rij) => ({ ...rij })),
    auditlog: [] as Rij[],
  };
  const updates: { tabel: string; waarden: Rij }[] = [];
  let volgende = 100;

  function past(rij: Rij, filters: { kolom: string; soort: 'eq' | 'ilike'; waarde: unknown }[]): boolean {
    return filters.every((filter) => {
      const ruw = rij[filter.kolom];
      if (filter.soort === 'eq') return ruw === filter.waarde;
      const patroon = String(filter.waarde).replace(/\\([\\%_])/g, '$1').toLowerCase();
      return String(ruw ?? '').toLowerCase() === patroon;
    });
  }

  function bouw(tabel: 'aanvragen' | 'relaties' | 'auditlog', actie: 'select' | 'update' | 'insert', waarden?: Rij): ReservelijstQuery {
    const filters: { kolom: string; soort: 'eq' | 'ilike'; waarde: unknown }[] = [];
    let klaar = false;
    let resultaat: Rij[] = [];
    const uitvoer = () => {
      if (klaar) return resultaat;
      klaar = true;
      if (actie === 'insert' && waarden) {
        const rij = { id: volgende++, ...waarden };
        tabellen[tabel].push(rij);
        resultaat = [rij];
        return resultaat;
      }
      const gevonden = tabellen[tabel].filter((rij) => past(rij, filters));
      if (actie === 'update' && waarden) {
        updates.push({ tabel, waarden });
        for (const rij of gevonden) Object.assign(rij, waarden);
      }
      resultaat = gevonden;
      return resultaat;
    };
    const query: ReservelijstQuery = {
      select() {
        return query;
      },
      eq(kolom, waarde) {
        filters.push({ kolom, soort: 'eq', waarde });
        return query;
      },
      ilike(kolom, waarde) {
        filters.push({ kolom, soort: 'ilike', waarde });
        return query;
      },
      maybeSingle() {
        const rijen = uitvoer();
        return Promise.resolve({ data: rijen[0] ?? null, error: null });
      },
      then(resolve, reject) {
        return Promise.resolve({ data: uitvoer(), error: null }).then(resolve, reject);
      },
    };
    return query;
  }

  return {
    tabellen,
    updates,
    from(tabel: string) {
      const naam = tabel === 'relaties' || tabel === 'auditlog' || tabel === 'aanvragen' ? tabel : 'aanvragen';
      const query = bouw(naam, 'select');
      return {
        select: (kolommen: string) => query.select(kolommen),
        update: (waarden: Rij) => bouw(naam, 'update', waarden),
        insert: (rij: Rij) => bouw(naam, 'insert', rij),
      };
    },
  };
}

test('een nieuwe aanvraag zonder relatie komt op de reservelijst zonder definitief te worden', async () => {
  const db = maakDb({
    aanvragen: [{ id: 7, status: 'nieuw', naam: 'Familie Hendriks', email: 'Hendriks@voorbeeld.nl', telefoon: '024 123', adres: 'Waalkade 8', relatie_id: null }],
    relaties: [],
  });
  const uit = await zetReservelijstViaAanvraag(db, 7, true, nelleke);
  assert.equal(uit.ok, true);
  assert.match(uit.melding, /niet definitief/);
  assert.match(uit.melding, /geen mail/);
  assert.equal(db.tabellen.aanvragen[0].status, 'nieuw');
  assert.equal(db.tabellen.aanvragen[0].relatie_id, 100);
  assert.equal(db.tabellen.relaties[0].op_reservelijst, true);
  assert.equal(db.tabellen.relaties[0].email, 'hendriks@voorbeeld.nl');
  assert.equal(db.updates.some((item) => item.tabel === 'aanvragen' && 'status' in item.waarden), false);
  assert.equal(db.tabellen.auditlog[0].actie, 'reservelijst_aan');
});

test('een bestaande relatie wordt aangevinkt terwijl de aanvraag in behandeling blijft', async () => {
  const db = maakDb({
    aanvragen: [{ id: 8, status: 'in_behandeling', naam: 'Kim', email: 'kim@voorbeeld.nl', telefoon: '', adres: '', relatie_id: null }],
    relaties: [{ id: 3, email: 'Kim@voorbeeld.nl', op_reservelijst: false }],
  });
  const uit = await zetReservelijstViaAanvraag(db, 8, true, nelleke);
  assert.equal(uit.ok, true);
  assert.equal(db.tabellen.relaties[0].op_reservelijst, true);
  assert.equal(db.tabellen.aanvragen[0].status, 'in_behandeling');
  assert.equal(db.tabellen.aanvragen[0].relatie_id, 3);
  assert.equal(db.tabellen.relaties.length, 1);
});

test('wie er al op staat en gekoppeld is, wordt niet opnieuw geschreven', async () => {
  const db = maakDb({
    aanvragen: [{ id: 9, status: 'nieuw', naam: 'Marieke', email: 'marieke@voorbeeld.nl', relatie_id: 4 }],
    relaties: [{ id: 4, email: 'marieke@voorbeeld.nl', op_reservelijst: true }],
  });
  const uit = await zetReservelijstViaAanvraag(db, 9, true, nelleke);
  assert.equal(uit.ok, true);
  assert.match(uit.melding, /Staat al/);
  assert.equal(db.updates.length, 0);
  assert.equal(db.tabellen.aanvragen[0].status, 'nieuw');
});

test('meerdere relaties met hetzelfde adres blijven ongemoeid', async () => {
  const db = maakDb({
    aanvragen: [{ id: 10, status: 'nieuw', naam: 'Sam', email: 'sam@voorbeeld.nl', relatie_id: null }],
    relaties: [
      { id: 1, email: 'sam@voorbeeld.nl', op_reservelijst: false },
      { id: 2, email: 'Sam@voorbeeld.nl', op_reservelijst: false },
    ],
  });
  const uit = await zetReservelijstViaAanvraag(db, 10, true, nelleke);
  assert.equal(uit.ok, false);
  assert.match(uit.melding, /Meerdere relaties/);
  assert.equal(db.tabellen.relaties.every((rij) => rij.op_reservelijst === false), true);
  assert.equal(db.tabellen.aanvragen[0].relatie_id, null);
  assert.equal(db.updates.length, 0);
});

test('van de lijst halen wijzigt de aanvraagstatus niet', async () => {
  const db = maakDb({
    aanvragen: [{ id: 11, status: 'goedgekeurd', naam: 'Kim', email: 'kim@voorbeeld.nl', relatie_id: 3 }],
    relaties: [{ id: 3, email: 'kim@voorbeeld.nl', op_reservelijst: true }],
  });
  const uit = await zetReservelijstViaAanvraag(db, 11, false, nelleke);
  assert.equal(uit.ok, true);
  assert.match(uit.melding, /geen mail/);
  assert.equal(db.tabellen.relaties[0].op_reservelijst, false);
  assert.equal(db.tabellen.aanvragen[0].status, 'goedgekeurd');
  assert.equal(db.tabellen.aanvragen[0].relatie_id, 3);
});

test('zonder schrijfrecht blijft alles staan', async () => {
  const db = maakDb({
    aanvragen: [{ id: 12, status: 'nieuw', naam: 'Kim', email: 'kim@voorbeeld.nl', relatie_id: null }],
    relaties: [],
  });
  const uit = await zetReservelijstViaAanvraag(db, 12, true, {
    type: 'gebruiker',
    naam: 'Hans',
    rechten: { isSuperAdmin: false, perModule: { aanvragen: 'lezen', relaties: 'lezen' } },
  });
  assert.equal(uit.ok, false);
  assert.equal(db.tabellen.relaties.length, 0);
  assert.equal(db.updates.length, 0);
});

test('een underscore in het e-mailadres blijft een underscore', () => {
  assert.equal(emailGelijkPatroon('a_b%c@voorbeeld.nl'), 'a\\_b\\%c@voorbeeld.nl');
});
