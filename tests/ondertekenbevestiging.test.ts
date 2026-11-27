import assert from 'node:assert/strict';
import test from 'node:test';
import { verwerkOndertekenbevestiging } from '../src/lib/operatie/ondertekenbevestiging.ts';
import type { ContractTekenClient } from '../src/lib/operatie/contract-tekenwinkel.ts';
import type { MailBericht, TransportUitkomst } from '../src/lib/mail-transport.ts';
import { pdfBytes } from '../src/platform/documenten/pdf.ts';
import { sha256Hex } from '../src/platform/contract-pakket.ts';

function provider(id = 'provider-1'): TransportUitkomst {
  return { verzonden: true, providerAangeroepen: true, providerBerichtId: id,
    besluit: { modus: 'aan', provider: true, uitvoeren: true, reden: 'testfixture' } as TransportUitkomst['besluit'] };
}

function fixture() {
  const pdf = pdfBytes('Dit zijn de daadwerkelijk ondertekende en onveranderlijk bewaarde bytes.');
  const staat = { geannuleerd: false, verkeerdBewijs: false, bewijsFout: false, externId: null as string | null, internId: null as string | null,
    claims: new Map<string, { status: string; claimToken: string; providerId: string | null }>() };
  const client: ContractTekenClient = {
    async rpc(naam, p) {
      if (naam === 'claim_contract_ontvangstmail') {
        const richting = String(p.p_richting);
        const oud = staat.claims.get(richting);
        if (oud && oud.status !== 'niet_verzonden') return { data: oud, error: null };
        const claimToken = `11111111-1111-4111-8111-${richting === 'huurder' ? '111111111111' : '222222222222'}`;
        staat.claims.set(richting, { status: 'bezig', claimToken, providerId: null });
        return { data: { status: 'geclaimd', claimToken }, error: null };
      }
      if (naam === 'registreer_contract_ontvangstmail_resultaat') {
        if (staat.bewijsFout) return { data: null, error: { message: 'databasefout na provideracceptatie' } };
        const claim = staat.claims.get(String(p.p_richting));
        assert.equal(claim?.claimToken, p.p_claim_token);
        claim!.status = String(p.p_status);
        claim!.providerId = p.p_provider_id == null ? null : String(p.p_provider_id);
        if (p.p_status === 'verzonden') {
          if (p.p_richting === 'huurder') staat.externId = String(p.p_provider_id);
          else staat.internId = String(p.p_provider_id);
        }
        return { data: true, error: null };
      }
      assert.equal(naam, 'lees_contract_ondertekening_voor_bevestiging');
      assert.equal(p.p_boeking_id, 42);
      assert.equal(p.p_contractversie_id, 100);
      return { error: null, data: staat.geannuleerd ? null : {
        contractversie_id: 100, actuele_versie: 1, machine_proces: true,
        boeking: { status: 'optie', huurder_naam_snapshot: 'Test Huurder', verhuurtype_sleutel: 'expositie' },
        contract: { contractnummer: 'KVP-42-1', bestuur: 'akkoord', bestuur_verplicht: true, tekst: 'Vast contract' },
        tekening: { boeking_id: 42, versie: 1, token_hash: 'a'.repeat(64),
          verloopt_op: '2026-12-01T00:00:00Z', ondertekend_op: '2026-11-25T10:00:00Z',
          naam: 'Test Persoon', email: 'exposant@example.test', vrijgegeven: true,
          document_hash: 'b'.repeat(64), pdf_hash: sha256Hex(pdf), pdf_pad: 'contracten/42/getekend-v1-bewijs.pdf',
          bevestiging_id: staat.externId, bestuur_bevestiging_id: staat.internId },
      } };
    },
    storage: { from() { return {
      async upload() { throw new Error('Deze mailstap mag geen bewijs herschrijven.'); },
      async download() { return { data: { async arrayBuffer() {
        return Uint8Array.from(staat.verkeerdBewijs ? pdfBytes('Gewijzigde PDF') : pdf).buffer;
      } }, error: null }; },
    }; } },
  };
  return { client, staat, pdf, input: { client, boekingId: 42, contractversieId: 100, env: { VERHUUR_MACHINE: 'true' } } };
}

test('de duurzame ontvangstmail gebruikt opgeslagen PDF en bewijs per ontvanger; herhalen verzendt niets', async () => {
  const f = fixture();
  const mails: MailBericht[] = [];
  const verstuur: NonNullable<Parameters<typeof verwerkOndertekenbevestiging>[0]['verstuur']> = async (mail, opties) => {
    assert.equal(opties?.vereisteLiveModus, true);
    assert.equal(mail.berichtsoort, 'geen_betaling');
    assert.equal(mail.eisBijlagen, true);
    assert.deepEqual(mail.bijlagen?.[0].inhoud, f.pdf);
    mails.push(mail);
    return provider(`provider-${mails.length}`);
  };
  const eerste = await verwerkOndertekenbevestiging({ ...f.input, verstuur });
  assert.equal(eerste.ok, true);
  assert.equal(eerste.providerId, 'provider-1');
  assert.equal(f.staat.externId, 'provider-1');
  assert.equal(f.staat.internId, 'provider-2');
  assert.deepEqual(mails.map((m) => m.idempotentieSleutel), ['ondertekend:42:100:aanvrager', 'ondertekend:42:100:intern']);
  assert.equal((await verwerkOndertekenbevestiging({ ...f.input, verstuur })).ok, true);
  assert.equal(mails.length, 2);
});

test('annulering, verkeerde jobidentiteit en afwijkende bewijsbytes stoppen vóór de provider', async () => {
  for (const situatie of ['geannuleerd', 'verkeerdBewijs', 'sleutel', 'machine-uit']) {
    const f = fixture();
    if (situatie === 'geannuleerd') f.staat.geannuleerd = true;
    if (situatie === 'verkeerdBewijs') f.staat.verkeerdBewijs = true;
    let calls = 0;
    const uit = await verwerkOndertekenbevestiging({ ...f.input,
      sleutel: situatie === 'sleutel' ? 'ondertekend:42:99' : undefined,
      env: { VERHUUR_MACHINE: situatie === 'machine-uit' ? 'false' : 'true' },
      verstuur: async () => { calls += 1; return provider(); },
    });
    assert.equal(uit.ok, false, situatie);
    assert.equal(uit.wachtOpMens, true);
    assert.equal(calls, 0);
  }
});

test('uitgeschakelde mailpoort wordt niet als verzonden of onzeker opgeslagen', async () => {
  const f = fixture();
  const uit = await verwerkOndertekenbevestiging({ ...f.input,
    verstuur: async () => ({ ...provider(), verzonden: false, providerAangeroepen: false, providerBerichtId: null, melding: 'Mailpoort staat uit.' }),
  });
  assert.equal(uit.ok, false);
  assert.equal(uit.onzeker, undefined);
  assert.equal(uit.wachtOpMens, true);
  assert.equal(f.staat.externId, null);
});

test('provider-time-out geeft onzeker en geen automatische toestemming opnieuw te verzenden', async () => {
  const f = fixture();
  const uit = await verwerkOndertekenbevestiging({ ...f.input, verstuur: async () => { throw new Error('time-out'); } });
  assert.equal(uit.ok, false);
  assert.equal(uit.onzeker, true);
  assert.equal(uit.wachtOpMens, true);
  assert.equal(f.staat.externId, null);
  assert.equal(f.staat.claims.get('huurder')?.status, 'onzeker');
  let opnieuwVerzonden = 0;
  const hervat = await verwerkOndertekenbevestiging({ ...f.input, verstuur: async () => { opnieuwVerzonden += 1; return provider(); } });
  assert.equal(hervat.onzeker, true);
  assert.equal(opnieuwVerzonden, 0);
});

test('databasefout na provideracceptatie bewaart bekende provider-id in onzeker resultaat', async () => {
  const f = fixture();
  f.staat.bewijsFout = true;
  const uit = await verwerkOndertekenbevestiging({ ...f.input, verstuur: async () => provider('geaccepteerd-123') });
  assert.equal(uit.ok, false);
  assert.equal(uit.onzeker, true);
  assert.equal(uit.providerId, 'geaccepteerd-123');
  assert.equal(f.staat.externId, null);
  let opnieuwVerzonden = 0;
  await verwerkOndertekenbevestiging({ ...f.input, verstuur: async () => { opnieuwVerzonden += 1; return provider(); } });
  assert.equal(opnieuwVerzonden, 0, 'een nieuwe root-jobclaim mag geen onbekende dispatch herhalen');
});

test('herstel na geblokkeerde interne mail verstuurt de huurdersmail niet opnieuw', async () => {
  const f = fixture();
  let calls = 0;
  const eerste = await verwerkOndertekenbevestiging({ ...f.input, verstuur: async () => {
    calls += 1;
    return calls === 1 ? provider('extern-123') : { ...provider(), verzonden: false, providerAangeroepen: false, providerBerichtId: null };
  } });
  assert.equal(eerste.ok, false);
  assert.equal(f.staat.externId, 'extern-123');
  assert.equal(f.staat.internId, null);
  const hervat: MailBericht[] = [];
  const opnieuw = await verwerkOndertekenbevestiging({ ...f.input, verstuur: async (mail) => { hervat.push(mail); return provider('intern-456'); } });
  assert.equal(opnieuw.ok, true);
  assert.deepEqual(hervat.map((m) => m.richting), ['intern']);
});

test('annulering tussen de twee ontvangers verhindert de tweede provideractie', async () => {
  const f = fixture();
  let calls = 0;
  const uit = await verwerkOndertekenbevestiging({ ...f.input, verstuur: async () => {
    calls += 1;
    f.staat.geannuleerd = true;
    return provider('extern-123');
  } });
  assert.equal(uit.ok, false);
  assert.equal(calls, 1);
  assert.equal(f.staat.externId, 'extern-123');
  assert.equal(f.staat.internId, null);
});

test('twee uitvoerders kunnen per ontvanger slechts één provideractie beginnen', async () => {
  const f = fixture();
  const verstuurd: string[] = [];
  const verstuur: NonNullable<Parameters<typeof verwerkOndertekenbevestiging>[0]['verstuur']> = async (mail) => {
    verstuurd.push(mail.richting!);
    return provider(`provider-${mail.richting}`);
  };
  const uit = await Promise.all([
    verwerkOndertekenbevestiging({ ...f.input, verstuur }),
    verwerkOndertekenbevestiging({ ...f.input, verstuur }),
  ]);
  assert.equal(uit.some((r) => r.ok), true);
  assert.deepEqual(verstuurd.sort(), ['aanvrager', 'intern']);
});
