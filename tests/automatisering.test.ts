import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAILCATEGORIEEN,
  STANDAARD_AUTOMATISERINGEN,
  TEMPLATE_AUTOMATISERING,
  TEMPLATES_ALLEEN_CATALOGUS,
  TEMPLATES_LEGACY,
  TEMPLATES_MET_CALLER,
  auditregel,
  magAutomatiseringUitvoeren,
  planStatuswijziging,
  type Automatisering,
} from '../src/platform/automatisering.ts';
import { MailGeblokkeerd } from '../src/platform/automatisering.ts';
import { eisProviderToegestaan, verstuurGecontroleerd } from '../src/lib/mail-transport.ts';
import { verstuurWekelijkseNieuwsbrief } from '../src/lib/nieuwsbrief.ts';
import { draaiWorkflow } from '../src/lib/operatie/runtime.ts';
import { legeWereld, voerOpdrachtUit, type DienstContext } from '../src/lib/operatie/kern.ts';
import { nodigGebruikerUit, verstuurUitnodigingOpnieuw } from '../src/lib/beheer-gebruikers.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

const bericht = {
  naar: 'bestuur@example.nl',
  onderwerp: 'test',
  tekst: 'geen echte mail',
};

function verbodenTransport() {
  return {
    async verstuur() {
      throw new Error('provider aangeroepen');
    },
  };
}

test('alleen contact en nieuwe aanvraag naar bestuur mogen een provider', async () => {
  assert.equal(magAutomatiseringUitvoeren('contact_bestuur').provider, true);
  assert.equal(magAutomatiseringUitvoeren('aanvraag_bestuur').provider, true);
  const actief = STANDAARD_AUTOMATISERINGEN.filter((item) => item.status === 'actief').map((item) => item.sleutel);
  assert.deepEqual(actief.sort(), ['aanvraag_bestuur', 'contact_bestuur']);

  let aangeroepen = 0;
  const uit = await verstuurGecontroleerd(
    { ...bericht, sleutel: 'aanvraag_bestuur' },
    {
      transport: {
        async verstuur() {
          aangeroepen += 1;
        },
      },
    },
  );
  assert.equal(uit.verzonden, true);
  assert.equal(uit.providerAangeroepen, true);
  assert.equal(aangeroepen, 1);

  const contact = await verstuurGecontroleerd(
    { ...bericht, sleutel: 'contact_bestuur' },
    {
      transport: {
        async verstuur() {
          aangeroepen += 1;
        },
      },
    },
  );
  assert.equal(contact.providerAangeroepen, true);
  assert.equal(aangeroepen, 2);
});

test('nieuwsbrief, workflow en betaalherinnering blijven dicht', async () => {
  for (const sleutel of ['nieuwsbrief', 'workflow', 'betaalherinnering'] as const) {
    const besluit = magAutomatiseringUitvoeren(sleutel);
    assert.equal(besluit.provider, false);
    assert.equal(besluit.uitvoeren, false);
    const uit = await verstuurGecontroleerd({ ...bericht, sleutel }, { transport: verbodenTransport() });
    assert.equal(uit.verzonden, false);
    assert.equal(uit.providerAangeroepen, false);
  }
  const nieuwsbrief = await verstuurWekelijkseNieuwsbrief();
  assert.equal(nieuwsbrief.verstuurd, 0);
  assert.match(nieuwsbrief.overgeslagen, /geblokkeerd/);
});

test('onbekende sleutel en onbekende mailcategorie zijn fail-closed', async () => {
  assert.equal(magAutomatiseringUitvoeren('bestaat-niet').provider, false);
  const register: Automatisering[] = [
    {
      ...STANDAARD_AUTOMATISERINGEN[0],
      sleutel: 'vreemd',
      status: 'actief',
      mailcategorie: 'marketing',
    },
  ];
  const besluit = magAutomatiseringUitvoeren('vreemd', register);
  assert.equal(besluit.provider, false);
  assert.equal(besluit.reden, 'onbekende mailcategorie');
  assert.equal((MAILCATEGORIEEN as readonly string[]).includes('marketing'), false);
  const uit = await verstuurGecontroleerd({ ...bericht, sleutel: 'vreemd' }, { register, transport: verbodenTransport() });
  assert.equal(uit.providerAangeroepen, false);
  await assert.rejects(() => eisProviderToegestaan('bestaat-niet', register), MailGeblokkeerd);
});

test('uitgeschakeld blokkeert en testmodus doet geen provider-call', async () => {
  const uitgeschakeld = STANDAARD_AUTOMATISERINGEN.map((item) =>
    item.sleutel === 'aanvraag_bestuur' ? { ...item, status: 'uit' as const } : item,
  );
  const dicht = await verstuurGecontroleerd(
    { ...bericht, sleutel: 'aanvraag_bestuur' },
    { register: uitgeschakeld, transport: verbodenTransport() },
  );
  assert.equal(dicht.providerAangeroepen, false);
  assert.equal(dicht.besluit.reden, 'automatisering uit');

  const testbesluit = magAutomatiseringUitvoeren('mailtemplate_test');
  assert.equal(testbesluit.uitvoeren, true);
  assert.equal(testbesluit.provider, false);
  const testmail = await verstuurGecontroleerd(
    { ...bericht, sleutel: 'mailtemplate_test' },
    { transport: verbodenTransport() },
  );
  assert.equal(testmail.verzonden, false);
  assert.equal(testmail.providerAangeroepen, false);
});

test('risicovolle activatie vraagt bevestiging en schrijft een auditregel', () => {
  const nieuwsbrief = STANDAARD_AUTOMATISERINGEN.find((item) => item.sleutel === 'nieuwsbrief');
  assert.ok(nieuwsbrief);
  assert.equal(planStatuswijziging(nieuwsbrief, 'actief', false).soort, 'bevestiging');
  assert.equal(planStatuswijziging(nieuwsbrief, 'actief', true).soort, 'wijziging');
  assert.equal(planStatuswijziging(nieuwsbrief, 'uit', false).soort, 'ongewijzigd');
  const regel = auditregel(nieuwsbrief, 'actief', 'tester', '2026-09-30T12:00:00.000Z');
  assert.deepEqual(regel, {
    automatisering: 'nieuwsbrief',
    oudeStatus: 'uit',
    nieuweStatus: 'actief',
    gebruiker: 'tester',
    tijdstip: '2026-09-30T12:00:00.000Z',
  });
});

test('elke template hangt aan een schakelaar die standaard geen provider toestaat, behalve de bestuursreview', () => {
  assert.equal(Object.keys(TEMPLATE_AUTOMATISERING).length, 40);
  const open = Object.entries(TEMPLATE_AUTOMATISERING).filter(([, sleutel]) => magAutomatiseringUitvoeren(sleutel).provider);
  assert.deepEqual(open.map(([template]) => template), ['internal_booking_review_required']);
});

test('workflowcron stopt voordat de planner draait', async () => {
  const vorigeBron = process.env.CONTENT_BRON;
  const vorigeAllow = process.env.ALLOW_SUPABASE_CONTENT;
  process.env.CONTENT_BRON = 'supabase';
  process.env.ALLOW_SUPABASE_CONTENT = 'true';
  try {
    const uit = await draaiWorkflow(process.env);
    assert.equal(uit.ok, true);
    assert.match(uit.melding, /Workflowmail geblokkeerd/);
  } finally {
    if (vorigeBron === undefined) delete process.env.CONTENT_BRON;
    else process.env.CONTENT_BRON = vorigeBron;
    if (vorigeAllow === undefined) delete process.env.ALLOW_SUPABASE_CONTENT;
    else process.env.ALLOW_SUPABASE_CONTENT = vorigeAllow;
  }
});

test('een geblokkeerde verzending wordt niet als verzonden gemarkeerd', async () => {
  const wereld = legeWereld();
  const ctx: DienstContext = {
    nu: new Date('2026-09-30T12:00:00.000Z'),
    env: { VERCEL_ENV: 'production' },
    actor: { type: 'systeem', naam: 'test' },
    basisUrl: 'https://kerkjepersingen.nl',
    internEmail: 'bestuur@example.nl',
  };
  const uit = await voerOpdrachtUit(
    wereld,
    {
      soort: 'dien_aanvraag',
      naam: 'Test Persoon',
      email: 'aanvrager@example.nl',
      verhuurtype: 'expositie',
      start: '2027-04-10',
      eind: '2027-04-11',
      toelichting: 'test',
    },
    ctx,
    {
      async verstuur() {
        throw new MailGeblokkeerd('automatisering uit');
      },
    },
  );
  const jobs = uit.wereld.jobs;
  assert.ok(jobs.length > 0);
  assert.ok(jobs.every((job) => job.status === 'geblokkeerd'));
  assert.ok(jobs.every((job) => job.status !== 'verzonden' && job.status !== 'geannuleerd'));
  assert.ok(jobs.every((job) => (job.foutmelding ?? '').includes('geen provider-call')));
  const audit = uit.mutaties.filter((mutatie) => mutatie.soort === 'insert_audit' && mutatie.velden.actie === 'verzonden');
  assert.equal(audit.length, 0);
});

test('de 40 templates vallen sluitend in caller, catalogus of legacy', () => {
  const alles = [...TEMPLATES_MET_CALLER, ...TEMPLATES_ALLEEN_CATALOGUS, ...TEMPLATES_LEGACY];
  assert.equal(TEMPLATES_MET_CALLER.length, 19);
  assert.equal(TEMPLATES_ALLEEN_CATALOGUS.length, 8);
  assert.equal(TEMPLATES_LEGACY.length, 13);
  assert.equal(alles.length, 40);
  assert.equal(new Set(alles).size, 40);
  assert.deepEqual([...alles].sort(), Object.keys(TEMPLATE_AUTOMATISERING).sort());
});

function authAdmin(): SupabaseClient {
  return {
    auth: {
      admin: {
        inviteUserByEmail() {
          throw new Error('Supabase Auth invite aangeroepen');
        },
      },
    },
    from() {
      throw new Error('database aangeroepen');
    },
  } as unknown as SupabaseClient;
}

const actor = { id: '11111111-1111-1111-1111-111111111111', naam: 'tester', rechten: { isSuperAdmin: true, perModule: {} } };

test('uitnodigen en opnieuw uitnodigen raken Supabase Auth niet bij Uit of Test', async () => {
  const uit = await nodigGebruikerUit(authAdmin(), actor, {
    naam: 'Test',
    email: 'test@example.nl',
    redirectTo: 'https://kerkjepersingen.nl/beheer/',
  }, STANDAARD_AUTOMATISERINGEN);
  assert.equal('fout' in uit && uit.fout, 'ongeldig');

  const opnieuw = await verstuurUitnodigingOpnieuw(
    authAdmin(),
    actor,
    '22222222-2222-2222-2222-222222222222',
    'https://kerkjepersingen.nl/beheer/',
    STANDAARD_AUTOMATISERINGEN,
  );
  assert.equal('fout' in opnieuw && opnieuw.fout, 'ongeldig');

  const teststand = STANDAARD_AUTOMATISERINGEN.map((item) =>
    item.sleutel === 'gebruiker_uitnodiging' ? { ...item, status: 'test' as const } : item,
  );
  const testInvite = await nodigGebruikerUit(authAdmin(), actor, {
    naam: 'Test',
    email: 'test@example.nl',
    redirectTo: 'https://kerkjepersingen.nl/beheer/',
  }, teststand);
  const testOpnieuw = await verstuurUitnodigingOpnieuw(
    authAdmin(),
    actor,
    '22222222-2222-2222-2222-222222222222',
    'https://kerkjepersingen.nl/beheer/',
    teststand,
  );
  assert.equal('fout' in testInvite && testInvite.melding.includes('testmodus'), true);
  assert.equal('fout' in testOpnieuw && testOpnieuw.melding.includes('testmodus'), true);
  assert.equal(magAutomatiseringUitvoeren('gebruiker_uitnodiging', teststand).provider, false);
});

test('contact heeft geen actieve trigger', () => {
  const contact = STANDAARD_AUTOMATISERINGEN.find((item) => item.sleutel === 'contact_bestuur');
  assert.ok(contact);
  assert.equal(contact.status, 'actief');
  assert.equal(contact.actieveTrigger, false);
  const aanvraag = STANDAARD_AUTOMATISERINGEN.find((item) => item.sleutel === 'aanvraag_bestuur');
  assert.equal(aanvraag?.actieveTrigger, true);
});
