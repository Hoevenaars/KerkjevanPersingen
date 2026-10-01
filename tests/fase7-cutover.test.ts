import assert from 'node:assert/strict';
import test from 'node:test';
import { huidigeContentBron, standaardBronnen } from '../src/platform/bron.ts';
import { leesSanityOproepen, metSanityRegistratie } from '../src/platform/sanity-registratie.ts';
import { getAgendaOverzicht, getActiviteitBySlug, getBezetteData, getEerstvolgendeVrijeWeekenden, getPubliekeAgenda } from '../src/lib/sanity.ts';
import {
  bewaarAanvraag,
  deactiveerVriend,
  getActieveVrienden,
  getExtraOntvangstAdres,
  getHuurderEmail,
  getNieuwsbriefVoorWeek,
  getOntvangstAdres,
  getVriendByToken,
  getVriendenVoorVerzending,
  maakOfUpdateNieuwsbriefStatus,
  maakVriendAan,
  markeerNieuwsbriefVerstuurd,
  updateVriendFrequentie,
} from '../src/lib/sanity.ts';
import { haalSanityDump } from '../src/lib/sanity-beheer.ts';
import { valideer } from '../src/lib/validatie.ts';
import { createClient } from '@supabase/supabase-js';
import { STANDAARD_SUPABASE_PUBLISHABLE_KEY, STANDAARD_SUPABASE_URL } from '../src/lib/supabase-project.ts';

const cutover = { CONTENT_BRON: 'supabase', ALLOW_SUPABASE_CONTENT: 'true', BEHEER_LIVE_SANITY: 'false' };

test('cutovervlaggen maken Supabase de schrijvende bron', () => {
  assert.equal(huidigeContentBron(cutover), 'supabase');
  const bronnen = standaardBronnen(cutover);
  assert.equal(new Set(Object.values(bronnen)).size, 1);
  assert.equal(bronnen.aanvragen, 'beheer');
  assert.equal(bronnen.vrienden, 'beheer');
  assert.equal(huidigeContentBron({}), 'sanity');
  assert.equal(standaardBronnen({}).aanvragen, 'sanity');
});

test('publieke flows raken Sanity niet', async () => {
  const vorigeBron = process.env.CONTENT_BRON;
  const vorigeAllow = process.env.ALLOW_SUPABASE_CONTENT;
  process.env.CONTENT_BRON = 'supabase';
  process.env.ALLOW_SUPABASE_CONTENT = 'true';
  try {
    const oproepen = await metSanityRegistratie(async () => {
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
      return leesSanityOproepen();
    });
    assert.equal(oproepen.length, 0);
  } finally {
    if (vorigeBron === undefined) delete process.env.CONTENT_BRON;
    else process.env.CONTENT_BRON = vorigeBron;
    if (vorigeAllow === undefined) delete process.env.ALLOW_SUPABASE_CONTENT;
    else process.env.ALLOW_SUPABASE_CONTENT = vorigeAllow;
  }
});

test('de 14 Sanity-functies voeren geen request uit na cutover', async () => {
  const vorigeBron = process.env.CONTENT_BRON;
  const vorigeAllow = process.env.ALLOW_SUPABASE_CONTENT;
  process.env.CONTENT_BRON = 'supabase';
  process.env.ALLOW_SUPABASE_CONTENT = 'true';
  const aanroepen = [
    () => maakVriendAan({ naam: 'Test', email: 'test@example.invalid' }),
    () => getActieveVrienden(),
    () => getVriendenVoorVerzending(new Date()),
    () => getVriendByToken('geen'),
    () => deactiveerVriend('id'),
    () => updateVriendFrequentie('id', 'wekelijks'),
    () => getHuurderEmail('id'),
    () => getNieuwsbriefVoorWeek(new Date()),
    () => markeerNieuwsbriefVerstuurd('id'),
    () => maakOfUpdateNieuwsbriefStatus(new Date()),
    () => bewaarAanvraag({} as never),
    () => getOntvangstAdres(),
    () => getExtraOntvangstAdres(),
    () => haalSanityDump(),
  ];
  try {
    const oproepen = await metSanityRegistratie(async () => {
      for (const aanroep of aanroepen) {
        await assert.rejects(aanroep, /geen runtimebron/);
      }
      return leesSanityOproepen();
    });
    assert.equal(oproepen.length, 0);
    assert.equal(aanroepen.length, 14);
  } finally {
    if (vorigeBron === undefined) delete process.env.CONTENT_BRON;
    else process.env.CONTENT_BRON = vorigeBron;
    if (vorigeAllow === undefined) delete process.env.ALLOW_SUPABASE_CONTENT;
    else process.env.ALLOW_SUPABASE_CONTENT = vorigeAllow;
  }
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
