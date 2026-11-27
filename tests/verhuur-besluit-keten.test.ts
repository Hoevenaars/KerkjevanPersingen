import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { behandelBestuursBeslisPagina } from '../src/lib/verhuurmachine/beslispagina.ts';
import { verwerkVerhuurStap, verwerkVerhuurmachine, type ProcesJob } from '../src/lib/verhuurmachine/proces.ts';
import { verstuurGecontroleerd, type MailBericht } from '../src/lib/mail-transport.ts';
import { STANDAARD_AUTOMATISERINGEN, type AutomatiseringStatus } from '../src/platform/automatisering.ts';
import {
  bevestigingsBewijs, beslisGeheim, beslisToken, geldigeBeslislink, nieuweBeslislink, tokenHash,
  type VerhuurBeslislink,
} from '../src/platform/verhuur-beslislink.ts';
import type { MachineClient, Rij } from '../src/lib/verhuurmachine/beoordeling.ts';

// Uitsluitend fictieve brondata en geïnjecteerde opslag/provider. Geen SDK of netwerk.
const NU = new Date('2026-11-25T12:00:00Z');
const SECRET = 'lokaal-testgeheim-voor-bestuursbesluiten-2026';
const ENV = { VERHUUR_MACHINE: 'true', VERHUUR_BESLUIT_SECRET: SECRET, VERHUUR_BASIS_URL: 'https://kerkjepersingen.nl' };
const ORIGIN = 'https://kerkjepersingen.nl';
const clone = <T>(v: T): T => structuredClone(v);

function bron(soort = 'expositie'): Rij {
  return {
    aanvraag_versie: 'aanvraag-v1', bron_versie: 'bron-v1',
    aanvraag: {
      id: 17, status: 'nieuw', naam: 'Karin Janssen', email: 'karin@example.test',
      telefoon: '0612345678', adres: 'Dorpsstraat 1', straat: 'Dorpsstraat', huisnummer: '1',
      postcode: '6575AA', woonplaats: 'Persingen', verhuurtype_sleutel: soort,
      start_datum: '2027-07-10', eind_datum: '2027-07-12', aantal_personen: '20',
      relatie_id: 91, boeking_id: null, website: '', toelichting: 'Een tentoonstelling.',
      akkoord_voorwaarden: true, mede_exposanten: '["Noor van Dijk"]',
    },
    aanvragen: [], boekingen: [], activiteiten: [], blokkades: [], fotos: [],
    tarieven: [{ verhuurtype_sleutel: soort, prijstype: soort === 'expositie' ? 'vast' : 'vanaf', bedrag: soort === 'expositie' ? 420 : 75, geldig_vanaf: '2020-01-01' }],
    instellingen: { verhuur_machine: { historieCompleet: false }, verhuur_autocontract_profielen: {} },
  };
}

function job(extra: Partial<ProcesJob> = {}): ProcesJob {
  return {
    id: 'job-1', aanvraag_id: 17, boeking_id: null, taak: 'bestuursmail', sleutel: 'bestuursmail:17:v1:bestuur',
    status: 'bezig', claim_token: 'claim-1', pogingen: 1,
    payload: { ontvanger: 'bestuur@example.test', aanvraagVersie: 'aanvraag-v1' }, ...extra,
  };
}

function fixture(opties: { soort?: string; zonderLink?: boolean; jobs?: ProcesJob[] } = {}) {
  const bronData = bron(opties.soort);
  const eersteLink = nieuweBeslislink({ aanvraagId: 17, versie: 'aanvraag-v1', ontvanger: 'bestuur@example.test', secret: SECRET, nu: NU });
  const links: VerhuurBeslislink[] = opties.zonderLink ? [] : [eersteLink];
  const jobs = clone(opties.jobs ?? []);
  const mutaties: { naam: string; args: Rij }[] = [];
  const reads: string[] = [];
  const state = { mandaatGeldig: true, besluitFout: '', besluitAantal: 0, wachtNaJa: false };
  const client: MachineClient = {
    async rpc(naam, args = {}) {
      if (naam === 'verhuur_beoordelingsbron') { reads.push(naam); return { data: clone(bronData), error: null }; }
      if (naam === 'verhuur_machine_mag') { reads.push(naam); return { data: state.mandaatGeldig, error: null }; }
      mutaties.push({ naam, args: clone(args) });
      if (naam === 'verhuur_neem_besluit') {
        if (state.besluitFout) return { data: null, error: { message: state.besluitFout } };
        state.besluitAantal++;
        for (const link of links) {
          if (link.aanvraag_id === args.p_aanvraag_id && link.aanvraag_versie === args.p_aanvraag_versie) {
            link.verbruikt_op = NU.toISOString(); link.uitkomst = args.p_besluit as 'ja' | 'nee';
          }
        }
        return { data: { ok: true, besluit: args.p_besluit, wacht: args.p_besluit === 'ja' && state.wachtNaJa }, error: null };
      }
      if (naam === 'verhuur_plan_stap') {
        let bestaand = jobs.find((j) => j.sleutel === args.p_sleutel);
        if (!bestaand) {
          bestaand = job({ id: `job-${jobs.length + 1}`, taak: String(args.p_taak), sleutel: String(args.p_sleutel), boeking_id: args.p_boeking_id as number | null, status: 'te_doen', payload: args.p_payload as Rij, pogingen: 0 });
          jobs.push(bestaand);
        }
        return { data: bestaand.id, error: null };
      }
      if (naam === 'verhuur_claim_stappen') {
        const gekozen = jobs.filter((j) => j.status === 'te_doen').slice(0, Number(args.p_limiet));
        for (const j of gekozen) { j.status = 'bezig'; j.claim_token = `claim-${j.id}`; j.pogingen++; }
        return { data: clone(gekozen), error: null };
      }
      if (naam === 'verhuur_rond_stap_af') {
        const j = jobs.find((r) => r.id === args.p_id && r.status === 'bezig' && r.claim_token === args.p_claim);
        if (j) j.status = String(args.p_status);
        return { data: Boolean(j), error: null };
      }
      throw new Error(`Onverwachte RPC in netwerkvrije test: ${naam}`);
    },
    from(tabel) {
      const filters: [string, unknown][] = [];
      let invoer: Rij | null = null;
      const uitvoeren = async () => {
        if (invoer) {
          if (tabel !== 'verhuur_beslislinks') throw new Error(`Onverwachte insert: ${tabel}`);
          mutaties.push({ naam: `${tabel}.insert`, args: clone(invoer) });
          links.push(clone(invoer as unknown as VerhuurBeslislink));
          return { data: clone(invoer), error: null };
        }
        reads.push(tabel);
        const rijen: readonly Rij[] = tabel === 'verhuur_beslislinks'
          ? links as unknown as Rij[] : tabel === 'verhuur_proces_jobs' ? jobs as unknown as Rij[] : [];
        if (!['verhuur_beslislinks', 'verhuur_proces_jobs'].includes(tabel)) throw new Error(`Onverwachte tabel: ${tabel}`);
        return { data: clone(rijen.find((r) => filters.every(([k, v]) => r[k] === v)) ?? null), error: null };
      };
      const q = {
        select() { return q; }, eq(kolom: string, waarde: unknown) { filters.push([kolom, waarde]); return q; },
        insert(waarde: Rij) { invoer = waarde; return q; }, maybeSingle: uitvoeren, single: uitvoeren,
      };
      return q;
    },
  };
  return { client, bron: bronData, links, jobs, mutaties, reads, state, token: beslisToken(eersteLink, SECRET) };
}

type Fixture = ReturnType<typeof fixture>;
const requestGet = (f: Fixture, method = 'GET') => new Request(`${ORIGIN}/bestuur/besluit/?token=${f.token}&besluit=ja`, { method });
async function bekijk(f: Fixture) {
  const response = await behandelBestuursBeslisPagina(requestGet(f), { client: f.client, env: ENV, nu: NU });
  const html = await response.text();
  const bewijs = html.match(/name="bewijs" value="([^"]+)"/)?.[1];
  assert.ok(bewijs, 'De GET toont een ondertekend bevestigingsbewijs.');
  return { response, html, bewijs };
}
function requestPost(f: Fixture, bewijs: string, besluit: string, extra: Record<string, string> = {}) {
  const data = new FormData();
  for (const [k, v] of Object.entries({ token: f.token, bewijs, besluit, ...extra })) data.set(k, v);
  return new Request(`${ORIGIN}/bestuur/besluit/`, { method: 'POST', headers: { Origin: ORIGIN }, body: data });
}
const register = (status: AutomatiseringStatus) => STANDAARD_AUTOMATISERINGEN.map((r) => r.sleutel === 'aanvraag_bestuur' ? { ...r, status } : r);

describe('bestuurscapability en bevestigingspagina', () => {
  test('GET en HEAD tonen de beoordeling maar wijzigen geen besluit, link of processtap', async () => {
    const f = fixture(); let vervolg = 0;
    const voor = clone(f.links);
    for (const method of ['GET', 'HEAD']) {
      const response = await behandelBestuursBeslisPagina(requestGet(f, method), { client: f.client, env: ENV, nu: NU, naBesluit: async () => { vervolg++; } });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control') ?? '', /no-store/);
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
      const inhoud = await response.text();
      if (method === 'HEAD') assert.equal(inhoud, '');
      else {
        assert.match(inhoud, /form method="post"/);
        assert.match(inhoud, /Alleen bevestigen slaat een besluit op/);
      }
    }
    assert.deepEqual(f.mutaties, []);
    assert.deepEqual(f.links, voor);
    assert.equal(vervolg, 0);
  });

  test('Nee bij een concert met vanafprijs vereist geen huurprijs en slaat geen indicatie als afspraak op', async () => {
    const f = fixture({ soort: 'concert' });
    const { bewijs, html } = await bekijk(f);
    assert.match(html, /Vanaf/);
    assert.match(html, /value="nee" formnovalidate/);
    const r = await behandelBestuursBeslisPagina(requestPost(f, bewijs, 'nee'), { client: f.client, env: ENV, nu: NU });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /afgewezen/);
    const besluit = f.mutaties.find((m) => m.naam === 'verhuur_neem_besluit');
    assert.equal(besluit?.args.p_besluit, 'nee');
    assert.equal(besluit?.args.p_huurprijs_euro, null);
    assert.equal(f.state.besluitAantal, 1);
  });

  test('Ja vereist een expliciete maatwerkprijs; een onleesbaar bedrag bereikt de besluit-RPC niet', async () => {
    const f = fixture({ soort: 'diverse' });
    const { bewijs } = await bekijk(f);
    for (const huurprijs of ['', '75,123', '1e3', '0']) {
      const r = await behandelBestuursBeslisPagina(requestPost(f, bewijs, 'ja', { huurprijs }), { client: f.client, env: ENV, nu: NU });
      assert.equal(r.status, 409);
    }
    assert.equal(f.mutaties.length, 0);
    const r = await behandelBestuursBeslisPagina(requestPost(f, bewijs, 'ja', { huurprijs: '175,50' }), { client: f.client, env: ENV, nu: NU });
    assert.equal(r.status, 200);
    assert.equal(f.mutaties[0]?.args.p_huurprijs_euro, 175.5);
  });

  test('gewijzigde beschikbaarheidsbron weigert de oude POST en toont een nieuw bevestigingsbewijs', async () => {
    const f = fixture();
    const { bewijs } = await bekijk(f);
    f.bron.bron_versie = 'bron-v2';
    f.bron.aanvragen = [{ id: 18, status: 'nieuw', naam: 'Nieuwe aanvraag', start_datum: '2027-07-10', eind_datum: '2027-07-12' }];
    const r = await behandelBestuursBeslisPagina(requestPost(f, bewijs, 'ja'), { client: f.client, env: ENV, nu: NU });
    assert.equal(r.status, 409);
    const html = await r.text();
    assert.match(html, /Nieuwe aanvraag/);
    assert.match(html, /beschikbaarheid is gewijzigd/);
    assert.equal(f.mutaties.length, 0);
    const nieuwBewijs = html.match(/name="bewijs" value="([^"]+)"/)?.[1];
    assert.ok(nieuwBewijs);
    assert.notEqual(nieuwBewijs, bewijs);
  });

  test('een gewijzigde aanvraag, andere sleutel, ingetrokken of verlopen link geven geen besluitbevoegdheid', async () => {
    assert.throws(() => beslisGeheim({ VERHUUR_BESLUIT_SECRET: 'kort' }), /niet ingericht/);
    const gewijzigd = fixture(); gewijzigd.bron.aanvraag_versie = 'aanvraag-v2';
    assert.equal((await behandelBestuursBeslisPagina(requestGet(gewijzigd), { client: gewijzigd.client, env: ENV, nu: NU })).status, 409);
    for (const soort of ['sleutel', 'ingetrokken', 'verlopen']) {
      const f = fixture();
      if (soort === 'ingetrokken') f.links[0]!.ingetrokken_op = NU.toISOString();
      if (soort === 'verlopen') {
        f.links[0]!.geldig_tot = NU.toISOString();
        f.token = beslisToken(f.links[0]!, SECRET); f.links[0]!.token_hash = tokenHash(f.token);
      }
      const r = await behandelBestuursBeslisPagina(requestGet(f), {
        client: f.client, env: soort === 'sleutel' ? { ...ENV, VERHUUR_BESLUIT_SECRET: `${SECRET}-gewijzigd` } : ENV, nu: NU,
      });
      assert.equal(r.status, 410, soort);
      assert.equal(f.mutaties.length, 0, soort);
    }
    const f = fixture();
    const veranderd = { ...f.links[0]!, ontvanger: 'andere-bestuurder@example.test' };
    assert.equal(geldigeBeslislink(veranderd, f.token, SECRET, NU), false);
  });

  test('herhalen van een geconsumeerde Ja-link kan niet alsnog Nee vastleggen of de machine opnieuw starten', async () => {
    const f = fixture(); let vervolg = 0;
    const { bewijs } = await bekijk(f);
    const input = { client: f.client, env: ENV, nu: NU, naBesluit: async () => { vervolg++; } };
    const eerste = await behandelBestuursBeslisPagina(requestPost(f, bewijs, 'ja'), input);
    assert.equal(eerste.status, 200);
    for (const herhaling of [requestPost(f, bewijs, 'ja'), requestPost(f, bewijs, 'nee'), requestGet(f)]) {
      const r = await behandelBestuursBeslisPagina(herhaling, input);
      assert.equal(r.status, 200);
      assert.match(await r.text(), /geen tweede verwerking/);
    }
    assert.equal(f.state.besluitAantal, 1);
    assert.equal(f.links[0]?.uitkomst, 'ja');
    assert.equal(vervolg, 1);
  });

  test('fout bij onmiddellijke vervolgverwerking maakt een opgeslagen besluit niet ongedaan', async () => {
    const f = fixture();
    const { bewijs } = await bekijk(f);
    const r = await behandelBestuursBeslisPagina(requestPost(f, bewijs, 'ja'), {
      client: f.client, env: ENV, nu: NU, naBesluit: async () => { throw new Error('Worker tijdelijk niet beschikbaar'); },
    });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /Besluit vastgelegd/);
    assert.equal(f.state.besluitAantal, 1);
    assert.ok(f.links[0]?.verbruikt_op);
  });

  test('een andere Origin of ontbrekend GET-bewijs wordt vóór een besluit geweigerd', async () => {
    const f = fixture();
    const { bewijs } = await bekijk(f);
    const cross = requestPost(f, bewijs, 'ja'); cross.headers.set('Origin', 'https://ander.example.test');
    assert.equal((await behandelBestuursBeslisPagina(cross, { client: f.client, env: ENV, nu: NU })).status, 403);
    assert.equal((await behandelBestuursBeslisPagina(requestPost(f, '', 'ja'), { client: f.client, env: ENV, nu: NU })).status, 409);
    assert.equal(f.mutaties.length, 0);
    assert.notEqual(bevestigingsBewijs(SECRET, tokenHash(f.token), 'aanvraag-v1', 'bron-v1'), bevestigingsBewijs(SECRET, tokenHash(f.token), 'aanvraag-v1', 'bron-v2'));
  });
});

describe('worker en echte mailpoort met geïnjecteerde provider', () => {
  test('een normale bestuursmail gebruikt een capability en eist Aan vlak vóór de provider', async () => {
    const f = fixture({ zonderLink: true, jobs: [job()] });
    const ontvangen: MailBericht[] = [];
    const uit = await verwerkVerhuurStap(f.client, f.jobs[0]!, ENV, {
      mailPoort: async () => ({ modus: 'aan' }),
      verstuur: (bericht, opties) => {
        assert.equal(opties?.vereisteLiveModus, true);
        return verstuurGecontroleerd(bericht, { register: register('actief'), vereisteLiveModus: opties?.vereisteLiveModus,
          transport: { verstuur: async (b) => { ontvangen.push(b); return 'provider-1'; } }, testadres: 'test@example.test', env: ENV });
      },
    });
    assert.equal(uit.status, 'afgerond');
    assert.equal(uit.providerId, 'provider-1');
    assert.equal(ontvangen.length, 1);
    assert.equal(ontvangen[0]?.naar, 'bestuur@example.test');
    assert.match(ontvangen[0]?.tekst ?? '', /\/bestuur\/besluit\/\?token=/);
    assert.equal(f.links.length, 1);
    assert.equal((f.links[0] as unknown as Rij).token, undefined, 'Opslag bevat alleen de tokenhash.');
  });

  test('live→test tussen opbouw en transport geeft de capability nooit door aan de provider', async () => {
    const f = fixture({ zonderLink: true, jobs: [job()] });
    const provider: MailBericht[] = [];
    let poging = 0;
    const uit = await verwerkVerhuurStap(f.client, f.jobs[0]!, ENV, {
      mailPoort: async () => ({ modus: 'aan' }),
      verstuur: (bericht, opties) => {
        poging++;
        assert.match(bericht.tekst, /token=/, 'Het bericht was als live bestuursmail opgebouwd.');
        assert.equal(opties?.vereisteLiveModus, true);
        return verstuurGecontroleerd(bericht, { register: register('test'), vereisteLiveModus: opties?.vereisteLiveModus,
          transport: { verstuur: async (b) => { provider.push(b); return 'mag-nooit'; } }, testadres: 'test@example.test', env: ENV });
      },
    });
    assert.equal(poging, 1);
    assert.equal(provider.length, 0, 'Ook het testadres ontvangt geen live capability.');
    assert.equal(uit.status, 'wacht_op_mens');
    assert.equal(uit.providerId, undefined);
  });

  test('mail die vanaf het begin op Test staat bevat alleen een beheerlink en geen capability', async () => {
    const f = fixture({ zonderLink: true, jobs: [job()] });
    const provider: MailBericht[] = [];
    const uit = await verwerkVerhuurStap(f.client, f.jobs[0]!, ENV, {
      mailPoort: async () => ({ modus: 'test' }),
      verstuur: (bericht, opties) => {
        assert.equal(opties?.vereisteLiveModus, false);
        return verstuurGecontroleerd(bericht, { register: register('test'), vereisteLiveModus: opties?.vereisteLiveModus,
          transport: { verstuur: async (b) => { provider.push(b); return 'provider-test'; } }, testadres: 'test@example.test', env: ENV });
      },
    });
    assert.equal(provider.length, 1);
    assert.equal(provider[0]?.naar, 'test@example.test');
    assert.match(provider[0]?.tekst ?? '', /\/beheer\/aanvragen\/17\//);
    assert.equal((provider[0]?.tekst ?? '').includes('token='), false);
    assert.equal((provider[0]?.html ?? '').includes('token='), false);
    assert.equal(f.links.length, 0);
    assert.equal(uit.status, 'wacht_op_mens', 'Een proefmail voltooit de echte bestuursmelding niet.');
  });

  test('Uit en een ingetrokken procesclaim starten geen provider-call', async () => {
    for (const toestand of ['uit', 'ingetrokken']) {
      const f = fixture({ zonderLink: true, jobs: [job()] }); let provider = 0;
      const uit = await verwerkVerhuurStap(f.client, f.jobs[0]!, ENV, {
        mailPoort: async () => {
          if (toestand === 'ingetrokken') f.jobs[0]!.status = 'geannuleerd';
          return { modus: toestand === 'uit' ? 'uit' : 'aan', reden: 'Mail staat uit' };
        },
        verstuur: async () => { provider++; throw new Error('Dit punt mag niet worden bereikt'); },
      });
      assert.equal(provider, 0);
      assert.equal(uit.status, toestand === 'uit' ? 'wacht_op_mens' : 'geannuleerd');
    }
  });

  test('een ontbrekend provider-ID of timeout eindigt als onzeker, nooit als voltooide verzending', async () => {
    for (const fout of ['geen-id', 'timeout']) {
      const f = fixture({ zonderLink: true, jobs: [job({ status: 'te_doen' })] });
      let provider = 0;
      const uit = await verwerkVerhuurmachine(ENV, { client: f.client, maxJobs: 1, deps: {
        mailPoort: async () => ({ modus: 'aan' }),
        verstuur: (bericht, opties) => verstuurGecontroleerd(bericht, {
          register: register('actief'), vereisteLiveModus: opties?.vereisteLiveModus, testadres: 'test@example.test', env: ENV,
          transport: { verstuur: async () => { provider++; if (fout === 'timeout') throw new Error('Timeout na aanroepen provider'); } },
        }),
      } });
      assert.equal(uit.verwerkt, 1);
      assert.equal(provider, 1);
      assert.equal(f.jobs[0]?.status, 'onzeker');
      const afronding = f.mutaties.find((m) => m.naam === 'verhuur_rond_stap_af');
      assert.equal(afronding?.args.p_status, 'onzeker');
      assert.equal(afronding?.args.p_provider_id, null);
    }
  });

  test('een ongeldig mandaat houdt een contractjob tegen voordat de contractdienst wordt aangeroepen', async () => {
    const f = fixture({ zonderLink: true, jobs: [job({ taak: 'contract', boeking_id: 28 })] });
    f.state.mandaatGeldig = false;
    let contract = 0;
    const uit = await verwerkVerhuurStap(f.client, f.jobs[0]!, ENV, { contract: async () => { contract++; return { ok: true, melding: 'Mag niet' }; } });
    assert.equal(uit.status, 'wacht_op_mens');
    assert.equal(contract, 0);
    assert.match(uit.melding, /bestuursmandaat/);
    assert.equal(f.mutaties.length, 0);
  });
});
