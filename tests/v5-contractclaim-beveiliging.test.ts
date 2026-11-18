import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { reserveerLiveContractVerzending } from '../src/lib/operatie/contract-verzendclaim.ts';
import { contractProviderUitkomstOnzeker } from '../src/platform/verzend-onzekerheid.ts';

const mail = { boekingId: 44, versie: 2, soort: 'contract' as const,
  idempotentie: 'contract:44:2', ontvanger: 'test@example.invalid', werkelijk: 'test@example.invalid' };

test('live verzendclaim valt niet terug op een onveilige INSERT als RPC ontbreekt', async () => {
  const r = await reserveerLiveContractVerzending({}, mail);
  assert.equal(r.ok, false);
});

test('RPC met onleesbaar antwoord mag geen provider-call mogelijk maken', async () => {
  for (const data of [null, undefined, {}, 0, -1, NaN]) {
    const r = await reserveerLiveContractVerzending({ rpc: async () => ({ data, error: null }) }, mail);
    assert.equal(r.ok, false, String(data));
  }
});

test('alleen een positief claim-ID van de juiste RPC mag door', async () => {
  let keren = 0;
  const r = await reserveerLiveContractVerzending({
    rpc: async (naam, args) => {
      keren++;
      assert.equal(naam, 'claim_contractverzending');
      assert.equal(args.p_boeking_id, 44);
      assert.equal(args.p_versie, 2);
      assert.equal(args.p_soort, 'contract');
      return { data: 19, error: null };
    },
  }, mail);
  assert.equal(r.ok, true);
  assert.equal(keren, 1);
  if (r.ok) assert.equal(r.id, 19);
});

test('database weigering geeft geen toestemming om te verzenden', async () => {
  const r = await reserveerLiveContractVerzending({ rpc: async () => ({ data: null, error: { message: 'Er loopt al een verzending' } }) }, mail);
  assert.equal(r.ok, false);
});

test('provider timeout is ONZEKER, niet veilig te resetten als geweigerd', () => {
  assert.equal(contractProviderUitkomstOnzeker({ livePakket: true, providerWierpFout: true, verzonden: false }), true);
  assert.equal(contractProviderUitkomstOnzeker({ livePakket: true, providerWierpFout: false, verzonden: false, providerAangeroepen: true }), true);
  assert.equal(contractProviderUitkomstOnzeker({ livePakket: true, providerWierpFout: false, verzonden: false }), true);
  assert.equal(contractProviderUitkomstOnzeker({ livePakket: true, providerWierpFout: false, verzonden: false, providerAangeroepen: false }), false);
  assert.equal(contractProviderUitkomstOnzeker({ livePakket: true, providerWierpFout: false, verzonden: true, providerAangeroepen: true }), false);
  assert.equal(contractProviderUitkomstOnzeker({ livePakket: false, providerWierpFout: true, verzonden: false }), false);
});

test('migratie is fail-closed en blokkeert live claim op oudere versie', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261118190000_contractverzendclaim_atomair.sql', import.meta.url), 'utf8');
  assert.match(sql, /auth\.uid\(\) IS NULL/i);
  assert.match(sql, /FROM public\.boekingen WHERE id = p_boeking_id FOR UPDATE/i);
  assert.match(sql, /v_versie\.versie <> p_versie/i);
  assert.match(sql, /status = 'bezig'/i);
  assert.match(sql, /CREATE TRIGGER contractversies_verzendlock/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.claim_contractverzending/i);
});

test('tweede Ja blokkeert oud contractpakket als de 3-PDF-vlag uit staat', async () => {
  const code = await readFile(new URL('../src/lib/operatie/contract-besluit.ts', import.meta.url), 'utf8');
  assert.match(code, /if \(!factuurpakketAan\(input\.env\)\)/);
});

test('boekingsroute mag live mailmodus nooit overrulen', async () => {
  const code = await readFile(new URL('../src/pages/beheer/boekingen/[id].astro', import.meta.url), 'utf8');
  assert.match(code, /vereisteLiveModus: mail\.teltAlsVerzonden/);
});
