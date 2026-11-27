import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { kiesGoedgekeurdePrijs, planFinancieleTermijnen, betaalontvangstFout, type FinancieleTermijn } from '../src/platform/verhuur-financieel.ts';
import { magAutomatischDefinitief } from '../src/platform/definitief-voorwaarde.ts';
import { verifieerBetaalimport, leesBetaalimport } from '../src/platform/betaalontvangst-auth.ts';
import { leesVerhuurProfielenFormulier } from '../src/platform/verhuur-profielen-formulier.ts';
import { leesGecontroleerdMandaat } from '../src/lib/operatie/verhuur-mandaat.ts';
import { verwerkBetaalontvangst } from '../src/lib/operatie/verhuur-betaalontvangst.ts';

const termijn: FinancieleTermijn = { id: 22, soort: 'restant', bedragCent: 39000, ontvangenCent: 0,
  status: 'open', vervaldatum: '2027-05-01', factuurMoment: '2027-04-17', herinneringen: [] };

for (const soort of ['concert', 'diverse']) {
  test(`${soort}: bestuursprijs vervangt uitsluitend de dossierprijs, niet het vanaf-/op-aanvraagtarief`, () => {
    const invoer = { soort, catalogus: { prijstype: soort === 'concert' ? 'op_aanvraag' : 'vanaf', bedrag: 250 }, boekingBedrag: 745.50 };
    assert.equal(kiesGoedgekeurdePrijs(invoer).ok, false);
    assert.equal(kiesGoedgekeurdePrijs({ ...invoer, mandaat: { huurprijsEuro: 745.50, prijsBron: 'bestuur', geverifieerd: false } }).ok, false);
    assert.deepEqual(kiesGoedgekeurdePrijs({ ...invoer, mandaat: { huurprijsEuro: 745.50, prijsBron: 'bestuur', geverifieerd: true } }), { ok: true, prijsEuro: 745.50 });
    assert.equal(invoer.catalogus.bedrag, 250);
    assert.equal(kiesGoedgekeurdePrijs({ ...invoer, mandaat: { huurprijsEuro: 745.50, prijsBron: 'tarief', geverifieerd: true } }).ok, false);
  });
}

test('een huidig catalogustarief overschrijft een bevroren bestuursmandaat niet', () => {
  assert.deepEqual(kiesGoedgekeurdePrijs({ soort: 'expositie', catalogus: { prijstype: 'vast', bedrag: 525 }, boekingBedrag: 490,
    mandaat: { huurprijsEuro: 490, prijsBron: 'tarief', geverifieerd: true } }), { ok: true, prijsEuro: 490 });
  assert.equal(kiesGoedgekeurdePrijs({ soort: 'concert', catalogus: null, boekingBedrag: 800,
    mandaat: { huurprijsEuro: 745.50, prijsBron: 'bestuur', geverifieerd: true } }).ok, false);
});

test('ongeldige prijzen worden niet afgerond tot een te factureren bedrag', () => {
  for (const prijs of [0, -1, NaN, Infinity, 1.001, 100_000_000]) {
    assert.equal(kiesGoedgekeurdePrijs({ soort: 'concert', catalogus: null, boekingBedrag: null,
      mandaat: { huurprijsEuro: prijs, prijsBron: 'bestuur', geverifieerd: true } }).ok, false);
  }
});

test('de database moet het mandaat verifiëren vóór de prijs gelezen wordt', async () => {
  let gelezen = false;
  const client = { rpc: async () => ({ data: false, error: null }), from() { gelezen = true; throw new Error('mag niet'); } };
  const uit = await leesGecontroleerdMandaat(client as never, 10, 11);
  assert.equal(uit.ok, false); assert.equal(gelezen, false);
});

test('gecontroleerd mandaat bevat het bevroren profiel en de oorspronkelijke prijs', async () => {
  const profiel = { tijdVan: '10:00', tijdTot: '17:00' };
  const rij = { aanvraag_id: 10, boeking_id: 11, aanvraag_versie: 'abc', besluit: 'ja', status: 'toegewezen', huurprijs_euro: '745.50', prijs_bron: 'bestuur', actor_label: 'bestuursmailbox', contract_profiel: profiel, vastgelegd_op: '2026-11-25T10:00:00Z' };
  const q = { select() { return q; }, eq() { return q; }, async maybeSingle() { return { data: rij, error: null }; } };
  const uit = await leesGecontroleerdMandaat({ rpc: async () => ({ data: true, error: null }), from: () => q } as never, 10, 11);
  assert.equal(uit.ok, true);
  if (uit.ok) { assert.equal(uit.mandaat.huurprijsEuro, 745.50); assert.deepEqual(uit.mandaat.contractProfiel, profiel); }
});

const gereed = { boekingStatus: 'optie', aanvraagStatus: 'goedgekeurd',
  versie: { ondertekening: 'ontvangen', bestuur: 'akkoord', bestuurVerplicht: true },
  aanbetalingBedrag: 0, aanbetalingOntvangen: false, aanbetalingTegenstrijdig: false, overlapt: false };

test('regressie: nul aanbetaling en getekend contract is geen bewijs van volledige huurontvangst', () => {
  assert.equal(magAutomatischDefinitief(gereed), false);
  assert.equal(magAutomatischDefinitief({ ...gereed, betalingVereist: 'volledig', volledigBetaald: false }), false);
  assert.equal(magAutomatischDefinitief({ ...gereed, betalingVereist: 'volledig', volledigBetaald: true }), true);
  assert.equal(magAutomatischDefinitief({ ...gereed, betalingVereist: 'geen' }), true);
});

test('beide volgordes vereisen dezelfde actuele handtekening en betaalvoorwaarde', () => {
  assert.equal(magAutomatischDefinitief({ ...gereed, volledigBetaald: true, versie: { ...gereed.versie, ondertekening: 'open' } }), false);
  assert.equal(magAutomatischDefinitief({ ...gereed, volledigBetaald: true, versie: { ...gereed.versie, bestuur: 'terug' } }), false);
  assert.equal(magAutomatischDefinitief({ ...gereed, aanbetalingBedrag: 100, aanbetalingOntvangen: true }), true);
  assert.equal(magAutomatischDefinitief({ ...gereed, aanbetalingBedrag: 100, aanbetalingOntvangen: true, aanbetalingTegenstrijdig: true }), false);
});

test('restfactuur volgt eigen afgesproken moment, niet de datum van de optie', () => {
  assert.deepEqual(planFinancieleTermijnen({ status: 'definitief', vandaag: '2027-04-16', termijnen: [termijn] }), []);
  assert.deepEqual(planFinancieleTermijnen({ status: 'definitief', vandaag: '2027-04-17', termijnen: [termijn] }), [{ betalingId: 22, soort: 'factuur', saldoCent: 39000 }]);
  assert.deepEqual(planFinancieleTermijnen({ status: 'geannuleerd', vandaag: '2027-06-01', termijnen: [termijn] }), []);
});

test('geen betalingsherinnering voordat de nota aantoonbaar verzonden is', () => {
  const zonder = { ...termijn, soort: 'aanbetaling', factuurId: 123 };
  assert.deepEqual(planFinancieleTermijnen({ status: 'optie', vandaag: '2027-06-01', termijnen: [zonder] }), []);
});

test('herinneringen volgen vervaldag, actuele deelbetaling en eerdere verzendstap', () => {
  const t = { ...termijn, factuurId: 123, factuurVerzondenOp: '2027-04-17T12:00:00Z', ontvangenCent: 10000 };
  assert.deepEqual(planFinancieleTermijnen({ status: 'definitief', vandaag: '2027-05-07', termijnen: [t] }), []);
  assert.deepEqual(planFinancieleTermijnen({ status: 'definitief', vandaag: '2027-05-08', termijnen: [t] }), [{ betalingId: 22, soort: 'herinnering_1', saldoCent: 29000 }]);
  assert.deepEqual(planFinancieleTermijnen({ status: 'definitief', vandaag: '2027-05-15', termijnen: [{ ...t, herinneringen: ['herinnering_1'] }] }), [{ betalingId: 22, soort: 'herinnering_2', saldoCent: 29000 }]);
  assert.deepEqual(planFinancieleTermijnen({ status: 'definitief', vandaag: '2027-05-15', termijnen: [{ ...t, ontvangenCent: 39000, status: 'ontvangen' }] }), []);
});

test('een pas na de vervaldag verzonden nota krijgt geen onmiddellijke achterstalligheidsmail', () => {
  const t = { ...termijn, factuurVerzondenOp: '2027-05-20T10:00:00Z' };
  assert.deepEqual(planFinancieleTermijnen({ status: 'definitief', vandaag: '2027-05-20', termijnen: [t] }), []);
  assert.equal(planFinancieleTermijnen({ status: 'definitief', vandaag: '2027-05-27', termijnen: [t] })[0]?.soort, 'herinnering_1');
});

const event = { bron: 'boekhouding', eventId: 'transactie-123', betalingId: 22, bedragCent: 10000, ontvangenOp: '2027-04-20T10:00:00Z' };
test('ontvangstimport vereist een eenduidig termijn-id, een centbedrag en unieke bron-id', () => {
  assert.equal(betaalontvangstFout(event), null);
  for (const slecht of [{ ...event, betalingId: 0 }, { ...event, bedragCent: 0 }, { ...event, bedragCent: 1.1 }, { ...event, eventId: '' }]) assert.notEqual(betaalontvangstFout(slecht), null);
  assert.equal(leesBetaalimport(JSON.stringify({ events: [event] })).ok, true);
  assert.equal(leesBetaalimport(JSON.stringify({ events: [{ ...event, bedragCent: '10000' }] })).ok, false);
  assert.equal(leesBetaalimport(JSON.stringify({ events: Array(101).fill(event) })).ok, false);
});

test('HMAC bindt body en tijdstip; ontbrekende secret, manipulatie en verlopen replay worden geweigerd', () => {
  const raw = JSON.stringify({ events: [event] }), secret = 'test-only-'.repeat(5), timestamp = '1800000000';
  const signature = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
  const invoer = { raw, secret, timestamp, signature, nuMs: 1_800_000_000_000 };
  assert.equal(verifieerBetaalimport(invoer), true);
  assert.equal(verifieerBetaalimport({ ...invoer, raw: raw.replace('10000', '90000') }), false);
  assert.equal(verifieerBetaalimport({ ...invoer, nuMs: invoer.nuMs + 301_000 }), false);
  assert.equal(verifieerBetaalimport({ ...invoer, secret: '' }), false);
  assert.equal(verifieerBetaalimport({ ...invoer, signature: 'bad' }), false);
});

test('activatie vereist expliciete datum en complete standaardafspraken', () => {
  const data = new FormData(); data.set('machine_actief', 'ja');
  assert.equal(leesVerhuurProfielenFormulier(data).ok, false);
  data.set('machine_vanaf', '2027-02-30'); assert.equal(leesVerhuurProfielenFormulier(data).ok, false);
  data.set('machine_vanaf', '2027-01-01');
  const p = { actief: 'ja', tijdVan: '10:00', tijdTot: '17:00', opbouw: 'Vanaf 09:00', afbouw: 'Tot 18:00', aanbetalingEuro: '100,25', betalingBinnenDagen: '14', restantMaandenVoorStart: '1', kortVoorStartVolledig: 'ja', restFactuurDagenVoorVerval: '14' };
  for (const [k, v] of Object.entries(p)) data.set(`profiel:concert:${k}`, v);
  const uit = leesVerhuurProfielenFormulier(data); assert.equal(uit.ok, true);
  if (uit.ok) { assert.equal(uit.profielen.concert?.aanbetalingEuro, 100.25); assert.equal(uit.profielen.concert?.restFactuurDagenVoorVerval, 14); assert.equal(uit.machine.historieCompleet, false); }
});

test('ontvangst zonder betrouwbare transactionele bevestiging promoveert nooit', async () => {
  let promoties = 0;
  for (const antwoord of [
    { data: null, error: { message: 'Geen geverifieerde termijn' } },
    { data: { boeking_id: 11, betaling_id: 99, volledig: true }, error: null },
  ]) {
    const uit = await verwerkBetaalontvangst({ client: { rpc: async () => antwoord } as never, event,
      actor: { type: 'systeem', id: 'system', naam: 'Testadapter' },
      promoveer: async () => { promoties++; return { gepromoveerd: true }; } });
    assert.equal(uit.ok, false);
  }
  assert.equal(promoties, 0);
});

test('deelontvangst blijft een open termijn; een storing na volledige ontvangst verliest geen bewijs', async () => {
  let promoties = 0;
  const input = { event, actor: { type: 'systeem' as const, id: 'system', naam: 'Testadapter' },
    promoveer: async () => { promoties++; throw new Error('Vervolgjob herstelt'); } };
  const deel = await verwerkBetaalontvangst({ ...input, client: { rpc: async () => ({ data: { boeking_id: 11, betaling_id: 22, volledig: false }, error: null }) } as never });
  assert.equal(deel.ok, true); assert.equal(promoties, 0); assert.match(deel.melding, /deelbetaling/);
  const vol = await verwerkBetaalontvangst({ ...input, client: { rpc: async () => ({ data: { boeking_id: 11, betaling_id: 22, volledig: true }, error: null }) } as never });
  assert.equal(vol.ok, true); assert.equal(promoties, 1); assert.match(vol.melding, /ontvangen/);
});
