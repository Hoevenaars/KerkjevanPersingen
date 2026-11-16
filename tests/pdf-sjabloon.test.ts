import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import test from 'node:test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { pdfBevatTekst, pdfBytes, pdfPastInA4 } from '../src/platform/documenten/pdf.ts';
import {
  VOORWAARDEN_MARKER,
  leesSjabloonVelden,
  normaliseerVeldnaam,
  veldenUitContracttekst,
  voorbeeldContractSjabloon,
  vulPdfSjabloon,
} from '../src/platform/documenten/pdf-sjabloon.ts';
import { maakContractPdf } from '../src/platform/contract-pakket.ts';
import { HUISREGELS_V1, PLATTEGROND_V1, VOORWAARDEN_V1 } from '../src/platform/documenten/teksten-v1.ts';
import {
  contractTekst,
  type ContractAfspraken,
  type ContractBron,
  type DocumentenflowInstellingen,
} from '../src/platform/documentenflow.ts';

const afspraken: ContractAfspraken = {
  tijdVan: '13:00',
  tijdTot: '18:00',
  opbouw: 'Vanaf 10:00',
  afbouw: 'Tot 20:00',
  contactpersoon: 'José de Vries',
};

function instellingen(): DocumentenflowInstellingen {
  return {
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
  };
}

function bron(): ContractBron {
  return {
    boekingId: '42',
    soort: 'bruiloft',
    soortLabel: 'Bruiloft',
    activiteit: 'Huwelijk José',
    toelichting: '',
    periodeVan: '2026-09-09',
    periodeTot: '2026-09-09',
    geboektOp: '2026-06-01',
    huurderNaam: 'José de Vries',
    straat: 'Kerkstraat',
    huisnummer: '1',
    toevoeging: '',
    postcode: '6575 AB',
    woonplaats: 'Persingen',
    email: 'jose@voorbeeld.nl',
    telefoon: '0612345678',
    personen: '40',
    huurprijsCent: 55000,
    aanbetalingCent: 10000,
    aanbetalingVerval: '2026-07-01',
    restCent: 45000,
    restVerval: '2026-08-01',
    gastNaam: '',
    gastEmail: '',
    gastTelefoon: '',
    promotieAanwezig: false,
    boekingStatus: 'optie',
  };
}

async function sjabloonMet(extra?: (doc: PDFDocument) => Promise<void> | void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const pagina = doc.addPage([595, 842]);
  const letter = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  const veld = form.createTextField('huurder');
  veld.addToPage(pagina, { x: 50, y: 700, width: 400, height: 24 });
  const nummer = form.createTextField('{{contractnummer}}');
  nummer.addToPage(pagina, { x: 50, y: 660, width: 400, height: 24 });
  pagina.drawText('Huurovereenkomst', { x: 50, y: 780, size: 16, font: letter });
  await extra?.(doc);
  return new Uint8Array(await doc.save({ useObjectStreams: false }));
}

test('een veldnaam met accolades telt als het mergeveld', () => {
  assert.equal(normaliseerVeldnaam('{{ contractnummer }}'), 'contractnummer');
  assert.equal(normaliseerVeldnaam('Huurder'), 'huurder');
});

test('de contracttekst levert de mergevelden, inclusief euro en accent', () => {
  const opgesteld = contractTekst(bron(), afspraken, instellingen(), 'KVP-20260909-42-v1', 1, '2026-06-02');
  assert.ok(opgesteld.tekst);
  const velden = veldenUitContracttekst(opgesteld.tekst ?? '');
  assert.ok(velden);
  assert.equal(velden?.contractnummer, 'KVP-20260909-42-v1');
  assert.equal(velden?.huurder, 'José de Vries');
  assert.equal(velden?.periode_van, '2026-09-09');
  assert.equal(velden?.tijd_tot, '18:00');
  assert.match(velden?.huurprijs ?? '', /550,00/);
  assert.equal(velden?.ondertekenaar, 'A. de Boer');
});

test('ingesloten FlateDecode-tekst wordt gevonden', () => {
  const stroom = deflateSync(Buffer.from('Verhuurvoorwaarden in een stroom'));
  const pdf = Buffer.concat([
    Buffer.from('%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode /Length '),
    Buffer.from(String(stroom.length)),
    Buffer.from(' >>\nstream\n'),
    stroom,
    Buffer.from('\nendstream\nendobj\n%%EOF'),
  ]);
  assert.equal(pdfBevatTekst(pdf, 'Verhuurvoorwaarden'), true);
  assert.equal(pdfBevatTekst(pdf, 'ontbreekt'), false);
});

test('een sjabloon zonder tekstvelden wordt geweigerd', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  const bytes = new Uint8Array(await doc.save());
  const gelezen = await leesSjabloonVelden(bytes);
  assert.match(gelezen.fout ?? '', /tekstvelden/);
});

test('het sjabloon vult de velden en zet de voorwaarden erachter', async () => {
  const opgesteld = contractTekst(bron(), afspraken, instellingen(), 'KVP-20260909-42-v1', 1, '2026-06-02');
  assert.ok(opgesteld.tekst);
  const sjabloon = await sjabloonMet();
  const pdf = await maakContractPdf({
    tekst: opgesteld.tekst ?? '',
    voorwaardenTekst: VOORWAARDEN_V1,
    huisregelsTekst: HUISREGELS_V1,
    plattegrondTekst: PLATTEGROND_V1,
    soort: 'bruiloft',
  }, 'KVP-20260909-42-v1.pdf', 'KVP-20260909-42-v1', sjabloon);
  assert.equal(pdf.ok, true);
  if (!pdf.ok) return;
  assert.equal(pdfBevatTekst(pdf.bijlage.inhoud, 'José de Vries'), true);
  assert.equal(pdfBevatTekst(pdf.bijlage.inhoud, 'KVP-20260909-42-v1'), true);
  assert.equal(pdfBevatTekst(pdf.bijlage.inhoud, 'achttien maanden'), true);
  assert.equal(pdfBevatTekst(pdf.bijlage.inhoud, 'Verhuurvoorwaarden'), true);
});

test('voorwaarden die al in het sjabloon staan worden niet nog eens toegevoegd', async () => {
  const opgesteld = contractTekst(bron(), afspraken, instellingen(), 'KVP-20260909-42-v1', 1, '2026-06-02');
  const sjabloon = await sjabloonMet(async (doc) => {
    const letter = await doc.embedFont(StandardFonts.Helvetica);
    doc.getPages()[0].drawText(`Verhuurvoorwaarden ${VOORWAARDEN_MARKER}`, { x: 50, y: 600, size: 10, font: letter });
  });
  const velden = veldenUitContracttekst(opgesteld.tekst ?? '');
  assert.ok(velden);
  const gevuld = await vulPdfSjabloon({
    sjabloon,
    velden: velden ?? {},
    bijlage: {
      voorwaardenTekst: VOORWAARDEN_V1,
      huisregelsTekst: HUISREGELS_V1,
      plattegrondTekst: '',
      soort: 'bruiloft',
    },
  });
  assert.equal(gevuld.ok, true);
  if (!gevuld.ok) return;
  assert.equal(pdfBevatTekst(gevuld.pdf, 'achttien maanden'), false);
  assert.equal(pdfBevatTekst(gevuld.pdf, VOORWAARDEN_MARKER), true);
});

test('een expositie krijgt de plattegrond achter het sjabloon', async () => {
  const expositie = bron();
  expositie.soort = 'expositie';
  expositie.soortLabel = 'Expositie';
  const opgesteld = contractTekst(expositie, afspraken, instellingen(), 'KVP-expositie', 1, '2026-06-02');
  const pdf = await maakContractPdf({
    tekst: opgesteld.tekst ?? '',
    voorwaardenTekst: VOORWAARDEN_V1,
    huisregelsTekst: HUISREGELS_V1,
    plattegrondTekst: PLATTEGROND_V1,
    soort: 'expositie',
  }, 'KVP-expositie.pdf', 'KVP-expositie', await sjabloonMet());
  assert.equal(pdf.ok, true);
  if (!pdf.ok) return;
  assert.equal(pdfBevatTekst(pdf.bijlage.inhoud, 'Plattegrond expositieruimte'), true);
});

test('lange waarden blijven binnen de A4-pagina en lopen over meerdere bladzijden', () => {
  const lang = [
    'Huurovereenkomst',
    `Huurder: ${'Wolf'.repeat(40)} van der ${'M'.repeat(90)}`,
    `Omschrijving: ${'Een zeer uitgebreide omschrijving van de bijeenkomst. '.repeat(40)}`,
    `\f\n${VOORWAARDEN_V1}`,
    `\f\n${HUISREGELS_V1}`,
  ].join('\n');
  const info = pdfPastInA4(lang);
  assert.deepEqual(info.teBreed, []);
  assert.ok(info.paginas >= 3);
  const pdf = pdfBytes(lang);
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString('latin1'), '%PDF-');
  assert.equal(pdf.subarray(0, 16).some((byte) => byte >= 128), true);
  assert.equal(pdfBevatTekst(pdf, 'WolfWolf'), true);
  assert.equal(pdfBevatTekst(pdf, 'Verhuurvoorwaarden'), true);
  assert.equal(pdfBevatTekst(pdf, 'Huisregels'), true);
});

test('een lange waarde blijft leesbaar in een sjabloonveld', async () => {
  const naam = 'José María Catharina van der Hoeven-Persingen';
  const token = `START${'x'.repeat(70)}EINDE`;
  const doc = await PDFDocument.create();
  const pagina = doc.addPage([595, 842]);
  const form = doc.getForm();
  form.createTextField('huurder').addToPage(pagina, { x: 50, y: 700, width: 240, height: 22 });
  form.createTextField('contractnummer').addToPage(pagina, { x: 50, y: 660, width: 240, height: 22 });
  form.createTextField('activiteit').addToPage(pagina, { x: 50, y: 560, width: 140, height: 70 });
  const sjabloon = new Uint8Array(await doc.save({ useObjectStreams: false }));
  const opgesteld = contractTekst(bron(), afspraken, instellingen(), 'KVP-lang', 1, '2026-06-02');
  const velden = veldenUitContracttekst(opgesteld.tekst ?? '');
  assert.ok(velden);
  velden.huurder = naam;
  velden.activiteit = token;
  const gevuld = await vulPdfSjabloon({
    sjabloon,
    velden,
    bijlage: {
      voorwaardenTekst: VOORWAARDEN_V1,
      huisregelsTekst: HUISREGELS_V1,
      plattegrondTekst: '',
      soort: 'bruiloft',
    },
  });
  assert.equal(gevuld.ok, true);
  if (!gevuld.ok) return;
  assert.equal(pdfBevatTekst(gevuld.pdf, naam), true);
  assert.equal(pdfBevatTekst(gevuld.pdf, 'START'), true);
  assert.equal(pdfBevatTekst(gevuld.pdf, 'EINDE'), true);
  assert.equal(pdfBevatTekst(gevuld.pdf, 'Verhuurvoorwaarden'), true);
});

test('het voorbeeldsjabloon bevat de veldnamen', async () => {
  const bytes = await voorbeeldContractSjabloon();
  const gelezen = await leesSjabloonVelden(bytes);
  assert.equal(gelezen.fout, null);
  assert.ok(gelezen.bekende.includes('huurder'));
  assert.ok(gelezen.bekende.includes('contractnummer'));
  assert.ok(bytes.byteLength > 800);
  assert.equal(pdfBytes('x').byteLength > 0, true);
});
