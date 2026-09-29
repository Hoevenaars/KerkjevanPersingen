/**
 * Sanity → Supabase staging.
 *
 *   npm run migratie:staging -- --fixture tests/fixtures/sanity-dump.json
 *   npm run migratie:staging -- --fixture tests/fixtures/sanity-dump.json --schrijf
 *
 * Zonder --schrijf gebeurt er geen database-write.
 * --schrijf weigert productie en weigert wanneer Supabase niet bewust aan staat.
 */

import { readFile } from 'node:fs/promises';
import type { Json } from '../src/lib/database.types.ts';
import { bouwSanityImport, stagingSchrijvenToegestaan } from '../src/platform/sanity-import.ts';
import type { SanityDump } from '../src/platform/migratie-transform.ts';

async function leesDump(): Promise<{ dump: SanityDump; bron: string }> {
  const fixtureIdx = process.argv.indexOf('--fixture');
  if (fixtureIdx >= 0 && process.argv[fixtureIdx + 1]) {
    const pad = process.argv[fixtureIdx + 1];
    return { dump: JSON.parse(await readFile(pad, 'utf8')) as SanityDump, bron: pad };
  }
  const { haalSanityDump, sanityBeheerGeconfigureerd } = await import('../src/lib/sanity-beheer.ts');
  if (!sanityBeheerGeconfigureerd()) {
    throw new Error('Geen SANITY_PROJECT_ID. Gebruik --fixture tests/fixtures/sanity-dump.json');
  }
  return { dump: await haalSanityDump(), bron: 'Sanity (alleen lezen)' };
}

const schrijven = process.argv.includes('--schrijf');
const { dump, bron } = await leesDump();
const plan = bouwSanityImport(dump);

console.log(`Bron: ${bron}`);
console.log(`Modus: ${schrijven ? 'staging-schrijven' : 'dry-run'}`);
console.log(JSON.stringify(plan.telling, null, 2));
for (const issue of plan.issues) {
  console.log(`  [${issue.ernst}] ${issue.legacyId}: ${issue.detail}`);
}

if (!schrijven) {
  console.log('Geen writes.');
  process.exit(0);
}

const poort = stagingSchrijvenToegestaan(process.env);
if (!poort.ok) {
  console.error(poort.reden);
  process.exit(1);
}

const { maakBeheerAdminClient } = await import('../src/lib/supabase.ts');
const client = maakBeheerAdminClient(process.env);
if (!client) {
  console.error('Supabase service-role ontbreekt. Er is niets geschreven.');
  process.exit(1);
}

const { data, error } = await client.rpc('importeer_sanity_batch', { p_batch: plan.batch as unknown as Json });
if (error) {
  console.error(error.message);
  process.exit(1);
}
console.log('Staging-import:');
console.log(JSON.stringify(data, null, 2));
