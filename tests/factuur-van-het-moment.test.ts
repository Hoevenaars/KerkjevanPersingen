/** Financial and document tests. No network, database, mail provider or real billing. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  kiesFactuurVanMoment, vasteContractbedragenFout, factuurSnapshotFout, factuurTekst, maakFactuurBijlage,
  maakDrieContractBijlagen, type BetaalregelFactuur, type FactuurSnapshot,
} from '../src/platform/factuur-van-moment.ts';
import { pdfBevatTekst } from '../src/platform/documenten/pdf.ts';

const vandaag = '2026-11-18';
const betaalregels: BetaalregelFactuur[] = [
  { id: 1, soort: 'aanbetaling', bedrag: 100, status: 'open', vervaldatum: '2026-12-01' },
  { id: 2, soort: 'restant', bedrag: 390, status: 'open', vervaldatum: '2027-01-18' },
];
const input = (regels: BetaalregelFactuur[] = betaalregels) => ({ huurprijsCent: 49000, aanbetalingCent: 10000, regels, vandaag });
const invoice: FactuurSnapshot = {
  factuurnummer: 'KVPF-2026-000001', factuurdatum: vandaag, vervaldatum:'2026-12-01', fase:'aanbetaling',
  bedragCent:10000,exclusiefCent:10000,btwCent:0,btwRegime:'vrijgesteld',btwNummer:'',
  btwToelichting:'Vrijgesteld volgens door het bestuur vastgestelde fiscale behandeling',
  verhuurderNaam:'Stichting Kerkje',verhuurderAdres:'Persingen 1, 6575 JA Persingen',verhuurderKvk:'12345678',
  verhuurderIban:'NL91ABNA0417164300',huurderNaam:'Jan Voorbeeld',huurderAdres:'Kerkstraat 1, 6575 AA Persingen',
  omschrijving:'Verhuur Kerkje van Persingen - expositie',contractnummer:'KVP-20270320-12-v1',
  boekingsnummer:'KVP-12',periodeVan:'2027-03-20',periodeTot:'2027-03-21',
};
const contract = {
  tekst: 'Huurovereenkomst KVP-20270320-12-v1\nPartijen\nStichting Kerkje\nJan Voorbeeld\nHuurbedrag: 490 euro',
  voorwaardenTekst:'Verhuurvoorwaarden versie 1.0\nDe huurder houdt het kerkje schoon.',
  huisregelsTekst:'Huisregels\nDeuren sluiten om 18:00.',
  plattegrondTekst:'Plattegrond expositie\nExpositieruimte.',
  soort:'expositie',
};

test('factureer bij een reguliere boeking uitsluitend de aanbetaling', () => {
  const r = kiesFactuurVanMoment(input());
  assert.equal(r.ok,true);
  if (r.ok) assert.deepEqual(r.moment, { betalingId:1, fase:'aanbetaling', bedragCent:10000, vervaldatum:'2026-12-01' });
});
test('geen aanbetaling betekent volledige huur op een factuur (geen fictieve aanbetaling)', () => {
  const r = kiesFactuurVanMoment({huurprijsCent:49000,aanbetalingCent:0,vandaag,regels:[{id:2,soort:'restant',bedrag:490,status:'open',vervaldatum:'2026-12-01'}]});
  assert.equal(r.ok,true);
  if(r.ok) assert.equal(r.moment.bedragCent,49000);
});
test('niet factureren als beide termijnen al opeisbaar zijn', () => {
  const r = kiesFactuurVanMoment(input([betaalregels[0],{...betaalregels[1],vervaldatum:'2026-11-01'}]));
  assert.equal(r.ok,false);
});
test('geen factuur bij dubbele, ontbrekende, geannuleerde of afwijkende regels', () => {
  for(const regels of [[],[betaalregels[0]], [...betaalregels,betaalregels[0]], [{...betaalregels[0],bedrag:199},betaalregels[1]], [{...betaalregels[0],status:'geannuleerd'},betaalregels[1]]]) {
    assert.equal(kiesFactuurVanMoment(input(regels)).ok,false);
  }
});
test('factuur verwerkt een bedrag van 100 euro exact met btw-controle', () => {
  assert.equal(factuurSnapshotFout(invoice), null);
  assert.match(factuurTekst(invoice),/Totaal deze factuur: EUR 100,00/);
  assert.equal(factuurSnapshotFout({...invoice,btwRegime:'belast_21',btwNummer:'',btwToelichting:''}) != null,true);
  assert.equal(factuurSnapshotFout({...invoice,bedragCent:99}) != null,true);
});
test('conceptfactuur heeft geen officieel factuurnummer', () => {
  const concept = {...invoice,factuurnummer:''};
  assert.equal(factuurSnapshotFout(concept,true),null);
  assert.match(factuurTekst(concept,true),/CONCEPTFACTUUR - NIET VERZENDEN/);
  assert.doesNotMatch(factuurTekst(concept,true),/KVPF-2026-000001/);
});
test('een contractmail bevat exact drie leesbare afzonderlijke PDFs', () => {
  const pdfs = maakDrieContractBijlagen(contract,invoice.contractnummer,invoice);
  assert.equal(pdfs.length,3);
  assert.ok(pdfs.every(p=>p.inhoud.byteLength>800));
  assert.ok(pdfBevatTekst(pdfs[0].inhoud,invoice.contractnummer));
  assert.ok(pdfBevatTekst(pdfs[1].inhoud,'Verhuurvoorwaarden'));
  assert.ok(pdfBevatTekst(pdfs[1].inhoud,'Plattegrond'));
  assert.ok(pdfBevatTekst(pdfs[2].inhoud,invoice.factuurnummer));
});
test('een verkeerde contractversie of lege voorwaarden kunnen niet worden verzonden',()=>{
  assert.throws(()=>maakDrieContractBijlagen(contract,invoice.contractnummer,{...invoice,contractnummer:'ANDERE'}));
  assert.throws(()=>maakDrieContractBijlagen({...contract,voorwaardenTekst:''},invoice.contractnummer,invoice));
});
test('PDF-concept bij voorvertoning heeft geen echte factuurnummerreeks',()=>{
  const pdf = maakFactuurBijlage({...invoice,factuurnummer:''},true);
  assert.ok(pdfBevatTekst(pdf.inhoud,'CONCEPTFACTUUR'));
  assert.ok(!pdfBevatTekst(pdf.inhoud,invoice.factuurnummer));
});

test('bevroren contractbedragen worden gecontroleerd voor een factuur mag ontstaan',()=>{
  const match = {huurprijs:'490,00',aanbetaling:'100',periodeVan:'2027-03-20',periodeTot:'2027-03-21',aanbetalingVerval:'2026-12-01',restVerval:'2027-01-18'};
  const a = {wizard:match,huurprijsCent:49000,aanbetalingCent:10000,aanbetalingVerval:'2026-12-01',restVerval:'2027-01-18',periodeVan:'2027-03-20',periodeTot:'2027-03-21'};
  assert.equal(vasteContractbedragenFout(a),null);
  assert.ok(vasteContractbedragenFout({...a,huurprijsCent:50000}));
  assert.ok(vasteContractbedragenFout({...a,restVerval:'2027-02-01'}));
  assert.ok(vasteContractbedragenFout({...a,wizard:null}));
});
