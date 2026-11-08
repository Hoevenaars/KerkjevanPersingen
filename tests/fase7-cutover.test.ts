import assert from 'node:assert/strict';
import test from 'node:test';
import { huidigeContentBron, standaardBronnen } from '../src/platform/bron.ts';
import { getAgendaOverzicht, getActiviteitBySlug, getBezetteData, getEerstvolgendeVrijeWeekenden, getPubliekeAgenda } from '../src/lib/content.ts';
import { valideer } from '../src/lib/validatie.ts';
import { createClient } from '@supabase/supabase-js';
import { STANDAARD_SUPABASE_PUBLISHABLE_KEY, STANDAARD_SUPABASE_URL } from '../src/lib/supabase-project.ts';

test('Supabase is de enige schrijvende bron', () => {
  assert.equal(huidigeContentBron({}), 'supabase');
  const bronnen = standaardBronnen({});
  assert.equal(new Set(Object.values(bronnen)).size, 1);
  assert.equal(bronnen.aanvragen, 'beheer');
  assert.equal(bronnen.vrienden, 'beheer');
});

test('publieke flows lezen Supabase', async () => {
  const agenda = await getPubliekeAgenda(20);
  const overzicht = await getAgendaOverzicht();
  const bezet = await getBezetteData();
  const vrij = await getEerstvolgendeVrijeWeekenden(3);
  const detail = await getActiviteitBySlug(agenda[0]?.slug || 'second-nature');
  assert.ok(Array.isArray(agenda));
  assert.ok(overzicht);
  assert.ok(bezet.length >= 148);
  assert.ok(vrij.length > 0);
  assert.ok(detail === null || typeof detail.slug === 'string');
});

test('aanvraagvalidatie en mailtemplate-lookup blijven op Supabase', async () => {
  const fouten = valideer({
    datum: '',
    datumTot: '',
    soort: '',
    personen: '',
    naam: '',
    email: 'geen-adres',
    adres: '',
    straat: '',
    huisnummer: '',
    toevoeging: '',
    postcode: '',
    woonplaats: '',
    telefoon: '',
    toelichting: '',
    website: '',
    eerderGeexposeerd: '',
    medeExposanten: '',
    akkoordVoorwaarden: '',
    negeerWaarschuwing: '',
  });
  assert.equal(typeof fouten.email, 'string');
  assert.equal(typeof fouten.naam, 'string');
  const client = createClient(STANDAARD_SUPABASE_URL, STANDAARD_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc('huidige_template', { p_sleutel: 'afwijzing' });
  assert.equal(error, null);
  const rij = Array.isArray(data) ? data[0] : data;
  assert.equal(typeof rij?.onderwerp, 'string');
  assert.ok(String(rij.onderwerp).length > 0);
});
