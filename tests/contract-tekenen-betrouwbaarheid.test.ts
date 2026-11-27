import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hashTekenToken, hashVerificatiecode, tekenCookieWaarde, voerTekenstap,
  type TekenDossier, type TekenStap, type TekenWinkel,
} from '../src/platform/contract-tekenen.ts';
import { sha256Hex } from '../src/platform/contract-pakket.ts';
import { pdfBytes } from '../src/platform/documenten/pdf.ts';
import { tekenwinkelVanClient, type ContractTekenClient } from '../src/lib/operatie/contract-tekenwinkel.ts';

const token = 'A'.repeat(43);
const tokenHash = hashTekenToken(token);
const nu = '2026-11-25T10:00:00.000Z';
const geheim = 'uitsluitend-lokale-tests';

function dossier(extra: Partial<TekenDossier> = {}): TekenDossier {
  return {
    boekingId: '42', versie: 1, actueleVersie: 1, boekingStatus: 'optie',
    contractnummer: 'KVP-42-1', tokenHash, verlooptOp: '2026-12-01T10:00:00.000Z',
    codeHash: null, codeVerloopt: null, pogingen: 0, geverifieerdOp: nu,
    ondertekendOp: null, naam: null, email: 'test@example.test', vrijgegeven: true,
    bestuurAkkoord: true, ingetrokkenOp: null, documentHash: null, pdfHash: null,
    pdfPad: null, bevestigingId: null, huurderNaam: 'Test Exposant',
    pakket: { tekst: 'Alleen deze bevroren overeenkomst.', voorwaardenTekst: 'Vaste voorwaarden.',
      huisregelsTekst: 'Vaste huisregels.', plattegrondTekst: '', soort: 'expositie' },
    ...extra,
  };
}

function teken(extra: Partial<Extract<TekenStap, { soort: 'onderteken' }>> = {}): TekenStap {
  return {
    soort: 'onderteken', token, nu, naam: 'Eerste Ondertekenaar', akkoord: true,
    cookie: tekenCookieWaarde(tokenHash, '2026-11-25T10:30:00.000Z', geheim),
    geheim, ipHash: null, userAgent: 'lokale-test', ...extra,
  };
}

function geheugen(begin = dossier()) {
  let opgeslagen = structuredClone(begin);
  let writes = 0;
  const pdfs = new Map<string, Uint8Array>();
  const winkel: TekenWinkel = {
    async lees() { return structuredClone(opgeslagen); },
    async bewaarCode() { writes += 1; },
    async zetGeverifieerd() { writes += 1; },
    async leesGetekendePdf(d) { return pdfs.get(d.pdfPad ?? '') ?? null; },
    async legOndertekening(input) {
      writes += 1;
      if (opgeslagen.ondertekendOp) return 'al';
      opgeslagen = { ...opgeslagen, naam: input.naam, ondertekendOp: input.op, documentHash: input.documentHash,
        pdfPad: input.pdfPad, pdfHash: sha256Hex(input.pdf) };
      pdfs.set(input.pdfPad, input.pdf);
      return 'nieuw';
    },
  };
  return { winkel, pdfs, get writes() { return writes; }, get opgeslagen() { return opgeslagen; } };
}

test('een succesvolle handtekening wordt uit de opgeslagen bewijsversie bevestigd', async () => {
  const db = geheugen();
  const eerste = await voerTekenstap(teken(), db.winkel);
  assert.equal(eerste.ok, true);
  if (!eerste.ok) return;
  assert.equal(eerste.mail, 'bevestiging');
  assert.equal(eerste.dossier.pdfPad, db.opgeslagen.pdfPad);
  assert.match(eerste.dossier.pdfPad ?? '', /getekend-v1-[a-f0-9]{64}\.pdf$/);
  const tweede = await voerTekenstap(teken({ naam: 'Andere Persoon' }), db.winkel);
  assert.equal(tweede.ok, true);
  if (!tweede.ok) return;
  assert.equal(tweede.dossier.naam, 'Eerste Ondertekenaar');
  assert.equal(tweede.mail, undefined);
  assert.equal(db.writes, 1);
});

test('gelijktijdige ondertekeningen tonen hetzelfde winnende bewijs en slechts één mailopdracht', async () => {
  const db = geheugen();
  const vastleggen = db.winkel.legOndertekening;
  let aantal = 0;
  let vrijgeven!: () => void;
  const beideAanwezig = new Promise<void>((resolve) => { vrijgeven = resolve; });
  db.winkel.legOndertekening = async (input) => {
    aantal += 1;
    if (aantal === 2) vrijgeven();
    await beideAanwezig;
    return vastleggen(input);
  };
  const uitkomsten = await Promise.all([
    voerTekenstap(teken(), db.winkel),
    voerTekenstap(teken({ naam: 'Tweede Ondertekenaar', nu: '2026-11-25T10:00:01.000Z' }), db.winkel),
  ]);
  assert.equal(uitkomsten.every((uit) => uit.ok), true);
  const gelukt = uitkomsten.filter((uit) => uit.ok);
  assert.equal(gelukt.filter((uit) => uit.mail === 'bevestiging').length, 1);
  assert.equal(new Set(gelukt.map((uit) => uit.dossier.naam)).size, 1);
  assert.equal(new Set(gelukt.map((uit) => uit.dossier.ondertekendOp)).size, 1);
  assert.equal(new Set(gelukt.map((uit) => uit.dossier.pdfPad)).size, 1);
});

test('een ongefundeerd al-resultaat wordt nooit een verzonnen handtekening', async () => {
  const db = geheugen();
  db.winkel.legOndertekening = async () => 'al';
  const uit = await voerTekenstap(teken(), db.winkel);
  assert.equal(uit.ok, false);
  assert.match(uit.melding, /niet aantoonbaar/);
  assert.equal(db.opgeslagen.ondertekendOp, null);
});

test('opslag-/databasefouten geven geen succes, PDF of mailopdracht', async () => {
  for (const fout of ['PDF niet opgeslagen', 'database niet bereikbaar', 'commitresultaat onbekend']) {
    const db = geheugen();
    db.winkel.legOndertekening = async () => { throw new Error(fout); };
    const uit = await voerTekenstap(teken(), db.winkel);
    assert.equal(uit.ok, false, fout);
    assert.equal('mail' in uit, false);
    assert.equal('pdf' in uit, false);
  }
});

test('onbekende commituitkomst kan veilig herhaald worden zonder de eerste handtekening te wijzigen', async () => {
  const db = geheugen();
  const schrijf = db.winkel.legOndertekening;
  db.winkel.legOndertekening = async (input) => { await schrijf(input); throw new Error('verbinding verbroken na commit'); };
  const eerste = await voerTekenstap(teken(), db.winkel);
  assert.equal(eerste.ok, false);
  const opnieuw = await voerTekenstap(teken({ naam: 'Andere Persoon' }), db.winkel);
  assert.equal(opnieuw.ok, true);
  if (!opnieuw.ok) return;
  assert.equal(opnieuw.dossier.naam, 'Eerste Ondertekenaar');
  assert.equal(opnieuw.mail, undefined);
  assert.equal(db.writes, 1);
});

test('annulering, ingetrokken link, nieuwere versie en ongeldige boekingsstatus blokkeren mutaties', async () => {
  for (const extra of [
    { boekingStatus: 'geannuleerd' }, { ingetrokkenOp: nu }, { actueleVersie: 2 },
    { boekingStatus: 'optie_verlopen' }, { boekingStatus: 'afgewezen' }, { bestuurAkkoord: false },
  ]) {
    const db = geheugen(dossier(extra));
    for (const stap of [teken(), { soort: 'code', token, nu, geheim } as TekenStap]) {
      assert.equal((await voerTekenstap(stap, db.winkel)).ok, false, JSON.stringify(extra));
    }
    assert.equal(db.writes, 0);
  }
});

test('een intussen geannuleerde boeking wordt na de opslagstap opnieuw gecontroleerd', async () => {
  const db = geheugen();
  const schrijf = db.winkel.legOndertekening;
  db.winkel.legOndertekening = async (input) => {
    const stand = await schrijf(input);
    db.winkel.lees = async () => ({ ...db.opgeslagen, boekingStatus: 'geannuleerd', ingetrokkenOp: nu });
    return stand;
  };
  const uit = await voerTekenstap(teken(), db.winkel);
  assert.equal(uit.ok, false);
  assert.match(uit.melding, /ingetrokken/);
  assert.equal('mail' in uit, false);
});

test('een getekende download gebruikt uitsluitend opgeslagen bytes, ook na sjabloonwijziging', async () => {
  const db = geheugen();
  const uit = await voerTekenstap(teken(), db.winkel);
  assert.equal(uit.ok, true);
  if (!uit.ok) return;
  const download = await voerTekenstap({ soort: 'download', token, nu }, db.winkel, { sjabloon: new Uint8Array([9, 8, 7]) });
  assert.equal(download.ok, true);
  if (!download.ok) return;
  assert.deepEqual(download.pdf, uit.pdf);
  db.pdfs.set(db.opgeslagen.pdfPad!, pdfBytes('Andere inhoud'));
  assert.equal((await voerTekenstap({ soort: 'download', token, nu }, db.winkel)).ok, false);
});

test('ontbrekende bewijs-PDF wordt niet uit een nieuw sjabloon gereconstrueerd', async () => {
  const db = geheugen(dossier({ ondertekendOp: nu, naam: 'Test Persoon', pdfPad: 'contracten/42/ontbreekt.pdf' }));
  const uit = await voerTekenstap({ soort: 'download', token, nu }, db.winkel);
  assert.equal(uit.ok, false);
});

test('een verificatiecode wordt alleen verstuurd na bevestigde codeopslag', async () => {
  const db = geheugen();
  db.winkel.bewaarCode = async () => { throw new Error('opslaan geweigerd'); };
  const uit = await voerTekenstap({ soort: 'code', token, nu, geheim }, db.winkel);
  assert.equal(uit.ok, false);
  assert.equal('code' in uit, false);
  assert.equal('mail' in uit, false);
});

test('een verificatiecookie wordt niet afgegeven als vastlegging van een correcte code mislukt', async () => {
  const code = '246813';
  const db = geheugen(dossier({ codeHash: hashVerificatiecode(code, tokenHash, geheim), codeVerloopt: '2026-11-25T10:15:00.000Z' }));
  db.winkel.zetGeverifieerd = async () => { throw new Error('verificatie niet vastgelegd'); };
  const uit = await voerTekenstap({ soort: 'controle', token, nu, geheim, code }, db.winkel);
  assert.equal(uit.ok, false);
  assert.equal('cookie' in uit, false);
});

function clientMetFouten(opties: { upload?: string; download?: Uint8Array; rpc?: string } = {}) {
  const calls: string[] = [];
  const client: ContractTekenClient = {
    async rpc(naam) {
      calls.push(naam);
      return opties.rpc ? { data: null, error: { message: opties.rpc } } : { data: { status: 'nieuw' }, error: null };
    },
    storage: { from() { return {
      async upload(_pad, _bytes, optiesUpload) {
        assert.equal(optiesUpload.upsert, false);
        calls.push('upload');
        return { error: opties.upload ? { message: opties.upload } : null };
      },
      async download() {
        calls.push('download');
        return opties.download
          ? { data: { async arrayBuffer() { return Uint8Array.from(opties.download!).buffer; } }, error: null }
          : { data: null, error: { message: 'niet aanwezig' } };
      },
    }; } },
  };
  return { client, calls };
}

function invoer() {
  const pdf = pdfBytes('Vaste onderteken-PDF voor de lokale opslagtest');
  return { tokenHash, naam: 'Test Persoon', op: nu, documentHash: 'b'.repeat(64),
    pdfPad: `contracten/42/getekend-v1-${sha256Hex(pdf)}.pdf`, pdf, audit: {} };
}

test('de productieadapter mag na een mislukte PDF-opslag geen teken-RPC aanroepen', async () => {
  const db = clientMetFouten({ upload: 'opslag geweigerd' });
  await assert.rejects(tekenwinkelVanClient(db.client).legOndertekening(invoer()));
  assert.deepEqual(db.calls, ['upload', 'download']);
});

test('duplicate opslag wordt alleen geaccepteerd als de bytes identiek zijn', async () => {
  const input = invoer();
  const afwijkend = clientMetFouten({ upload: 'Duplicate', download: pdfBytes('Ander bewijs') });
  await assert.rejects(tekenwinkelVanClient(afwijkend.client).legOndertekening(input), /ANDERE PDF/);
  assert.equal(afwijkend.calls.includes('leg_contract_ondertekening_vast'), false);
  const identiek = clientMetFouten({ upload: 'Duplicate', download: input.pdf });
  assert.equal(await tekenwinkelVanClient(identiek.client).legOndertekening(input), 'nieuw');
  assert.equal(identiek.calls.includes('leg_contract_ondertekening_vast'), true);
});

test('de productieadapter vertaalt databasefouten nooit naar al-ondertekend', async () => {
  const db = clientMetFouten({ rpc: 'transactie teruggedraaid' });
  await assert.rejects(tekenwinkelVanClient(db.client).legOndertekening(invoer()), /niet aantoonbaar/);
  await assert.rejects(tekenwinkelVanClient(db.client).bewaarCode(tokenHash, 'c'.repeat(64), nu, 0));
  await assert.rejects(tekenwinkelVanClient(db.client).zetGeverifieerd(tokenHash, nu, 'c'.repeat(64)));
});
