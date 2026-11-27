#!/usr/bin/env node
// Werkt uitsluitend op een expliciet benoemde lokale testdatabase. Geen schemareset.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const waarde = process.env.KVP_SQL_TEST_DATABASE_URL;
if (!waarde) {
  console.error('Stel KVP_SQL_TEST_DATABASE_URL in op postgresql://gebruiker@127.0.0.1/kerkje_test_<naam>. Eerst alle migraties lokaal toepassen.');
  process.exit(2);
}
let url;
try { url = new URL(waarde); } catch { console.error('Ongeldige lokale testdatabase-URL.'); process.exit(2); }
const database = decodeURIComponent(url.pathname.slice(1));
if (!['postgresql:', 'postgres:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/^kerkje_test_[a-z0-9_]+$/.test(database) || url.search || url.hash) {
  console.error('Geweigerd: uitsluitend localhost/127.0.0.1/::1 en database kerkje_test_<naam> zijn toegestaan.');
  process.exit(2);
}
const env = {
  PATH: process.env.PATH ?? '', PGHOST: url.hostname.replace(/^\[|\]$/g, ''), PGPORT: url.port || '5432',
  PGDATABASE: database, PGUSER: decodeURIComponent(url.username) || 'postgres',
  PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: 'disable', PGAPPNAME: 'kerkje-lokale-ketentest',
};
const uit = spawnSync('psql', ['-X', '--no-password', '--set', 'ON_ERROR_STOP=1', '--file',
  fileURLToPath(new URL('./verhuur-ondertekenen.sql', import.meta.url))], { env, stdio: 'inherit' });
if (uit.error?.code === 'ENOENT') {
  console.error('SQL-test niet uitgevoerd: lokale psql/PostgreSQL ontbreekt.');
  process.exit(77);
}
if (uit.error) { console.error('De lokale SQL-run kon niet worden gestart.'); process.exit(1); }
process.exit(uit.status ?? 1);
