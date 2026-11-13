import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beoordeelAanvraag,
  leesAanvraagFilter,
  magGoedkeuren,
  pastInFilter,
  type FaseAanvraag,
  type FaseWereld,
} from '../src/platform/aanvraag-fase.ts';
import { leesbareAuthFout, voerDossierViaSessie, type DossierSessie } from '../src/lib/operatie/dossier-sessie.ts';
import type { Actor } from '../src/lib/operatie/kern.ts';

const leeg: FaseWereld = {
  aanvragen: [],
  boekingen: [],
  documenten: [],
  mails: [],
  betalingen: [],
  blokkades: [],
  activiteiten: [],
};

function aanvraag(extra: Partial<FaseAanvraag> = {}): FaseAanvraag {
  return {
    id: 'a-1',
    status: 'nieuw',
    naam: 'Expositie Jansen',
    start: '2026-07-10',
    eind: '2026-07-12',
    ...extra,
  };
}

function wereld(extra: Partial<FaseWereld> = {}): FaseWereld {
  return { ...leeg, aanvragen: [aanvraag()], ...extra };
}

test('een nieuwe aanvraag staat in fase Nieuw', () => {
  const beeld = beoordeelAanvraag(aanvraag(), wereld());
  assert.equal(beeld.fase, 'nieuw');
  assert.equal(beeld.volgendeActie, 'Geschiktheid beoordelen');
  assert.equal(beeld.beschikbaarheid.uitkomst, 'beschikbaar');
  assert.equal(beeld.geschikt, false);
});

test('geschikt zonder boeking blijft Nieuw tot de goedkeuring', () => {
  const beeld = beoordeelAanvraag(aanvraag({ status: 'in_behandeling' }), wereld());
  assert.equal(beeld.fase, 'nieuw');
  assert.equal(beeld.geschikt, true);
  assert.equal(beeld.volgendeActie, 'Goedkeuren en in behandeling nemen');
  assert.equal(magGoedkeuren(beeld, 'in_behandeling').ok, true);
  assert.equal(magGoedkeuren(beeld, 'nieuw').ok, false);
});

test('meerdaagse overlap met een definitieve boeking is bezet', () => {
  const beeld = beoordeelAanvraag(aanvraag({ status: 'in_behandeling' }), wereld({
    boekingen: [{
      id: 'b-1',
      nummer: '2026-1',
      status: 'definitief',
      start: '2026-07-11',
      eind: '2026-07-11',
      titel: 'Concert Bakker',
      huurder: 'Bakker',
      aanbetalingBinnen: true,
    }],
  }));
  assert.equal(beeld.beschikbaarheid.uitkomst, 'bezet');
  assert.match(beeld.beschikbaarheid.blokkades[0]?.tekst ?? '', /Definitieve boeking/);
  assert.equal(beeld.volgendeActie, 'Conflict oplossen');
  assert.equal(magGoedkeuren(beeld, 'in_behandeling').ok, false);
});

test('een lopende optie is geen definitieve boeking en blokkeert wel', () => {
  const beeld = beoordeelAanvraag(aanvraag({ status: 'in_behandeling' }), wereld({
    boekingen: [{
      id: 'b-2',
      nummer: '2026-2',
      status: 'optie',
      start: '2026-07-10',
      eind: '2026-07-10',
      titel: 'Optie Piet',
      huurder: 'Piet',
      aanbetalingBinnen: false,
    }],
  }));
  assert.equal(beeld.beschikbaarheid.uitkomst, 'bezet');
  assert.match(beeld.beschikbaarheid.blokkades[0]?.tekst ?? '', /nog geen definitieve boeking/);
});

test('een andere lopende aanvraag blokkeert, een afgewezen of geannuleerde niet', () => {
  const basis = aanvraag({ status: 'in_behandeling' });
  const andere: FaseAanvraag = {
    id: 'a-2',
    status: 'nieuw',
    naam: 'Concert De Vries',
    start: '2026-07-12',
    eind: '2026-07-13',
  };
  const open = beoordeelAanvraag(basis, wereld({ aanvragen: [basis, andere] }));
  assert.equal(open.beschikbaarheid.uitkomst, 'aanvraag');
  assert.equal(open.beschikbaarheid.aanvragen[0]?.naam, 'Concert De Vries');
  assert.equal(open.beschikbaarheid.aanvragen[0]?.href, '/beheer/aanvragen/a-2/');

  const afgewezen = beoordeelAanvraag(basis, wereld({
    aanvragen: [basis, { ...andere, status: 'afgewezen' }, { ...andere, id: 'a-3', status: 'gesloten', naam: 'Gesloten' }],
  }));
  assert.equal(afgewezen.beschikbaarheid.uitkomst, 'beschikbaar');

  const geannuleerd = beoordeelAanvraag(basis, wereld({
    aanvragen: [basis, { ...andere, status: 'goedgekeurd', boekingId: 'b-9' }],
    boekingen: [{
      id: 'b-9',
      nummer: '2026-9',
      status: 'geannuleerd',
      start: '2026-07-12',
      eind: '2026-07-13',
      titel: 'Weg',
      huurder: 'Weg',
      aanbetalingBinnen: false,
      aanvraagId: 'a-2',
    }],
  }));
  assert.equal(geannuleerd.beschikbaarheid.uitkomst, 'beschikbaar');
});

test('winterstop en een andere blokkade blijven gelden', () => {
  const winter = beoordeelAanvraag(aanvraag({ status: 'in_behandeling', start: '2026-12-24', eind: '2026-12-26' }), wereld({
    blokkades: [{ id: 'w', titel: 'Winterstop', start: '2026-12-01', eind: '2027-03-01', blokkeert: true }],
  }));
  assert.equal(winter.beschikbaarheid.uitkomst, 'bezet');
  assert.match(winter.beschikbaarheid.blokkades[0]?.tekst ?? '', /Winterstop/);

  const open = beoordeelAanvraag(aanvraag({ status: 'in_behandeling' }), wereld({
    blokkades: [{ id: 'b', titel: 'Bestuur', start: '2026-07-10', eind: '2026-07-10', blokkeert: false }],
  }));
  assert.equal(open.beschikbaarheid.uitkomst, 'beschikbaar');
});

test('contract, handtekening en aanbetaling bepalen de volgende actie', () => {
  const boeking = {
    id: 'b-4',
    nummer: '2026-4',
    status: 'optie',
    start: '2026-07-10',
    eind: '2026-07-11',
    titel: 'Concert',
    huurder: 'De Vries',
    aanbetalingBinnen: false,
    aanvraagId: 'a-1',
  };
  const item = aanvraag({ status: 'goedgekeurd', boekingId: 'b-4' });
  const verzenden = beoordeelAanvraag(item, wereld({ aanvragen: [item], boekingen: [boeking] }));
  assert.equal(verzenden.fase, 'in_behandeling');
  assert.equal(verzenden.volgendeActie, 'Contract verzenden');

  const wachten = beoordeelAanvraag(item, wereld({
    aanvragen: [item],
    boekingen: [boeking],
    documenten: [{ boekingId: 'b-4', soort: 'contract', naam: 'contract.pdf' }],
  }));
  assert.equal(wachten.checklist.verzonden, true);
  assert.equal(wachten.checklist.ondertekend, false);
  assert.equal(wachten.volgendeActie, 'Wachten op ondertekening');

  const betalen = beoordeelAanvraag(item, wereld({
    aanvragen: [item],
    boekingen: [boeking],
    documenten: [{ boekingId: 'b-4', soort: 'getekend_contract', naam: 'getekend.pdf' }],
  }));
  assert.equal(betalen.checklist.verzonden, true);
  assert.equal(betalen.checklist.ondertekend, true);
  assert.equal(betalen.volgendeActie, 'Aanbetaling controleren');

  const vlag = beoordeelAanvraag(item, wereld({
    aanvragen: [item],
    boekingen: [{ ...boeking, aanbetalingBinnen: true }],
    documenten: [{ boekingId: 'b-4', soort: 'getekend_contract', naam: 'getekend.pdf' }],
  }));
  assert.equal(vlag.checklist.aanbetaling, true);
  assert.equal(vlag.fase, 'gereed');
  assert.equal(vlag.volgendeActie, 'Geen actie');

  const regel = beoordeelAanvraag(item, wereld({
    aanvragen: [item],
    boekingen: [boeking],
    documenten: [{ boekingId: 'b-4', soort: 'getekend_contract', naam: 'getekend.pdf' }],
    betalingen: [
      { boekingId: 'b-4', soort: 'aanbetaling', status: 'ontvangen' },
      { boekingId: 'b-4', soort: 'restant', status: 'open' },
    ],
  }));
  assert.equal(regel.checklist.aanbetaling, true);
  assert.equal(regel.fase, 'gereed');
  assert.equal(regel.checklist.aanbetalingTekst, 'Ontvangen');
});

test('een bestaande definitieve boeking blijft Gereed zonder contract', () => {
  const item = aanvraag({ status: 'goedgekeurd', boekingId: 'b-5' });
  const beeld = beoordeelAanvraag(item, wereld({
    aanvragen: [item],
    boekingen: [{
      id: 'b-5',
      nummer: '2026-5',
      status: 'definitief',
      start: '2026-07-10',
      eind: '2026-07-11',
      titel: 'Oud',
      huurder: 'Willems',
      aanbetalingBinnen: false,
      aanvraagId: 'a-1',
    }],
  }));
  assert.equal(beeld.fase, 'gereed');
  assert.equal(beeld.checklist.compleet, false);
  assert.equal(beeld.volgendeActie, 'Geen actie');
});

test('wacht op aanvrager hoort bij In behandeling', () => {
  const beeld = beoordeelAanvraag(aanvraag({ status: 'wacht_op_aanvrager' }), wereld());
  assert.equal(beeld.fase, 'in_behandeling');
  assert.equal(beeld.volgendeActie, 'Wachten op de aanvrager');
});

test('elke bestaande status blijft in precies één filter', () => {
  const statussen = ['nieuw', 'in_behandeling', 'wacht_op_aanvrager', 'goedgekeurd', 'afgewezen', 'gesloten'] as const;
  const filters = [
    leesAanvraagFilter({ get: (naam) => (naam === 'fase' ? 'nieuw' : null) }),
    leesAanvraagFilter({ get: (naam) => (naam === 'fase' ? 'in_behandeling' : null) }),
    leesAanvraagFilter({ get: (naam) => (naam === 'fase' ? 'gereed' : null) }),
    leesAanvraagFilter({ get: (naam) => (naam === 'fase' ? 'afgesloten' : null) }),
  ];
  for (const status of statussen) {
    const item = aanvraag({
      status,
      boekingId: status === 'goedgekeurd' ? 'b-1' : undefined,
    });
    const beeld = beoordeelAanvraag(item, wereld({
      aanvragen: [item],
      boekingen: status === 'goedgekeurd' ? [{
        id: 'b-1',
        nummer: '1',
        status: 'optie',
        start: '2026-07-10',
        eind: '2026-07-11',
        titel: 'Optie',
        huurder: 'Jansen',
        aanbetalingBinnen: false,
      }] : [],
    }));
    const treffers = filters.filter((filter) => pastInFilter(beeld.fase, filter, status));
    assert.equal(treffers.length, 1, status);
  }
});

test('oude statuslinks blijven werken en een onbekende filter valt terug', () => {
  const oud = leesAanvraagFilter({ get: (naam) => (naam === 'status' ? 'wacht_op_aanvrager' : null) });
  assert.equal(oud.modus, 'technisch');
  assert.equal(pastInFilter('in_behandeling', oud, 'wacht_op_aanvrager'), true);
  assert.equal(pastInFilter('in_behandeling', oud, 'goedgekeurd'), false);
  const gereed = leesAanvraagFilter({ get: (naam) => (naam === 'status' ? 'gereed' : null) });
  assert.equal(gereed.fase, 'gereed');
  const onbekend = leesAanvraagFilter({ get: (naam) => (naam === 'status' ? 'pipeline' : null) });
  assert.equal(onbekend.modus, 'onbekend');
  assert.equal(onbekend.fase, 'alle');
});

test('twee opties op dezelfde periode worden door de database tegengehouden', () => {
  const tekst = leesbareAuthFout('conflicting key value violates exclusion constraint "boekingen_een_actieve_optie"');
  assert.match(tekst, /overlapt/);
  assert.match(tekst, /niets opgeslagen/);
});

const beheer: Actor = {
  id: '11111111-1111-1111-1111-111111111111',
  naam: 'Beheer',
  type: 'gebruiker',
  rechten: { isSuperAdmin: true, perModule: {} },
};

test('goedkeuren vanuit Nieuw wordt op de server geweigerd', async () => {
  const uit = await voerDossierViaSessie(fakeClient({ status: 'nieuw' }), {
    soort: 'beoordeel',
    aanvraagId: '12',
    besluit: 'goedkeuren',
  }, beheer);
  assert.equal(uit.ok, false);
  assert.match(uit.melding, /past/);
});

test('goedkeuren leest de agenda opnieuw en weigert een bezette periode', async () => {
  const uit = await voerDossierViaSessie(fakeClient({
    status: 'in_behandeling',
    boekingen: [{
      id: 8,
      nummer: 'KVP-8',
      status: 'definitief',
      start_datum: '2027-03-02',
      eind_datum: '2027-03-02',
      interne_titel: 'Concert',
      huurder_naam_snapshot: 'Bakker',
      aanvraag_id: null,
      aanbetaling_ontvangen: true,
    }],
  }), {
    soort: 'beoordeel',
    aanvraagId: '12',
    besluit: 'goedkeuren',
  }, beheer);
  assert.equal(uit.ok, false);
  assert.match(uit.melding, /Bakker/);
});

test('afwijzen zonder reden wijzigt niets', async () => {
  const uit = await voerDossierViaSessie(fakeClient({ status: 'nieuw' }), {
    soort: 'beoordeel',
    aanvraagId: '12',
    besluit: 'afwijzen',
    reden: '   ',
  }, beheer);
  assert.equal(uit.ok, false);
  assert.match(uit.melding, /afwijsreden/);
});

function fakeClient(extra: {
  status: string;
  boekingen?: Record<string, unknown>[];
}): DossierSessie {
  return {
    from(tabel: string) {
      const q = {
        actie: 'select',
        select() { return q; },
        update() { q.actie = 'update'; return q; },
        insert() { q.actie = 'insert'; return q; },
        eq() { return q; },
        neq() { return q; },
        in() { return q; },
        async maybeSingle() {
          if (tabel === 'aanvragen' && q.actie === 'select') {
            return {
              data: {
                id: 12,
                status: extra.status,
                naam: 'Kim',
                email: 'kim@example.test',
                telefoon: null,
                adres: null,
                verhuurtype_sleutel: 'expositie',
                start_datum: '2027-03-02',
                eind_datum: '2027-03-02',
                boeking_id: null,
                relatie_id: null,
                toelichting: null,
                aantal_personen: null,
                website: null,
                mede_exposanten: null,
              },
              error: null,
            };
          }
          return { data: { id: 12 }, error: null };
        },
        then(resolve: (waarde: { data: Record<string, unknown>[]; error: null }) => unknown) {
          const data = tabel === 'boekingen' && q.actie === 'select' ? extra.boekingen ?? [] : [];
          return Promise.resolve(resolve({ data, error: null }));
        },
      };
      return q;
    },
  } as unknown as DossierSessie;
}
