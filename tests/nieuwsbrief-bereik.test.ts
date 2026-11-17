import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  bereikPatch,
  bereikVanRijen,
  isActiviteitLink,
  leesResendGebeurtenis,
  verifieerResendHandtekening,
  type BereikRij,
} from '../src/lib/nieuwsbrief-bereik.ts';

const GEHEIM = `whsec_${Buffer.from('kerkje-nieuwsbrief-geheim').toString('base64')}`;

function handtekening(id: string, timestamp: string, payload: string): string {
  const geheim = Buffer.from(GEHEIM.slice('whsec_'.length), 'base64');
  const waarde = createHmac('sha256', geheim).update(`${id}.${timestamp}.${payload}`).digest('base64');
  return `v1,${waarde}`;
}

test('alleen de agenda-activiteit telt als doorklik', () => {
  assert.equal(isActiviteitLink('https://kerkjepersingen.nl/agenda/expositie/'), true);
  assert.equal(isActiviteitLink('https://www.kerkjepersingen.nl/agenda/expositie'), true);
  assert.equal(isActiviteitLink('https://kerkjepersingen.nl/agenda/'), true);
  assert.equal(isActiviteitLink('https://kerkjepersingen.nl/steun-ons/'), false);
  assert.equal(isActiviteitLink('https://kerkjepersingen.nl/contact/'), false);
  assert.equal(isActiviteitLink('https://kerkjepersingen.nl/agenda/expositie/extra'), false);
  assert.equal(isActiviteitLink('https://example.test/agenda/expositie'), false);
});

test('een klik bewaart geen netwerkadres en alleen de activiteitlink', () => {
  const gebeurtenis = leesResendGebeurtenis({
    type: 'email.clicked',
    data: {
      email_id: 'mail-abc-123',
      to: ['bo@example.test'],
      ip_address: '203.0.113.8',
      user_agent: 'geheim-programma',
      click: { link: 'https://kerkjepersingen.nl/agenda/expositie/?token=geheim', ipAddress: '203.0.113.8' },
      tags: { soort: 'nieuwsbrief', editie: '9', vriend: '1' },
    },
  });
  assert.deepEqual(gebeurtenis, {
    soort: 'geklikt',
    emailId: 'mail-abc-123',
    editieId: '9',
    vriendId: '1',
    vanOns: true,
    activiteit: true,
  });
  assert.equal(JSON.stringify(gebeurtenis).includes('203.0.113.8'), false);
  assert.equal(JSON.stringify(gebeurtenis).includes('geheim'), false);
});

test('een andere klik en een andere mail blijven buiten de telling', () => {
  assert.equal(
    leesResendGebeurtenis({
      type: 'email.clicked',
      data: {
        email_id: 'mail-abc-123',
        click: { link: 'https://kerkjepersingen.nl/steun-ons/' },
        tags: [{ name: 'soort', value: 'nieuwsbrief' }],
      },
    })?.activiteit,
    false,
  );
  assert.equal(leesResendGebeurtenis({ type: 'email.delivered', data: { email_id: 'mail-abc-123' } }), null);
});

test('de eerste opening blijft staan en een activiteitklik telt ook als geopend', () => {
  const eerste = bereikPatch({ geopendOp: null, activiteitOp: null }, { soort: 'geopend', activiteit: false }, '2026-11-13T09:00:00.000Z');
  const opnieuw = bereikPatch(eerste, { soort: 'geopend', activiteit: false }, '2026-11-13T10:00:00.000Z');
  assert.equal(opnieuw.geopendOp, '2026-11-13T09:00:00.000Z');
  const geklikt = bereikPatch(
    { geopendOp: null, activiteitOp: null },
    { soort: 'geklikt', activiteit: true },
    '2026-11-13T11:00:00.000Z',
  );
  assert.equal(geklikt.geopendOp, '2026-11-13T11:00:00.000Z');
  assert.equal(geklikt.activiteitOp, '2026-11-13T11:00:00.000Z');
  const later = bereikPatch(geklikt, { soort: 'geklikt', activiteit: true }, '2026-11-13T12:00:00.000Z');
  assert.equal(later.activiteitOp, '2026-11-13T11:00:00.000Z');
});

test('het overzicht noemt wie opende, wie niet, en wie de activiteit aanklikte', () => {
  const rijen: BereikRij[] = [
    { nieuwsbriefId: '9', naam: 'Bo', email: 'bo@example.test', test: false, status: 'verzonden', geopendOp: '2026-11-13T09:00:00.000Z', activiteitOp: '2026-11-13T09:05:00.000Z' },
    { nieuwsbriefId: '9', naam: '', email: 'ada@example.test', test: false, status: 'verzonden', geopendOp: null, activiteitOp: null },
    { nieuwsbriefId: '9', naam: 'Test', email: 'test@example.test', test: true, status: 'verzonden', geopendOp: '2026-11-13T09:00:00.000Z', activiteitOp: null },
    { nieuwsbriefId: '8', naam: 'Andere week', email: 'week@example.test', test: false, status: 'verzonden', geopendOp: null, activiteitOp: null },
  ];
  const uit = bereikVanRijen(rijen, '9');
  assert.equal(uit.verstuurd, 2);
  assert.equal(uit.geopend, 1);
  assert.equal(uit.nietGeopend, 1);
  assert.equal(uit.activiteit, 1);
  assert.deepEqual(uit.personen.map((persoon) => persoon.naam), ['ada@example.test', 'Bo']);
});

test('een geldige Resend-handtekening wordt geaccepteerd en een vervalste geweigerd', () => {
  const payload = '{"type":"email.opened"}';
  const id = 'msg_1';
  const timestamp = '1760000000';
  const nu = 1760000000 * 1000;
  assert.equal(verifieerResendHandtekening({
    payload,
    id,
    timestamp,
    signature: handtekening(id, timestamp, payload),
    secret: GEHEIM,
    nu,
  }), true);
  assert.equal(verifieerResendHandtekening({
    payload,
    id,
    timestamp,
    signature: handtekening(id, timestamp, '{"type":"email.clicked"}'),
    secret: GEHEIM,
    nu,
  }), false);
  assert.equal(verifieerResendHandtekening({
    payload,
    id,
    timestamp,
    signature: handtekening(id, timestamp, payload),
    secret: GEHEIM,
    nu: nu + 6 * 60 * 1000,
  }), false);
});

test('de webhook weigert zonder geheim en bij een foute handtekening', async () => {
  const vorig = process.env.RESEND_WEBHOOK_SECRET;
  const { POST } = await import('../src/pages/api/resend/nieuwsbrief.ts');
  delete process.env.RESEND_WEBHOOK_SECRET;
  const zonder = await POST({ request: new Request('https://kerkjepersingen.nl/api/resend/nieuwsbrief', { method: 'POST', body: '{}' }) } as never);
  assert.equal(zonder.status, 503);

  process.env.RESEND_WEBHOOK_SECRET = GEHEIM;
  const payload = '{"type":"email.opened","data":{"email_id":"mail-abc-123","tags":{"soort":"nieuwsbrief"}}}';
  const fout = await POST({
    request: new Request('https://kerkjepersingen.nl/api/resend/nieuwsbrief', {
      method: 'POST',
      body: payload,
      headers: { 'svix-id': 'msg_1', 'svix-timestamp': '1760000000', 'svix-signature': 'v1,fout' },
    }),
  } as never);
  assert.equal(fout.status, 400);
  if (vorig === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
  else process.env.RESEND_WEBHOOK_SECRET = vorig;
});
