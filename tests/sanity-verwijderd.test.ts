import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { imageUrl, publiekeFotoUrl } from '../src/lib/sanity.ts';
import { haalSanityDump, sanityBeheerGeconfigureerd } from '../src/lib/sanity-beheer.ts';

test('een Sanity-asset levert geen beeld-URL meer', () => {
  const asset = { _type: 'image', asset: { _ref: 'image-abc-800x600-jpg' } };
  assert.equal(imageUrl(asset), null);
  assert.equal(publiekeFotoUrl(asset), null);
  assert.equal(publiekeFotoUrl('/foto/geen-foto.jpg'), '/foto/geen-foto.jpg');
  assert.equal(publiekeFotoUrl('https://xskqpefeumylrticrphp.supabase.co/storage/v1/object/public/public-media/a.jpg'), 'https://xskqpefeumylrticrphp.supabase.co/storage/v1/object/public/public-media/a.jpg');
});

test('de applicatie haalt geen Sanity-dump op', async () => {
  assert.equal(sanityBeheerGeconfigureerd({ SANITY_PROJECT_ID: '8le5jso9' }), false);
  await assert.rejects(haalSanityDump({ SANITY_PROJECT_ID: '8le5jso9', SANITY_API_TOKEN: 'geheim' }), /geen runtimebron/);
});

test('package.json noemt Sanity niet meer', async () => {
  const pakket = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
    dependencies: Record<string, string>;
    scripts: Record<string, string>;
  };
  const namen = Object.keys(pakket.dependencies);
  assert.equal(namen.some((naam) => naam.includes('sanity')), false);
  assert.equal(Object.keys(pakket.scripts).some((naam) => naam.startsWith('sanity')), false);
});
