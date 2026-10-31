/**
 * Historische huuroverzichten 2026–2029.
 *
 *   npm run import:historical-rentals -- --dry-run --file bron.json --snapshot db.json
 *   npm run import:historical-rentals -- --apply --file bron.json --snapshot db.json
 *
 * Zonder --apply wordt niets geschreven. --apply voert het plan uit wanneer
 * DATABASE_URL gezet is (psql). Het SQL-bestand wordt altijd weggeschreven.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  controleerBron,
  formatConflictenCsv,
  formatRapport,
  planHistorischeHuur,
  sqlIsVeilig,
  type BronBestand,
  type HistorischeDb,
} from '../src/platform/historische-huur-import.ts';

function arg(naam: string): string {
  const index = process.argv.indexOf(naam);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : '';
}

function tekst(waarde: unknown): string {
  return waarde == null ? '' : String(waarde).trim();
}

export function normaliseerDb(ruw: unknown): HistorischeDb {
  const bron = ruw as Record<string, unknown>;
  const lijst = (sleutel: string) => (Array.isArray(bron[sleutel]) ? bron[sleutel] as Record<string, unknown>[] : []);
  return {
    boekingen: lijst('boekingen').map((rij) => ({
      id: Number(rij.id),
      status: tekst(rij.status),
      start_datum: tekst(rij.start_datum ?? rij.start).slice(0, 10),
      eind_datum: tekst(rij.eind_datum ?? rij.eind).slice(0, 10),
      interne_titel: tekst(rij.interne_titel ?? rij.titel),
      huurder_naam_snapshot: tekst(rij.huurder_naam_snapshot ?? rij.naam) || null,
      huurder_email_snapshot: tekst(rij.huurder_email_snapshot ?? rij.email) || null,
      huurder_telefoon_snapshot: tekst(rij.huurder_telefoon_snapshot ?? rij.tel) || null,
      huurder_relatie_id: rij.huurder_relatie_id == null && rij.relatie == null ? null : Number(rij.huurder_relatie_id ?? rij.relatie),
      interne_notities: tekst(rij.interne_notities ?? rij.notities) || null,
      mede_exposanten: tekst(rij.mede_exposanten ?? rij.mede) || null,
      tarief_bedrag: (rij.tarief_bedrag ?? rij.bedrag ?? null) as string | number | null,
      tarief_prijstype: tekst(rij.tarief_prijstype) || null,
      aanbetaling_bedrag: (rij.aanbetaling_bedrag ?? rij.aanbetaling ?? null) as string | number | null,
      verhuurtype_sleutel: tekst(rij.verhuurtype_sleutel ?? rij.type) || null,
      migration_source: tekst(rij.migration_source ?? rij.ms) || null,
      migration_external_id: tekst(rij.migration_external_id ?? rij.me) || null,
      nummer: tekst(rij.nummer) || null,
    })),
    relaties: lijst('relaties').map((rij) => ({
      id: Number(rij.id),
      naam: tekst(rij.naam),
      email: tekst(rij.email) || null,
      telefoon: tekst(rij.telefoon ?? rij.tel) || null,
      organisatie: tekst(rij.organisatie ?? rij.org) || null,
      notities: tekst(rij.notities) || null,
      migration_source: tekst(rij.migration_source ?? rij.ms) || null,
      migration_external_id: tekst(rij.migration_external_id ?? rij.me) || null,
    })),
    betalingen: lijst('betalingen').map((rij) => ({
      id: Number(rij.id),
      boeking_id: Number(rij.boeking_id),
      soort: tekst(rij.soort),
      bedrag: (rij.bedrag ?? 0) as string | number,
      status: tekst(rij.status),
      vervaldatum: tekst(rij.vervaldatum ?? rij.verval).slice(0, 10) || null,
      ontvangen_op: tekst(rij.ontvangen_op ?? rij.ontvangen) || null,
      referentie: tekst(rij.referentie ?? rij.ref) || null,
      migration_source: tekst(rij.migration_source ?? rij.ms) || null,
      migration_external_id: tekst(rij.migration_external_id ?? rij.me) || null,
    })),
    blokkades: lijst('blokkades').map((rij) => ({
      id: Number(rij.id),
      titel: tekst(rij.titel),
      start_datum: tekst(rij.start_datum ?? rij.start).slice(0, 10),
      eind_datum: tekst(rij.eind_datum ?? rij.eind).slice(0, 10),
      blokkeert_verhuurkalender: Boolean(rij.blokkeert_verhuurkalender ?? rij.blok),
      notities: tekst(rij.notities) || null,
      migration_source: tekst(rij.migration_source ?? rij.ms) || null,
      migration_external_id: tekst(rij.migration_external_id ?? rij.me) || null,
    })),
    bronregels: lijst('bronregels').map((rij) => ({
      source_fingerprint: tekst(rij.source_fingerprint),
      doel_tabel: tekst(rij.doel_tabel) || null,
      doel_id: rij.doel_id == null ? null : Number(rij.doel_id),
      uitkomst: tekst(rij.uitkomst),
    })),
  };
}

function main() {
  const apply = process.argv.includes('--apply');
  const dry = process.argv.includes('--dry-run') || !apply;
  if (apply && process.argv.includes('--dry-run')) {
    console.error('Kies één modus: --dry-run of --apply.');
    process.exit(1);
  }
  const bestandPad = arg('--file');
  const snapshotPad = arg('--snapshot');
  if (!bestandPad || !snapshotPad) {
    console.error('Gebruik: npm run import:historical-rentals -- --dry-run --file <json> --snapshot <db.json>');
    process.exit(1);
  }
  const bestand = JSON.parse(readFileSync(bestandPad, 'utf8')) as BronBestand;
  const fouten = controleerBron(bestand);
  if (fouten.length) {
    console.error('Bronbestand wijkt af van de sanity-check:');
    for (const fout of fouten) console.error(`- ${fout}`);
    process.exit(1);
  }
  const db = normaliseerDb(JSON.parse(readFileSync(snapshotPad, 'utf8')));
  const plan = planHistorischeHuur(bestand, db);
  const onveilig = sqlIsVeilig(plan.sql);
  const rapport = formatRapport(plan);
  console.log(rapport);
  const map = '/opt/cursor/artifacts';
  mkdirSync(map, { recursive: true });
  writeFileSync(`${map}/historische-huur-rapport.txt`, rapport);
  writeFileSync(`${map}/historische-huur-rapport.json`, JSON.stringify({
    perJaar: plan.perJaar,
    veiligheid: plan.veiligheid,
    regels: plan.regels.map(({ record: _record, ...regel }) => regel),
  }, null, 2));
  writeFileSync(`${map}/historische-huur-conflicten.csv`, formatConflictenCsv(plan));
  writeFileSync(`${map}/historische-huur-apply.sql`, plan.sql.join('\n\n'));
  if (onveilig.length) {
    console.error(`SQL geweigerd: ${onveilig.join(', ')}`);
    process.exit(1);
  }
  if (dry) {
    console.log('\nDry-run. Er is niets naar de database geschreven.');
    process.exit(0);
  }
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!databaseUrl) {
    console.error('Apply gevraagd, maar DATABASE_URL ontbreekt. SQL staat in /opt/cursor/artifacts/historische-huur-apply.sql');
    process.exit(2);
  }
  const resultaat = spawnSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', `${map}/historische-huur-apply.sql`], { stdio: 'inherit' });
  process.exit(resultaat.status ?? 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
