/**
 * Dry-run / toepassing huuroverzicht-delta op Supabase.
 *
 *   node --experimental-strip-types scripts/huuroverzicht-delta-migratie.ts --delta tests/fixtures/kerkje_delta_01-09_naar_01-10-2026.json --snapshot /pad/db-snapshot.json
 *   node --experimental-strip-types scripts/huuroverzicht-delta-migratie.ts --delta ... --snapshot ... --schrijf
 *
 * Met --schrijf: voert plan.sql uit via Supabase service-role (SUPABASE_SERVICE_ROLE_KEY).
 * Zonder snapshot: alleen delta inlezen en tonen dat snapshot ontbreekt.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  formatDryRun,
  planHuuroverzichtDelta,
  type DbSnapshot,
  type HuuroverzichtDelta,
} from '../src/platform/huuroverzicht-delta.ts';

function arg(naam: string): string {
  const i = process.argv.indexOf(naam);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : '';
}

const deltaPad = arg('--delta');
const snapshotPad = arg('--snapshot');
const schrijven = process.argv.includes('--schrijf');

if (!deltaPad) {
  console.error('Geef --delta <json>');
  process.exit(1);
}

const delta = JSON.parse(readFileSync(deltaPad, 'utf8')) as HuuroverzichtDelta;

if (!snapshotPad) {
  console.error('Geef --snapshot <json> (export uit Supabase).');
  process.exit(1);
}

const db = JSON.parse(readFileSync(snapshotPad, 'utf8')) as DbSnapshot;
const plan = planHuuroverzichtDelta(delta, db);
const tekst = formatDryRun(plan);

console.log(tekst);
mkdirSync('/opt/cursor/artifacts', { recursive: true });
writeFileSync('/opt/cursor/artifacts/huuroverzicht-delta-dry-run.txt', tekst);
writeFileSync('/opt/cursor/artifacts/huuroverzicht-delta-plan.json', JSON.stringify(plan, null, 2));
writeFileSync('/opt/cursor/artifacts/huuroverzicht-delta-apply.sql', plan.sql.join('\n'));

if (plan.geblokkeerd.length > 0) {
  console.error('\nMigratie geblokkeerd: niet-unieke matches.');
  process.exit(2);
}

if (!schrijven) {
  console.log('\nDry-run alleen. Geen database-wijzigingen.');
  console.log('SQL staat in /opt/cursor/artifacts/huuroverzicht-delta-apply.sql');
  process.exit(0);
}

console.error('Gebruik Supabase MCP execute_sql met huuroverzicht-delta-apply.sql (--schrijf is bewust niet direct gekoppeld).');
process.exit(1);
