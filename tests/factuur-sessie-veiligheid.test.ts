/** Integration at the application/database boundary using a deterministic stub.
 * The stub does not establish whether PostgreSQL RLS/RPC works in production.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { bekijkFactuurConcept, geefFactuurVoorContract, factuurpakketAan } from '../src/lib/operatie/factuur-sessie.ts';
import type { FlowContext, ContractVersie } from '../src/platform/documentenflow.ts';

type Rij = Record<string, unknown>;
const wizard = {
  huurprijs:'490,00',aanbetaling:'100',aanbetalingVerval:'2026-12-01',restVerval:'2027-01-18',
  periodeVan:'2027-03-20',periodeTot:'2027-03-21',naam:'Jan Voorbeeld',straat:'Kerkstraat',
  huisnummer:'1',toevoeging:'',postcode:'6575 AA',woonplaats:'Persingen',
};
const bron = {
  boekingId:'44', soort:'expositie',soortLabel:'Expositie',activiteit:'Kunst',toelichting:'',
  periodeVan:wizard.periodeVan,periodeTot:wizard.periodeTot,geboektOp:'2026-11-18',
  huurderNaam:'Jan Voorbeeld',straat:'Kerkstraat',huisnummer:'1',toevoeging:'',postcode:'6575 AA',woonplaats:'Persingen',
  email:'test@example.invalid',telefoon:'',personen:'25',huurprijsCent:49000,aanbetalingCent:10000,
  aanbetalingVerval:'2026-12-01',restCent:39000,restVerval:'2027-01-18',gastNaam:'',gastEmail:'',gastTelefoon:'',
  promotieAanwezig:false,boekingStatus:'optie',
};
const versie = {versie:1,contractnummer:'KVP-20270320-44-v1'} as ContractVersie;
const context = {bron,instellingen:{iban:'NL91ABNA0417164300'},nu:new Date().toISOString(), vandaag:'2026-11-18', actorNaam:'Bestuur',rechten:{isSuperAdmin:true,perModule:{}},versies:[versie],betaling:{stand:'open',toelichting:''},modus:'aan',testadres:null} as FlowContext;
const inst = (k:string,waarde:string)=>({sleutel:k,waarde});
const instellingen = [
  inst('factuur_btw_regime','vrijgesteld'), inst('factuur_btw_toelichting','Vastgestelde grondslag voor vrijstelling'),
  inst('factuur_verhuurder_naam','Stichting Kerkje van Persingen'),
  inst('factuur_verhuurder_adres','Persingensestraat 7, 6575 JA Persingen'),
  inst('factuur_kvk','41058732'), inst('documentenflow_iban','NL91ABNA0417164300'),
];
function mockDb(opts:{gegevens?:Rij[],regelingen?:Rij[],wizard?:unknown,geenInstellingen?:boolean}={}) {
  const calls={writes:0,rpc:0,reads:0};
  const tables:Record<string,Rij[]>={
    betalingen:opts.regelingen ?? [
      {id:1,soort:'aanbetaling',bedrag:100,status:'open',vervaldatum:'2026-12-01'},
      {id:2,soort:'restant',bedrag:390,status:'open',vervaldatum:'2027-01-18'},
    ],
    instellingen: opts.geenInstellingen ? [] : instellingen,
    contractversies:[{afspraken:{wizard:opts.wizard === undefined ? wizard : opts.wizard}}],
    boekingen:[{nummer:'KVP-20270320-44'}],
  };
  return {
    calls,
    client: {
      from(name:string) {
        calls.reads++;
        const q = {
          select(_a:string){return q;},eq(_k:string,_v:unknown){return q;},
          maybeSingle:async()=>({data:tables[name]?.[0] ?? null,error:null}),
          then:(resolve:(x:unknown)=>unknown,reject?: (x:unknown)=>unknown) => Promise.resolve({data:tables[name] ?? [],error:null}).then(resolve,reject),
        };
        return q;
      },
      rpc:async()=>{calls.rpc++;return {data:null,error:{message:'No migration'}};},
    } as never,
  };
}
test('de pakketflag staat standaard UIT',()=>{
  assert.equal(factuurpakketAan({}),false);
  assert.equal(factuurpakketAan({FACTUURPAKKET_V3:'false'}),false);
  assert.equal(factuurpakketAan({FACTUURPAKKET_V3:'true'}),true);
});
test('proefvoorbeeld is alleen read-only en geeft geen factuurnummer uit',async()=>{
  const {client,calls}=mockDb();
  const r=await bekijkFactuurConcept(client,context,versie);
  assert.equal(r.ok,true,JSON.stringify(r));
  if(r.ok){assert.equal(r.id,null);assert.equal(r.factuur.factuurnummer,'');assert.equal(r.factuur.bedragCent,10000);}
  assert.equal(calls.writes,0);assert.equal(calls.rpc,0);assert.equal(calls.reads,4);
});
test('geen fiscale configuratie betekent: geen factuur en geen mail',async()=>{
  const {client}=mockDb({geenInstellingen:true});
  const r=await bekijkFactuurConcept(client,context,versie);
  assert.equal(r.ok,false);
});
test('ander bedrag in bevroren contract verhindert uitgifte',async()=>{
  const {client,calls}=mockDb({wizard:{...wizard,huurprijs:'690,00'}});
  const r=await bekijkFactuurConcept(client,context,versie);
  assert.equal(r.ok,false);
  assert.equal(calls.rpc,0);
});
test('RPC die niet geïnstalleerd is geeft geen foutief factuurnummer terug',async()=>{
  const {client,calls}=mockDb();
  const dicht=await geefFactuurVoorContract(client,context,versie);
  assert.equal(dicht.ok,false);
  assert.match(dicht.ok ? '' : dicht.melding, /Betalingscommunicatie staat uit/);
  assert.equal(calls.rpc,0);
  const r=await geefFactuurVoorContract(client,context,versie,{betalingscommunicatieAan:true});
  assert.equal(r.ok,false);
  assert.equal(calls.rpc,1);
});
