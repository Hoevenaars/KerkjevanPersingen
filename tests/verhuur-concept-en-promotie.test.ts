import assert from 'node:assert/strict';
import test from 'node:test';
import { keurMachineConceptGoed, leesMachineConceptBeoordeling } from '../src/lib/operatie/verhuur-concept-herbeoordeling.ts';
import { promoveerMachineAlsKlaar } from '../src/lib/operatie/verhuur-promotie.ts';
import type { Actor } from '../src/lib/operatie/kern.ts';
import type { MachineClient, Rij } from '../src/lib/verhuurmachine/beoordeling.ts';

const A = 'a'.repeat(64), B = 'b'.repeat(64), C = 'c'.repeat(64);
const actor: Actor = { type: 'gebruiker', id: '00000000-0000-4000-8000-000000000001', naam: 'Testbestuur',
  rechten: { isSuperAdmin: false, perModule: { aanvragen: 'schrijven', instellingen: 'schrijven' } } };
function fixture() {
  const prijs = '745,50';
  const bron: Rij = {
    aanvraag_versie: A, bron_versie: B, snapshot_hash: C,
    contract: { id: 22, boeking_id: 11, versie: 2, contractnummer: 'KVP-TEST-v2', tekst: 'Ongewijzigde opgeslagen tekst.' },
    wizard: { huurprijs: prijs, aanbetaling: '100,00', tijdVan: '10:00', tijdTot: '17:00',
      aanbetalingVerval: '2027-06-01', restVerval: '2027-07-01', restFactuurDagenVoorVerval: '14' },
    betalingen: [{ id: 31, soort: 'aanbetaling', bedrag: '100.00', vervaldatum: '2027-06-01', factuur_op: '2027-05-18' },
      { id: 32, soort: 'restant', bedrag: '645.50', vervaldatum: '2027-07-01', factuur_op: '2027-06-17' }],
    toelaatbaar: true, blokkade: null, eigenaar: 'Bestuur en penningmeester', opvolgen_voor: null,
    beoordelingsbron: {
      aanvraag_versie: A, bron_versie: 'onderliggende-bron', aanvraag: { id: 10, boeking_id: 11, status: 'goedgekeurd',
        naam: 'Testorganisator', email: 'test@example.test', verhuurtype_sleutel: 'concert', start_datum: '2027-07-10', eind_datum: '2027-07-10', akkoord_voorwaarden: true },
      aanvragen: [], boekingen: [], activiteiten: [], blokkades: [], tarieven: [], fotos: [],
      instellingen: { verhuur_machine: { historieCompleet: true, beleid: { maanden: 18, grondslag: 'einde_begin', versie: 'expositie-18m-einde-begin-v1' } } },
    },
  };
  const oproepen: { naam: string; args: Rij }[] = [];
  const client: MachineClient = { from() { throw new Error('Geen losse tabelmutatie'); }, async rpc(naam, args = {}) {
    oproepen.push({ naam, args });
    return { error: null, data: naam === 'verhuur_concept_beoordelingsbron' ? structuredClone(bron)
      : { ok: true, boekingId: 11, revisie: 2, melding: 'Concreet concept goedgekeurd.' } };
  } };
  return { bron, client, oproepen, input: { client, actor, aanvraagId: 10, contractversieId: 22,
    aanvraagVersie: A, bronVersie: B, reden: 'De concrete termijn en prijs zijn door het bestuur gecontroleerd.' } };
}

test('conceptpreview behoudt precies de opgeslagen prijs en termijnen; POST voert geen nieuwe prijs in', async () => {
  const f = fixture();
  const v = await leesMachineConceptBeoordeling(f.client, 10, 22);
  assert.equal(v.wizard.huurprijs, '745,50');
  assert.equal(v.betalingen[1]!.bedrag, '645.50');
  const r = await keurMachineConceptGoed(f.input);
  assert.equal(r.ok, true);
  const mutatie = f.oproepen.find(c => c.naam === 'verhuur_keur_concept_goed');
  assert.ok(mutatie); assert.equal(mutatie.args.p_bron_versie, B);
  assert.equal('p_huurprijs_euro' in mutatie.args, false);
});

test('ongewijzigde aanvraag maar gewijzigd concept/termijn/bron mag niet met oude preview worden goedgekeurd', async () => {
  const f = fixture(); f.bron.bron_versie = C;
  const r = await keurMachineConceptGoed(f.input);
  assert.equal(r.ok, false); assert.match(r.melding, /gewijzigd/);
  assert.equal(f.oproepen.some(c => c.naam === 'verhuur_keur_concept_goed'), false);
});

test('een systeemactor kan geen nieuwe menselijke conceptgoedkeuring simuleren', async () => {
  const f = fixture();
  assert.equal((await keurMachineConceptGoed({ ...f.input, actor: { ...actor, type: 'systeem', id: 'system' } })).ok, false);
  assert.equal(f.oproepen.length, 0);
});

test('herhaalde POST na geslaagde commit wordt door dezelfde transactionele RPC ontdubbeld', async () => {
  const f = fixture(); f.bron.bron_versie = C;
  f.bron.huidig_besluit = { status: 'toegewezen', contractversie_id: 22, aanvraag_versie: A, concept_bron_versie: B };
  assert.equal((await keurMachineConceptGoed(f.input)).ok, true);
  assert.equal(f.oproepen.filter(c => c.naam === 'verhuur_keur_concept_goed').length, 1);
});

test('definitiefcontrole valt alleen terug op legacy na een expliciete databasebevestiging', async () => {
  for (const data of [null, {}, { machine: true, ok: true }, { machine: false }, { machine: true, ok: false, gepromoveerd: true }]) {
    const r = await promoveerMachineAlsKlaar({ rpc: async () => ({ data, error: null }) } as never, 11, actor);
    assert.equal(r.behandeld, true);
    if (r.behandeld) { assert.equal(r.ok, false); assert.equal(r.gepromoveerd, false); }
  }
  assert.deepEqual(await promoveerMachineAlsKlaar({ rpc: async () => ({ data: { machine: false, ok: true }, error: null }) } as never, 11, actor), { behandeld: false });
});

test('annulering/herbeoordeling en RPC-fout geven geen definitiefclaim of onbewaakte fallback', async () => {
  const afgewezen = await promoveerMachineAlsKlaar({ rpc: async () => ({ data: { machine: true, ok: false, gepromoveerd: false, melding: 'Herbeoordeling vereist.' }, error: null }) } as never, 11, actor);
  assert.deepEqual(afgewezen, { behandeld: true, ok: false, gepromoveerd: false, melding: 'Herbeoordeling vereist.' });
  const kapot = await promoveerMachineAlsKlaar({ rpc: async () => { throw new Error('Verbinding verbroken'); } } as never, 11, actor);
  assert.equal(kapot.behandeld, true);
  if (kapot.behandeld) { assert.equal(kapot.ok, false); assert.equal(kapot.gepromoveerd, false); }
  const goed = await promoveerMachineAlsKlaar({ rpc: async () => ({ data: { machine: true, ok: true, gepromoveerd: true, melding: 'Definitief.' }, error: null }) } as never, 11, actor);
  assert.deepEqual(goed, { behandeld: true, ok: true, gepromoveerd: true, melding: 'Definitief.' });
});
