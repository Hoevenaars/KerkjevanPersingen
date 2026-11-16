import assert from 'node:assert/strict';
import test from 'node:test';
import { standaardTemplate } from '../src/platform/mailtemplates/catalog.ts';
import { renderMailHtml } from '../src/platform/mailtemplates/render.ts';
import { VOORBEELD_VARIABELEN } from '../src/platform/mailtemplates/voorbeeld.ts';
import { communicatieStappen } from '../src/platform/continuiteit.ts';
import { STANDAARD_AUTOMATISERINGEN, magAutomatiseringUitvoeren, technischeGereedheid } from '../src/platform/automatisering.ts';
import {
  controleerAutomatischeMail,
  emailGeldig,
  komendeBerichten,
  openstaandeAanbetaling,
  redenBuitenWorkflow,
  samenstellenWorkflowmail,
} from '../src/platform/mail-poort.ts';
import { legeWereld, voerOpdrachtUit, type DienstContext, type MailTransport } from '../src/lib/operatie/kern.ts';
import { STANDAARD_MAILTEMPLATES } from '../src/platform/mailtemplates/catalog.ts';

test('afloopmail heeft geen groet als knop', () => {
  const html = renderMailHtml(standaardTemplate('host_post_event_check')!, VOORBEELD_VARIABELEN);
  assert.equal(/Met vriendelijke groet,<\/a>/i.test(html), false);
  assert.equal(/Stichting Het Kerkje van Persingen<\/a>/.test(html), false);
  assert.match(html, /Alles is goed verlopen/);
  assert.match(html, /Bijzonderheid melden/);
  assert.match(html, /Met vriendelijke groet/);
  assert.equal(html.includes('{{'), false);
  assert.match(html, /viewport/);
});

test('contentverzoek vult de verplichte variabelen', () => {
  const template = standaardTemplate('booking_content_request')!;
  const mail = samenstellenWorkflowmail(template, { naam: 'Marie Jansen', start: '2027-02-12', soort: 'concert' });
  assert.equal(mail.ok, true);
  if (!mail.ok) return;
  assert.match(mail.tekst, /Titel van de activiteit/);
  assert.match(mail.tekst, /december 2026/);
  assert.equal(mail.tekst.includes('{{'), false);
  assert.equal(mail.html.includes('{{'), false);
});

test('praktische mail zonder aanvangstijd wordt niet opgebouwd', () => {
  const template = standaardTemplate('booking_practical_information')!;
  const mail = samenstellenWorkflowmail(template, { naam: 'Marie Jansen', start: '2027-02-12', soort: 'concert', titel: 'Winterconcert' });
  assert.equal(mail.ok, false);
  if (mail.ok) return;
  assert.match(mail.toelichting, /Aanvangstijd/);
  assert.match(mail.toelichting, /Toegang vanaf/);
});

test('optionele gastbegeleider verdwijnt uit de tekst', () => {
  const template = standaardTemplate('booking_practical_information')!;
  const mail = samenstellenWorkflowmail(template, {
    naam: 'Marie Jansen',
    start: '2027-02-12',
    soort: 'concert',
    titel: 'Winterconcert',
    tijdVan: '20:00',
    tijdTot: '22:00',
    toegangVanaf: '19:30',
  });
  assert.equal(mail.ok, true);
  if (!mail.ok) return;
  assert.match(mail.tekst, /20:00/);
  assert.equal(mail.tekst.includes('Expositiebegeleider'), false);
  assert.equal(mail.tekst.includes('{{'), false);
});

test('definitieve boeking met open aanbetaling wordt herkend en niet verzonden', () => {
  const open = openstaandeAanbetaling({
    status: 'definitief',
    ontvangen: false,
    bedrag: 150,
    optieAangemaaktOp: '2026-11-01',
    deadline: '2026-11-15',
  });
  assert.equal(open.herkend, true);
  assert.equal(open.inplanbaar, true);
  const stappen = communicatieStappen({
    status: 'definitief',
    start: '2027-02-12',
    verhuurtype: 'concert',
    publicatieTrigger: 'niet_publiceren',
    inhoudStatus: 'niet_vereist',
    aanbetalingOntvangen: false,
    aanbetalingVerplicht: true,
    optieAangemaaktOp: '2026-11-01',
    betaaldeadline: '2026-11-15',
    gastheerAanwezig: false,
    verzonden: new Set(),
    vandaag: '2026-11-16',
  });
  assert.equal(stappen.some((stap) => stap.templateId === 'booking_payment_reminder'), true);
  assert.equal(magAutomatiseringUitvoeren('betaalherinnering').modus, 'uit');
  assert.equal(technischeGereedheid(STANDAARD_AUTOMATISERINGEN.find((item) => item.sleutel === 'betaalherinnering')!).label, 'Aandacht nodig');
});

test('migratieboeking valt buiten de planner', () => {
  assert.match(redenBuitenWorkflow('migratie_vastgelegd') ?? '', /geen mail achteraf/);
  assert.equal(communicatieStappen({
    status: 'migratie_vastgelegd',
    start: '2026-06-01',
    verhuurtype: 'expositie',
    publicatieTrigger: 'niet_publiceren',
    inhoudStatus: 'niet_vereist',
    aanbetalingOntvangen: false,
    aanbetalingVerplicht: true,
    optieAangemaaktOp: '2026-01-01',
    betaaldeadline: null,
    gastheerAanwezig: false,
    verzonden: new Set(),
    vandaag: '2026-11-16',
  }).length, 0);
  assert.equal(openstaandeAanbetaling({
    status: 'migratie_vastgelegd',
    ontvangen: false,
    bedrag: 100,
    optieAangemaaktOp: '2026-01-01',
    deadline: '2026-02-01',
  }).herkend, false);
});

test('controle blokkeert een uitgeschakelde of incomplete mail', () => {
  assert.equal(controleerAutomatischeMail({
    ingeschakeld: false,
    aanleidingGeldig: true,
    ontvangerToegestaan: true,
    email: 'jan@example.nl',
    mailCompleet: true,
    alVerzonden: false,
    bezig: false,
  }).ok, false);
  assert.equal(emailGeldig('geen-adres'), false);
  const uit = controleerAutomatischeMail({
    ingeschakeld: true,
    aanleidingGeldig: true,
    ontvangerToegestaan: true,
    email: 'jan@example.nl',
    mailCompleet: true,
    alVerzonden: true,
    bezig: false,
  });
  assert.match(uit.reden, /al verzonden/);
});

test('komende berichten tonen Uit en geen placeholders', () => {
  const rijen = komendeBerichten({
    vandaag: '2026-11-16',
    register: STANDAARD_AUTOMATISERINGEN,
    templates: STANDAARD_MAILTEMPLATES,
    boekingen: [{
      boekingId: '42',
      status: 'definitief',
      naam: 'Ada Kunst',
      email: 'ada@example.nl',
      telefoon: '0612345678',
      titel: 'Winterconcert',
      soort: 'concert',
      start: '2027-02-12',
      eind: '2027-02-12',
      gastheerNaam: '',
      gastheerTelefoon: '',
      gastheerEmail: '',
      tijdVan: '',
      tijdTot: '',
      toegangVanaf: '',
      praktisch: '',
      personen: '80',
      bedrag: 0,
      aanbetalingOntvangen: true,
      optieAangemaaktOp: null,
      optieEind: null,
      inhoudStatus: 'niet_gestart',
      publicatieTrigger: 'zodra_content_compleet',
      gastheerAanwezig: false,
      verzonden: [],
      geannuleerd: false,
    }],
  });
  const content = rijen.find((rij) => rij.templateId === 'booking_content_request');
  assert.ok(content);
  assert.equal(content.status, 'Uit');
  assert.equal(content.tekst.includes('{{'), false);
  assert.match(content.tekst, /Titel van de activiteit/);
});

test('een proefverzending telt niet als verzonden', async () => {
  const wereld = legeWereld();
  const ctx: DienstContext = {
    nu: new Date('2026-11-16T08:00:00Z'),
    env: { VERCEL_ENV: 'production' },
    actor: { type: 'systeem', naam: 'test' },
    basisUrl: 'https://kerkjepersingen.nl',
    internEmail: 'bestuur@example.nl',
  };
  const transport: MailTransport = {
    async verstuur() {
      return { test: true, providerBerichtId: 'provider-1' };
    },
  };
  const uit = await voerOpdrachtUit(wereld, {
    soort: 'dien_aanvraag',
    naam: 'Test Persoon',
    email: 'aanvrager@example.nl',
    verhuurtype: 'bruiloft',
    start: '2027-05-04',
    eind: '2027-05-04',
  }, ctx, transport);
  assert.equal(uit.wereld.jobs.some((job) => job.status === 'verzonden'), false);
  assert.ok(uit.wereld.jobs.every((job) => job.status === 'concept'));
  assert.equal(uit.mutaties.some((mutatie) => mutatie.soort === 'insert_audit' && mutatie.velden.actie === 'verzonden'), false);
  assert.equal(uit.mutaties.some((mutatie) => mutatie.soort === 'insert_audit' && mutatie.velden.actie === 'testverzending'), true);
});

test('contact blijft geblokkeerd zonder formulier', () => {
  const contact = STANDAARD_AUTOMATISERINGEN.find((item) => item.sleutel === 'contact_bestuur')!;
  assert.equal(technischeGereedheid(contact).status, 'geblokkeerd');
  assert.equal(contact.actieveTrigger, false);
});
