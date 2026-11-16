import assert from 'node:assert/strict';
import test from 'node:test';
import { adviesVoorPeriode, leesHandmatigeBoeking } from '../src/platform/handmatige-boeking.ts';
import type { FaseWereld } from '../src/platform/aanvraag-fase.ts';
import { SNEL_NIEUW } from '../src/platform/modules.ts';
import { voerDossierViaSessie, type DossierSessie } from '../src/lib/operatie/dossier-sessie.ts';
import { legeWereld, voerOpdrachtUit, type Actor, type DienstContext, type Opdracht, type Wereld } from '../src/lib/operatie/kern.ts';

const beheer: Actor = {
  type: 'gebruiker',
  naam: 'Nelleke',
  rechten: { isSuperAdmin: true, perModule: {} },
};

const lezer: Actor = {
  type: 'gebruiker',
  naam: 'Lezer',
  rechten: { isSuperAdmin: false, perModule: { boekingen: 'lezen' } },
};

const schrijver: Actor = {
  type: 'gebruiker',
  naam: 'Schrijver',
  rechten: { isSuperAdmin: false, perModule: { boekingen: 'schrijven', aanvragen: 'schrijven' } },
};

const expositie: Opdracht = {
  soort: 'handmatige_boeking',
  soortBoeking: 'verhuur',
  naam: 'Ada Berg',
  email: 'ada@example.test',
  verhuurtype: 'expositie',
  start: '2027-06-12',
  eind: '2027-06-13',
  titel: 'Ada Berg',
  fase: 'in_behandeling',
};

function ctx(extra: Record<string, unknown> = {}): DienstContext {
  return {
    nu: new Date('2026-10-06T12:00:00Z'),
    env: extra,
    actor: beheer,
    basisUrl: 'https://kerkjepersingen.nl',
    internEmail: 'bestuur@example.test',
  };
}

function bezetteBoeking(status: Wereld['boekingen'][number]['status']): Wereld['boekingen'][number] {
  return {
    id: '9',
    nummer: 'KVP-9',
    status,
    verhuurtype: 'expositie',
    titel: 'Bezet',
    start: '2027-06-12',
    eind: '2027-06-13',
    relatieId: null,
    gastheerId: null,
    aanvraagId: null,
    naam: 'Bezet',
    email: 'bezet@example.test',
    telefoon: '',
    adres: '',
    aanbetalingBedrag: 0,
    aanbetalingOntvangen: false,
    optieAangemaaktOp: null,
    optieEind: null,
  };
}

function legeFase(): FaseWereld {
  return {
    aanvragen: [],
    boekingen: [],
    documenten: [],
    mails: [],
    betalingen: [],
    blokkades: [],
    activiteiten: [],
  };
}

test('plusknop Boeking opent het aanmaakformulier', () => {
  assert.equal(SNEL_NIEUW.find((item) => item.label === 'Boeking')?.href, '/beheer/boekingen/nieuw/');
});

test('expositie op een doordeweekse dag wordt geweigerd', () => {
  const uit = leesHandmatigeBoeking({ ...expositie, start: '2027-06-14', eind: '2027-06-14' });
  assert.equal(uit.ok, false);
  if (!uit.ok) assert.match(uit.melding, /zaterdag/);
});

test('bruiloft in het weekend wordt geweigerd', () => {
  const uit = leesHandmatigeBoeking({
    ...expositie,
    verhuurtype: 'bruiloft',
    start: '2027-06-12',
    eind: '2027-06-13',
  });
  assert.equal(uit.ok, false);
  if (!uit.ok) assert.match(uit.melding, /maandag/);
});

test('definitief zonder reden wordt geweigerd', () => {
  const uit = leesHandmatigeBoeking({ ...expositie, definitief: 'ja', uitzondering: '  ' });
  assert.equal(uit.ok, false);
  if (!uit.ok) assert.match(uit.melding, /reden/);
});

test('nieuw wordt niet meteen definitief', () => {
  const uit = leesHandmatigeBoeking({ ...expositie, fase: 'nieuw', definitief: 'ja', uitzondering: 'Te vroeg' });
  assert.equal(uit.ok, false);
  if (!uit.ok) assert.match(uit.melding, /niet meteen definitief/);
});

test('handmatige optie schrijft een aanvraag en geen mail', async () => {
  const mail = { n: 0, async verstuur() { this.n += 1; } };
  const uit = await voerOpdrachtUit(legeWereld(), expositie, ctx(), mail);
  assert.equal(uit.resultaat.ok, true);
  assert.match(uit.resultaat.melding, /geen bevestigingsmail/i);
  assert.equal(uit.wereld.boekingen.length, 1);
  assert.equal(uit.wereld.boekingen[0]?.status, 'optie');
  assert.equal(uit.wereld.boekingen[0]?.email, 'ada@example.test');
  assert.equal(uit.wereld.aanvragen[0]?.status, 'in_behandeling');
  assert.equal(uit.wereld.jobs.length, 0);
  assert.equal(mail.n, 0);
});

test('fase nieuw legt alleen een aanvraag vast', async () => {
  const uit = await voerOpdrachtUit(legeWereld(), { ...expositie, fase: 'nieuw' }, ctx());
  assert.equal(uit.resultaat.ok, true);
  assert.equal(uit.wereld.boekingen.length, 0);
  assert.equal(uit.wereld.aanvragen[0]?.status, 'nieuw');
  assert.match(uit.resultaat.melding, /nieuw/);
});

test('gereed zonder definitief blijft in behandeling en wordt gelogd', async () => {
  const uit = await voerOpdrachtUit(legeWereld(), {
    ...expositie,
    fase: 'gereed',
    uitzondering: 'Checklist volgt later',
  }, ctx());
  assert.equal(uit.resultaat.ok, true);
  assert.equal(uit.wereld.boekingen[0]?.status, 'optie');
  assert.equal(uit.wereld.aanvragen[0]?.status, 'in_behandeling');
  assert.equal(uit.wereld.audits.some((regel) => regel.actie === 'fase_overgeslagen'), true);
  assert.match(uit.resultaat.melding, /in behandeling/);
});

test('overlap met een definitieve of historische boeking vraagt een bewuste afwijking', async () => {
  const bezet: Wereld = legeWereld();
  bezet.boekingen.push(bezetteBoeking('definitief'));
  const geblokkeerd = await voerOpdrachtUit(bezet, expositie, ctx());
  assert.equal(geblokkeerd.resultaat.ok, false);
  assert.match(geblokkeerd.resultaat.melding, /bevestig|advies/i);
  assert.equal(geblokkeerd.wereld.boekingen.length, 1);

  const historisch: Wereld = legeWereld();
  historisch.boekingen.push(bezetteBoeking('migratie_vastgelegd'));
  const ookBezet = await voerOpdrachtUit(historisch, expositie, ctx());
  assert.equal(ookBezet.resultaat.ok, false);

  const afwijking = await voerOpdrachtUit(bezet, {
    ...expositie,
    bevestig_conflict: 'ja',
    conflict_reden: 'Bestuur houdt beide reserveringen naast elkaar.',
  }, ctx());
  assert.equal(afwijking.resultaat.ok, true);
  assert.equal(afwijking.wereld.boekingen.length, 2);
  assert.equal(afwijking.wereld.boekingen[0]?.status, 'definitief');
  assert.equal(afwijking.mutaties.some((mutatie) => mutatie.soort === 'update_boeking'), false);
  const toegevoegd = afwijking.mutaties.find((mutatie) => mutatie.soort === 'insert_boeking');
  assert.equal(toegevoegd?.velden?.overlap_toegestaan, true);
  assert.equal(afwijking.wereld.audits.some((regel) => regel.actie === 'beschikbaarheid_afwijking' && regel.reden.includes('naast elkaar')), true);
});

test('een lezer of schrijver zonder bestuursrecht kan geen boeking aanmaken', async () => {
  const gelezen = await voerOpdrachtUit(legeWereld(), expositie, { ...ctx(), actor: lezer });
  assert.equal(gelezen.resultaat.ok, false);
  assert.match(gelezen.resultaat.melding, /bestuurder/);
  const geschreven = await voerOpdrachtUit(legeWereld(), expositie, { ...ctx(), actor: schrijver });
  assert.equal(geschreven.resultaat.ok, false);
  assert.equal(geschreven.wereld.boekingen.length, 0);
});

test('interne activiteit blokkeert de kalender zonder huurder', async () => {
  const uit = await voerOpdrachtUit(legeWereld(), {
    soort: 'handmatige_boeking',
    soortBoeking: 'intern',
    interne_soort: 'grote_schoonmaak',
    interne_omschrijving: 'Voorjaar',
    datum: '2027-06-12',
    hele_dag: 'ja',
    opmerkingen: 'Sleutel bij de koster',
  }, ctx());
  assert.equal(uit.resultaat.ok, true);
  assert.equal(uit.wereld.boekingen.length, 0);
  assert.equal(uit.wereld.aanvragen.length, 0);
  assert.equal(uit.wereld.interne[0]?.titel, 'Interne activiteit — Grote schoonmaak');
  assert.equal(uit.wereld.interne[0]?.blokkeert, true);
  assert.match(uit.wereld.interne[0]?.notities ?? '', /gehele dag/);
  assert.match(uit.resultaat.melding, /geen bevestigingsmail/i);

  const overlap = await voerOpdrachtUit(uit.wereld, expositie, ctx());
  assert.equal(overlap.resultaat.ok, false);
  assert.match(overlap.resultaat.melding, /bevestig|advies/i);
});

test('bevestigingsmail gaat één keer weg en past bij de status', async () => {
  const mail = { n: 0, async verstuur() { this.n += 1; } };
  const omgeving = { MAIL_STAGING_ALLOWLIST: 'ada@example.test' };
  const eerste = await voerOpdrachtUit(legeWereld(), { ...expositie, mail: 'ja' }, ctx(omgeving), mail);
  assert.equal(eerste.resultaat.ok, true);
  assert.equal(mail.n, 1);
  assert.equal(eerste.wereld.jobs.length, 1);
  assert.equal(eerste.wereld.jobs[0]?.status, 'verzonden');
  assert.equal(eerste.wereld.jobs[0]?.templateSleutel, 'booking_request_received');
  assert.match(eerste.wereld.jobs[0]?.onderwerp ?? '', /aanvraag/i);

  const opnieuw = await voerOpdrachtUit(eerste.wereld, {
    ...expositie,
    mail: 'ja',
    bevestig_conflict: 'ja',
    conflict_reden: 'Technische herhaling, de eerste mail blijft staan.',
  }, ctx(omgeving), mail);
  assert.equal(opnieuw.resultaat.ok, true);
  assert.equal(mail.n, 1);
  assert.match(opnieuw.resultaat.melding, /niet opnieuw/i);

  const definitief = await voerOpdrachtUit(legeWereld(), {
    ...expositie,
    start: '2027-07-10',
    eind: '2027-07-11',
    mail: 'ja',
    definitief: 'ja',
    uitzondering: 'Telefonisch bevestigd',
    contract_verzonden: 'ja',
    contract_ondertekend: 'ja',
    aanbetaling: 'ja',
  }, ctx(omgeving), mail);
  assert.equal(definitief.wereld.jobs[0]?.templateSleutel, 'booking_confirmed');
  assert.match(definitief.wereld.jobs[0]?.onderwerp ?? '', /definitief/i);
  assert.equal(definitief.wereld.boekingen[0]?.status, 'definitief');
});

test('beschikbaarheidsadvies gebruikt de bestaande periodecontrole', () => {
  const vrij = adviesVoorPeriode(legeFase(), '2027-06-12', '2027-06-13');
  assert.equal(vrij.uitkomst, 'beschikbaar');
  assert.equal(vrij.kop, 'Beschikbaar');

  const aanvraag = adviesVoorPeriode({
    ...legeFase(),
    aanvragen: [{ id: 'a1', status: 'in_behandeling', naam: 'Lies', start: '2027-06-12', eind: '2027-06-13' }],
  }, '2027-06-12', '2027-06-13');
  assert.equal(aanvraag.uitkomst, 'aanvraag');
  assert.equal(aanvraag.aanvragen[0]?.naam, 'Lies');

  const bezet = adviesVoorPeriode({
    ...legeFase(),
    boekingen: [{
      id: '9',
      nummer: 'KVP-9',
      status: 'definitief',
      start: '2027-06-12',
      eind: '2027-06-13',
      titel: 'Ada',
      huurder: 'Ada Berg',
      aanbetalingBinnen: false,
    }],
  }, '2027-06-12', '2027-06-13');
  assert.equal(bezet.uitkomst, 'bezet');
  assert.match(bezet.regels[0]?.tekst ?? '', /Definitieve boeking/);

  const winter = adviesVoorPeriode({
    ...legeFase(),
    blokkades: [{ id: 'w', titel: 'Winterstop', start: '2027-01-01', eind: '2027-03-01', blokkeert: true }],
  }, '2027-01-16', '2027-01-17');
  assert.equal(winter.uitkomst, 'geblokkeerd');

  const activiteit = adviesVoorPeriode({
    ...legeFase(),
    activiteiten: [{
      id: 'p',
      titel: 'Kerkdienst',
      start: '2027-06-12',
      eind: '2027-06-12',
      zichtbaarheid: 'bezet',
      levenscyclus: 'actief',
    }],
  }, '2027-06-12', '2027-06-12');
  assert.equal(activiteit.uitkomst, 'geblokkeerd');

  const intern = adviesVoorPeriode({
    ...legeFase(),
    blokkades: [{
      id: 'i',
      titel: 'Interne activiteit — Grote schoonmaak',
      start: '2027-06-12',
      eind: '2027-06-12',
      blokkeert: true,
      notities: 'Tijd: 09:00-11:00',
    }],
  }, '2027-06-12', '2027-06-12', '14:00-16:00');
  assert.equal(intern.uitkomst, 'bezet');
  assert.match(intern.regels[0]?.tekst ?? '', /overlappen niet/);
});

test('de sessie slaat een definitieve boeking op zonder communicatiejob', async () => {
  const staat = {
    jobs: 0,
    audits: 0,
    rij: null as Record<string, unknown> | null,
    agenda: null as Record<string, unknown> | null,
  };
  const client = {
    from(tabel: string) {
      const q = {
        actie: 'select',
        waarden: {} as Record<string, unknown>,
        select() { return q; },
        update() { return q; },
        insert(waarden: Record<string, unknown>) {
          q.actie = 'insert';
          q.waarden = waarden;
          if (tabel === 'communicatie_jobs') staat.jobs += 1;
          if (tabel === 'publieke_activiteiten') staat.agenda = waarden;
          return q;
        },
        eq() { return q; },
        neq() { return q; },
        in() { return q; },
        async maybeSingle() {
          if (tabel === 'boekingen' && q.actie === 'insert') {
            staat.rij = q.waarden;
            return { data: { id: 77 }, error: null };
          }
          if (tabel === 'aanvragen' && q.actie === 'insert') {
            return { data: { id: 12 }, error: null };
          }
          if (tabel === 'auditlog') {
            staat.audits += 1;
            return { data: { id: 1 }, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve: (waarde: { data: Record<string, unknown>[] | null; error: null; count: number | null }) => unknown) {
          if (tabel === 'auditlog' && q.actie === 'insert') staat.audits += 1;
          return Promise.resolve(resolve({ data: [], error: null, count: 0 }));
        },
      };
      return q;
    },
  };
  const uit = await voerDossierViaSessie(client as unknown as DossierSessie, {
    ...expositie,
    fase: 'in_behandeling',
    definitief: 'ja',
    uitzondering: 'Telefonisch bevestigd',
  }, beheer);
  assert.equal(uit.ok, true);
  assert.equal(uit.boekingId, '77');
  assert.equal(uit.aanvraagId, '12');
  assert.match(uit.melding, /geen bevestigingsmail/i);
  assert.equal(staat.rij?.status, 'definitief');
  assert.equal(staat.rij?.interne_notities, 'Telefonisch bevestigd');
  assert.equal(staat.rij?.overlap_toegestaan, false);
  assert.equal(staat.jobs, 0);
  assert.equal(staat.audits, 2);
  assert.equal(staat.agenda?.zichtbaarheid, 'bezet');
  assert.equal(staat.agenda?.gepubliceerd, false);
  assert.equal(staat.agenda?.start_datum, '2027-06-12');
  assert.equal(staat.agenda?.eind_datum, '2027-06-13');
  assert.equal(staat.agenda?.boeking_id, 77);
});
