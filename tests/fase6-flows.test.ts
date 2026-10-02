import assert from 'node:assert/strict';
import test from 'node:test';
import { valideer, type Aanvraag } from '../src/lib/validatie.ts';
import {
  deactiveerVriend,
  geheugenVrienden,
  getVriendByToken,
  maakVriendAan,
  updateVriendFrequentie,
  type Vriend,
} from '../src/lib/vrienden-supabase.ts';
import { draaiNieuwsbriefDryRun, geheugenNieuwsbrief } from '../src/lib/nieuwsbrief-supabase.ts';
import { activiteitUitSlugRijen, magAlGetoondWorden, stelPubliekeAgenda, vrijeWeekendenVanBezetting, type AgendaRij } from '../src/lib/publiek-lezen.ts';
import { laadBeheerSnapshot, resetBeheerBronCache } from '../src/platform/beheer-bron.ts';
import type { SupabaseLeesClient } from '../src/platform/beheer-supabase-lees.ts';
import { huidigeContentBron } from '../src/platform/bron.ts';

const leeg: Aanvraag = {
  datum: '',
  datumTot: '',
  soort: '',
  personen: '',
  naam: '',
  email: '',
  adres: '',
  telefoon: '',
  toelichting: '',
  website: '',
  eerderGeexposeerd: '',
  medeExposanten: '',
  akkoordVoorwaarden: '',
  negeerWaarschuwing: '',
};

test('aanvraagvalidatie blijft dicht bij ontbrekende contactgegevens', () => {
  const fouten = valideer(leeg);
  assert.equal(typeof fouten.naam, 'string');
  assert.equal(typeof fouten.email, 'string');
  assert.equal(typeof fouten.datum, 'string');
  assert.equal(typeof fouten.soort, 'string');
});

test('vrienden: aanmelden, opnieuw, afmelden, ongeldig token en frequentie', async () => {
  const bron = geheugenVrienden();
  await maakVriendAan({ naam: 'Ada', email: 'Ada@Example.test' }, bron);
  await maakVriendAan({ naam: 'Ada', email: 'ada@example.test' }, bron);
  assert.equal(bron.alle().length, 1);
  assert.equal(bron.alle()[0].actief, true);
  const token = bron.alle()[0].uitschrijfToken;

  await deactiveerVriend(bron.alle()[0]._id, bron);
  assert.equal(bron.alle()[0].actief, false);
  await maakVriendAan({ naam: 'Ada twee', email: 'ada@example.test' }, bron);
  assert.equal(bron.alle().length, 1);
  assert.equal(bron.alle()[0].actief, true);
  assert.equal(bron.alle()[0].frequentie, 'wekelijks');
  assert.notEqual(bron.alle()[0].uitschrijfToken, token);

  assert.equal(await getVriendByToken('bestaat-niet', bron), null);
  const gevonden = await getVriendByToken(bron.alle()[0].uitschrijfToken, bron);
  assert.equal(gevonden?.email, 'ada@example.test');

  await updateVriendFrequentie(bron.alle()[0]._id, 'maandelijks', bron);
  assert.equal(bron.alle()[0].frequentie, 'maandelijks');
});

test('nieuwsbrief dry-run kiest template, logt concept en verstuurt niets', async () => {
  const vriend: Vriend = {
    _id: '1',
    naam: 'Bo',
    email: 'bo@example.test',
    actief: true,
    frequentie: 'wekelijks',
    uitschrijfToken: 'tok-1',
  };
  const vrienden = geheugenVrienden([vriend]);
  const bron = geheugenNieuwsbrief({
    template: { sleutel: 'nieuwsbrief_week', onderwerp: 'Week uit de catalogus', bron: 'supabase' },
  });
  const uit = await draaiNieuwsbriefDryRun({
    datum: new Date('2026-09-30T12:00:00Z'),
    vrienden,
    bron,
  });
  assert.equal(uit.verstuurd, 0);
  assert.equal(uit.gepland, 1);
  assert.equal(uit.template?.onderwerp, 'Week uit de catalogus');
  assert.equal(uit.template?.bron, 'supabase');
  assert.deepEqual(uit.ontvangers, ['bo@example.test']);
  assert.equal(bron.verzendingen.length, 1);
  assert.equal(bron.verzendingen[0].test, true);
  assert.equal(bron.verzendingen[0].status, 'concept');
  assert.equal(bron.weken[0].verstuurd, false);
});

test('nieuwsbrief zonder catalogusregel valt terug op de ingebouwde onderwerpregel', async () => {
  const vrienden = geheugenVrienden([
    { _id: '1', email: 'bo@example.test', actief: true, frequentie: 'wekelijks', uitschrijfToken: 'tok-1' },
  ]);
  const bron = geheugenNieuwsbrief();
  const uit = await draaiNieuwsbriefDryRun({ datum: new Date('2026-09-30T12:00:00Z'), vrienden, bron });
  assert.equal(uit.template?.bron, 'ingebouwd');
  assert.equal(uit.verstuurd, 0);
  assert.equal(bron.verzendingen[0].templateSleutel, 'nieuwsbrief_week');
});

test('publieke agenda toont een bezette activiteit niet en respecteert toonVanaf', () => {
  const rijen: AgendaRij[] = [
    {
      id: 1,
      slug: 'leon',
      titel: 'Leon Swinkels',
      start_datum: '2028-03-11',
      eind_datum: '2028-03-12',
      omschrijving: null,
      foto_pad: null,
      foto_alt: null,
      publicatie_trigger: 'uiterlijk_12_maanden',
      zichtbaarheid: 'publiek',
      inhoud_status: 'niet_gestart',
      soort: 'expositie',
    },
  ];
  const nu = new Date('2026-09-30T12:00:00Z');
  assert.equal(stelPubliekeAgenda(rijen, nu).length, 0);
  const later = new Date('2027-04-01T12:00:00Z');
  const getoond = stelPubliekeAgenda(rijen, later);
  assert.equal(getoond.length, 1);
  assert.equal(getoond[0].zichtbaarheid, 'publiek');
  assert.equal(magAlGetoondWorden(getoond[0], nu), false);
});

test('activiteitdetail vindt een slug voorbij de eerste 100 agenda-rijen', () => {
  const nu = new Date('2026-10-02T12:00:00Z');
  const rijen: AgendaRij[] = Array.from({ length: 120 }, (_, index) => ({
    id: index + 1,
    slug: `activiteit-${index + 1}`,
    titel: `Activiteit ${index + 1}`,
    start_datum: '2027-06-01',
    eind_datum: '2027-06-02',
    omschrijving: null,
    foto_pad: null,
    foto_alt: null,
    publicatie_trigger: null,
    zichtbaarheid: 'publiek',
    inhoud_status: 'niet_gestart',
    soort: 'expositie',
    contentstatus: null,
  }));
  const lijst = stelPubliekeAgenda(rijen, nu, 100);
  assert.equal(lijst.some((item) => item.slug === 'activiteit-120'), false);
  const detail = activiteitUitSlugRijen('activiteit-120', [rijen[119]], nu);
  assert.equal(detail?.publiekeTitel, 'Activiteit 120');
  assert.equal(activiteitUitSlugRijen('activiteit-1', [{ ...rijen[0], zichtbaarheid: 'bezet' }], nu), null);
});

test('vrije weekenden hergebruiken de kalenderbezetting', () => {
  const bezet = [{
    start: '2026-10-10T12:00:00+02:00',
    eind: '2026-10-10T12:00:00+02:00',
    soort: 'expositie',
    zichtbaarheid: 'bezet',
  }];
  const weekenden = vrijeWeekendenVanBezetting(bezet, 1, new Date('2026-10-02T12:00:00Z'));
  assert.equal(weekenden.length, 1);
  assert.equal(weekenden[0].zaterdag, '2026-10-03');
  assert.equal(weekenden[0].zondagVrij, true);
});

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

test('beheer zonder queryparameter leest de meegegeven Supabase-client', async () => {
  resetBeheerBronCache();
  const snapshot = await laadBeheerSnapshot({
    env: { CONTENT_BRON: 'sanity' },
    client: clientVan({
      relaties: [{ id: 9, naam: 'Uit database', email: 'db@example.test', telefoon: '', adres: '', op_reservelijst: false }],
      relatie_rollen: [],
      boekingen: [],
      betalingen: [],
      interne_activiteiten: [],
      gastbegeleider_toewijzingen: [],
      vrienden: [{ id: 1, naam: 'Vriend', email: 'v@example.test', actief: true, frequentie: 'wekelijks' }],
      nieuwsbrieven: [],
      documenten: [],
      communicatie_templates: [{ id: 3, sleutel: 'afwijzing', naam: 'Afwijzing', verhuurtype_sleutel: null, trigger_soort: 'handmatig', termijn_waarde: null, termijn_eenheid: null, verzendwijze: 'handmatig', ontvanger_rol: 'huurder' }],
      instellingen: [{ sleutel: 'ontvangst_adres', waarde: 'contractbeheer.kvp@gmail.com' }],
      publieke_activiteiten: [],
      activiteit_bron: [],
      aanvragen: [{ id: 4, status: 'afgewezen', naam: 'Piet', email: 'piet@example.test', telefoon: '1', adres: 'Straat', verhuurtype_sleutel: 'bruiloft', start_datum: '2027-01-01', eind_datum: '2027-01-02', aantal_personen: '20', toelichting: '', binnengekomen_op: '2026-01-01', website: '', boeking_id: null, afwijsreden: 'datum bezet', relatie_id: 9 }],
      communicatie_jobs: [],
      tarieven: [{ id: 1, verhuurtype_sleutel: 'bruiloft', prijstype: 'vast', bedrag: 550, geldig_vanaf: '2020-01-01', geldig_tot: '2028-12-31', toelichting: '' }],
    }),
  });
  assert.equal(snapshot.bron, 'supabase');
  assert.equal(snapshot.relaties[0].naam, 'Uit database');
  assert.equal(snapshot.aanvragen[0].status, 'afgewezen');
  assert.equal(snapshot.aanvragen[0].afwijsreden, 'datum bezet');
  assert.equal(snapshot.aanvragen[0].relatieId, '9');
  assert.equal(snapshot.instellingen.ontvangstAdres, 'contractbeheer.kvp@gmail.com');
  assert.equal(snapshot.tarieven?.[0].bedrag, 550);
  assert.equal(snapshot.templates[0].id, 'afwijzing');
  assert.equal(snapshot.vrienden[0].email, 'v@example.test');
  assert.equal(huidigeContentBron({ CONTENT_BRON: 'sanity' }), 'sanity');
  resetBeheerBronCache();
});
