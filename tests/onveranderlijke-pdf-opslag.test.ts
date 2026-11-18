import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bewaarOnveranderlijkePdf } from '../src/lib/operatie/onveranderlijke-pdf-opslag.ts';

const pdf = (inhoud: string) => new TextEncoder().encode('%PDF-1.7\n' + inhoud.repeat(20));
const geldig = pdf('contract');
const pad = 'facturen/123/KVPF-2026-000001.pdf';

test('een nieuw document wordt eenmalig, zonder upsert, opgeslagen', async () => {
  const uploads: unknown[] = [];
  const result = await bewaarOnveranderlijkePdf({
    async upload(p, bytes, opties) { uploads.push({ p, bytes, opties }); return { error: null }; },
  }, pad, geldig);
  assert.deepEqual(result, { ok: true, bestaand: false });
  assert.deepEqual((uploads[0] as { opties: unknown }).opties, { contentType: 'application/pdf', upsert: false });
});

test('een identieke PDF mag na een mislukte/gedupliceerde upload worden hergebruikt', async () => {
  const result = await bewaarOnveranderlijkePdf({
    async upload() { return { error: { message: 'Asset Already Exists', statusCode: '409' } }; },
    async download() { return { data: { async arrayBuffer() { return Uint8Array.from(geldig).buffer; } }, error: null }; },
  }, pad, geldig);
  assert.deepEqual(result, { ok: true, bestaand: true });
});

test('een afwijkende PDF onder hetzelfde factuurnummer blokkeert verzending', async () => {
  const result = await bewaarOnveranderlijkePdf({
    async upload() { return { error: { message: '409' } }; },
    async download() { return { data: { async arrayBuffer() { return pdf('andere inhoud').buffer; } }, error: null }; },
  }, pad, geldig);
  assert.equal(result.ok, false);
});

test('onduidelijke opslag zonder controle blokkeert fail-closed', async () => {
  const result = await bewaarOnveranderlijkePdf({
    async upload() { return { error: { message: 'Time-out' } }; },
  }, pad, geldig);
  assert.equal(result.ok, false);
});

test('onjuiste PDF leidt niet tot upload', async () => {
  let aangeroepen = false;
  const result = await bewaarOnveranderlijkePdf({
    async upload() { aangeroepen = true; return { error: null }; },
  }, pad, new TextEncoder().encode('geen pdf'));
  assert.equal(result.ok, false);
  assert.equal(aangeroepen, false);
});
