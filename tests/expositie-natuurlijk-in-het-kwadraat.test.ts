import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activiteitVanAgendaRij, type AgendaRij } from '../src/lib/publiek-lezen.ts';
import { detailTekst, kaartTekst, teaserTekst } from '../src/lib/activiteit-content.ts';
import { toonFotoInHetGeheel } from '../src/lib/publicatie-foto.ts';
import { natuurlijkFlyer } from '../src/lib/natuurlijk-in-het-kwadraat.ts';

const sql = readFileSync(
  new URL('../supabase/migrations/20261110190000_expositie_natuurlijk_in_het_kwadraat.sql', import.meta.url),
  'utf8',
);

const KORT = 'Marjon Meulenbrugge en Petra Crielaard laten hun nieuwste werk zien: natuurlijke objecten en kleurrijke, sprookjesachtige schilderijen.';
const PRAKTISCH = 'Te bezoeken op zaterdag en zondag, van 11.00 tot 17.00 uur. Toegang is gratis.';
const FLYER = '/foto/exposities/natuurlijk-in-het-kwadraat-flyer.jpg';

test('de aangeleverde gegevens staan in het veld dat de site toont', () => {
  assert.match(sql, /titel = 'Natuurlijk in het kwadraat'/);
  assert.match(sql, /Marjon Meulenbrugge\nPetra Crielaard/);
  assert.match(sql, /korte_omschrijving = \$kort\$/);
  assert.match(sql, /omschrijving = \$kort\$/);
  assert.match(sql, /volledige_omschrijving = \$volledig\$/);
  assert.match(sql, /www\.floremetart\.nl/);
  assert.match(sql, /www\.petracrielaard-lohuis\.nl/);
  assert.match(sql, /Huis Kernhem te Ede/);
  assert.match(sql, /Kunstcollectief Gelderse Poort/);
  assert.match(sql, /Vlinder en Hert helpen Ridder Remco/);
  assert.match(sql, /praktische_informatie = 'Te bezoeken op zaterdag en zondag, van 11\.00 tot 17\.00 uur\. Toegang is gratis\.'/);
  assert.match(sql, /foto_alt = 'Flyer van de expositie Natuurlijk in het kwadraat/);
  assert.equal(sql.includes('foto_pad ='), false);
  assert.match(sql, /slug = 'petra-crielaard-en-marjon-meulenbrugge'/);
  assert.match(sql, /date '2026-11-14'/);
  assert.match(sql, /date '2026-11-15'/);
  assert.match(sql, /mede_exposanten = 'Marjon Meulenbrugge'/);
  assert.match(sql, /MarjonMeulenbrugge/);
  assert.equal(sql.includes("titel = 'Expositie: Petra Crielaard en Marjon Meulenbrugge'"), false);
});

test('titel, kunstenaars, korte tekst, volledige tekst en flyer komen op de juiste plek', () => {
  const rij: AgendaRij = {
    id: 15,
    slug: 'petra-crielaard-en-marjon-meulenbrugge',
    titel: 'Natuurlijk in het kwadraat',
    start_datum: '2026-11-14',
    eind_datum: '2026-11-15',
    omschrijving: KORT,
    foto_pad: FLYER,
    foto_alt: 'Flyer van de expositie Natuurlijk in het kwadraat',
    publicatie_trigger: 'direct',
    zichtbaarheid: 'publiek',
    inhoud_status: 'goedgekeurd',
    soort: 'expositie',
    korte_omschrijving: KORT,
    volledige_omschrijving: 'Marjon maakt 2D- en 3D-objecten met de natuur.\n\nKom kijken, laat je inspireren en beleef kunst die groeit, ademt en raakt.',
    exposanten: 'Marjon Meulenbrugge\nPetra Crielaard',
    praktische_informatie: PRAKTISCH,
  };
  const activiteit = activiteitVanAgendaRij(rij);
  assert.equal(activiteit.publiekeTitel, 'Expositie: Natuurlijk in het kwadraat');
  assert.equal(activiteit.kunstenaars, 'Marjon Meulenbrugge, Petra Crielaard');
  assert.equal(activiteit.praktischeInformatie, PRAKTISCH);
  assert.equal(kaartTekst(activiteit).tekst, KORT);
  assert.equal(kaartTekst(activiteit).letterlijk, true);
  assert.equal(teaserTekst(activiteit), KORT);
  assert.match(detailTekst(activiteit) ?? '', /2D- en 3D-objecten/);
  assert.match(detailTekst(activiteit) ?? '', /groeit, ademt en raakt/);
  assert.equal(detailTekst(activiteit)?.includes(KORT), false);
  assert.equal(toonFotoInHetGeheel(activiteit.foto), true);
  assert.equal(natuurlijkFlyer(activiteit), null);
  assert.equal(natuurlijkFlyer({ slug: activiteit.slug, foto: undefined }), FLYER);
  assert.equal(KORT.length <= 160, true);
});

test('een sfeerfoto blijft bijgesneden en de homepage leest de korte tekst', () => {
  assert.equal(toonFotoInHetGeheel('/foto/kerkje-standaard.svg'), false);
  assert.equal(toonFotoInHetGeheel(FLYER), true);
  const home = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
  assert.match(home, /teaserTekst/);
  assert.equal(home.includes('vandaag.omschrijving'), false);
  const detail = readFileSync(new URL('../src/pages/agenda/[slug].astro', import.meta.url), 'utf8');
  assert.match(detail, /korteOmschrijving\?\.trim\(\)/);
});
