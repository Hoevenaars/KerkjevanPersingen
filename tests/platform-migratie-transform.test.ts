import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isoNaarYmd, transformSanityDump, type SanityDump } from '../src/platform/migratie-transform.ts';
import { magLiveSanityLezen } from '../src/platform/beheer-bron.ts';
import {
  beheerAuthOk,
  beheerHeeftWachtwoord,
  beheerWachtwoord,
} from '../src/platform/beheer-gate.ts';

const fixture = JSON.parse(
  await readFile(new URL('./fixtures/sanity-dump.json', import.meta.url), 'utf8'),
) as SanityDump;

describe('Sanity-dump transformeert naar beheerrecords', () => {
  const uit = transformSanityDump(fixture, new Date('2026-09-10T12:00:00+02:00'));

  test('aanvraag ja/nee en nieuw', () => {
    assert.equal(uit.aanvragen.find((a) => a.id === 'aanvraag-jansen')?.status, 'nieuw');
    assert.equal(uit.aanvragen.find((a) => a.id === 'aanvraag-zonder-mail')?.status, 'goedgekeurd');
  });

  test('activiteit splitst in boeking, publieke agenda en interne blokkade', () => {
    assert.equal(uit.boekingen.length, 3);
    assert.equal(uit.intern.length, 1);
    assert.equal(uit.intern[0]?.titel, 'Kerstsluiting');
    assert.equal(uit.intern[0]?.blokkeert, true);
    assert.ok(uit.agenda.some((a) => a.slug === 'second-nature' && a.status === 'online'));
  });

  test('vastgelegd wordt migratie_vastgelegd', () => {
    const second = uit.boekingen.find((b) => b.id === 'act-second-nature');
    assert.equal(second?.status, 'migratie_vastgelegd');
    assert.equal(second?.publiek, true);
  });

  test('optie blijft optie en verborgen', () => {
    const optie = uit.boekingen.find((b) => b.id === 'act-optie');
    assert.equal(optie?.status, 'optie');
    assert.equal(optie?.zichtbaarheid, 'verborgen');
  });

  test('gastheer-rol uit personen', () => {
    assert.ok(uit.gastheren.some((g) => g.naam === 'Henk Vos'));
  });

  test('vrienden actief/inactief', () => {
    assert.equal(uit.vrienden.filter((v) => v.actief).length, 1);
    assert.equal(uit.vrienden.filter((v) => !v.actief).length, 1);
  });

  test('toekomstige activiteiten tellen gelijk na split', () => {
    const rij = uit.controles.find((c) => c.label === 'Toekomstige activiteiten');
    assert.equal(rij?.sanity, rij?.nieuw);
  });

  test('controlelijst vult FO-tellingen', () => {
    const labels = uit.controles.map((c) => c.label);
    assert.ok(labels.includes('Aanvragen'));
    assert.ok(labels.includes('Actieve vrienden'));
    const aanvragen = uit.controles.find((c) => c.label === 'Aanvragen');
    assert.equal(aanvragen?.sanity, 2);
    assert.equal(aanvragen?.nieuw, 2);
  });

  test('issues voor ontbrekende mail, start en token', () => {
    assert.ok(uit.issues.some((i) => i.legacyId === 'aanvraag-zonder-mail' && i.ernst === 'fout'));
    assert.ok(uit.issues.some((i) => i.legacyId === 'act-zonder-start' && i.ernst === 'fout'));
    assert.ok(uit.issues.some((i) => i.legacyId === 'vriend-stil' && i.detail.includes('uitschrijftoken')));
  });

  test('nieuwe bezettingsregel telt minder dagen dan de huidige', () => {
    assert.ok(uit.bezetteDagenHuidig >= uit.bezetteDagenNieuw);
    assert.ok(uit.bezetteDagenHuidig > 0);
  });

  test('isoNaarYmd houdt Amsterdamse kalenderdag', () => {
    assert.equal(isoNaarYmd('2026-10-03T07:00:00.000Z'), '2026-10-03');
    assert.equal(isoNaarYmd('2026-11-07'), '2026-11-07');
  });
});

describe('live Sanity in /beheer is achter een wachtwoord gezet', () => {
  test('zonder project of wachtwoord blijft demo', () => {
    assert.equal(magLiveSanityLezen({}), false);
    assert.equal(magLiveSanityLezen({ SANITY_PROJECT_ID: 'abc' }), false);
  });

  test('met project én SITE_PASSWORD mag live', () => {
    assert.equal(magLiveSanityLezen({ SANITY_PROJECT_ID: 'abc', SITE_PASSWORD: 'geheim' }), true);
  });

  test('BEHEER_LIVE_SANITY=false forceert demo', () => {
    assert.equal(
      magLiveSanityLezen({ SANITY_PROJECT_ID: 'abc', SITE_PASSWORD: 'geheim', BEHEER_LIVE_SANITY: 'false' }),
      false,
    );
  });

  test('zonder wachtwoord is /beheer dicht (fail-closed)', () => {
    assert.equal(beheerHeeftWachtwoord({}), false);
    assert.equal(beheerAuthOk(null, {}), false);
    assert.equal(beheerAuthOk('x', {}), false);
    assert.equal(beheerAuthOk('Basic ' + Buffer.from('kerkje:').toString('base64'), {}), false);
  });

  test('SITE_PASSWORD sluit /beheer ook als de site live is', () => {
    const header = 'Basic ' + Buffer.from('kerkje:site').toString('base64');
    assert.equal(beheerHeeftWachtwoord({ SITE_PASSWORD: 'site' }), true);
    assert.equal(beheerAuthOk(null, { SITE_PASSWORD: 'site' }), false);
    assert.equal(beheerAuthOk(header, { SITE_PASSWORD: 'site' }), true);
    assert.equal(beheerAuthOk(header, { SITE_PASSWORD: 'ander' }), false);
  });

  test('BEHEER_PASSWORD gaat voor SITE_PASSWORD', () => {
    assert.equal(beheerHeeftWachtwoord({ BEHEER_PASSWORD: 'beheer' }), true);
    assert.equal(beheerWachtwoord({ BEHEER_PASSWORD: 'beheer', SITE_PASSWORD: 'site' }), 'beheer');
    assert.equal(beheerAuthOk(null, { BEHEER_PASSWORD: 'beheer' }), false);
    const beheer = 'Basic ' + Buffer.from('kerkje:beheer').toString('base64');
    const site = 'Basic ' + Buffer.from('kerkje:site').toString('base64');
    assert.equal(beheerAuthOk(beheer, { BEHEER_PASSWORD: 'beheer', SITE_PASSWORD: 'site' }), true);
    assert.equal(beheerAuthOk(site, { BEHEER_PASSWORD: 'beheer', SITE_PASSWORD: 'site' }), false);
  });
});
