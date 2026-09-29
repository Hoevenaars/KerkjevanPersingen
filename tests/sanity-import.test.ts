import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { bouwSanityImport, stagingSchrijvenToegestaan } from '../src/platform/sanity-import.ts';
import type { SanityDump } from '../src/platform/migratie-transform.ts';

test('Sanity-import plant publicatie, slaat onvolledige rijen over en dupliceert niet in de payload', async () => {
  const dump = JSON.parse(await readFile(new URL('./fixtures/sanity-dump.json', import.meta.url), 'utf8')) as SanityDump;
  const plan = bouwSanityImport(dump);
  assert.equal(plan.telling.aanvragen, 1);
  assert.equal(plan.telling.boekingen, 2);
  assert.equal(plan.telling.publiek, 1);
  assert.equal(plan.telling.intern, 1);
  assert.equal(plan.telling.fouten >= 1, true);
  const online = plan.batch.publiek[0];
  assert.equal(online.gepubliceerd, true);
  assert.equal(online.inhoud_status, 'goedgekeurd');
  assert.equal(plan.batch.boekingen.find((rij) => rij.legacy_id === 'act-second-nature')?.status, 'migratie_vastgelegd');
  const nogmaals = bouwSanityImport(dump);
  assert.deepEqual(nogmaals.batch, plan.batch);
});

test('staging-import schrijft niet op productie en niet zolang Sanity de bron is', () => {
  assert.equal(stagingSchrijvenToegestaan({ VERCEL_ENV: 'production', CONTENT_BRON: 'supabase', ALLOW_SUPABASE_CONTENT: 'true' }).ok, false);
  assert.equal(stagingSchrijvenToegestaan({ CONTENT_BRON: 'sanity' }).ok, false);
  assert.equal(stagingSchrijvenToegestaan({ CONTENT_BRON: 'supabase', ALLOW_SUPABASE_CONTENT: 'true' }).ok, true);
});
