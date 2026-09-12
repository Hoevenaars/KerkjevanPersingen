/**
 * Dry-run van de Sanity → beheer mapping. Schrijft niets.
 *
 *   npm run migratie:dry-run
 *   npm run migratie:dry-run -- --fixture tests/fixtures/sanity-dump.json
 */

import { readFile } from 'node:fs/promises';
import { transformSanityDump, type SanityDump } from '../src/platform/migratie-transform.ts';

async function leesDump(): Promise<{ dump: SanityDump; bron: string }> {
  const fixtureIdx = process.argv.indexOf('--fixture');
  if (fixtureIdx >= 0 && process.argv[fixtureIdx + 1]) {
    const pad = process.argv[fixtureIdx + 1];
    const raw = JSON.parse(await readFile(pad, 'utf8')) as SanityDump;
    return { dump: raw, bron: pad };
  }

  const { haalSanityDump, sanityBeheerGeconfigureerd } = await import('../src/lib/sanity-beheer.ts');
  if (!sanityBeheerGeconfigureerd()) {
    throw new Error(
      'Geen SANITY_PROJECT_ID. Zet .env of gebruik --fixture tests/fixtures/sanity-dump.json',
    );
  }
  return { dump: await haalSanityDump(), bron: 'Sanity (live, alleen lezen)' };
}

const { dump, bron } = await leesDump();
const resultaat = transformSanityDump(dump);

console.log(`Bron: ${bron}`);
console.log('');
console.log('Controlelijst');
console.log('-------------');
for (const rij of resultaat.controles) {
  const mark = rij.sanity === rij.nieuw ? 'ok' : '≠';
  console.log(`  [${mark}] ${rij.label}: Sanity ${rij.sanity} → nieuw ${rij.nieuw}`);
  if (rij.toelichting) console.log(`       ${rij.toelichting}`);
}
console.log('');
console.log(`Bezette dagen huidig ${resultaat.bezetteDagenHuidig} / nieuw ${resultaat.bezetteDagenNieuw}`);
console.log(`Issues: ${resultaat.issues.filter((i) => i.ernst === 'fout').length} fout, ${resultaat.issues.filter((i) => i.ernst === 'letop').length} let op`);
for (const issue of resultaat.issues.filter((i) => i.ernst === 'fout')) {
  console.log(`  ! ${issue.titel}: ${issue.detail}`);
}
