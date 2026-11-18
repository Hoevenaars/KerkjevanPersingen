/**
 * Regressietests voor twee bestuursbesluiten.
 * Alle databases en providers zijn fakes: deze tests verzenden NOOIT mail.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { beoordeelAanvraag, magGoedkeuren, type FaseWereld } from '../src/platform/aanvraag-fase.ts';
import { voerDossierViaSessie } from '../src/lib/operatie/dossier-sessie.ts';
import { promoveerIndienKlaar } from '../src/lib/operatie/definitief-auto.ts';
import { bouwOpvolging, voerFlowUit, legeInstellingen, type ContractBron, type ContractVersie, type FlowContext } from '../src/platform/documentenflow.ts';

const bestuurder = { type: 'gebruiker' as const, naam: 'Bestuur', rechten: { isSuperAdmin: false, perModule: { aanvragen: 'schrijven' as const, instellingen: 'schrijven' as const, boekingen: 'schrijven' as const } } };
const medewerker = { type: 'gebruiker' as const, naam: 'Medewerker', rechten: { isSuperAdmin: false, perModule: { aanvragen: 'schrijven' as const, boekingen: 'schrijven' as const } } };
const aanvraag = { id: 14, status: 'nieuw', naam: 'Proefaanvraag', email: 'test@example.invalid', telefoon: null, adres: 'Kerkstraat 1', verhuurtype_sleutel: 'expositie', start_datum: '2027-03-20', eind_datum: '2027-03-21', boeking_id: null, relatie_id: null, toelichting: '', aantal_personen: '20', website: null, mede_exposanten: null };
const basisWereld: FaseWereld = { aanvragen: [{id:'14',status:'nieuw',naam:'Proef',start:'2027-03-20',eind:'2027-03-21'}], boekingen:[], documenten:[], mails:[], betalingen:[], blokkades:[], activiteiten:[] };

function dbDummy(options: { conflict?: boolean; rpcError?: string; missingRpc?: boolean; status?: string; bestaandeBoeking?: number } = {}) {
  const calls = { rpc: 0, mails: 0, inserts: 0, updates: 0 };
  const rows: Record<string, Record<string, unknown>[]> = {
    aanvragen: [{ ...aanvraag, status: options.status ?? 'nieuw', boeking_id: options.bestaandeBoeking ?? null }],
    boekingen: options.conflict ? [{ id: 55, nummer:'KVP-55', status:'optie', start_datum:'2027-03-20', eind_datum:'2027-03-21', interne_titel:'Andere huurder', huurder_naam_snapshot:'Andere', aanvraag_id: 18, aanbetaling_ontvangen:false }] : [],
    interne_activiteiten: [], activiteit_bron: [], auditlog:[],
  };
  const client = {
    from(name: string) {
      const filters: [string, unknown][] = [];
      let mode: 'read' | 'insert' | 'update' = 'read';
      let payload: Record<string, unknown> = {};
      const selected = () => (rows[name] ?? []).filter((row) => filters.every(([key,value]) => row[key] === value));
      const response = () => {
        if (mode === 'insert') { calls.inserts++; rows[name] ??= []; rows[name].push(payload); return {data: [payload], error:null, count:1}; }
        if (mode === 'update') { calls.updates++; const items = selected(); for(const item of items) Object.assign(item,payload); return {data:items,error:null,count:items.length}; }
        return {data:selected(),error:null,count:selected().length};
      };
      const q = {
        select(_columns: string) { return q; }, eq(key:string,value:unknown) { filters.push([key,value]); return q; },
        in(key:string,values:string[]) { return q; },
        update(values:Record<string,unknown>) { mode='update';payload=values;return q; },
        insert(values:Record<string,unknown>) {mode='insert';payload=values;return q;},
        maybeSingle: async() => { const r=response();return {data:r.data[0] ?? null,error:r.error};},
        then: (resolve:(value:unknown)=>unknown,reject?: (error:unknown)=>unknown) => Promise.resolve(response()).then(resolve,reject),
      };
      return q;
    },
    rpc: options.missingRpc ? undefined : async(name:string,args:Record<string,unknown>) => {
      calls.rpc++;
      assert.equal(name,'keur_aanvraag_en_reserveer');
      assert.equal(args.p_aanvraag_id,14);
      if(options.rpcError) return {data:null,error:{message:options.rpcError}};
      rows.aanvragen[0].status='goedgekeurd'; rows.aanvragen[0].boeking_id=44;
      return {data:{boekingId:44,alVerwerkt:false},error:null};
    },
  };
  return {client:client as never,calls,rows};
}

test('Ja direct vanaf nieuw, maar legacy-route blijft beschermd', () => {
  const beeld = beoordeelAanvraag({id:'14',status:'nieuw',naam:'Proef',start:'2027-03-20',eind:'2027-03-21'},basisWereld);
  assert.equal(magGoedkeuren(beeld,'nieuw').ok,false);
  assert.equal(magGoedkeuren(beeld,'nieuw',{direct:true}).ok,true);
});

test('Ja van bestuurder gebruikt precies een atomaire RPC en geen losse boeking-insert', async () => {
  const {client,calls} = dbDummy();
  const uit = await voerDossierViaSessie(client,{soort:'beoordeel',aanvraagId:'14',besluit:'goedkeuren_direct'},bestuurder);
  assert.equal(uit.ok,true,uit.melding);
  assert.equal(uit.boekingId,'44');
  assert.equal(calls.rpc,1);
  assert.equal(calls.updates,0);
  assert.equal(calls.inserts,1); // uitsluitend auditlog
});

test('Tweede Ja op dezelfde aanvraag legt geen tweede optie vast', async() => {
  const {client,calls}=dbDummy();
  const opdracht = {soort:'beoordeel' as const,aanvraagId:'14',besluit:'goedkeuren_direct' as const};
  assert.equal((await voerDossierViaSessie(client,opdracht,bestuurder)).ok,true);
  assert.equal((await voerDossierViaSessie(client,opdracht,bestuurder)).ok,true);
  assert.equal(calls.rpc,1);
});

test('Alleen bestuurder mag direct goedkeuren; geen RPC zonder rechten', async() => {
  const {client,calls}=dbDummy();
  const uit=await voerDossierViaSessie(client,{soort:'beoordeel',aanvraagId:'14',besluit:'goedkeuren_direct'},medewerker);
  assert.equal(uit.ok,false);
  assert.equal(calls.rpc,0);
});

test('Aanvraag met bezette periode kan niet goedgekeurd worden', async() => {
  const {client,calls}=dbDummy({conflict:true});
  const uit=await voerDossierViaSessie(client,{soort:'beoordeel',aanvraagId:'14',besluit:'goedkeuren_direct'},bestuurder);
  assert.equal(uit.ok,false);
  assert.equal(calls.rpc,0);
});

test('Bij ontbrekende of falende RPC geen halve reservering', async () => {
  for (const opties of [{missingRpc:true},{rpcError:'Database niet beschikbaar'}]) {
    const {client,calls}=dbDummy(opties);
    const uit=await voerDossierViaSessie(client,{soort:'beoordeel',aanvraagId:'14',besluit:'goedkeuren_direct'},bestuurder);
    assert.equal(uit.ok,false);
    assert.equal(calls.updates,0);
    assert.equal(calls.inserts,0);
  }
});

test('Nee van het bestuur werkt zonder verplichte vrije tekst; zonder bestuursrecht niet', async() => {
  const {client,rows}=dbDummy();
  const uit=await voerDossierViaSessie(client,{soort:'beoordeel',aanvraagId:'14',besluit:'afwijzen_direct',reden:''},bestuurder);
  assert.equal(uit.ok,true,uit.melding);
  assert.equal(rows.aanvragen[0].status,'afgewezen');
  assert.match(String(rows.aanvragen[0].afwijsreden),/mogelijkheden/);
  const andere=dbDummy();
  assert.equal((await voerDossierViaSessie(andere.client,{soort:'beoordeel',aanvraagId:'14',besluit:'afwijzen_direct'},medewerker)).ok,false);
});

const instellingen = { ...legeInstellingen(), ondertekenaarNaam:'Voorzitter', ondertekenaarFunctie:'Voorzitter', iban:'NL91ABNA0417164300', tenaamstelling:'Stichting Kerkje', voorwaardenVastgesteldOp:'2026-11-01', huisregelsVastgesteldOp:'2026-11-01' };
const bron: ContractBron={ boekingId:'44', soort:'expositie', soortLabel:'Expositie', activiteit:'Kunst', toelichting:'', periodeVan:'2027-03-20', periodeTot:'2027-03-21', geboektOp:'2026-11-18', huurderNaam:'Jan Example', straat:'Kerkstraat',huisnummer:'1', toevoeging:'',postcode:'6575 AA',woonplaats:'Persingen',email:'jan@example.invalid',telefoon:'0612345678',personen:'25',huurprijsCent:49000,aanbetalingCent:10000,aanbetalingVerval:'2026-12-01',restCent:39000,restVerval:'2027-02-01',gastNaam:'',gastEmail:'',gastTelefoon:'',promotieAanwezig:false,boekingStatus:'optie'};
const afspraak = {tijdVan:'10:00',tijdTot:'18:00',opbouw:'Vrijdag',afbouw:'Zondag',contactpersoon:'Jan Example'};
function context(rechten=bestuurder.rechten,versies:ContractVersie[]=[]):FlowContext {return { nu:'2026-11-18T12:00:00Z',vandaag:'2026-11-18',actorNaam:'Bestuur',rechten,instellingen,bron,versies,betaling:{stand:'open',toelichting:''},modus:'aan',testadres:null };}
function contract():ContractVersie {
 const result=voerFlowUit({soort:'maken',afspraken:afspraak},context());
 assert.equal(result.ok,true, result.melding);
 if(!result.ok) throw new Error(result.melding);
 const versie=result.versies[0];assert.ok(versie);return versie;
}

test('Contract toont Ja/Nee alleen bij juiste rechten en ingeschakelde mail', () => {
  const versie=contract();
  const input={rechten:bestuurder.rechten,bron,instellingen,versies:[versie],betaling:{stand:'open' as const,toelichting:''},vandaag:'2026-11-18',bekijkHref:'/beheer/aanvragen/14/?document=contract',fout:'',modus:'aan' as const};
  const goed=bouwOpvolging(input);
  assert.equal(goed.kanGoedkeuren,true);
  assert.equal(goed.kanTerug,true);
  assert.equal(bouwOpvolging({...input,modus:'uit'}).kanGoedkeuren,false);
  assert.equal(bouwOpvolging({...input,rechten:medewerker.rechten}).kanGoedkeuren,false);
});

test('Contract Nee zet terug ter correctie en kan niet blind opnieuw Ja worden', () => {
  const v=contract();
  const nee=voerFlowUit({soort:'terug',toelichting:'Prijs controleren'},context(bestuurder.rechten,[v]));
  assert.equal(nee.ok,true,nee.melding);
  if(!nee.ok)return;
  assert.equal(nee.versies[0].bestuur,'terug');
  assert.equal(nee.versies[0].bestuurToelichting,'Prijs controleren');
  assert.equal(voerFlowUit({soort:'akkoord'},context(bestuurder.rechten,nee.versies)).ok,false);
});

test('Contract verzenden is onmogelijk vóór Ja; na Ja heeft hij een verzendplan', () => {
  const v=contract();
  assert.equal(voerFlowUit({soort:'verzend',proef:false,poging:'1'},context(bestuurder.rechten,[v])).ok,false);
  const ja=voerFlowUit({soort:'akkoord'},context(bestuurder.rechten,[v]));
  assert.equal(ja.ok,true,ja.melding);
  if(!ja.ok)return;
  const uit=voerFlowUit({soort:'verzend',proef:false,poging:'1'},context(bestuurder.rechten,ja.versies));
  assert.equal(uit.ok,true,uit.melding);
  if(!uit.ok)return;
  assert.equal(uit.mail?.soort,'contract');
  assert.equal(uit.mail?.teltAlsVerzonden,true);
});

test('Databasefout in overlapcontrole blokkeert automatisch definitief', async() => {
  const rijen:Record<string,Record<string,unknown>[]>={
    boekingen:[{id:44,status:'optie',start_datum:'2027-03-20',eind_datum:'2027-03-21',aanvraag_id:14,aanbetaling_bedrag:100,aanbetaling_ontvangen:true}],
    aanvragen:[{id:14,status:'goedgekeurd'}],
    contractversies:[{versie:1,ondertekening:'ontvangen',bestuur:'akkoord',bestuur_verplicht:true}],
    betalingen:[{soort:'aanbetaling',status:'ontvangen'}],
  };
  const client={from(tabel:string){
    const q={select(_kol:string){return q;},eq(_key:string,_value:unknown){return q;},
      in(_key:string,_values:unknown[]){return q;},
      maybeSingle:async()=>({data:rijen[tabel]?.[0]??null,error:null}),
      then:(resolve:(data:unknown)=>unknown,reject?:(e:unknown)=>unknown)=>Promise.resolve(tabel==='boekingen' ? {data:null,error:{message:'PostgREST timeout'}} : {data:rijen[tabel]??[],error:null}).then(resolve,reject)};
    return q;
  }};
  const uit=await promoveerIndienKlaar(client as never,44,bestuurder);
  assert.equal(uit.ok,false);
  assert.equal(uit.gepromoveerd,false);
  assert.match(uit.melding,/bezetting/i);
});

test('Verouderde contractversie kan niet alsnog worden goedgekeurd of verstuurd', async () => {
  const { pasDocumentenflowToe } = await import('../src/lib/operatie/documentenflow-sessie.ts');
  let wijzigingen = 0;
  let verzendingen = 0;
  const tabellen: Record<string, Record<string, unknown>[]> = {
    boekingen: [{
      id: 44, status: 'optie', aanvraag_id: null, verhuurtype_sleutel: 'expositie',
      interne_titel: 'Kunst', start_datum: '2027-03-20', eind_datum: '2027-03-21',
      huurder_naam_snapshot: 'Jan Example', huurder_email_snapshot: 'jan@example.invalid',
    }],
    betalingen: [], instellingen: [],
    contractversies: [{ boeking_id: 44, versie: 2, bestuur_verplicht: true, bestuur: 'open', afspraken: {}, checks: {} }],
    contract_verzendingen: [],
  };
  const db = {
    from(tabel: string) {
      const condities: [string, unknown][] = [];
      const q = {
        select(_velden: string) { return q; },
        eq(kolom: string, waarde: unknown) { condities.push([kolom, waarde]); return q; },
        update(_waarden: unknown) { wijzigingen++; return q; },
        insert(_waarden: unknown) { wijzigingen++; return q; },
        maybeSingle: async () => ({data: (tabellen[tabel] ?? []).find(r => condities.every(([k,v])=> r[k] === v)) ?? null, error:null}),
        then(resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) {
          return Promise.resolve({data: (tabellen[tabel] ?? []).filter(r => condities.every(([k,v])=>r[k] === v)), error:null}).then(resolve,reject);
        },
      };
      return q;
    },
  };
  const uit = await pasDocumentenflowToe({
    client: db as never, env: { DOCUMENTENFLOW: true }, actor: bestuurder,
    boekingId: '44', verwachteVersie: 1, actie: { soort: 'akkoord' },
    modus: 'aan', testadres: null,
    verstuur: async () => { verzendingen++; return { verzonden: true, berichtId: 'fake', melding: '' }; },
  });
  assert.equal(uit.ok, false);
  assert.match(uit.melding, /gewijzigd/);
  assert.equal(wijzigingen, 0);
  assert.equal(verzendingen, 0);
});

test('SQL-reserveringscontrole ziet ook via RLS verborgen kalenderblokkades', async () => {
  const { readFile } = await import('node:fs/promises');
  const sql = await readFile(new URL('../supabase/migrations/20261118130000_bestuur_een_ja_aanvraag.sql', import.meta.url), 'utf8');
  assert.match(sql, /security definer\s+set search_path = ''/i);
  assert.match(sql, /auth\.uid\(\) is null/i);
  assert.match(sql, /app\.heeft_recht\('aanvragen', 'schrijven'\)/i);
  assert.match(sql, /app\.heeft_recht\('instellingen', 'schrijven'\)/i);
  assert.match(sql, /from public\.interne_activiteiten/i);
  assert.match(sql, /from public\.activiteit_bron/i);
  assert.match(sql, /revoke all on function public\.keur_aanvraag_en_reserveer\(bigint\) from public, anon;/i);
});

test('Een naar Test teruggezette mailschakelaar mag live contractverzending niet activeren', async () => {
  const { verstuurGecontroleerd } = await import('../src/lib/mail-transport.ts');
  const { STANDAARD_AUTOMATISERINGEN } = await import('../src/platform/automatisering.ts');
  const register = (status: 'actief' | 'test' | 'uit') => STANDAARD_AUTOMATISERINGEN.map(rij =>
    rij.sleutel === 'handmatige_template' ? { ...rij, status } : rij);
  let providers = 0;
  const transport = { async verstuur() { providers++; return 'mail-123'; } };
  const bericht = { sleutel: 'handmatige_template', naar: 'aanvrager@example.invalid', onderwerp: 'Contract', tekst: 'Bijlage', berichtsoort: 'geen_betaling' as const };
  for (const status of ['test', 'uit'] as const) {
    const geweigerd = await verstuurGecontroleerd(bericht, {
      register: register(status), transport, modus: 'aan', vereisteLiveModus: true,
    });
    assert.equal(geweigerd.providerAangeroepen, false);
    assert.equal(geweigerd.geblokkeerd, true);
  }
  assert.equal(providers, 0);
  const aan = await verstuurGecontroleerd(bericht, {
    register: register('actief'), transport, modus: 'aan', vereisteLiveModus: true,
  });
  assert.equal(aan.providerAangeroepen, true);
  assert.equal(providers, 1);
});

test('Onverwachte contract- of databasefout levert een veilige melding op, nooit een onbehandelde exception', async () => {
  const { besluitContractViaSessie } = await import('../src/lib/operatie/contract-besluit.ts');
  let naarProvider = 0;
  const onbereikbaar = { from() { throw new Error('Database connection reset'); } };
  const oudLog = console.error;
  let waarschuwingen = 0;
  try {
    console.error = () => { waarschuwingen++; };
    const resultaat = await besluitContractViaSessie({
      client: onbereikbaar as never,
      actor: bestuurder,
      boekingId: '44',
      besluit: 'ja',
      verwachteVersie: 1,
      env: { DOCUMENTENFLOW: true },
      modus: 'aan', testadres: null,
      verstuur: async () => { naarProvider++; return { verzonden: true, berichtId: 'x', melding: '' }; },
    });
    assert.equal(resultaat.ok, false);
    assert.match(resultaat.melding, /controleer.*verzendstatus/i);
    assert.equal(naarProvider, 0);
    assert.equal(waarschuwingen, 1);
  } finally {
    console.error = oudLog;
  }
});
