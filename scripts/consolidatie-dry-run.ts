/**
 * Dry-run van het consolidatiepakket. Schrijft niet naar Supabase.
 *
 *   npm run consolidatie:dry-run -- --input /pad/naar/migratiepakket
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { consolidatieDryRun, leesConsolidatiePakket } from '../src/platform/consolidatie-dry-run.ts';

if (process.argv.includes('--schrijf')) {
  console.error('Deze straat heeft geen schrijfmodus.');
  process.exit(1);
}

const index = process.argv.indexOf('--input');
const map = index >= 0 ? process.argv[index + 1] : '';
if (!map) {
  console.error('Geef --input met de map van de CSV-bestanden.');
  process.exit(1);
}

const pakket = leesConsolidatiePakket(map);
const eerste = consolidatieDryRun(pakket);
const tweede = consolidatieDryRun(pakket, eerste.beeld);
eerste.rapport.tweedeRunNieuw = tweede.rapport.relaties.insert
  + tweede.rapport.rollen.insert
  + tweede.rapport.boekingen.insert
  + tweede.rapport.betalingen.insert
  + tweede.rapport.blokkades.insert
  + tweede.rapport.gastbegeleider.dienst
  + tweede.rapport.gastbegeleider.assist
  + tweede.rapport.schemaWacht.length;

const rapport = eerste.rapport;
const regels = [
  'Consolidatie dry-run. Er is niets naar de database geschreven.',
  `Bestaand beeld: ${rapport.bestaandBeeld}. Productie is niet gelezen.`,
  '',
  'Bronrecords:',
  ...rapport.bronrecords.map((rij) => `  ${rij.records}  ${rij.bestand}`),
  '',
  `Relaties  nieuw ${rapport.relaties.nieuw}  match ${rapport.relaties.match}  conflict ${rapport.relaties.conflict}  review ${rapport.relaties.review_blocked}`,
  `Rollen    nieuw ${rapport.rollen.insert}  match ${rapport.rollen.skip + rapport.rollen.update}  conflict ${rapport.rollen.conflict}  review ${rapport.rollen.review_blocked}`,
  `Boekingen nieuw ${rapport.boekingen.nieuw}  match ${rapport.boekingen.match}  conflict ${rapport.boekingen.conflict}  review ${rapport.boekingen.review_blocked}  geannuleerd ${rapport.boekingen.geannuleerd}`,
  `Betalingen importeerbaar ${rapport.betalingen.importeerbaar}  review ${rapport.betalingen.review}  schema ${rapport.betalingen.schema_wacht}`,
  `Gastbegeleiders bron dienst ${rapport.gastbegeleider.bronDienst} / assist ${rapport.gastbegeleider.bronAssist} / x ${rapport.gastbegeleider.bronX}`,
  `  na poort: dienst ${rapport.gastbegeleider.dienst}  assist ${rapport.gastbegeleider.assist}  genegeerde x ${rapport.gastbegeleider.genegeerdeX}  review ${rapport.gastbegeleider.review_blocked}`,
  `Blokkades insert ${rapport.blokkades.insert}  review ${rapport.blokkades.review_blocked}`,
  `Gastheer één-op-één ${rapport.gastheerEenOpEen}; open gelaten ${rapport.gastheerOpenGelaten.join(', ') || 'geen'}`,
  `Conflicten ${rapport.conflicten.length}; duplicaten ${rapport.duplicaten.length}; integriteit ${rapport.integriteit.ok ? 'ok' : rapport.integriteit.fouten.join(' | ')}`,
  `Tweede run nieuwe records: ${rapport.tweedeRunNieuw}`,
  '',
  'Vergelijking (bestaand exact = verrijken + unchanged):',
  ...(['relaties', 'rollen', 'boekingen', 'betalingen', 'blokkades', 'gastbegeleider'] as const).map((sleutel) => {
    const rij = rapport.vergelijking[sleutel];
    return `  ${sleutel}: bron ${rij.bronrecords}  bestaand exact ${rij.bestaandExact}  nieuw ${rij.nieuw}  verrijken ${rij.zouVerrijken}  unchanged ${rij.unchanged}  conflict ${rij.conflict}  review ${rij.reviewBlocked}  orphan ${rij.orphan}  schema ${rij.schemaWacht}  overgeslagen ${rij.bewustOvergeslagen}`;
  }),
  '',
  'High-review:',
  ...rapport.highReview.map((regel) => `  ${regel.entityId} ${regel.field}: ${regel.issue} → ${regel.dispositie}`),
  '',
  'Review:',
  ...rapport.review.map((regel) => `  [${regel.severity}] ${regel.entityType} ${regel.entityId} ${regel.field} → ${regel.dispositie}`),
  '',
  'Schema dat nog nodig is vóór een echte import:',
  ...rapport.schemaWijzigingen.map((wijziging) => `  ${wijziging.id}: ${wijziging.nodigVoor}`),
  '',
  'Niet gemapt:',
  ...rapport.ongemapt.map((regel) => `  ${regel}`),
];

if (rapport.geblokkeerd.length > 0) {
  regels.push('', 'Geblokkeerde records:');
  for (const rij of rapport.geblokkeerd) regels.push(`  ${rij.externalId} ${rij.actie}: ${rij.reden}`);
}
if (rapport.schemaWacht.length > 0) {
  regels.push('', 'Schema-wacht:');
  for (const rij of rapport.schemaWacht) regels.push(`  ${rij.externalId} ${rij.reden}`);
}

const tekst = regels.join('\n');
console.log(tekst);
mkdirSync('/opt/cursor/artifacts', { recursive: true });
writeFileSync('/opt/cursor/artifacts/consolidatie-dry-run.txt', tekst);
writeFileSync('/opt/cursor/artifacts/consolidatie-dry-run.json', JSON.stringify(rapport, null, 2));

if (rapport.tweedeRunNieuw !== 0 || !rapport.integriteit.ok || rapport.duplicaten.length > 0) {
  process.exitCode = 2;
}
