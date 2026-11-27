import assert from 'node:assert/strict';
import test from 'node:test';
import { herstelOndertekenbevestiging } from '../src/lib/operatie/herstel-ondertekenbevestiging.ts';
import type { Actor } from '../src/lib/operatie/kern.ts';

const actor: Actor = { type: 'gebruiker', id: '11111111-1111-4111-8111-111111111111', naam: 'Test Beheerder',
  rechten: { isSuperAdmin: false, perModule: { instellingen: 'schrijven', aanvragen: 'schrijven' } } };
const basis = { actor, boekingId: 42, contractversieId: 100, richting: 'huurder' as const,
  uitkomst: 'geaccepteerd' as const, providerId: 'provider-huurder-123', bewijs: 'Providerlog gecontroleerd: bericht geaccepteerd op het juiste tijdstip.' };

test('alleen een bevoegde menselijke beheerder kan ontvangstmailherstel starten', async () => {
  for (const kandidaat of [
    { ...actor, type: 'systeem' as const },
    { ...actor, rechten: { isSuperAdmin: false, perModule: { aanvragen: 'schrijven' as const } } },
    { ...actor, rechten: { isSuperAdmin: false, perModule: { instellingen: 'schrijven' as const } } },
  ]) {
    let calls = 0;
    const uit = await herstelOndertekenbevestiging({ ...basis, actor: kandidaat,
      client: { async rpc() { calls += 1; return { data: null, error: null }; } } });
    assert.equal(uit.ok, false);
    assert.equal(calls, 0);
  }
});

test('ontbrekend providerbewijs, korte toelichting of verkeerde dossieridentiteit stopt vóór SQL', async () => {
  for (const extra of [{ bewijs: 'gecheckt' }, { providerId: '' }, { boekingId: 0 }, { contractversieId: NaN }, { bewijs: 'x'.repeat(2001) }]) {
    let calls = 0;
    const uit = await herstelOndertekenbevestiging({ ...basis, ...extra,
      client: { async rpc() { calls += 1; return { data: null, error: null }; } } });
    assert.equal(uit.ok, false);
    assert.equal(calls, 0);
  }
});

test('één herstelde ontvanger hervat de job niet zolang de andere onzeker is', async () => {
  let parameters: Record<string, unknown> | null = null;
  const uit = await herstelOndertekenbevestiging({ ...basis, client: { async rpc(naam, p) {
    assert.equal(naam, 'herstel_contract_ontvangstmail');
    parameters = p;
    return { data: { ok: true, hervat: false, status: 'onzeker' }, error: null };
  } } });
  assert.equal(uit.ok, true);
  assert.equal(uit.hervat, false);
  assert.match(uit.melding, /andere ontvanger/);
  assert.deepEqual(parameters, { p_boeking_id: 42, p_contractversie_id: 100,
    p_richting: 'huurder', p_uitkomst: 'geaccepteerd', p_provider_id: 'provider-huurder-123', p_bewijs: basis.bewijs });
});

test('bewijs niet-verzonden raakt alleen de gekozen bestuursontvanger en kan gecontroleerd hervatten', async () => {
  const uit = await herstelOndertekenbevestiging({ ...basis, richting: 'bestuur', uitkomst: 'niet_verzonden',
    client: { async rpc(_naam, p) {
      assert.equal(p.p_richting, 'bestuur');
      assert.equal(p.p_provider_id, null);
      assert.equal(p.p_uitkomst, 'niet_verzonden');
      return { data: { ok: true, hervat: true, status: 'te_doen' }, error: null };
    } } });
  assert.equal(uit.ok, true);
  assert.equal(uit.hervat, true);
  assert.equal(uit.status, 'te_doen');
});

test('beide bewezen verzendingen ronden af zonder een nieuwe mail te plannen', async () => {
  const uit = await herstelOndertekenbevestiging({ ...basis, client: { async rpc() {
    return { data: { ok: true, hervat: false, status: 'afgerond' }, error: null };
  } } });
  assert.equal(uit.ok, true);
  assert.equal(uit.hervat, false);
  assert.match(uit.melding, /geen nieuwe mail/);
});

test('SQL-weigering, netwerkfout of onbevestigd herstel wordt niet als succes getoond', async () => {
  for (const rpc of [
    async () => ({ data: null, error: { message: 'Deze job loopt nog; herstel geweigerd.' } }),
    async () => ({ data: {}, error: null }),
    async () => { throw new Error('antwoord verloren'); },
  ]) {
    const uit = await herstelOndertekenbevestiging({ ...basis, client: { rpc } });
    assert.equal(uit.ok, false);
    assert.equal(uit.hervat, undefined);
  }
});
