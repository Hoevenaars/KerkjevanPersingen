import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activiteitVanAgendaRij, stelPubliekeAgenda, type AgendaRij } from '../src/lib/publiek-lezen.ts';
import { blokkeertBeschikbaarheid } from '../src/lib/agenda-zichtbaarheid.ts';
import { huidigeBezetteDagen } from '../src/platform/kalender.ts';

const sql = readFileSync(
  new URL('../supabase/migrations/20261006213000_expositie_7_8_november.sql', import.meta.url),
  'utf8',
);

test('7 en 8 november wordt een publieke expositie in bron en agenda', () => {
  assert.match(sql, /legacy_id = 'tK6YSvZ1UTtMScmpBoQ6pf'/);
  assert.match(sql, /zichtbaarheid = 'publiek'/);
  assert.match(sql, /date '2026-11-07'/);
  assert.match(sql, /date '2026-11-08'/);
  assert.match(sql, /'Expositie Hans Peters icm Ineke Christiaans'/);
  assert.match(sql, /'Hans Peters en Ineke Christiaans'/);
  assert.match(sql, /'expositie-hans-peters-icm-ineke-christiaans'/);
  assert.match(sql, /'direct'/);
  assert.match(sql, /insert into public\.publieke_activiteiten/);
  assert.match(sql, /update public\.activiteit_bron/);
});

test('de expositie verschijnt op de agenda en blokkeert het verhuurweekend', () => {
  const rij: AgendaRij = {
    id: 99,
    slug: 'expositie-hans-peters-icm-ineke-christiaans',
    titel: 'Expositie Hans Peters icm Ineke Christiaans',
    start_datum: '2026-11-07',
    eind_datum: '2026-11-08',
    omschrijving: null,
    foto_pad: null,
    foto_alt: null,
    publicatie_trigger: 'direct',
    zichtbaarheid: 'publiek',
    inhoud_status: 'niet_gestart',
    soort: 'expositie',
    exposanten: 'Hans Peters en Ineke Christiaans',
  };
  const lijst = stelPubliekeAgenda([rij], new Date('2026-10-06T12:00:00Z'));
  assert.equal(lijst.length, 1);
  assert.equal(lijst[0]?.publiekeTitel, 'Expositie Hans Peters icm Ineke Christiaans');
  assert.equal(lijst[0]?.slug, 'expositie-hans-peters-icm-ineke-christiaans');
  assert.equal(lijst[0]?.soort, 'expositie');
  assert.equal(activiteitVanAgendaRij(rij).kunstenaars, 'Hans Peters en Ineke Christiaans');
  assert.equal(blokkeertBeschikbaarheid({ zichtbaarheid: 'publiek' }), true);
  const dagen = huidigeBezetteDagen([
    { startYmd: '2026-11-07', eindYmd: '2026-11-08', zichtbaarheid: 'publiek' },
  ]);
  assert.equal(dagen.has('2026-11-07'), true);
  assert.equal(dagen.has('2026-11-08'), true);
});
