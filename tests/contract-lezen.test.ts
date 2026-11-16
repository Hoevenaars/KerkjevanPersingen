import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contractNavHtml,
  contractWeergaveHtml,
  leesContractPakket,
  tekenFoutHtml,
} from '../src/platform/contract-lezen.ts';
import { contractPakketTekst } from '../src/platform/contract-pakket.ts';
import { HUISREGELS_V1, VOORWAARDEN_V1 } from '../src/platform/documenten/teksten-v1.ts';

test('de leesweergave gebruikt dezelfde tekst als het pakket en ontsnapt html', () => {
  const huurder = `<script>alert(1)</script> Wolf${'m'.repeat(30)}`;
  const pakket = contractPakketTekst({
    tekst: `Huurovereenkomst\nContractnummer: KVP-1 | Documentversie: 1 | Datum opgesteld: 2026-06-02\nHuurder: ${huurder}`,
    voorwaardenTekst: VOORWAARDEN_V1,
    huisregelsTekst: HUISREGELS_V1,
    plattegrondTekst: '',
    soort: 'bruiloft',
  });
  const delen = leesContractPakket(pakket);
  assert.equal(delen[0]?.id, 'overeenkomst');
  assert.equal(delen.some((deel) => deel.id === 'voorwaarden'), true);
  assert.equal(delen.some((deel) => deel.id === 'huisregels'), true);
  const feit = delen[0]?.blokken.find((blok) => blok.label === 'Huurder');
  assert.equal(feit?.waarde, huurder);
  const html = contractWeergaveHtml(delen);
  assert.equal(html.includes('<script>'), false);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /id="voorwaarden"/);
  assert.match(html, /Wolf/);
  assert.match(contractNavHtml(delen), /Huisregels/);
  const fout = tekenFoutHtml('Deze link is verlopen. <token>');
  assert.match(fout, /name="viewport"/);
  assert.match(fout, /Deze link is verlopen/);
  assert.match(fout, /&lt;token&gt;/);
  assert.equal(fout.includes('Kenmerk'), false);
  assert.equal(/tekenen\/[A-Za-z0-9_-]{10,}/.test(fout), false);
});
