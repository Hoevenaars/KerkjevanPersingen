import { leesBestuursPrijs, verhuurMachineAan } from '../../platform/verhuur-beslislink.ts';
import { leesVerhuurBeoordeling, neemVerhuurBesluit, tekst, type MachineClient } from './beoordeling.ts';
import type { Actor } from '../operatie/kern.ts';

export async function verwerkMachineBeheer(input: { client: MachineClient; actor: Actor; formulier: FormData; aanvraagId: number; env: Record<string, unknown> }): Promise<{ ok: boolean; melding: string; aanvraagId: number }> {
  const { client, formulier: f, aanvraagId, env }=input;
  if(!verhuurMachineAan(env))return {ok:false,melding:'De verhuurmachine is niet geactiveerd.',aanvraagId};
  const scope=await client.rpc('verhuur_machine_in_scope',{p_id:aanvraagId});
  if(scope.error||scope.data!==true)return {ok:false,melding:'Dit dossier valt niet onder de geactiveerde verhuurmachine.',aanvraagId};
  const actie=tekst(f.get('actie'));
  try {
    let melding='Verwerkt.';
    if(actie==='vm_ja'||actie==='vm_nee') {
      const d=await leesVerhuurBeoordeling(client,aanvraagId);
      if(d.aanvraagVersie!==tekst(f.get('aanvraagVersie'))||d.bronVersie!==tekst(f.get('bronVersie')))throw new Error('De aanvraag of beoordeling is gewijzigd. Bekijk de actuele gegevens en bevestig opnieuw.');
      const uit=await neemVerhuurBesluit({client,dossier:d,besluit:actie==='vm_ja'?'ja':'nee',
        prijsCent:d.beoordeling.prijs.moetVaststellen?leesBestuursPrijs(f.get('huurprijs')):d.beoordeling.prijs.bedragCent,reden:tekst(f.get('reden')).slice(0,2000)});
      melding=uit.alVerwerkt?'Een besluit was al vastgelegd.':actie==='vm_nee'?'Afwijzing vastgelegd; de afwijzingsmail is klaargezet.':uit.wacht?'Akkoord en prijs vastgelegd. Het datumconflict vraagt nog een beslissing.':'Akkoord en prijs vastgelegd. De contractketen is gestart.';
    } else if(actie==='vm_toewijzen') {
      const r=await client.rpc('verhuur_wijs_datum_toe',{p_aanvraag_id:aanvraagId,p_bewuste_toewijzing:true});
      if(r.error)throw new Error(r.error.message);
      melding=(r.data as any)?.melding||'De periode is toegewezen; de contractketen gaat verder.';
    } else if(actie==='vm_herstel') {
      // Bind de getoonde herstelactie aan dit dossier, ook bij een handmatige POST.
      const job=await client.from('verhuur_proces_jobs').select('id,aanvraag_id').eq('id',tekst(f.get('jobId'))).maybeSingle();
      if(job.error||job.data?.aanvraag_id!==aanvraagId)throw new Error('Deze processtap hoort niet bij dit dossier.');
      const r=await client.rpc('verhuur_herstel_stap',{p_id:tekst(f.get('jobId')),p_provider_id:tekst(f.get('providerId')).trim()||null,p_bewezen_niet_verzonden:['ja','true','on'].includes(tekst(f.get('bewezenNietVerzonden')))});
      if(r.error||r.data!==true)throw new Error(r.error?.message||'De processtap kon niet worden hervat.');
      melding='Herstel vastgelegd. De processtap kan verder.';
    } else if(actie==='vm_concept_goedkeuren') {
      const { keurMachineConceptGoed } = await import('../operatie/verhuur-concept-herbeoordeling.ts');
      const r = await keurMachineConceptGoed({ client: client as never, actor: input.actor, aanvraagId,
        contractversieId: Number(f.get('contractversieId')), aanvraagVersie: tekst(f.get('aanvraagVersie')),
        bronVersie: tekst(f.get('bronVersie')), reden: tekst(f.get('reden')) });
      if(!r.ok)throw new Error(r.melding);
      melding=r.melding;
    } else if(actie==='vm_herstel_ontvangst') {
      const boekingId = Number(f.get('boekingId'));
      const d = await client.from('verhuur_besluiten').select('boeking_id').eq('aanvraag_id',aanvraagId).maybeSingle();
      if(d.error||Number(d.data?.boeking_id)!==boekingId)throw new Error('Deze boeking hoort niet bij dit besluit.');
      const richting=tekst(f.get('richting')),uitkomst=tekst(f.get('uitkomst'));
      if(!['huurder','bestuur'].includes(richting)||!['geaccepteerd','niet_verzonden'].includes(uitkomst))throw new Error('Kies de gecontroleerde ontvanger en verzenduitkomst.');
      const { herstelOndertekenbevestiging } = await import('../operatie/herstel-ondertekenbevestiging.ts');
      const r = await herstelOndertekenbevestiging({ client: client as never, actor: input.actor, boekingId,
        contractversieId:Number(f.get('contractversieId')),richting:richting as 'huurder'|'bestuur',
        uitkomst:uitkomst as 'geaccepteerd'|'niet_verzonden',providerId:tekst(f.get('providerId'))||undefined,bewijs:tekst(f.get('bewijs')) });
      if(!r.ok)throw new Error(r.melding);
      melding=r.melding;
    } else if(actie==='vm_herstel_verzending') {
      const boekingId=Number(f.get('boekingId'));
      const d=await client.from('verhuur_besluiten').select('boeking_id').eq('aanvraag_id',aanvraagId).maybeSingle();
      if(d.error||d.data?.boeking_id!==boekingId)throw new Error('Deze boeking hoort niet bij dit besluit.');
      const type=tekst(f.get('type')),uitkomst=tekst(f.get('uitkomst'));
      if(!['contract','factuur'].includes(type)||!['geaccepteerd','niet_verzonden'].includes(uitkomst))throw new Error('Kies de gecontroleerde verzenduitkomst.');
      const {herstelVerhuurVerzending}=await import('../operatie/verhuur-verzendherstel.ts');
      const r=await herstelVerhuurVerzending({client:client as never,actor:input.actor,boekingId,type:type as 'contract'|'factuur',claimId:Number(f.get('claimId')),uitkomst:uitkomst as 'geaccepteerd'|'niet_verzonden',providerId:tekst(f.get('providerId'))||undefined,bewijs:tekst(f.get('bewijs'))});
      if(!r.ok)throw new Error(r.melding);
      melding=r.melding;
    } else return {ok:false,melding:'Onbekende machineactie.',aanvraagId};
    // Alleen de worker gebruikt service-role; hij controleert opnieuw het mandaat.
    try {
      const {verwerkVerhuurmachine}=await import('./proces.ts');
      await verwerkVerhuurmachine(env,{aanvraagId});
    } catch { melding+=' Het besluit is opgeslagen; het vervolg wordt vanuit de proceswachtrij hervat.'; }
    return {ok:true,melding,aanvraagId};
  } catch(error) {return {ok:false,melding:error instanceof Error?error.message:'De actie is niet verwerkt.',aanvraagId};}
}
