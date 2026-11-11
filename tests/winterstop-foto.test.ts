import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { kiesActiviteitenVoorMail } from '../src/lib/nieuwsbrief-agenda.ts';
import type { Activiteit } from '../src/lib/content.ts';
import { WINTERSTOP_FOTO, WINTERSTOP_FOTO_ABSOLUUT, WINTERSTOP_FOTO_ALT, WINTERSTOP_TITEL } from '../src/lib/winterstop.ts';

const sql = readFileSync(
  new URL('../supabase/migrations/20261111220000_winterstop_foto.sql', import.meta.url),
  'utf8',
);

test('de winterstopfoto staat in de site en in de agenda-functie', () => {
  assert.equal(WINTERSTOP_FOTO, '/foto/winterstop.jpg');
  assert.equal(existsSync(new URL('../public/foto/winterstop.jpg', import.meta.url)), true);
  const functie = sql.slice(sql.indexOf('function public.publieke_agenda'));
  assert.match(functie, /\/foto\/winterstop\.jpg/);
  assert.match(functie, /in de sneeuw, met de vlag in top/);
  assert.equal(functie.includes('nieuwe-vlag'), false);
  const agenda = readFileSync(new URL('../src/pages/agenda/index.astro', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
  assert.match(agenda, /WINTERSTOP_FOTO/);
  assert.equal(agenda.includes('nieuwe-vlag'), false);
  assert.match(home, /isWinterstop\(item\?\.soort\)\) return WINTERSTOP_FOTO/);
  assert.match(home, /src="\/foto\/nieuwe-vlag\.jpg"/);
});

test('agenda, homepage en nieuwsbrief gebruiken de sneeuwfoto, niet de oude vlagfoto', () => {
  const winterstop: Activiteit = {
    _id: 'winter',
    slug: '',
    interneTitel: 'Winterstop',
    publiekeTitel: 'Winterstop',
    start: '2026-12-19T12:00:00+01:00',
    eind: '2027-02-14T12:00:00+01:00',
    soort: 'winterstop',
    zichtbaarheid: 'publiek',
    foto: '/foto/nieuwe-vlag.jpg',
    fotoAlt: 'Het kerkje van Persingen',
  };
  const blokken = kiesActiviteitenVoorMail(
    [],
    { vandaag: null, volgende: winterstop, daarna: null },
    'wekelijks',
    new Date('2026-11-11T12:00:00Z'),
  );
  assert.equal(blokken.length, 1);
  assert.equal(blokken[0]?.titel, WINTERSTOP_TITEL);
  assert.equal(blokken[0]?.fotoUrl, WINTERSTOP_FOTO_ABSOLUUT);
  assert.equal(blokken[0]?.fotoAlt, WINTERSTOP_FOTO_ALT);
  assert.equal(blokken[0]?.fotoUrl.includes('nieuwe-vlag'), false);
});
