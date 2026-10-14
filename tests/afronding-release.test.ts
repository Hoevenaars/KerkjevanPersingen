import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fotoPadNaAanlevering, intakePad, planIntake, valideerIntakeBestand } from '../src/platform/intake-foto.ts';
import { stelMailconceptSamen } from '../src/platform/mailconcept.ts';
import { magAutomatiseringUitvoeren, STANDAARD_AUTOMATISERINGEN } from '../src/platform/automatisering.ts';
import { verstuurGecontroleerd } from '../src/lib/mail-transport.ts';
import { CONTRACTBEHEER_EMAIL } from '../src/lib/mail-adressen.ts';

const sql = readFileSync(new URL('../supabase/migrations/20261014190000_beheer_vervolgfase.sql', import.meta.url), 'utf8');
const zonderComments = sql
  .split('\n')
  .filter((regel) => !regel.trim().startsWith('--'))
  .join('\n');

test('migratie verwijdert geen data en laat schakelaars staan', () => {
  const laag = zonderComments.toLowerCase();
  assert.equal(laag.includes('delete from'), false);
  assert.equal(laag.includes('truncate'), false);
  assert.equal(laag.includes('drop table'), false);
  assert.equal(laag.includes('drop schema'), false);
  const dataUpdate = zonderComments.match(/update public\.automatiseringen[\s\S]*?where[\s\S]*?;/i)?.[0] ?? '';
  assert.match(dataUpdate, /set actieve_trigger = true/i);
  assert.equal(/status\s*=/i.test(dataUpdate), false);
  assert.match(zonderComments, /set actieve_trigger = true/);
  assert.match(zonderComments, /actieve_trigger is distinct from true/);
  assert.match(zonderComments, /on conflict \(sleutel\) do nothing/);
  assert.match(zonderComments, /on conflict \(id\) do nothing/);
  assert.equal(laag.includes('update public.boekingen'), false);
  assert.equal(laag.includes('update public.aanvragen'), false);
  assert.equal(laag.includes('update public.relaties'), false);
  assert.equal(laag.includes('update public.gebruikersrechten'), false);
  assert.equal(laag.includes('update public.profielen'), false);
  assert.equal(laag.includes('public-media'), false);
  assert.match(zonderComments, /'content-intake'/);
  assert.match(zonderComments, /false,\s*\n\s*8000000/);
  for (const sleutel of ['aanvraag_bestuur', 'contact_bestuur', 'workflow', 'nazorg']) {
    assert.equal(STANDAARD_AUTOMATISERINGEN.find((item) => item.sleutel === sleutel)?.status, sleutel.endsWith('bestuur') ? 'actief' : 'uit');
  }
});

test('aanleverfoto overschrijft een bestaande hoofdfoto niet', () => {
  assert.equal(valideerIntakeBestand({ type: 'image/jpeg', size: 100 }).ok, true);
  assert.equal(valideerIntakeBestand({ type: 'application/pdf', size: 100 }).ok, false);
  assert.equal(valideerIntakeBestand({ type: 'image/png', size: 8_000_001 }).ok, false);
  const id = '11111111-1111-4111-8111-111111111111';
  const plan = planIntake({
    boekingId: '42',
    bestaandHoofd: 'intake/42/oud.jpg',
    bestaandPaden: ['intake/42/oud.jpg'],
    bestanden: [
      { mime: 'image/jpeg', bytes: 10, id, alsHoofd: true },
      { mime: 'image/png', bytes: 10, id: '22222222-2222-4222-8222-222222222222', alsHoofd: false },
    ],
  });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.hoofd, 'intake/42/oud.jpg');
  assert.equal(plan.bestanden.every((bestand) => bestand.rol === 'extra'), true);
  assert.equal(plan.bestanden.some((bestand) => bestand.pad === 'intake/42/oud.jpg'), false);
  assert.equal(intakePad('42', 'image/jpeg', id), `intake/42/${id}.jpg`);
  assert.equal(fotoPadNaAanlevering('intake/42/oud.jpg', `intake/42/${id}.jpg`, true), 'intake/42/oud.jpg');
  assert.equal(fotoPadNaAanlevering('', `intake/42/${id}.jpg`, true), `intake/42/${id}.jpg`);
  const botsing = planIntake({
    boekingId: '7',
    bestaandHoofd: '',
    bestaandPaden: [`intake/7/${id}.jpg`],
    bestanden: [{ mime: 'image/jpeg', bytes: 10, id, alsHoofd: true }],
  });
  assert.equal(botsing.ok, false);
});

test('handmatig concept previewt in de Kerkje-layout en Uit belt de provider niet', async () => {
  const concept = stelMailconceptSamen({
    ontvanger: 'klant@example.com',
    naam: 'Ada Berg',
    template: null,
    onderwerp: 'Praktische informatie',
    inhoud: 'Neem de sleutel mee.',
  });
  assert.equal('fout' in concept, false);
  if ('fout' in concept) return;
  assert.equal(concept.replyTo, CONTRACTBEHEER_EMAIL);
  assert.match(concept.html, /data-kerkje-mail/);
  assert.match(concept.text, /Neem de sleutel mee/);
  let aangeroepen = 0;
  const uit = await verstuurGecontroleerd(
    {
      sleutel: 'handmatige_template',
      naar: concept.ontvanger,
      onderwerp: concept.onderwerp,
      tekst: concept.text,
      html: concept.html,
      replyTo: concept.replyTo,
    },
    {
      register: STANDAARD_AUTOMATISERINGEN,
      transport: { async verstuur() { aangeroepen += 1; } },
    },
  );
  assert.equal(magAutomatiseringUitvoeren('handmatige_template').status, 'uit');
  assert.equal(uit.providerAangeroepen, false);
  assert.equal(aangeroepen, 0);
});
