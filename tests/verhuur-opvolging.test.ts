import assert from 'node:assert/strict';
import test from 'node:test';
import { legeWereld, isVervolgmailNodig, type Wereld, type DienstContext } from '../src/lib/operatie/kern.ts';
import { hashToegangstoken } from '../src/platform/magictoken.ts';
import { planVerhuurOpvolging, isMachineOpvolgtemplate } from '../src/lib/verhuurmachine/opvolging.ts';
import { verwerkVerhuurStap, type ProcesJob } from '../src/lib/verhuurmachine/proces.ts';

const ctx: DienstContext = { nu: new Date('2027-03-20T10:00:00Z'), env: {}, actor: { type: 'systeem', naam: 'testplanner' },
  basisUrl: 'https://kerkje.example.test', internEmail: 'bestuur@example.test', sjabloonOpen: () => true };
function wereld(): Wereld {
  const w = legeWereld();
  w.boekingen.push({ id: '11', nummer: 'TEST-11', status: 'definitief', verhuurtype: 'expositie', titel: 'Tentoonstelling',
    start: '2027-06-12', eind: '2027-06-13', relatieId: null, gastheerId: null, aanvraagId: '10',
    naam: 'Test Exposant', email: 'exposant@example.test', telefoon: '', adres: '',
    aanbetalingBedrag: 100, aanbetalingOntvangen: true, optieAangemaaktOp: '2026-11-25', optieEind: '2026-12-09' });
  return w;
}
function database() {
  const opgeslagen: any[] = [], sleutels = new Set<string>();
  let bevoegd = true, fout = false;
  const client = {
    from(tabel: string) {
      const q: any = { select: () => q, eq: () => q,
        then: (klaar: any) => Promise.resolve({ data: [...sleutels].map(sleutel => ({ sleutel })), error: null }).then(klaar),
        maybeSingle: async () => ({ data: tabel === 'toegangstokens' ? { ingetrokken_op: null, verloopt_op: '2099-01-01T00:00:00Z' } : { status: 'bezig', claim_token: 'claim' }, error: null }) };
      return q;
    },
    async rpc(naam: string, args: any) {
      if (naam === 'verhuur_machine_mag') return { data: bevoegd, error: null };
      assert.equal(naam, 'verhuur_plan_opvolging');
      if (fout) return { data: null, error: { message: 'transactie mislukt' } };
      opgeslagen.push(structuredClone(args));
      for (const b of args.p_berichten) sleutels.add(b.sleutel);
      return { data: { gepland: args.p_berichten.length }, error: null };
    },
  };
  return { client, opgeslagen, sleutels, bevoegd: (v: boolean) => { bevoegd = v; }, fout: () => { fout = true; } };
}

test('klanttoken, bestaande taak en volledige vervolgmail gaan in één opslagtransactie', async () => {
  const db = database();
  const r = await planVerhuurOpvolging({ client: db.client, wereld: wereld(), ctx, boekingIds: new Set(['11']) });
  assert.equal(r.gepland, 1);
  assert.equal(db.opgeslagen.length, 1);
  const transactie = db.opgeslagen[0], mail = transactie.p_berichten[0];
  assert.equal(mail.payload.templateId, 'booking_content_request');
  assert.equal(mail.sleutel, 'opvolgmail:job:11:booking_content_request');
  assert.ok(transactie.p_mutaties.some((m: any) => m.soort === 'upsert_taak'));
  const token = transactie.p_mutaties.find((m: any) => m.soort === 'insert_token');
  const url = mail.payload.tekst.match(/https:\/\/[^\s]+\/klant\/aanleveren\/\?token=[^\s]+/)?.[0];
  assert.ok(url);
  assert.equal(hashToegangstoken(new URL(url).searchParams.get('token')!), token.velden.token_hash);
  assert.equal(mail.payload.tokenVerlooptOp, token.velden.verloopt_op);
  assert.equal(mail.payload.tokenHash, token.velden.token_hash);
});

test('tweede planning maakt geen tweede mail en geen tweede klanttoken', async () => {
  const db = database(), invoer = { client: db.client, wereld: wereld(), ctx, boekingIds: new Set(['11']) };
  await planVerhuurOpvolging(invoer);
  const r = await planVerhuurOpvolging(invoer);
  assert.equal(r.gepland, 0);
  assert.equal(db.opgeslagen.length, 1);
});

test('mislukte opslag begint geen verzending en blijft opnieuw planbaar', async () => {
  const db = database(); db.fout();
  await assert.rejects(planVerhuurOpvolging({ client: db.client, wereld: wereld(), ctx, boekingIds: new Set(['11']) }), /transactie mislukt/);
  assert.equal(db.sleutels.size, 0);
  assert.equal(db.opgeslagen.length, 0);
});

test('geen mandaat, oude boeking of geannuleerd dossier geeft geen machineplanning', async () => {
  const db = database();
  const w = wereld();
  assert.equal((await planVerhuurOpvolging({ client: db.client, wereld: w, ctx, boekingIds: new Set() })).gepland, 0);
  db.bevoegd(false);
  assert.equal((await planVerhuurOpvolging({ client: db.client, wereld: w, ctx, boekingIds: new Set(['11']) })).gepland, 0);
  db.bevoegd(true); w.boekingen[0].status = 'geannuleerd';
  assert.equal((await planVerhuurOpvolging({ client: db.client, wereld: w, ctx, boekingIds: new Set(['11']) })).gepland, 0);
  assert.equal(db.opgeslagen.length, 0);
});

test('financiële en definitieve mails blijven buiten de oude vervolgplanner', () => {
  for (const id of ['booking_confirmed','booking_approved_payment_required','booking_payment_reminder',
    'booking_payment_final_reminder','internal_payment_overdue','aanbetaling_check_paul','onbekend']) {
    assert.equal(isMachineOpvolgtemplate(id), false, id);
  }
  assert.equal(isMachineOpvolgtemplate('booking_content_request'), true);
  assert.equal(isMachineOpvolgtemplate('booking_practical_information'), true);
});

test('de actuele dossierstatus kan een eerder geplande inhoudsmail laten vervallen', () => {
  const w = wereld();
  assert.equal(isVervolgmailNodig(w, '11', 'booking_content_request', '2027-03-20'), true);
  w.boekingen[0].status = 'geannuleerd';
  assert.equal(isVervolgmailNodig(w, '11', 'booking_content_request', '2027-03-20'), false);
});

test('vervolgworker hercontroleert noodzaak en livepoort voordat een provider wordt aangeroepen', async () => {
  const db = database();
  const job: ProcesJob = { id: 'job', aanvraag_id: 10, boeking_id: 11, taak: 'opvolgmail', sleutel: 'opvolgmail:job:11:booking_content_request',
    status: 'bezig', claim_token: 'claim', pogingen: 1, payload: { templateId: 'booking_content_request', automatisering: 'content_herinnering',
      tokenHash: 'a'.repeat(64), naar: 'exposant@example.test', onderwerp: 'Inhoud gevraagd', tekst: 'Vul uw inhoud aan.', richting: 'aanvrager' } };
  let calls = 0;
  const verstuur = async (_b: any, opties: any) => {
    calls++; assert.equal(opties.vereisteLiveModus, true);
    return { verzonden: true, providerAangeroepen: true, providerBerichtId: 'bewijs-1', besluit: { modus: 'aan' } } as any;
  };
  assert.equal((await verwerkVerhuurStap(db.client, job, {}, { verstuur, opvolgActueel: async () => false })).status, 'geannuleerd');
  assert.equal(calls, 0);
  assert.equal((await verwerkVerhuurStap(db.client, job, {}, { verstuur, opvolgActueel: async () => true })).status, 'afgerond');
  assert.equal(calls, 1);
  job.payload.tokenVerlooptOp = '2000-01-01T00:00:00Z';
  assert.equal((await verwerkVerhuurStap(db.client, job, {}, { verstuur, opvolgActueel: async () => true })).status, 'wacht_op_mens');
  assert.equal(calls, 1);
});
