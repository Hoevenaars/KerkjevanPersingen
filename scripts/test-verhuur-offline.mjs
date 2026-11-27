#!/usr/bin/env node
/** Expliciete lokale suite; geen productievariabelen, live integraties of SQL-reset. */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const wortel = fileURLToPath(new URL('../', import.meta.url));
const standaard = [
  'tests/boeking-annuleren.test.ts',
  'tests/contract-tekenen-betrouwbaarheid.test.ts',
  'tests/ondertekenbevestiging.test.ts',
  'tests/herstel-ondertekenbevestiging.test.ts',
  'tests/verhuur-beoordeling.test.ts',
  'tests/verhuur-beslismail.test.ts',
  'tests/verhuur-besluit-keten.test.ts',
  'tests/verhuur-financieel-machine.test.ts',
  'tests/verhuur-concept-en-promotie.test.ts',
  'tests/verhuur-opvolging.test.ts',
  'tests/verhuur-machine-ui.test.ts',
  'tests/kerkje-mail.test.ts',
  'tests/onveranderlijke-pdf-opslag.test.ts',
];
const gevraagd = process.argv.slice(2);
const bestanden = gevraagd.length ? gevraagd : standaard;
if (!bestanden.every((p) => /^tests\/[a-z0-9-]+\.test\.ts$/.test(p) && existsSync(new URL(`../${p}`, import.meta.url)))) {
  console.error('Geef alleen bestaande tests/<naam>.test.ts-bestanden mee.');
  process.exit(2);
}
const preload = fileURLToPath(new URL('./test-netwerk-uit.mjs', import.meta.url));
const kind = spawn(process.execPath, ['--experimental-strip-types', '--test', '--test-skip-pattern=sql-migraties en mutatie-rpc', ...bestanden], {
  cwd: wortel,
  env: { PATH: process.env.PATH ?? '', NODE_ENV: 'test', TZ: 'Europe/Amsterdam', NODE_OPTIONS: `--import=${JSON.stringify(preload)}` },
  stdio: 'inherit',
});
kind.once('error', () => { console.error('Lokale tests konden niet worden gestart.'); process.exit(1); });
kind.once('exit', (code) => process.exit(code ?? 1));
