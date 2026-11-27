import type { APIRoute } from 'astro';
import { behandelBestuursBeslisPagina } from '../../lib/verhuurmachine/beslispagina.ts';
import { verwerkVerhuurmachine } from '../../lib/verhuurmachine/proces.ts';
import { verhuurMachineAan } from '../../platform/verhuur-beslislink.ts';

export const prerender=false;
const behandel:APIRoute=async({request})=>{
  if(!verhuurMachineAan(process.env))return new Response('Niet beschikbaar',{status:404,headers:{'Cache-Control':'no-store'}});
  try {
    const {maakBeheerAdminClient}=await import('../../lib/supabase.ts');
    const client=maakBeheerAdminClient();
    if(!client)return new Response('Tijdelijk niet beschikbaar',{status:503,headers:{'Cache-Control':'no-store'}});
    return await behandelBestuursBeslisPagina(request,{client:client as never,env:process.env,
      naBesluit:async aanvraagId=>{await verwerkVerhuurmachine(process.env,{client:client as never,aanvraagId});}});
  } catch {
    return new Response('Het besluit is niet bevestigd. Open het dossier of probeer het later opnieuw.',{status:503,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'}});
  }
};
export const GET=behandel;
export const HEAD=behandel;
export const POST=behandel;
