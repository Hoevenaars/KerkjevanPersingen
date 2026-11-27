import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { describe, test } from 'node:test';
import { beoordeelVerhuuraanvraag, type VerhuurBeoordeling } from '../src/platform/verhuur-beoordeling.ts';

const component = readFileSync(new URL('../src/components/beheer/VerhuurMachine.astro', import.meta.url), 'utf8');
const pagina = readFileSync(new URL('../src/pages/beheer/aanvragen/[id].astro', import.meta.url), 'utf8');
const wizard = readFileSync(new URL('../src/components/beheer/ContractWizard.astro', import.meta.url), 'utf8');
const frontmatter = component.split('---')[1]!;
// Voer de echte rendervoorwaarden uit zonder Astro, Supabase of een browser.
// Dit is een netwerkvrije controle van de componentlogica, geen volledige SSR-test.
const beslisRender = new Function('Astro', `${stripTypeScriptTypes(frontmatter, { mode: 'strip' })}
return { kanBesluiten, kanToewijzen, kanConceptGoedkeuren, magUitvoeren, beoordeling,
  gegevensBlokkerenJa, openBesluit, specifiekHerstel, ontvangstHerstelJobs, ontvangstHerstel, wachtJob };`);
const routeCode = pagina.slice(pagina.indexOf('async function leesMachineRoute('), pagina.indexOf('\nlet machineRouteCache:'));
const leesRoute = new Function(`${stripTypeScriptTypes(routeCode, { mode: 'strip' })}; return leesMachineRoute;`)();
const wizardCode = pagina.slice(pagina.indexOf('function machineWizardToegang('), pagina.indexOf('\nconst mailtemplates:'));
const wizardToegang = new Function(`${stripTypeScriptTypes(wizardCode, { mode: 'strip' })}; return machineWizardToegang;`)();
const beoordeel = (conflict: 'geen' | 'aanvraag' | 'boeking' = 'geen') => beoordeelVerhuuraanvraag({
  aanvraag: { id: 17, naam: 'Karin Janssen', email: 'karin@example.test', status: 'nieuw', start: '2027-07-10', eind: '2027-07-12', verhuurtype: 'expositie' },
  vandaag: '2026-11-25', historieCompleet: true, tarief: { prijstype: 'vast', bedrag: 420 },
  aanvragen: conflict === 'aanvraag' ? [{ id: 18, naam: 'Andere exposant', status: 'in_behandeling', start: '2027-07-10', eind: '2027-07-12' }] : [],
  boekingen: conflict === 'boeking' ? [{ id: 19, status: 'optie', start: '2027-07-10', eind: '2027-07-12' }] : [],
});
const dossier = (beoordeling: VerhuurBeoordeling = beoordeel()) => ({
  beoordeling, aanvraag: { soort: 'expositie' }, aanvraagRij: { id: 17, status: 'nieuw' }, aanvraagVersie: 'aanvraag-versie', bronVersie: 'bron-versie',
});
const props = (extra: Record<string, unknown> = {}) => ({
  dossier: dossier(), besluit: null, jobs: [], claims: [], fout: '', schrijven: true, geactiveerd: true,
  actie: '/beheer/aanvragen/17/', aanvraagId: '17', ...extra,
});
const stand = (extra: Record<string, unknown> = {}) => beslisRender({ props: props(extra) }) as {
  kanBesluiten: boolean; kanToewijzen: boolean; gegevensBlokkerenJa: boolean; openBesluit: boolean;
  kanConceptGoedkeuren: boolean; magUitvoeren: boolean; beoordeling: VerhuurBeoordeling;
  ontvangstHerstelJobs: Record<string, unknown>[]; ontvangstHerstel: Record<string, unknown>[]; wachtJob: Record<string, unknown> | undefined;
  specifiekHerstel: (job: Record<string, unknown>) => boolean;
};

describe('dossiercomponent beslist wanneer mutatieformulieren zichtbaar mogen zijn', () => {
  test('schrijfrecht geeft alleen een besluitformulier voor een actuele open aanvraag', () => {
    assert.equal(stand().kanBesluiten, true);
    assert.equal(stand({ schrijven: false }).kanBesluiten, false);
    assert.equal(stand({ dossier: null }).kanBesluiten, false);
    assert.equal(stand({ fout: 'Bron is niet beschikbaar' }).kanBesluiten, false);
    assert.equal(stand({ besluit: { besluit: 'nee', status: 'afgewezen' } }).kanBesluiten, false);
    assert.equal(stand({ besluit: { besluit: 'ja', status: 'toegewezen' } }).kanBesluiten, false);
    assert.equal(stand({ besluit: { besluit: 'ja', status: 'herbeoordelen' } }).kanBesluiten, true);
  });

  test('een inhoudelijk Ja blijft mogelijk bij overlap; toewijzen vereist bestaande ja en vrije capaciteit', () => {
    for (const conflict of ['aanvraag', 'boeking'] as const) {
      const open = stand({ dossier: dossier(beoordeel(conflict)) });
      assert.equal(open.kanBesluiten, true);
      assert.equal(open.gegevensBlokkerenJa, false);
      assert.equal(Boolean(open.kanToewijzen), false);
    }
    const besluit = { besluit: 'ja', status: 'wacht_op_beschikbaarheid' };
    assert.equal(Boolean(stand({ besluit, dossier: dossier(beoordeel('aanvraag')) }).kanToewijzen), true);
    assert.equal(Boolean(stand({ besluit, dossier: dossier(beoordeel('boeking')) }).kanToewijzen), false);
    assert.equal(Boolean(stand({ besluit, schrijven: false }).kanToewijzen), false);
    assert.equal(Boolean(stand({ besluit, fout: 'Voortgang onbekend' }).kanToewijzen), false);
  });

  test('onvolledige eigen afspraken blokkeren Ja en een specifieke claim krijgt geen generiek herstelpad', () => {
    const beoordeling = beoordeel();
    beoordeling.meldingen.push({ code: 'periode_onvolledig', ernst: 'blokkade', tekst: 'Einddatum ontbreekt' });
    assert.equal(stand({ dossier: dossier(beoordeling) }).gegevensBlokkerenJa, true);
    const uit = stand({ claims: [{ type: 'contract', id: '51' }] });
    assert.equal(uit.specifiekHerstel({ taak: 'contract' }), true);
    assert.equal(uit.specifiekHerstel({ taak: 'bestuursmail' }), false);
    assert.equal(uit.specifiekHerstel({ taak: 'financieel' }), false);
    assert.equal(uit.specifiekHerstel({ taak: 'ondertekenbevestiging' }), true);
  });

  test('een geboekte herbeoordeling gebruikt uitsluitend een concreet toelaatbaar concept', () => {
    const beoordeling = beoordeel('aanvraag');
    const concept = { beoordeling, toelaatbaar: true, contract: { id: 49, versie: 2 }, wizard: {}, betalingen: [] };
    const geboekt = { besluit: { besluit: 'ja', status: 'herbeoordelen', boeking_id: 31 }, concept };
    const uit = stand(geboekt);
    assert.equal(uit.kanBesluiten, false, 'De gewone Ja/Nee maakt geen tweede boeking of afwijzing.');
    assert.equal(uit.kanConceptGoedkeuren, true);
    assert.equal(uit.beoordeling, beoordeling, 'De getoonde waarschuwingen horen bij de concrete contractbron.');
    assert.equal(stand({ ...geboekt, concept: { ...concept, toelaatbaar: false, blokkade: 'Factuur bestaat' } }).kanConceptGoedkeuren, false);
    assert.equal(stand({ ...geboekt, conceptFout: 'Contractpreview onvolledig' }).kanConceptGoedkeuren, false);
    assert.equal(stand({ ...geboekt, schrijven: false }).kanConceptGoedkeuren, false);
    assert.equal(stand({ ...geboekt, geactiveerd: false }).kanConceptGoedkeuren, false);
    assert.equal(stand({ ...geboekt, fout: 'Voortgang niet gelezen' }).kanConceptGoedkeuren, false);
  });

  test('een pauze laat geen besluit, toewijzing of herstel toe', () => {
    assert.equal(stand({ geactiveerd: false }).kanBesluiten, false);
    const uit = stand({ geactiveerd: false, besluit: { besluit: 'ja', status: 'wacht_op_beschikbaarheid' } });
    assert.equal(Boolean(uit.kanToewijzen), false);
    assert.equal(uit.magUitvoeren, false);
  });

  test('een exposantenafwijking wordt in het opgeslagen concept opgenomen vóór goedkeuring', () => {
    const beoordeling = { ...beoordeel(), historieWaarschuwingen: [{ persoon: 'Mede-exposant' }] };
    const concept = { beoordeling, toelaatbaar: true, contract: { id: 49, versie: 2 }, wizard: { bijzondereAfspraken: '' }, betalingen: [] };
    assert.equal(stand({ concept }).kanConceptGoedkeuren, false);
    concept.wizard.bijzondereAfspraken = 'Het bestuur staat een uitzondering toe op de termijn van 18 maanden voor deze expositie.';
    assert.equal(stand({ concept }).kanConceptGoedkeuren, true);
    assert.match(wizard, /<textarea[^>]+name="bijzondereAfspraken"[\s\S]*?velden\.bijzondereAfspraken/);
    assert.match(wizard, /name="restFactuurDagenVoorVerval"[^>]+min="0"[^>]+max="90"/);
    assert.match(pagina, /expositieWaarschuwing=\{toonVerhuurMachine && Boolean/);
  });

  test('ondertekenherstel onderscheidt ontvangers, ontbrekende claims en werkelijk oude jobs', () => {
    const job = { id: 'mailjob', taak: 'ondertekenbevestiging', status: 'onzeker', boeking_id: 31,
      payload: { contractversie_id: 49 }, verantwoordelijke: 'Beheerder', opvolgen_voor: '2026-11-27T10:00:00Z' };
    const claim = { boeking_id: 31, contractversie_id: 49, richting: 'huurder', status: 'verzonden', provider_id: 'bewijs-1' };
    const uit = stand({ jobs: [job], ontvangstClaims: [claim,
      { ...claim, contractversie_id: 48, richting: 'bestuur', provider_id: 'oude-versie' }] });
    assert.equal(uit.ontvangstHerstel.length, 2);
    assert.deepEqual(uit.ontvangstHerstel.map(r => [r.richting, r.status, r.providerId]), [
      ['huurder', 'verzonden', 'bewijs-1'], ['bestuur', 'ontbreekt', ''],
    ]);
    assert.equal(uit.ontvangstHerstel[1]!.contractversieId, 49);
    for (const geclaimd_op of [null, '', 'geen-datum', new Date().toISOString()]) {
      assert.equal(stand({ jobs: [{ ...job, status: 'bezig', geclaimd_op }] }).ontvangstHerstel.length, 0);
    }
    assert.equal(stand({ jobs: [{ ...job, status: 'bezig', geclaimd_op: new Date(Date.now() - 16 * 60 * 1000).toISOString() }] }).ontvangstHerstel.length, 2);
    assert.equal(stand({ jobs: [{ ...job, payload: {} }] }).ontvangstHerstel.length, 0);
    assert.equal(stand({ jobs: [{ ...job, status: 'afgerond' }], ontvangstClaims: [claim] }).ontvangstHerstel.length, 0);
  });

  test('een korte wakejob verbergt de menselijke beschikbaarheidsdeadline niet', () => {
    const taak = { taak: 'hervatten' };
    const wacht = { ...taak, status: 'wacht_op_mens', opvolgen_voor: '2026-11-28T10:00:00Z', verantwoordelijke: 'Bestuur' };
    assert.equal(stand({ jobs: [{ ...taak, status: 'te_doen' }, wacht] }).wachtJob, wacht);
  });
});

describe('route en wizard blijven beschermd bij een gepauzeerde machine', () => {
  const client = (scope: unknown, besluit: unknown = null, jobs: unknown[] = [], fout: { code?: string; message: string } | null = null) => ({
    rpc: async () => ({ data: scope, error: fout }),
    from: (tabel: string) => {
      const uit = { data: tabel === 'verhuur_besluiten' ? besluit : jobs, error: fout };
      const query = { select: () => query, eq: () => query, in: () => query, order: () => query, limit: () => query,
        maybeSingle: async () => uit, then: (yes: (waarde: unknown) => unknown, no: (fout: unknown) => unknown) => Promise.resolve(uit).then(yes, no) };
      return query;
    },
  });
  test('actieve scope, bestaand besluit of bestaande jobs behouden het paneel wanneer de omgeving uit staat', async () => {
    for (const bron of [client(true), client(false, { boeking_id: 31 }), client(false, null, [{ id: 'job' }])]) {
      const uit = await leesRoute(bron, 17, false);
      assert.equal(uit.toon, true);
      assert.equal(uit.actief, false);
    }
    assert.equal((await leesRoute(client(false, { boeking_id: 31 }), 17, true)).actief, false, 'Actuele scope is ook nodig.');
    assert.equal((await leesRoute(client(true), 17, true)).actief, true);
    assert.equal((await leesRoute(client(false), 17, false)).toon, false, 'Normale oudere dossiers houden hun bestaande route.');
  });

  test('leesfouten blokkeren terugval; een nog niet geïnstalleerde en uitgeschakelde machine wijzigt legacy niet', async () => {
    const fout = await leesRoute(client(null, null, [], { code: '08006', message: 'Verbinding verbroken' }), 17, false);
    assert.equal(fout.toon, true);
    assert.equal(fout.actief, false);
    assert.ok(fout.fout);
    const ontbreekt = client(null, null, [], { code: '42P01', message: 'Tabel ontbreekt' });
    assert.equal((await leesRoute(ontbreekt, 17, false)).toon, false);
    assert.equal((await leesRoute(ontbreekt, 17, true)).toon, true);
  });

  test('honderd recente afgeronde jobs verdringen oude herstel- en deadlinetaken niet', async () => {
    const wacht = { id: 'oud-wacht', taak: 'hervatten', status: 'wacht_op_mens', opvolgen_voor: '2026-11-28T10:00:00Z' };
    const onzeker = { id: 'oud-herstel', taak: 'ondertekenbevestiging', status: 'onzeker' };
    const recent = Array.from({ length: 100 }, (_, index) => ({ id: `klaar-${index}`, status: 'afgerond' }));
    const gelezen: { statussen: string[]; limiet: number | null }[] = [];
    const bron = {
      rpc: async () => ({ data: true, error: null }),
      from: (tabel: string) => {
        let statussen: string[] = [], limiet: number | null = null;
        const query = { select: () => query, eq: () => query, order: () => query,
          in: (_veld: string, waarden: string[]) => { statussen = waarden; return query; },
          limit: (n: number) => { limiet = n; return query; },
          maybeSingle: async () => ({ data: null, error: null }),
          then: (yes: (waarde: unknown) => unknown, no: (fout: unknown) => unknown) => {
            assert.equal(tabel, 'verhuur_proces_jobs');
            gelezen.push({ statussen, limiet });
            return Promise.resolve({ data: statussen.includes('wacht_op_mens') ? [wacht, onzeker, recent[0]] : recent, error: null }).then(yes, no);
          },
        };
        return query;
      },
    };
    const uit = await leesRoute(bron, 17, true);
    assert.equal(uit.jobs.length, 102, 'Dubbel gelezen id telt één keer.');
    assert.ok(uit.jobs.some((job: Record<string, unknown>) => job.id === wacht.id));
    assert.ok(uit.jobs.some((job: Record<string, unknown>) => job.id === onzeker.id));
    assert.equal(gelezen.find(lezing => lezing.statussen.includes('wacht_op_mens'))!.limiet, null);
    assert.equal(gelezen.find(lezing => lezing.statussen.includes('afgerond'))!.limiet, 100);
  });

  test('herbeoordelen zonder versie blijft bereikbaar na vervallen jobs; externe bewijzen en pauzes blokkeren de wizard', () => {
    const invoer = { toon: true, actief: true, fout: '', status: 'herbeoordelen', heeftVersie: false,
      conceptToelaatbaar: false, conceptFout: '', bestaandBewijs: '', jobs: [{ taak: 'contract', status: 'geannuleerd' }] };
    assert.deepEqual(wizardToegang(invoer), { eerste: true, vervangen: false });
    for (const wijziging of [{ actief: false }, { fout: 'Bron onbekend' }, { conceptFout: 'Versie onbekend' }, { bestaandBewijs: 'Factuur uitgegeven' }]) {
      assert.deepEqual(wizardToegang({ ...invoer, ...wijziging }), { eerste: false, vervangen: false });
    }
    assert.deepEqual(wizardToegang({ ...invoer, heeftVersie: true, conceptToelaatbaar: true }), { eerste: false, vervangen: true });
    assert.deepEqual(wizardToegang({ ...invoer, heeftVersie: true, conceptToelaatbaar: false }), { eerste: false, vervangen: false });
    assert.deepEqual(wizardToegang({ ...invoer, toon: false }), { eerste: true, vervangen: true });
  });
});

describe('bestaande dossierroute en formulieren blijven aan de servercontrole verbonden', () => {
  test('alle mutaties zijn expliciete POST-formulieren en beide besluitversies gaan mee', () => {
    const formulieren = [...component.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)];
    assert.equal(formulieren.length, 6);
    for (const formulier of formulieren) assert.match(formulier[1]!, /method="post"/);
    const besluit = formulieren.find((f) => f[2]!.includes('value="vm_ja"'));
    assert.ok(besluit);
    for (const veld of ['aanvraagId', 'aanvraagVersie', 'bronVersie', 'huurprijs', 'reden']) {
      assert.ok(besluit[2]!.includes(`name="${veld}"`), veld);
    }
    assert.match(besluit[2]!, /value="vm_nee" formnovalidate/);
    assert.match(besluit[2]!, /name="huurprijs"[^>]+required/);
    assert.equal(component.includes('<script'), false);
    assert.equal(component.includes('set:html'), false, 'Dossiergegevens worden door Astro als tekst ge-escaped.');
  });

  test('prijsindicatie wordt niet vooringevuld als vastgesteld bedrag en herstel vraagt controlebewijs', () => {
    const prijsVeld = component.match(/<input[^>]+id="vm-huurprijs"[^>]*>/)?.[0];
    assert.ok(prijsVeld);
    assert.equal(prijsVeld.includes('value='), false);
    const herstel = [...component.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)]
      .find((f) => f[1]!.includes('value="vm_herstel_verzending"'))?.[1];
    assert.ok(herstel);
    for (const veld of ['boekingId', 'type', 'claimId', 'uitkomst', 'providerId', 'bewijs']) assert.ok(herstel.includes(`name="${veld}"`));
    assert.match(herstel, /name="bewijs"[^>]*minlength="20"[^>]*required/);
    const ontvangst = [...component.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)]
      .find((f) => f[1]!.includes('value="vm_herstel_ontvangst"'))?.[1];
    assert.ok(ontvangst);
    for (const veld of ['boekingId', 'contractversieId', 'richting', 'uitkomst', 'providerId', 'bewijs']) assert.ok(ontvangst.includes(`name="${veld}"`));
    assert.match(ontvangst, /name="bewijs"[^>]*minlength="20"[^>]*required/);
    assert.match(component, /ontvangst\.status === 'verzonden' \?[\s\S]*?: magUitvoeren && <form/);
    assert.match(component, /Eigenaar/);
    assert.match(component, /Opvolgen vóór/);
  });

  test('de bestaande route onderdrukt oude besluiten en beschermt POST ook bij een pauze', () => {
    assert.match(pagina, /VERHUUR_MACHINE === 'true'/);
    assert.match(pagina, /rpc\('verhuur_machine_in_scope', \{ p_id: aanvraagId \}\)/);
    assert.match(pagina, /toonVerhuurMachine = route\.toon/);
    assert.match(pagina, /const toonBeoordeling = !toonVerhuurMachine && beeld\.fase === 'nieuw'/);
    assert.match(pagina, /opvolging && toonVerhuurMachine \? \{[\s\S]*?kanGoedkeuren: false[\s\S]*?kanVerzenden: false/);
    assert.match(pagina, /actie\.startsWith\('vm_'\)[\s\S]{0,400}Astro\.locals\.beheer\.viewAs[\s\S]{0,200}snapshot\.alleenLezen/);
    assert.match(pagina, /schrijven=\{kanBeoordelen\}/);
    assert.match(pagina, /geactiveerd=\{machineActief\}/);
    const wizardPost = pagina.slice(pagina.indexOf("actie === 'contract_definitief'"), pagina.indexOf("actie === 'fase_terug'"));
    assert.match(wizardPost, /route\.toon && \(!route\.actief \|\| route\.fout\)/);
    assert.match(wizardPost, /Astro\.locals\.beheer\.viewAs \|\| snapshot\.alleenLezen/);
    assert.match(wizardPost, /atomair: route\.toon \|\|/);
    assert.match(pagina, /\|\| \(magNieuweVersie && contractDefinitief/);
  });

  test('conceptgoedkeuring bindt de eigen bronhash en opgeslagen versie, zonder nieuwe prijs uit het formulier', () => {
    const concept = [...component.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)]
      .find((f) => f[1]!.includes('value="vm_concept_goedkeuren"'))?.[1];
    assert.ok(concept);
    assert.match(concept, /name="contractversieId" value=\{tekst\(concept\.contract\.id\)\}/);
    assert.match(concept, /name="bronVersie" value=\{concept\.bronVersie\}/);
    assert.match(concept, /name="aanvraagVersie" value=\{concept\.aanvraagVersie\}/);
    assert.match(concept, /name="reden"[^>]*minlength="20"[^>]*required/);
    assert.equal(concept.includes('name="huurprijs"'), false);
    assert.match(component, /concept\.betalingen\.map/);
    assert.match(component, /document=contract&versie=/);
    assert.match(pagina, /leesMachineConceptBeoordeling\(client, Number\(aanvraag\.id\), Number\(machineContractVersie\.id\)\)/);
  });

  test('ontvangst van de volledige huur en de resttermijn gebruikt de bestaande ontvangstfunctie', () => {
    assert.match(pagina, /\['ondertekening_ontvangen', 'aanbetaling_ontvangen', 'volledige_betaling_ontvangen', 'restbetaling_ontvangen'\]\.includes\(actie\)/);
    assert.match(pagina, /await verwerkOntvangst\(actie,/);
    assert.match(pagina, /magBetalen && openRestTermijn/);
    assert.match(pagina, /volledigeHuursom \? 'volledige_betaling_ontvangen' : 'restbetaling_ontvangen'/);
  });
});
