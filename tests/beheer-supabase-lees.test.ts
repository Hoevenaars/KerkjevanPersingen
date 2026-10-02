import assert from 'node:assert/strict';
import test from 'node:test';
import { kiesBeheerLezer, laadBeheerSnapshot, resetBeheerBronCache } from '../src/platform/beheer-bron.ts';
import { leesSupabaseBeheer, periodeKlasse, supabaseFoutSnapshot, type SupabaseLeesClient } from '../src/platform/beheer-supabase-lees.ts';
import { leesSanityOproepen, metSanityRegistratie, noteerSanityOproep } from '../src/platform/sanity-registratie.ts';

function clientVan(tabellen: Record<string, Record<string, unknown>[]>): SupabaseLeesClient {
  return {
    from(tabel: string) {
      return {
        select() {
          if (!(tabel in tabellen)) return Promise.resolve({ data: null, error: { message: `onbekende tabel ${tabel}` } });
          return Promise.resolve({ data: tabellen[tabel], error: null });
        },
      };
    },
  };
}

const basis = {
  relaties: [{ id: 1, naam: 'Huurder A', email: 'a@example.test', telefoon: '1', adres: '', op_reservelijst: false }, { id: 2, naam: 'Gast B', email: 'b@example.test', telefoon: '2', adres: '', op_reservelijst: false }],
  relatie_rollen: [{ relatie_id: 1, rol: 'huurder' }],
  boekingen: [
    { id: 10, nummer: 'BKG-1', status: 'geannuleerd', verhuurtype_sleutel: null, interne_titel: '1/2 mei', start_datum: '2024-05-01', eind_datum: '2024-05-02', huurder_relatie_id: 1, gastheer_relatie_id: null, huurder_naam_snapshot: 'Huurder A', huurder_email_snapshot: 'a@example.test', tarief_bedrag: 100, aanbetaling_ontvangen: false, interne_notities: '' },
    { id: 11, nummer: 'BKG-2', status: 'migratie_vastgelegd', verhuurtype_sleutel: 'bruiloft', interne_titel: '3 juli', start_datum: '2026-07-03', eind_datum: '2026-07-03', huurder_relatie_id: 1, gastheer_relatie_id: 2, huurder_naam_snapshot: 'Huurder A', huurder_email_snapshot: '', tarief_bedrag: 50, aanbetaling_ontvangen: false, interne_notities: '' },
  ],
  betalingen: [{ id: 7, boeking_id: 11, soort: 'aanbetaling', bedrag: 25, status: 'ontvangen', vervaldatum: null, ontvangen_op: '2026-01-02T00:00:00Z' }],
  interne_activiteiten: [{ id: 3, titel: 'Winterstop', start_datum: '2026-01-01', eind_datum: '2026-01-07', blokkeert_verhuurkalender: true }],
  gastbegeleider_toewijzingen: [
    { id: 1, boeking_id: 11, relatie_id: 2, datum: '2026-07-03', type: 'dienst' },
    { id: 2, boeking_id: 10, relatie_id: 2, datum: null, type: 'assist' },
  ],
  vrienden: [],
  nieuwsbrieven: [],
  documenten: [],
  communicatie_templates: [],
  publieke_activiteiten: [],
  activiteit_bron: [],
  aanvragen: [],
  communicatie_jobs: [],
  tarieven: [
    { id: 1, verhuurtype_sleutel: 'expositie', prijstype: 'vast', bedrag: 490, geldig_vanaf: '2020-01-01', geldig_tot: '2028-12-31', toelichting: '' },
    { id: 2, verhuurtype_sleutel: 'concert', prijstype: 'op_aanvraag', bedrag: null, geldig_vanaf: '2020-01-01', geldig_tot: '2028-12-31', toelichting: '' },
  ],
  instellingen: [
    { sleutel: 'optietermijn_dagen', waarde: '14' },
    { sleutel: 'expositie_openingstijden', waarde: '{"van":"11:00","tot":"17:00"}' },
    { sleutel: 'ontvangst_adres', waarde: 'aanvraag@example.test' },
    { sleutel: 'contractbeheerder', waarde: '' },
  ],
};

test('periodeklasse scheidt verleden, lopend en komend', () => {
  assert.equal(periodeKlasse('2024-05-01', '2024-05-02', '2026-09-30'), 'verleden');
  assert.equal(periodeKlasse('2026-09-28', '2026-10-02', '2026-09-30'), 'lopend');
  assert.equal(periodeKlasse('2026-10-01', '2026-10-01', '2026-09-30'), 'komend');
});

test('supabase-leesmodel houdt relaties, annulering, datum en blokkade uit elkaar', async () => {
  const snapshot = await leesSupabaseBeheer(clientVan(basis), { vandaag: '2026-09-30', testmodus: true });
  assert.equal(snapshot.bron, 'supabase');
  assert.equal(snapshot.alleenLezen, true);
  assert.equal(snapshot.relaties.length, 2);
  assert.deepEqual(snapshot.relaties[0].rollen, ['huurder']);
  assert.equal(snapshot.boekingen[0].status, 'geannuleerd');
  assert.equal(snapshot.boekingen[0].periode, 'verleden');
  assert.equal(snapshot.boekingen[0].eind, '2024-05-02');
  assert.equal(snapshot.boekingen[1].periode, 'verleden');
  assert.equal(snapshot.intern.length, 1);
  assert.equal(snapshot.intern[0].titel, 'Winterstop');
  assert.equal(snapshot.boekingen.some((boeking) => boeking.interneTitel === 'Winterstop'), false);
  const toe = snapshot.toewijzingen ?? [];
  assert.equal(toe.find((item) => item.id === '1')?.datum, '2026-07-03');
  assert.equal(toe.find((item) => item.id === '2')?.datum, null);
  assert.equal(snapshot.gastheren.length, 1);
  assert.equal(snapshot.gastheren[0].naam, 'Gast B');
  assert.equal(snapshot.instellingen.openingVan, '11:00');
  assert.equal(snapshot.instellingen.contractbeheerder, '');
  assert.equal(snapshot.instellingen.ontvangstAdres, 'aanvraag@example.test');
  assert.equal(snapshot.tarieven?.length, 2);
  assert.equal(snapshot.tarieven?.[1].bedrag, null);
  assert.equal(snapshot.tarieven?.[1].prijstype, 'op_aanvraag');
  assert.equal(snapshot.fout, null);
});

test('een beheerpagina gebruikt de sessie en niet de service-role', () => {
  const sessie = clientVan(basis);
  const admin = clientVan(basis);
  const uitVerzoek = clientVan(basis);
  assert.equal(kiesBeheerLezer({
    meegegeven: sessie,
    clientMeegegeven: true,
    sessieUitVerzoek: uitVerzoek,
    heeftVerzoek: true,
    admin,
  }), sessie);
  assert.equal(kiesBeheerLezer({
    meegegeven: null,
    clientMeegegeven: true,
    sessieUitVerzoek: uitVerzoek,
    heeftVerzoek: true,
    admin,
  }), uitVerzoek);
  assert.equal(kiesBeheerLezer({
    meegegeven: null,
    clientMeegegeven: true,
    sessieUitVerzoek: null,
    heeftVerzoek: false,
    admin,
  }), null);
  assert.equal(kiesBeheerLezer({
    meegegeven: null,
    clientMeegegeven: false,
    sessieUitVerzoek: null,
    heeftVerzoek: false,
    admin,
  }), admin);
});

test('een supabase-fout toont geen voorbeelddata', async () => {
  resetBeheerBronCache();
  const fout = supabaseFoutSnapshot('relaties: permission denied');
  assert.equal(fout.bron, 'supabase');
  assert.equal(fout.relaties.length, 0);
  assert.equal(fout.intern.length, 0);
  assert.equal(fout.instellingen.contractbeheerder, '');
  assert.match(fout.banner, /permission denied/);
  assert.doesNotMatch(fout.banner, /Voorbeelddata/);

  const snapshot = await laadBeheerSnapshot({
    url: new URL('http://localhost/beheer/?bron=supabase'),
    env: {},
    client: clientVan({}),
  });
  assert.equal(snapshot.bron, 'supabase');
  assert.equal(snapshot.relaties.length, 0);
  assert.match(snapshot.banner, /Supabase-fout/);
  assert.equal(snapshot.relaties.some((relatie) => relatie.naam === 'Marieke Jansen'), false);
});

test('normale beheer-url laadt de snapshot één keer per request', async () => {
  resetBeheerBronCache();
  let selects = 0;
  const bron = clientVan(basis);
  const client: SupabaseLeesClient = {
    from(tabel: string) {
      return {
        select(kolommen: string) {
          selects += 1;
          return bron.from(tabel).select(kolommen);
        },
      };
    },
  };
  const cookies = { set() {} };
  const opties = {
    url: new URL('http://localhost/beheer/'),
    env: { CONTENT_BRON: 'supabase' },
    client,
    request: new Request('http://localhost/beheer/'),
    cookies,
  };

  await metSanityRegistratie(async () => {
    const dashboard = await laadBeheerSnapshot(opties);
    const planning = await laadBeheerSnapshot({ ...opties, url: new URL('http://localhost/beheer/planning/') });
    const kalender = await laadBeheerSnapshot({ ...opties, url: new URL('http://localhost/beheer/kalender/') });
    const boeking = await laadBeheerSnapshot({ ...opties, url: new URL('http://localhost/beheer/boekingen/1/') });
    const activiteit = await laadBeheerSnapshot({ ...opties, url: new URL('http://localhost/beheer/agenda/1/') });
    assert.equal(dashboard.bron, 'supabase');
    assert.equal(planning, dashboard);
    assert.equal(kalender, dashboard);
    assert.equal(boeking, dashboard);
    assert.equal(activiteit, dashboard);
    const expliciet = await laadBeheerSnapshot({
      ...opties,
      url: new URL('http://localhost/beheer/?bron=supabase'),
    });
    assert.equal(expliciet, dashboard);
  });
  assert.equal(selects, 16);

  selects = 0;
  resetBeheerBronCache();
  await laadBeheerSnapshot(opties);
  await laadBeheerSnapshot(opties);
  assert.equal(selects, 32);
});

test('voorbeelddata deelt de supabase-snapshot van hetzelfde request niet', async () => {
  resetBeheerBronCache();
  const cookies = { set() {} };
  const client = clientVan(basis);
  await metSanityRegistratie(async () => {
    const live = await laadBeheerSnapshot({
      url: new URL('http://localhost/beheer/'),
      env: {},
      client,
      request: new Request('http://localhost/beheer/'),
      cookies,
    });
    const demo = await laadBeheerSnapshot({
      url: new URL('http://localhost/beheer/?bron=demo'),
      env: {},
      client,
      request: new Request('http://localhost/beheer/?bron=demo'),
      cookies,
    });
    assert.equal(live.bron, 'supabase');
    assert.equal(demo.bron, 'demo');
    assert.notEqual(demo.banner, live.banner);
  });
});

test('testmodus registreert een sanity-call en blijft anders op nul', async () => {
  const leeg = await metSanityRegistratie(async () => leesSanityOproepen());
  assert.equal(leeg.length, 0);
  const gezien = await metSanityRegistratie(async () => {
    noteerSanityOproep('beheer.sanity-dump');
    return leesSanityOproepen();
  });
  assert.deepEqual(gezien.map((oproep) => oproep.plek), ['beheer.sanity-dump']);
});
