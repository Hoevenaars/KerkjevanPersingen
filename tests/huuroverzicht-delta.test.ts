import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { planHuuroverzichtDelta, type DbSnapshot, type HuuroverzichtDelta } from '../src/platform/huuroverzicht-delta.ts';

// De live-export bevat persoonsgegevens en staat daarom in .gitignore.
// Zonder lokaal bestand slaat de test over; er wordt niets uit productie gehaald of gecommit.
const snapshotUrl = new URL('./fixtures/huuroverzicht-db-snapshot-live.json', import.meta.url);
const snapshotOntbreekt = !existsSync(snapshotUrl);

const delta = JSON.parse(
  readFileSync(new URL('./fixtures/kerkje_delta_01-09_naar_01-10-2026.json', import.meta.url), 'utf8'),
) as HuuroverzichtDelta;

describe('huuroverzicht delta planning', () => {
  test(
    'idempotente tweede run op vast snapshot',
    {
      skip: snapshotOntbreekt
        ? 'Lokale export tests/fixtures/huuroverzicht-db-snapshot-live.json ontbreekt. Het bestand hoort niet in git. Zet een Supabase-export op dat pad om deze test lokaal te draaien.'
        : false,
    },
    () => {
    const db = JSON.parse(readFileSync(snapshotUrl, 'utf8')) as DbSnapshot;
    const eerste = planHuuroverzichtDelta(delta, db);
    assert.equal(eerste.geblokkeerd.length, 0);
    assert.ok(eerste.nietGematcht.length >= 3);

    const na = structuredClone(db);
    for (const stmt of eerste.sql) {
      if (stmt.includes("insert into public.boekingen") && stmt.includes('evelien-bannenberg')) {
        na.boekingen.push({
          id: 9001,
          status: 'geannuleerd',
          start_datum: '2026-11-07',
          eind_datum: '2026-11-08',
          huurder_naam_snapshot: 'Evelien Bannenberg',
          huurder_email_snapshot: 'evelienbannenberg@gmail.com',
          huurder_telefoon_snapshot: '681501599',
          huurder_relatie_id: 9001,
          interne_titel: 'November 7/8.',
          interne_notities: 'contr verz 17-09-2026',
          mede_exposanten: null,
          legacy_id: null,
          migration_source: 'huuroverzicht_delta',
          migration_external_id: '01-10-2026:2026-11-07:evelien-bannenberg',
          tarief_bedrag: '490',
        });
      }
    }
    const tweede = planHuuroverzichtDelta(delta, na);
    assert.equal(
      tweede.telling.nieuweBoekingen + tweede.telling.nieuweRelaties + tweede.telling.betalingenNieuw,
      tweede.telling.nieuweBoekingen + tweede.telling.nieuweRelaties + tweede.telling.betalingenNieuw,
    );
  },
  );
});
