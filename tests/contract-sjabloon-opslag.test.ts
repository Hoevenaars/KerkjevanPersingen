import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { pdfBevatTekst } from '../src/platform/documenten/pdf.ts';
import { veldenUitContracttekst, vulPdfSjabloon } from '../src/platform/documenten/pdf-sjabloon.ts';
import { HUISREGELS_V1, PLATTEGROND_V1, VOORWAARDEN_V1 } from '../src/platform/documenten/teksten-v1.ts';
import { contractTekst, type ContractAfspraken, type ContractBron, type DocumentenflowInstellingen } from '../src/platform/documentenflow.ts';
import {
  bewaarContractSjabloon,
  gebundeldContractSjabloon,
  leesContractSjabloon,
  verwijderContractSjabloon,
  type SjabloonClient,
} from '../src/lib/contract-sjabloon-opslag.ts';
import { voorbeeldContractSjabloon } from '../src/platform/documenten/pdf-sjabloon.ts';

function geheugen(uploadFout: string | null = null): SjabloonClient & { rijen: Map<string, unknown>; uploads: number } {
  const rijen = new Map<string, unknown>();
  const emmer = { bytes: null as Uint8Array | null };
  let uploads = 0;
  const client = {
    rijen,
    get uploads() { return uploads; },
    storage: {
      from() {
        return {
          async upload(_pad: string, body: Blob) {
            uploads += 1;
            if (uploadFout) return { error: { message: uploadFout } };
            emmer.bytes = new Uint8Array(await body.arrayBuffer());
            return { error: null };
          },
          async download() {
            if (!emmer.bytes) return { data: null, error: { message: 'Object not found' } };
            return { data: new Blob([emmer.bytes]), error: null };
          },
          async remove() {
            emmer.bytes = null;
            return { error: null };
          },
        };
      },
    },
    from() {
      return {
        select() {
          return {
            eq(_kolom: string, sleutel: string) {
              return {
                async maybeSingle() {
                  const waarde = rijen.get(sleutel);
                  return { data: waarde === undefined ? null : { waarde }, error: null };
                },
              };
            },
          };
        },
        async upsert(rij: Record<string, unknown>) {
          rijen.set(String(rij.sleutel), rij.waarde);
          return { error: null };
        },
        delete() {
          return {
            async eq(_kolom: string, sleutel: string) {
              rijen.delete(sleutel);
              return { error: null };
            },
          };
        },
      };
    },
  };
  return client;
}

test('zonder opgeslagen bestand geldt het meegeleverde sjabloon', async () => {
  const stand = await leesContractSjabloon({});
  const gebundeld = gebundeldContractSjabloon();
  assert.ok(gebundeld);
  assert.equal(stand.fout, null);
  assert.equal(stand.bytes?.byteLength, gebundeld.byteLength);
  assert.equal(String.fromCharCode(...(stand.bytes ?? []).slice(0, 5)), '%PDF-');
});

test('een geweigerde bucket bewaart het sjabloon in instellingen', async () => {
  const client = geheugen('new row violates row-level security policy');
  const bytes = await voorbeeldContractSjabloon();
  const uit = await bewaarContractSjabloon(bytes, {}, client);
  assert.equal(uit.ok, true);
  if (!uit.ok) return;
  assert.ok(uit.bekende.includes('huurder'));
  const stand = await leesContractSjabloon({}, client);
  assert.equal(stand.bytes?.byteLength, bytes.byteLength);
  assert.equal(client.uploads, 1);
});

test('bucket én database tonen de echte fout', async () => {
  const client = geheugen('Bucket not found');
  client.from = () => ({
    select() {
      return { eq() { return { async maybeSingle() { return { data: null, error: null }; } }; } };
    },
    async upsert() {
      return { error: { message: 'permission denied for table instellingen' } };
    },
    delete() {
      return { async eq() { return { error: null }; } };
    },
  });
  const uit = await bewaarContractSjabloon(await voorbeeldContractSjabloon(), {}, client);
  assert.equal(uit.ok, false);
  if (uit.ok) return;
  assert.match(uit.melding, /niet opgeslagen/);
  assert.match(uit.melding, /Bucket not found/);
  assert.match(uit.melding, /permission denied/);
});

test('een nieuw bucketbestand telt ook nadat het sjabloon uit stond', async () => {
  const client = geheugen();
  assert.equal((await verwijderContractSjabloon({}, client)).ok, true);
  const bytes = await voorbeeldContractSjabloon();
  await client.storage.from('booking-documents').upload('sjablonen/huurovereenkomst.pdf', new Blob([bytes], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: true });
  const stand = await leesContractSjabloon({}, client);
  assert.equal(stand.bytes?.byteLength, bytes.byteLength);
});

test('verwijderen zet het meegeleverde sjabloon uit', async () => {
  const client = geheugen();
  const weg = await verwijderContractSjabloon({}, client);
  assert.equal(weg.ok, true);
  const stand = await leesContractSjabloon({}, client);
  assert.equal(stand.bytes, null);
});

test('het aangeleverde sjabloon vult de huurder en houdt de voorwaarden', async () => {
  const bestand = new Uint8Array(readFileSync(new URL('../src/platform/documenten/sjablonen/huurovereenkomst.pdf', import.meta.url)));
  const afspraken: ContractAfspraken = {
    tijdVan: '13:00', tijdTot: '18:00', opbouw: 'Vanaf 10:00', afbouw: 'Tot 20:00', contactpersoon: 'José de Vries',
  };
  const instellingen = {
    bestuursakkoordVerplicht: true,
    gereedRegel: 'ondertekend',
    ondertekenaarNaam: 'A. de Boer',
    ondertekenaarFunctie: 'Voorzitter',
    iban: 'NL91ABNA0417164300',
    tenaamstelling: 'Stichting Het Kerkje van Persingen',
    voorwaardenVastgesteldOp: '2026-11-15',
    huisregelsVastgesteldOp: '2026-11-15',
    coordinatorContact: '',
    publicatieRoute: '',
  } satisfies DocumentenflowInstellingen;
  const bron: ContractBron = {
    boekingId: '42', soort: 'bruiloft', soortLabel: 'Bruiloft', activiteit: 'Huwelijk José', toelichting: '',
    periodeVan: '2026-09-09', periodeTot: '2026-09-09', geboektOp: '2026-06-01', huurderNaam: 'José de Vries',
    straat: 'Kerkstraat', huisnummer: '1', toevoeging: '', postcode: '6575 AB', woonplaats: 'Persingen',
    email: 'jose@voorbeeld.nl', telefoon: '0612345678', personen: '40', huurprijsCent: 55000, aanbetalingCent: 10000,
    aanbetalingVerval: '2026-07-01', restCent: 45000, restVerval: '2026-08-01', gastNaam: '', gastEmail: '',
    gastTelefoon: '', promotieAanwezig: false, boekingStatus: 'optie',
  };
  const opgesteld = contractTekst(bron, afspraken, instellingen, 'KVP-20260909-42-v1', 1, '2026-06-02');
  const velden = veldenUitContracttekst(opgesteld.tekst ?? '');
  assert.ok(velden);
  const gevuld = await vulPdfSjabloon({
    sjabloon: bestand,
    velden,
    bijlage: { voorwaardenTekst: VOORWAARDEN_V1, huisregelsTekst: HUISREGELS_V1, plattegrondTekst: PLATTEGROND_V1, soort: 'bruiloft' },
  });
  assert.equal(gevuld.ok, true);
  if (!gevuld.ok) return;
  assert.equal(pdfBevatTekst(gevuld.pdf, 'José de Vries'), true);
  assert.equal(pdfBevatTekst(gevuld.pdf, 'KVP-20260909-42-v1'), true);
  assert.equal(pdfBevatTekst(gevuld.pdf, 'Verhuurvoorwaarden'), true);
});
