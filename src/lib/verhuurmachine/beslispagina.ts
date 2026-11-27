import { bevestigingsBewijs, beslisGeheim, geldigBevestigingsBewijs, geldigeBeslislink, leesBestuursPrijs, tokenHash, verhuurMachineAan, type VerhuurBeslislink } from '../../platform/verhuur-beslislink.ts';
import { leesVerhuurBeoordeling, neemVerhuurBesluit, tekst, type BeoordelingsDossier, type MachineClient } from './beoordeling.ts';

const esc = (v: unknown): string => tekst(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const euro = (cent: number | null): string => cent == null ? 'Nog vast te stellen' : (cent / 100).toLocaleString('nl-NL',{style:'currency',currency:'EUR'});
const HEADERS = {
  'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Robots-Tag':'noindex, nofollow',
  'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
  'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

function document(titel: string, inhoud: string): string {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titel)} | Kerkje van Persingen</title>
  <style>body{margin:0;background:#faf8f3;color:#25271e;font:17px/1.55 system-ui,sans-serif}main{max-width:740px;margin:30px auto;padding:28px;background:white;border:1px solid #ded9cb}h1{font:700 30px/1.2 Georgia,serif;color:#4a5235}h2{font-size:21px}p{margin:14px 0}dl{display:grid;grid-template-columns:140px 1fr;gap:8px}dt{font-weight:600}dd{margin:0}.melding{padding:14px 18px;border-left:4px solid #a97324;background:#fff5df;margin:18px 0}.fout{border-color:#9c4a2f;background:#fff0eb}.klaar{border-color:#4a5235;background:#edf3e9}label{display:block;font-weight:600;margin:16px 0 5px}input,textarea{font:inherit;box-sizing:border-box;padding:12px;border:1px solid #8a8a7c;width:100%;max-width:100%}button{font:600 17px/1.3 system-ui;padding:14px 22px;background:#4a5235;color:white;border:1px solid #4a5235;cursor:pointer;margin:20px 10px 0 0}.nee{color:#9c4a2f;background:white;border-color:#9c4a2f}small{color:#5b5c52}a{color:#4a5235}@media(max-width:600px){main{margin:0;padding:22px}dl{grid-template-columns:1fr;gap:2px}dd{margin-bottom:10px}button{width:100%;margin-right:0}}</style></head>
  <body><main><p><strong>KERKJE VAN PERSINGEN · BESTUUR</strong></p><h1>${esc(titel)}</h1>${inhoud}</main></body></html>`;
}

function antwoord(titel: string, inhoud: string, status=200): Response { return new Response(document(titel,inhoud), {status,headers:HEADERS}); }

export function renderBeslisFormulier(d: BeoordelingsDossier, token: string, bewijs: string, fout='', prijs=''): string {
  const b=d.beoordeling, a=d.aanvraag;
  const waarschuwingen = [
    ...b.conflicts.map(c => `${c.melding} ${c.naam ? `(${c.naam})` : ''} ${c.start} t/m ${c.eind}.`),
    ...b.historieWaarschuwingen.map(w => `${w.melding} Bron: ${w.referentie}; ${w.voorlopig ? 'voorlopig, ' : ''}${w.zekerheid}.`),
    ...b.meldingen.map(m => m.tekst),
  ];
  const profielen=(d.bron.instellingen as any)?.verhuur_autocontract_profielen ?? {};
  const profiel=profielen[a.soort];
  const afspraken=profiel ? `<p><strong>Standaardafspraken:</strong> ${esc(profiel.tijdVan)}–${esc(profiel.tijdTot)} uur. Opbouw: ${esc(profiel.opbouw)}. Afbouw: ${esc(profiel.afbouw)}.<br>Aanbetaling: ${euro(Math.round(Number(profiel.aanbetalingEuro)*100))}; betaling binnen ${esc(profiel.betalingBinnenDagen)} dagen; restant ${esc(profiel.restantMaandenVoorStart)} maand(en) vóór de activiteit. Bij korte termijn ${profiel.kortVoorStartVolledig ? 'volledige huur vooraf' : 'eerst een afzonderlijke termijn afspreken'}.</p>` : '<div class="melding">Standaardcontractafspraken zijn nog niet compleet. Uw inhoudelijke akkoord wordt bewaard; contractverzending wacht op aanvulling in het dossier.</div>';
  return `${fout ? `<div class="melding fout" role="alert">${esc(fout)}</div>` : ''}
    <dl><dt>Aanvraag</dt><dd>${esc(d.aanvraagRij.id)}</dd><dt>Activiteit</dt><dd>${esc(a.soort==='diverse'?'Overig':a.soort)}</dd><dt>Aanvrager</dt><dd>${esc(a.naam)}</dd><dt>Periode</dt><dd>${esc(a.datum)} t/m ${esc(a.datumTot||a.datum)}</dd><dt>Prijsindicatie</dt><dd>${b.prijs.prijstype==='vanaf'?'Vanaf ':''}${b.prijs.prijstype==='op_aanvraag'?'Op aanvraag':euro(b.prijs.bedragCent??b.prijs.indicatieCent)}</dd></dl>
    ${a.toelichting?`<p><strong>Toelichting</strong><br>${esc(a.toelichting).replace(/\n/g,'<br>')}</p>`:''}
    ${waarschuwingen.length?`<section class="melding"><h2>Aandachtspunten</h2><ul>${waarschuwingen.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>${b.historieWaarschuwingen.length?'<p>Bij Ja legt u ook de getoonde afwijking van de 18-maandenregel vast.</p>':''}${b.conflicts.length?'<p>Uw inhoudelijke akkoord blijft bewaard. De periode wordt pas toegewezen wanneer het conflict is opgelost.</p>':''}</section>`:''}
    ${afspraken}<form method="post" action="/bestuur/besluit/">
      <input type="hidden" name="token" value="${esc(token)}"><input type="hidden" name="bewijs" value="${esc(bewijs)}">
      ${b.prijs.moetVaststellen?`<label for="huurprijs">Definitieve totale huurprijs voor deze periode</label><input id="huurprijs" name="huurprijs" inputmode="decimal" maxlength="16" value="${esc(prijs)}" required aria-describedby="prijsinfo"><small id="prijsinfo">Bedrag in euro’s, inclusief btw waar van toepassing. Dit bedrag wordt gebruikt voor contract en facturen.</small>`:`<p><strong>Definitieve huurprijs: ${euro(b.prijs.bedragCent)}</strong></p>`}
      <label for="reden">Toelichting (optioneel)</label><textarea id="reden" name="reden" maxlength="2000" rows="3"></textarea>
      <button type="submit" name="besluit" value="ja">${b.prijs.moetVaststellen?'Akkoord en prijs bevestigen':'Ja, akkoord bevestigen'}</button>
      <button class="nee" type="submit" name="besluit" value="nee" formnovalidate>Nee, aanvraag afwijzen</button>
    </form><p><small>Alleen bevestigen slaat een besluit op. Openen van de mail of deze pagina wijzigt niets.</small></p>`;
}

export async function behandelBestuursBeslisPagina(request: Request, input: {
  client: MachineClient; env: Record<string, unknown>; naBesluit?: (aanvraagId:number)=>Promise<void>; nu?: Date;
}): Promise<Response> {
  if (!verhuurMachineAan(input.env)) return antwoord('Niet beschikbaar','<p>De bestuursbeslisroute is niet actief.</p>',404);
  if (!['GET','HEAD','POST'].includes(request.method)) return new Response(null,{status:405,headers:{...HEADERS,Allow:'GET, HEAD, POST'}});
  const url=new URL(request.url);
  if (request.method==='POST' && request.headers.get('origin')!==url.origin) return antwoord('Verzoek geweigerd','<p>Open de link uit de bestuursmail en bevestig daar uw keuze.</p>',403);
  if (Number(request.headers.get('content-length')||0)>16384) return antwoord('Verzoek te groot','<p>Het besluit is niet verwerkt.</p>',413);
  let data:FormData|null=null;
  if(request.method==='POST') { try { data=await request.formData(); } catch {return antwoord('Ongeldig verzoek','<p>Het besluit is niet verwerkt.</p>',400);} }
  const token=tekst(data?.get('token')??url.searchParams.get('token'));
  if(token.length>160||!token) return antwoord('Ongeldige link','<p>Open de volledige link uit de bestuursmail.</p>',404);
  const secret=beslisGeheim(input.env);
  const hash=tokenHash(token);
  const r=await input.client.from('verhuur_beslislinks').select('*').eq('token_hash',hash).maybeSingle();
  if(r.error) return antwoord('Tijdelijk niet beschikbaar','<p>Het besluit is niet gewijzigd. Probeer het later opnieuw.</p>',503);
  const link=r.data as VerhuurBeslislink|null;
  if(!geldigeBeslislink(link,token,secret,input.nu)) return antwoord('Link niet meer geldig','<p>Deze link is verlopen of ingetrokken. U kunt de aanvraag beoordelen in de bestaande beheeromgeving.</p>',410);
  if(link!.verbruikt_op) return antwoord('Besluit al vastgelegd',`<div class="melding klaar">Er is al ${link!.uitkomst==='ja'?'akkoord gegeven':'een afwijzing vastgelegd'}. Deze link veroorzaakt geen tweede verwerking.</div>`);
  let dossier=await leesVerhuurBeoordeling(input.client,link!.aanvraag_id);
  if(dossier.aanvraagVersie!==link!.aanvraag_versie) return antwoord('Aanvraag gewijzigd','<p>De gegevens zijn gewijzigd. Gebruik de nieuwe bestuursmail of open het dossier.</p>',409);
  let fout=''; let status=200;
  if(data) {
    if(!geldigBevestigingsBewijs(tekst(data.get('bewijs')),secret,hash,dossier.aanvraagVersie,dossier.bronVersie)) {
      fout='De aanvraag of beschikbaarheid is gewijzigd. Bekijk de actuele gegevens hieronder en bevestig opnieuw.'; status=409;
    } else {
      const besluit=tekst(data.get('besluit'));
      if(besluit!=='ja'&&besluit!=='nee'){fout='Kies Ja of Nee.';status=400;}
      else try {
        const uit=await neemVerhuurBesluit({client:input.client,dossier,besluit,prijsCent:dossier.beoordeling.prijs.moetVaststellen?leesBestuursPrijs(data.get('huurprijs')):dossier.beoordeling.prijs.bedragCent,
          tokenHash:hash,reden:tekst(data.get('reden')).slice(0,2000)});
        // Het besluit en de vervolgopdracht staan al duurzaam vast. Een storing
        // bij de onmiddellijke verwerking verandert het besluit niet terug.
        try {await input.naBesluit?.(link!.aanvraag_id);} catch { /* De cron herneemt de opgeslagen stap. */ }
        const tekstUit=uit.alVerwerkt?'Een bestuursbesluit was al vastgelegd. Er is geen tweede besluit gemaakt.':besluit==='nee'?'De aanvraag is afgewezen. De afwijzingsmail is klaargezet.':uit.wacht?'Uw akkoord en huurprijs zijn vastgelegd. De aanvraag wacht op oplossing van het datumconflict.':'Uw akkoord en huurprijs zijn vastgelegd. De aanvraag wordt verder verwerkt.';
        return antwoord('Besluit vastgelegd',`<div class="melding klaar">${esc(tekstUit)}</div><p><a href="/beheer/aanvragen/${link!.aanvraag_id}/">Open het dossier in beheer</a></p>`);
      } catch(error) {
        fout=error instanceof Error?error.message:'Het besluit kon niet worden verwerkt.';status=409;
        dossier=await leesVerhuurBeoordeling(input.client,link!.aanvraag_id);
      }
    }
  }
  const bewijs=bevestigingsBewijs(secret,hash,dossier.aanvraagVersie,dossier.bronVersie);
  const response=antwoord('Aanvraag beoordelen',renderBeslisFormulier(dossier,token,bewijs,fout,tekst(data?.get('huurprijs'))),status);
  return request.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;
}
