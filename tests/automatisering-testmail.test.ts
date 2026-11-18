import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { STANDAARD_AUTOMATISERINGEN, type Automatisering, type AutomatiseringStatus } from '../src/platform/automatisering.ts';
import {
  planAutomatiseringTestmails,
  vatTestmailsSamen,
} from '../src/platform/automatisering-testmail.ts';
import { STANDAARD_MAILTEMPLATES } from '../src/platform/mailtemplates/catalog.ts';
import { verstuurAutomatiseringTestmails } from '../src/lib/automatisering-testmail.ts';
import { providerPayloadIsTestveilig } from '../src/platform/testmail.ts';

const TEST = 'nhoevenaars@gmail.com';

function registerMet(status: Partial<Record<string, AutomatiseringStatus>>): Automatisering[] {
  return STANDAARD_AUTOMATISERINGEN.map((item) => ({
    ...item,
    status: status[item.sleutel] ?? 'uit',
  }));
}

const bronnen = {
  templates: STANDAARD_MAILTEMPLATES,
  testadres: TEST,
  nieuwsbrief: {
    subject: 'Deze week in Persingen',
    html: '<p>Nieuwsbrief</p>',
    text: 'Nieuwsbrief',
    replyTo: 'vrienden@example.nl',
  },
};

test('alleen automatiseringen op test krijgen een mail naar het testadres', () => {
  const plannen = planAutomatiseringTestmails(
    registerMet({
      betaalherinnering: 'test',
      nieuwsbrief: 'test',
      social_media_content: 'test',
      aanvraag_bestuur: 'actief',
      workflow: 'test',
      gebruiker_uitnodiging: 'test',
    }),
    bronnen,
  );
  const sleutels = plannen.map((plan) => plan.sleutel);
  assert.deepEqual(sleutels, ['workflow', 'nieuwsbrief', 'betaalherinnering', 'gebruiker_uitnodiging', 'social_media_content']);
  assert.equal(plannen.some((plan) => plan.sleutel === 'aanvraag_bestuur'), false);

  const betaling = plannen.find((plan) => plan.sleutel === 'betaalherinnering');
  assert.equal(betaling?.versturen, true);
  assert.equal(betaling?.bericht?.naar, TEST);
  assert.equal(betaling?.templateId, 'booking_payment_reminder');
  assert.match(betaling?.bericht?.onderwerp ?? '', /Betaalherinneringen: Herinnering voor uw reservering/);
  assert.match(betaling?.bericht?.tekst ?? '', /Jan/);

  const nieuws = plannen.find((plan) => plan.sleutel === 'nieuwsbrief');
  assert.match(nieuws?.bericht?.onderwerp ?? '', /Nieuwsbrief: Deze week in Persingen/);

  const social = plannen.find((plan) => plan.sleutel === 'social_media_content');
  assert.match(social?.bericht?.onderwerp ?? '', /Goedgekeurde content/);
  assert.equal(social?.bericht?.naar, TEST);

  const workflow = plannen.find((plan) => plan.sleutel === 'workflow');
  assert.match(workflow?.bericht?.tekst ?? '', /automatisering Workflowcron/);

  const uitnodiging = plannen.find((plan) => plan.sleutel === 'gebruiker_uitnodiging');
  assert.equal(uitnodiging?.versturen, false);
  assert.equal(uitnodiging?.overgeslagen, true);
  assert.match(uitnodiging?.reden ?? '', /auth-uitnodiging/);
});

test('zonder testadres wordt niets verstuurd', () => {
  const plannen = planAutomatiseringTestmails(registerMet({ mailtemplate_test: 'test' }), {
    ...bronnen,
    testadres: 'twee@example.nl, drie@example.nl',
  });
  assert.equal(plannen.length, 1);
  assert.equal(plannen[0].versturen, false);
  assert.equal(plannen[0].overgeslagen, false);
  assert.match(plannen[0].reden, /testmailadres/);
});

test('de verzender roept de provider alleen aan voor test en alleen naar het testadres', async () => {
  const ontvangen: { naar: string; onderwerp: string }[] = [];
  const register = registerMet({
    aanvraag_bestuur: 'actief',
    betaalherinnering: 'test',
    betalingscommunicatie: 'test',
    mailtemplate_test: 'test',
    statusmail_huurder: 'uit',
  });
  const uit = await verstuurAutomatiseringTestmails({
    register,
    testadres: TEST,
    transport: {
      async verstuur(bericht) {
        ontvangen.push({ naar: bericht.naar, onderwerp: bericht.onderwerp });
        assert.equal(
          providerPayloadIsTestveilig({ to: [bericht.naar], subject: bericht.onderwerp }, TEST),
          true,
        );
        assert.equal(bericht.bedoeldeOntvanger, TEST);
      },
    },
  });
  assert.deepEqual(
    ontvangen.map((bericht) => bericht.naar),
    [TEST, TEST, TEST],
  );
  assert.equal(ontvangen.some((bericht) => bericht.onderwerp.includes('Nieuwe verhuuraanvraag')), false);
  assert.equal(uit.filter((item) => item.verzonden).length, 3);
  const samen = vatTestmailsSamen(uit, TEST);
  assert.match(samen.melding, /3 testmails verstuurd naar nhoevenaars@gmail.com/);
  assert.equal(samen.fout, '');
});

test('een providerfout stopt de overige testmails niet', async () => {
  let teller = 0;
  const uit = await verstuurAutomatiseringTestmails({
    register: registerMet({ betaalherinnering: 'test', betalingscommunicatie: 'test', herinnering: 'test' }),
    testadres: TEST,
    transport: {
      async verstuur() {
        teller += 1;
        if (teller === 1) throw new Error('provider tijdelijk weg');
      },
    },
  });
  assert.equal(uit.filter((item) => item.verzonden).length, 2);
  assert.match(vatTestmailsSamen(uit, TEST).fout, /provider tijdelijk weg/);
});

test('de knop staat naast testmailadres bewaren', () => {
  const bron = readFileSync(new URL('../src/pages/beheer/instellingen/automatiseringen/index.astro', import.meta.url), 'utf8');
  const bewaren = bron.indexOf('Testmailadres bewaren');
  const versturen = bron.indexOf('Versturen testmails');
  assert.ok(bewaren > 0);
  assert.ok(versturen > bewaren);
  assert.ok(versturen - bewaren < 400);
});
