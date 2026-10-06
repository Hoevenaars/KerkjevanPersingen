import assert from 'node:assert/strict';
import test from 'node:test';
import { leesHandmatigeBoeking } from '../src/platform/handmatige-boeking.ts';
import { SNEL_NIEUW } from '../src/platform/modules.ts';
import { voerDossierViaSessie, type DossierSessie } from '../src/lib/operatie/dossier-sessie.ts';
import { legeWereld, voerOpdrachtUit, type Actor, type DienstContext, type Wereld } from '../src/lib/operatie/kern.ts';

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

const expositie = {
  soort: 'handmatige_boeking' as const,
  naam: 'Ada Berg',
  email: 'ada@example.test',
  verhuurtype: 'expositie',
  start: '2027-06-12',
  eind: '2027-06-13',
  titel: 'Ada Berg',
  status: 'optie' as const,
};

function ctx(): DienstContext {
  return {
    nu: new Date('2026-10-06T12:00:00Z'),
    env: {},
    actor: beheer,
    basisUrl: 'https://kerkjepersingen.nl',
    internEmail: 'bestuur@example.test',
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
  const uit = leesHandmatigeBoeking({ ...expositie, status: 'definitief', reden: '  ' });
  assert.equal(uit.ok, false);
  if (!uit.ok) assert.match(uit.melding, /reden/);
});

test('handmatige optie schrijft een boeking en geen mail', async () => {
  const mail = { n: 0, async verstuur() { this.n += 1; } };
  const uit = await voerOpdrachtUit(legeWereld(), expositie, ctx(), mail);
  assert.equal(uit.resultaat.ok, true);
  assert.match(uit.resultaat.melding, /geen mail/);
  assert.equal(uit.wereld.boekingen.length, 1);
  assert.equal(uit.wereld.boekingen[0]?.status, 'optie');
  assert.equal(uit.wereld.boekingen[0]?.email, 'ada@example.test');
  assert.equal(uit.wereld.jobs.length, 0);
  assert.equal(mail.n, 0);
  assert.equal(uit.wereld.aanvragen.length, 0);
});

test('overlap met een definitieve boeking blokkeert, een migratieboeking niet', async () => {
  const bezet: Wereld = legeWereld();
  bezet.boekingen.push({
    id: '9',
    nummer: 'KVP-9',
    status: 'definitief',
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
  });
  const geblokkeerd = await voerOpdrachtUit(bezet, expositie, ctx());
  assert.equal(geblokkeerd.resultaat.ok, false);
  assert.match(geblokkeerd.resultaat.melding, /bezet/i);
  assert.equal(geblokkeerd.wereld.boekingen.length, 1);

  const historisch: Wereld = legeWereld();
  historisch.boekingen.push({ ...bezet.boekingen[0]!, status: 'migratie_vastgelegd' });
  const vrij = await voerOpdrachtUit(historisch, expositie, ctx());
  assert.equal(vrij.resultaat.ok, true);
  assert.equal(vrij.wereld.boekingen.filter((boeking) => boeking.status === 'optie').length, 1);
});

test('een lezer kan geen boeking aanmaken', async () => {
  const uit = await voerOpdrachtUit(legeWereld(), expositie, { ...ctx(), actor: lezer });
  assert.equal(uit.resultaat.ok, false);
  assert.match(uit.resultaat.melding, /Geen recht/);
  assert.equal(uit.wereld.boekingen.length, 0);
});

test('de sessie slaat een definitieve boeking op zonder communicatiejob', async () => {
  const staat = { jobs: 0, audits: 0, rij: null as Record<string, unknown> | null };
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
    status: 'definitief',
    reden: 'Telefonisch bevestigd',
  }, beheer);
  assert.equal(uit.ok, true);
  assert.equal(uit.boekingId, '77');
  assert.match(uit.melding, /geen mail/);
  assert.equal(staat.rij?.status, 'definitief');
  assert.equal(staat.rij?.interne_notities, 'Telefonisch bevestigd');
  assert.equal(staat.jobs, 0);
  assert.equal(staat.audits, 1);
});
