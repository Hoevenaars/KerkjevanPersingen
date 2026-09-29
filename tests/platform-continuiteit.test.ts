import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { actueleVerzendingen, type CommunicatieContext } from '../src/platform/continuiteit.ts';
import { voegDagenToe } from '../src/platform/datum.ts';
import { huidigeContentBron } from '../src/platform/bron.ts';
import { bewaakUitgaandeMail } from '../src/platform/mailguard.ts';
import { hashToegangstoken, nieuwToegangstoken } from '../src/platform/magictoken.ts';
import {
  legeWereld,
  voerOpdrachtUit,
  readinessVanBoeking,
  type DienstContext,
  type MailTransport,
  type Wereld,
} from '../src/lib/operatie/kern.ts';

const START = '2027-06-12';
const EIND = '2027-06-13';

function ctx(nu: Date, env: Record<string, unknown> = {}, rechten = { isSuperAdmin: true, perModule: {} }): DienstContext {
  return {
    nu,
    env: { VERCEL_ENV: 'preview', MAIL_STAGING_ALLOWLIST: 'klant@example.nl,bestuur@example.nl', ...env },
    actor: { type: 'gebruiker', naam: 'Nick', id: '11111111-1111-1111-1111-111111111111', rechten },
    basisUrl: 'https://preview.kerkje.test',
    internEmail: 'bestuur@example.nl',
  };
}

function transport(gedrag: 'ok' | 'fout' = 'ok'): MailTransport & { n: number; onderwerpen: string[] } {
  return {
    n: 0,
    onderwerpen: [],
    async verstuur(input) {
      this.n += 1;
      this.onderwerpen.push(input.onderwerp);
      if (gedrag === 'fout') throw new Error('smtp down');
    },
  };
}

async function expositieDefinitief(nu: Date, opties: { gastheer?: boolean; inhoud?: 'niet_gestart' | 'goedgekeurd' | 'gevraagd'; verzoekVerzonden?: boolean } = {}): Promise<Wereld> {
  let wereld = legeWereld();
  const mail = transport();
  ({ wereld } = await voerOpdrachtUit(wereld, {
    soort: 'dien_aanvraag',
    naam: 'Marieke Jansen',
    email: 'klant@example.nl',
    verhuurtype: 'expositie',
    start: START,
    eind: EIND,
    toelichting: 'Schilderijen',
  }, ctx(nu), mail));
  const aanvraagId = wereld.aanvragen[0].id;
  ({ wereld } = await voerOpdrachtUit(wereld, { soort: 'beoordeel', aanvraagId, besluit: 'goedkeuren' }, ctx(nu), mail));
  const boekingId = wereld.boekingen[0].id;
  ({ wereld } = await voerOpdrachtUit(wereld, { soort: 'betaling', boekingId }, ctx(nu), mail));
  if (opties.gastheer) {
    wereld.relaties.push({ id: 'gast-1', naam: 'Henk Vos', email: 'bestuur@example.nl', telefoon: '', adres: '', rollen: ['gastheer'] });
    ({ wereld } = await voerOpdrachtUit(wereld, { soort: 'gastheer', boekingId, gastheerId: 'gast-1' }, ctx(nu), mail));
  }
  const publiek = wereld.publiek.find((item) => item.boekingId === boekingId);
  if (publiek && opties.inhoud) {
    publiek.inhoudStatus = opties.inhoud;
    if (opties.inhoud === 'goedgekeurd') {
      publiek.titel = 'Ooijpolder';
      publiek.omschrijving = 'Tekst';
      publiek.foto = true;
      publiek.gepubliceerd = true;
    }
  }
  if (opties.verzoekVerzonden) {
    wereld.jobs.push({
      id: 'job-content',
      boekingId,
      aanvraagId,
      relatieId: wereld.boekingen[0].relatieId,
      templateSleutel: 'booking_content_request',
      status: 'verzonden',
      modus: 'automatisch',
      geplandOp: nu.toISOString(),
      dedup: `job:${boekingId}:booking_content_request`,
      ontvangerEmail: 'klant@example.nl',
      onderwerp: 'content',
      pogingen: 1,
      foutmelding: null,
    });
  }
  return wereld;
}

test('normale expositie wordt definitief en vraagt content eenmalig uit', async () => {
  const nu = new Date(`${voegDagenToe(START, -84)}T10:00:00Z`);
  let wereld = await expositieDefinitief(nu);
  const boekingId = wereld.boekingen[0].id;
  assert.equal(wereld.boekingen[0].status, 'definitief');
  assert.equal(wereld.betalingen.length, 1);
  const mail = transport();
  ({ wereld } = await voerOpdrachtUit(wereld, { soort: 'scheduler' }, ctx(nu), mail));
  ({ wereld } = await voerOpdrachtUit(wereld, { soort: 'scheduler' }, ctx(nu), mail));
  const content = wereld.jobs.filter((job) => job.templateSleutel === 'booking_content_request' && job.status === 'verzonden');
  assert.equal(content.length, 1);
  assert.equal(mail.n, 0);
  const link = wereld.tokens.find((token) => token.doel === 'content');
  assert.ok(link);
  assert.equal(link.tokenHash.length, 64);
  assert.equal(readinessVanBoeking(wereld, boekingId, voegDagenToe(START, -84)).uitkomst, 'actie_vereist');
});

test('meer informatie en afwijzing', async () => {
  const nu = new Date('2027-01-01T10:00:00Z');
  let wereld = legeWereld();
  ({ wereld } = await voerOpdrachtUit(wereld, {
    soort: 'dien_aanvraag', naam: 'Kim', email: 'klant@example.nl', verhuurtype: 'bruiloft', start: '2027-05-04', eind: '2027-05-04',
  }, ctx(nu), transport()));
  const id = wereld.aanvragen[0].id;
  ({ wereld } = await voerOpdrachtUit(wereld, { soort: 'beoordeel', aanvraagId: id, besluit: 'meer_informatie', vraag: 'Hoeveel gasten?' }, ctx(nu)));
  assert.equal(wereld.aanvragen[0].status, 'wacht_op_aanvrager');
  const plain = 'test-token-plain-value-dat-lang-genoeg-is';
  wereld.tokens[0].tokenHash = hashToegangstoken(plain);
  ({ wereld } = await voerOpdrachtUit(wereld, { soort: 'aanvulling', token: plain, toelichting: 'Veertig gasten' }, ctx(nu)));
  assert.equal(wereld.aanvragen[0].status, 'in_behandeling');
  ({ wereld } = await voerOpdrachtUit(wereld, { soort: 'beoordeel', aanvraagId: id, besluit: 'afwijzen', reden: 'Past niet' }, ctx(nu)));
  assert.equal(wereld.aanvragen[0].status, 'afgewezen');
  assert.equal(wereld.jobs.some((job) => job.templateSleutel === 'booking_request_rejected' && job.status === 'concept'), true);
});

test('betaling twee keer start de voorbereiding niet opnieuw', async () => {
  const nu = new Date('2027-01-01T10:00:00Z');
  let wereld = await expositieDefinitief(nu);
  const boekingId = wereld.boekingen[0].id;
  const audits = wereld.audits.filter((item) => item.dedup === `betaling:${boekingId}:aanbetaling`).length;
  const taken = wereld.taken.length;
  const tweede = await voerOpdrachtUit(wereld, { soort: 'betaling', boekingId }, ctx(nu), transport());
  assert.equal(tweede.resultaat.alVerwerkt, true);
  assert.equal(tweede.wereld.betalingen.length, 1);
  assert.equal(tweede.wereld.audits.filter((item) => item.dedup === `betaling:${boekingId}:aanbetaling`).length, audits);
  assert.equal(tweede.wereld.taken.length, taken);
});

test('content op tijd geeft geen reminder; incompleet wel, zonder escalatie tegelijk', () => {
  const vandaag = voegDagenToe(START, -70);
  const basis: CommunicatieContext = {
    status: 'definitief',
    start: START,
    verhuurtype: 'expositie',
    publicatieTrigger: 'zodra_content_compleet',
    inhoudStatus: 'goedgekeurd',
    aanbetalingOntvangen: true,
    aanbetalingVerplicht: true,
    optieAangemaaktOp: '2027-01-01',
    betaaldeadline: '2027-01-15',
    gastheerAanwezig: true,
    verzonden: new Set(['booking_content_request']),
    vandaag,
  };
  assert.equal(actueleVerzendingen(basis).some((item) => item.templateId === 'booking_content_reminder'), false);
  const laat = actueleVerzendingen({ ...basis, inhoudStatus: 'gevraagd', gastheerAanwezig: false });
  assert.deepEqual(laat.map((item) => item.templateId), ['booking_content_reminder']);
});

test('late boeking T-6 stuurt alleen de actuele contentuitvraag', async () => {
  const start = voegDagenToe('2027-03-01', 42);
  const nu = new Date('2027-03-01T10:00:00Z');
  let wereld = legeWereld();
  ({ wereld } = await voerOpdrachtUit(wereld, {
    soort: 'dien_aanvraag', naam: 'Laat', email: 'klant@example.nl', verhuurtype: 'expositie', start, eind: voegDagenToe(start, 1),
  }, ctx(nu), transport()));
  ({ wereld } = await voerOpdrachtUit(wereld, { soort: 'beoordeel', aanvraagId: wereld.aanvragen[0].id, besluit: 'goedkeuren' }, ctx(nu), transport()));
  const mail = transport();
  ({ wereld } = await voerOpdrachtUit(wereld, {
    soort: 'handmatig_definitief', boekingId: wereld.boekingen[0].id, reden: 'Late binnenkomst',
  }, ctx(nu), mail));
  const verzonden = mail.onderwerpen.join(' ');
  assert.equal(wereld.jobs.filter((job) => job.status === 'verzonden' && job.templateSleutel.startsWith('booking_content')).map((job) => job.templateSleutel).join(','), 'booking_content_request');
  assert.equal(wereld.jobs.some((job) => job.templateSleutel === 'booking_content_reminder'), false);
  assert.equal(wereld.jobs.some((job) => job.templateSleutel === 'internal_content_overdue'), false);
  assert.match(verzonden, /STAGING|Informatie|content|aanleveren|Ooij|Marieke|Laat|tekst/i);
});

test('gastheer aanwezig geeft geen ontbreekt-alert; afwezig wel', async () => {
  const vroeg = new Date('2027-01-01T10:00:00Z');
  const nu = new Date(`${voegDagenToe(START, -28)}T10:00:00Z`);
  const met = await expositieDefinitief(vroeg, { gastheer: true, inhoud: 'goedgekeurd', verzoekVerzonden: true });
  const uitMet = await voerOpdrachtUit(met, { soort: 'scheduler' }, ctx(nu), transport());
  assert.equal(uitMet.wereld.jobs.some((job) => job.templateSleutel === 'internal_host_required'), false);
  const zonder = await expositieDefinitief(vroeg, { inhoud: 'goedgekeurd', verzoekVerzonden: true });
  const uitZonder = await voerOpdrachtUit(zonder, { soort: 'scheduler' }, ctx(nu), transport());
  assert.equal(uitZonder.wereld.jobs.some((job) => job.templateSleutel === 'internal_host_required' && job.status === 'verzonden'), true);
});

test('content twee keer submitten blijft één versie bij dezelfde payload', async () => {
  const nu = new Date(`${voegDagenToe(START, -84)}T10:00:00Z`);
  let wereld = await expositieDefinitief(nu);
  ({ wereld } = await voerOpdrachtUit(wereld, { soort: 'scheduler' }, ctx(nu), transport()));
  const plain = nieuwToegangstoken();
  wereld.tokens[0].tokenHash = plain.hash;
  const opdracht = { soort: 'content_indienen' as const, token: plain.plain, titel: 'Ooij', omschrijving: 'Tekst over de polder', praktisch: 'Parkeren bij de dijk', foto: true };
  ({ wereld } = await voerOpdrachtUit(wereld, opdracht, ctx(nu)));
  const versie = wereld.publiek[0].versie;
  ({ wereld } = await voerOpdrachtUit(wereld, opdracht, ctx(nu)));
  assert.equal(wereld.publiek[0].versie, versie);
  assert.equal(wereld.publiek[0].inhoudStatus, 'ingediend');
  ({ wereld } = await voerOpdrachtUit(wereld, { soort: 'content_beoordelen', boekingId: wereld.boekingen[0].id, besluit: 'goedkeuren' }, ctx(nu)));
  assert.equal(wereld.publiek[0].inhoudStatus, 'goedgekeurd');
  assert.equal(wereld.publiek[0].gepubliceerd, true);
});

test('verlopen magic link lekt geen dossier', async () => {
  const nu = new Date('2027-01-01T10:00:00Z');
  let wereld = legeWereld();
  ({ wereld } = await voerOpdrachtUit(wereld, {
    soort: 'dien_aanvraag', naam: 'Kim', email: 'klant@example.nl', verhuurtype: 'expositie', start: START, eind: EIND,
  }, ctx(nu), transport()));
  ({ wereld } = await voerOpdrachtUit(wereld, { soort: 'beoordeel', aanvraagId: wereld.aanvragen[0].id, besluit: 'meer_informatie', vraag: 'Welke werken?' }, ctx(nu)));
  const plain = 'verlopen-token-plain-0123456789abcdef';
  wereld.tokens[0].tokenHash = hashToegangstoken(plain);
  const later = new Date('2027-03-01T10:00:00Z');
  const uit = await voerOpdrachtUit(wereld, { soort: 'aanvulling', token: plain, toelichting: 'geheim' }, ctx(later));
  assert.equal(uit.resultaat.ok, false);
  assert.equal(uit.wereld.aanvragen[0].toelichting.includes('geheim'), false);
});

test('onbevoegde mutatie schrijft niets', async () => {
  const nu = new Date('2027-01-01T10:00:00Z');
  let wereld = legeWereld();
  ({ wereld } = await voerOpdrachtUit(wereld, {
    soort: 'dien_aanvraag', naam: 'Kim', email: 'klant@example.nl', verhuurtype: 'expositie', start: START, eind: EIND,
  }, ctx(nu), transport()));
  const uit = await voerOpdrachtUit(wereld, { soort: 'beoordeel', aanvraagId: wereld.aanvragen[0].id, besluit: 'goedkeuren' }, ctx(nu, {}, { isSuperAdmin: false, perModule: { aanvragen: 'lezen' } }));
  assert.equal(uit.resultaat.ok, false);
  assert.equal(uit.wereld.boekingen.length, 0);
});

test('staging blokkeert een echt adres en mailfout wordt herhaald', async () => {
  const vroeg = new Date('2027-01-01T10:00:00Z');
  const nu = new Date(`${voegDagenToe(START, -84)}T10:00:00Z`);
  const wereld = await expositieDefinitief(vroeg);
  const geblokkeerd = transport();
  const blok = await voerOpdrachtUit(wereld, { soort: 'scheduler' }, ctx(nu, { MAIL_STAGING_ALLOWLIST: 'alleen@kerkje.test' }), geblokkeerd);
  assert.equal(geblokkeerd.n, 0);
  assert.equal(blok.wereld.jobs.some((job) => job.status === 'fout' && job.foutmelding?.includes('Staging')), true);
  assert.equal(bewaakUitgaandeMail({ VERCEL_ENV: 'preview' }, 'klant@example.nl').reden, 'geblokkeerd');
  assert.equal(bewaakUitgaandeMail({ VERCEL_ENV: 'preview', MAIL_STAGING_OVERRIDE: 'qa@kerkje.test' }, 'klant@example.nl').naar, 'qa@kerkje.test');

  let opnieuw = await expositieDefinitief(vroeg);
  const stuk = transport('fout');
  ({ wereld: opnieuw } = await voerOpdrachtUit(opnieuw, { soort: 'scheduler' }, ctx(nu), stuk));
  assert.equal(opnieuw.jobs.some((job) => job.templateSleutel === 'booking_content_request' && job.status === 'wachtrij'), true);
  const heel = transport();
  ({ wereld: opnieuw } = await voerOpdrachtUit(opnieuw, { soort: 'scheduler' }, ctx(nu), heel));
  assert.equal(opnieuw.jobs.filter((job) => job.templateSleutel === 'booking_content_request' && job.status === 'verzonden').length, 1);
  assert.equal(heel.n, 1);
});

test('incident houdt het dossier open', async () => {
  const nu = new Date('2027-01-01T10:00:00Z');
  let wereld = await expositieDefinitief(nu);
  const boekingId = wereld.boekingen[0].id;
  wereld.taken = [];
  ({ wereld } = await voerOpdrachtUit(wereld, { soort: 'incident', boekingId, omschrijving: 'Lekkage' }, ctx(nu)));
  const dicht = await voerOpdrachtUit(wereld, { soort: 'sluit', boekingId }, ctx(nu));
  assert.equal(dicht.resultaat.ok, false);
  assert.equal(dicht.wereld.boekingen[0].status, 'definitief');
  const incident = wereld.incidenten[0];
  ({ wereld } = await voerOpdrachtUit(wereld, { soort: 'incident_sluiten', incidentId: incident.id }, ctx(nu)));
  wereld.taken = wereld.taken.map((taak) => ({ ...taak, status: 'afgerond' as const }));
  ({ wereld } = await voerOpdrachtUit(wereld, { soort: 'sluit', boekingId }, ctx(nu)));
  assert.equal(wereld.boekingen[0].status, 'afgerond');
});

test('productie zonder vlaggen blijft Sanity', () => {
  assert.equal(huidigeContentBron({}), 'sanity');
  assert.equal(huidigeContentBron({ VERCEL_ENV: 'production', CONTENT_BRON: 'supabase' }), 'sanity');
  assert.equal(huidigeContentBron({ ALLOW_SUPABASE_CONTENT: 'true', CONTENT_BRON: 'supabase' }), 'supabase');
});

test('sql-migraties en mutatie-rpc', () => {
  execFileSync('bash', ['tests/sql/run.sh'], { stdio: 'pipe' });
});
