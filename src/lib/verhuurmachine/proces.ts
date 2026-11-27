/** Duurzame procesregie. De database claimt; de bestaande diensten voeren uit. */
import { beslisGeheim, beslisToken, geldigeBeslislink, nieuweBeslislink, verhuurBasisUrl, verhuurMachineAan, type VerhuurBeslislink } from '../../platform/verhuur-beslislink.ts';
import { leesVerhuurBeoordeling, tekst, type MachineClient, type Rij } from './beoordeling.ts';
import type { Actor } from '../operatie/kern.ts';
import type { MailBericht, TransportUitkomst } from '../mail-transport.ts';
import { ymdInAmsterdam } from '../../platform/datum.ts';

export interface ProcesJob {
  id: string; aanvraag_id: number; boeking_id: number | null; taak: string; sleutel: string;
  status: string; payload: Rij; claim_token: string; pogingen: number;
}
export interface StapResultaat {
  status: 'afgerond' | 'te_doen' | 'wacht_op_mens' | 'onzeker' | 'geannuleerd';
  melding: string; providerId?: string | null; resultaat?: Rij;
}
export interface MachineDependencies {
  verstuur?: (bericht: MailBericht, opties?: { vereisteLiveModus: boolean }) => Promise<TransportUitkomst>;
  ontvangers?: () => Promise<string[]>;
  opvolgActueel?: (job: ProcesJob) => Promise<boolean>;
  mailPoort?: () => Promise<{ modus: string; reden?: string }>;
  contract?: (job: ProcesJob) => Promise<{ ok: boolean; melding: string; onzeker?: boolean; wachtOpMens?: boolean }>;
  controleerDefinitief?: (job: ProcesJob) => Promise<{ ok?: boolean; melding?: string; gepromoveerd?: boolean }>;
  financieel?: (job: ProcesJob) => Promise<{ ok: boolean; melding: string; onzeker?: boolean; wachtOpMens?: boolean }>;
}
export const MACHINE_ACTOR: Actor = {
  type: 'systeem', id: 'system', naam: 'Verhuurmachine: vastgelegd bestuursmandaat',
  rechten: { isSuperAdmin: false, perModule: { aanvragen: 'schrijven', boekingen: 'schrijven', instellingen: 'schrijven', finance: 'schrijven' } },
};

async function rpc(client: MachineClient, naam: string, args: Rij): Promise<any> {
  const r = await client.rpc(naam, args);
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
export async function planVerhuurStap(client: MachineClient, job: { aanvraagId: number; boekingId?: number | null; taak: string; sleutel: string; payload?: Rij; geplandOp?: string }): Promise<string | null> {
  return rpc(client, 'verhuur_plan_stap', {
    p_aanvraag_id: job.aanvraagId, p_boeking_id: job.boekingId ?? null, p_taak: job.taak, p_sleutel: job.sleutel,
    p_payload: job.payload ?? {}, p_gepland_op: job.geplandOp ?? new Date().toISOString(),
  });
}

async function machineClient(env: Record<string, unknown>): Promise<MachineClient> {
  const { maakBeheerAdminClient } = await import('../supabase.ts');
  const client = maakBeheerAdminClient(env);
  if (!client) throw new Error('De serververbinding voor de verhuurmachine ontbreekt.');
  return client as unknown as MachineClient;
}

async function standaardOntvangers(env: Record<string, unknown>): Promise<string[]> {
  const { leesExtraAanvraagOntvanger, uniekeOntvangers, ontvangersZonderBcc } = await import('../aanvraag-ontvangers.ts');
  const { toezichtBcc } = await import('../toezicht-bcc.ts');
  const primair = tekst(env.CONTACT_FALLBACK_EMAIL).trim() || 'contractbeheer.kvp@gmail.com';
  const extra = await leesExtraAanvraagOntvanger();
  const bcc = await toezichtBcc(primair, env, true).catch(() => [] as string[]);
  return ontvangersZonderBcc(uniekeOntvangers([primair, extra]), bcc);
}

async function geefBeslislink(client: MachineClient, aanvraagId: number, versie: string, ontvanger: string, secret: string): Promise<VerhuurBeslislink> {
  const gevonden = await client.from('verhuur_beslislinks').select('*').eq('aanvraag_id', aanvraagId).eq('aanvraag_versie', versie).eq('ontvanger', ontvanger).maybeSingle();
  if (gevonden.error) throw new Error(gevonden.error.message);
  let link = gevonden.data as VerhuurBeslislink | null;
  if (!link) {
    const nieuw = nieuweBeslislink({ aanvraagId, versie, ontvanger, secret });
    const r = await client.from('verhuur_beslislinks').insert(nieuw).select('*').single();
    if (r.error) throw new Error(r.error.message);
    link = r.data as VerhuurBeslislink;
  }
  const token = beslisToken(link, secret);
  if (!geldigeBeslislink(link, token, secret)) throw new Error('De beslislink is verlopen of ingetrokken. Beoordeel deze aanvraag in het dossier.');
  return link;
}

function uitDienst(r: { ok?: boolean; melding?: string; onzeker?: boolean; wachtOpMens?: boolean; providerId?: string | null }): StapResultaat {
  return { status: r.onzeker ? 'onzeker' : r.ok === false || r.wachtOpMens ? 'wacht_op_mens' : 'afgerond', melding: r.melding ?? 'Verwerkt.', providerId: r.providerId };
}

async function verzendStap(client: MachineClient, job: ProcesJob, bericht: MailBericht, env: Record<string, unknown>, deps: MachineDependencies, vereisteLiveModus=false): Promise<StapResultaat> {
  // Opnieuw controleren direct vóór het externe effect. Annulering trekt de claim in.
  const huidig = await client.from('verhuur_proces_jobs').select('status,claim_token').eq('id', job.id).maybeSingle();
  if (huidig.error) return { status: 'te_doen', melding: 'De verzendbevoegdheid kon niet worden gecontroleerd.' };
  if (huidig.data?.status !== 'bezig' || huidig.data?.claim_token !== job.claim_token) return { status: 'geannuleerd', melding: 'Deze processtap is ingetrokken.' };
  if (job.boeking_id && ['definitiefmail','opvolgmail'].includes(job.taak)) {
    const recht = await rpc(client, 'verhuur_machine_mag', { p_boeking_id: job.boeking_id, p_aanvraag_id: job.aanvraag_id });
    if (recht !== true) return { status: 'wacht_op_mens', melding: 'Het bestuursmandaat is gewijzigd; de status- of vervolgmail is niet verzonden.' };
  }
  let r: TransportUitkomst;
  try {
    const verstuur = deps.verstuur ?? (async (b, opties) => {
      const { verstuurGecontroleerd } = await import('../mail-transport.ts');
      return verstuurGecontroleerd(b, { env, vereisteLiveModus: opties?.vereisteLiveModus });
    });
    r = await verstuur({ ...bericht, idempotentieSleutel: job.sleutel }, { vereisteLiveModus });
  } catch {
    return { status: 'onzeker', melding: 'De mailuitkomst is onbekend. Controleer providerbewijs voordat deze stap wordt hervat.' };
  }
  if (r.besluit.modus === 'test') return { status: 'wacht_op_mens', melding: 'Testmail verwerkt; de echte verzending wacht op activering en hervatten.', resultaat: { test: true, testProviderId: r.providerBerichtId ?? null } };
  if (r.verzonden && r.providerAangeroepen && r.providerBerichtId) return { status: 'afgerond', melding: 'Mail door de provider geaccepteerd.', providerId: r.providerBerichtId };
  return { status: r.providerAangeroepen ? 'onzeker' : 'wacht_op_mens', melding: r.melding || r.besluit.reden || 'Er is geen verzendbewijs.' };
}

export async function verwerkVerhuurStap(client: MachineClient, job: ProcesJob, env: Record<string, unknown>, deps: MachineDependencies = {}): Promise<StapResultaat> {
  const basisUrl = verhuurBasisUrl(env);
  if (job.taak === 'bestuursmail') {
    const dossier = await leesVerhuurBeoordeling(client, job.aanvraag_id);
    if (dossier.aanvraagRij.boeking_id || !['nieuw','in_behandeling','wacht_op_aanvrager'].includes(tekst(dossier.aanvraagRij.status))) return { status: 'geannuleerd', melding: 'Deze aanvraag is al verwerkt.' };
    if (!job.payload.ontvanger) {
      const ontvangers = await (deps.ontvangers?.() ?? standaardOntvangers(env));
      if (!ontvangers.length) return { status: 'wacht_op_mens', melding: 'Er is geen bestuursontvanger ingesteld.' };
      for (const adres of ontvangers) {
        const ontvanger = adres.trim().toLowerCase();
        await planVerhuurStap(client, { aanvraagId: job.aanvraag_id, taak: 'bestuursmail',
          sleutel: `bestuursmail:${job.aanvraag_id}:${dossier.aanvraagVersie}:${ontvanger}`, payload: { ontvanger, aanvraagVersie: dossier.aanvraagVersie } });
      }
      return { status: 'afgerond', melding: 'Bestuursmail per ontvanger klaargezet.' };
    }
    if (job.payload.aanvraagVersie !== dossier.aanvraagVersie) return { status: 'geannuleerd', melding: 'Deze aanvraagversie is vervallen.' };
    const poort = deps.mailPoort ? await deps.mailPoort() : deps.verstuur ? null
      : await (await import('../automatisering-register.ts')).besluitVoor('aanvraag_bestuur', undefined, env);
    if (poort && !['aan','test'].includes(poort.modus)) return { status: 'wacht_op_mens', melding: poort.reden || 'De bestuursmail is niet vrijgegeven.' };
    const secret = beslisGeheim(env);
    let jaUrl = `${basisUrl}/beheer/aanvragen/${job.aanvraag_id}/`, neeUrl = jaUrl;
    // Testmails krijgen uitsluitend een gewone beheerlink, geen besliscapability.
    if (poort?.modus !== 'test') {
      const link = await geefBeslislink(client, job.aanvraag_id, dossier.aanvraagVersie, tekst(job.payload.ontvanger), secret);
      const url = new URL('/bestuur/besluit/', basisUrl);
      url.searchParams.set('token', beslisToken(link, secret));
      url.searchParams.set('besluit', 'ja'); jaUrl = url.toString();
      url.searchParams.set('besluit', 'nee'); neeUrl = url.toString();
    }
    const { bestuurMail } = await import('../aanvraag.ts');
    const brief = bestuurMail(dossier.aanvraag, { beoordeling: dossier.beoordeling, jaUrl, neeUrl });
    return verzendStap(client, job, { sleutel: 'aanvraag_bestuur', naar: tekst(job.payload.ontvanger), onderwerp: 'Besluit gevraagd: nieuwe verhuuraanvraag',
      tekst: brief.text, html: brief.html, richting: 'intern', berichtsoort: 'geen_betaling', aanvragerEmail: dossier.aanvraag.email, aanvragerNaam: dossier.aanvraag.naam }, env, deps, poort?.modus !== 'test');
  }
  if (job.taak === 'hervatten') {
    const r = await rpc(client, 'verhuur_wijs_datum_toe', { p_aanvraag_id: job.aanvraag_id, p_bewuste_toewijzing: false });
    return { status: 'afgerond', melding: r.melding || (r.wacht ? 'Wacht op beschikbaarheid.' : 'Datum toegewezen.') };
  }
  if (job.taak === 'afwijzingsmail' || job.taak === 'definitiefmail') {
    const a = await client.from('aanvragen').select('*').eq('id', job.aanvraag_id).maybeSingle();
    if (a.error || !a.data) return { status: 'te_doen', melding: 'Aanvraag niet beschikbaar voor statusmail.' };
    let boeking: Rij | null = null;
    if (job.taak === 'definitiefmail') {
      const b = await client.from('boekingen').select('*').eq('id', job.boeking_id).maybeSingle();
      if (b.error) return { status: 'te_doen', melding: 'Boeking niet beschikbaar voor bevestiging.' };
      if (b.data?.status !== 'definitief') return { status: 'geannuleerd', melding: 'De boeking is niet meer definitief.' };
      boeking = b.data;
    } else if (a.data.status !== 'afgewezen') return { status: 'geannuleerd', melding: 'De aanvraag is niet afgewezen.' };
    const templateId = job.taak === 'afwijzingsmail' ? 'booking_request_rejected' : 'booking_confirmed';
    const { laadMailtemplatesUitSupabase } = await import('../../platform/mailtemplates/supabase-bron.ts');
    const { renderMailBericht, onderwerpUitTemplate } = await import('../../platform/mailtemplates/render.ts');
    const { metReservering } = await import('../../platform/mailtemplates/definitief-mail.ts');
    const templates = await laadMailtemplatesUitSupabase(client as never);
    const template = templates.find(t => t.id === templateId);
    if (!template?.actief) return { status: 'wacht_op_mens', melding: 'De juiste statusmailtemplate is niet actief.' };
    let tijden: Rij = {};
    if (boeking) {
      const cv = await client.from('contractversies').select('afspraken').eq('boeking_id', job.boeking_id).order('versie', { ascending: false }).limit(1).maybeSingle();
      if (cv.error) return { status: 'te_doen', melding: 'Contractafspraken voor de bevestiging konden niet worden gelezen.' };
      tijden = (cv.data?.afspraken as Rij | undefined)?.wizard as Rij || {};
    }
    const vars = metReservering({ naam: tekst(a.data.naam), voornaam: tekst(a.data.naam).split(' ')[0], reden_afwijzing: tekst(a.data.afwijsreden) }, {
      start: tekst(boeking?.start_datum || a.data.start_datum), eind: tekst(boeking?.eind_datum || a.data.eind_datum), soort: tekst(a.data.verhuurtype_sleutel),
      titel: tekst(tijden.activiteit || boeking?.interne_titel), tijdVan: tekst(tijden.tijdVan), tijdTot: tekst(tijden.tijdTot),
    });
    const brief = renderMailBericht(template, vars, { templateId, siteOrigin: basisUrl });
    return verzendStap(client, job, { sleutel: 'statusmail_huurder', naar: tekst(boeking?.huurder_email_snapshot || a.data.email),
      onderwerp: onderwerpUitTemplate(template, vars), tekst: brief.text, html: brief.html, templateId, richting: 'aanvrager', berichtsoort: 'geen_betaling' }, env, deps);
  }
  if (!job.boeking_id) return { status: 'wacht_op_mens', melding: 'De processtap mist een boeking.' };
  const bevoegd = await rpc(client, 'verhuur_machine_mag', { p_boeking_id: job.boeking_id, p_aanvraag_id: job.aanvraag_id });
  if (bevoegd !== true) return { status: 'wacht_op_mens', melding: 'Het bestuursmandaat is niet meer geldig voor deze boeking. Controleer gewijzigde afspraken of annulering.' };
  if (job.taak === 'opvolgmail') {
    const p = job.payload;
    const { isMachineOpvolgtemplate } = await import('./opvolging.ts');
    if (!isMachineOpvolgtemplate(tekst(p.templateId))) return { status: 'wacht_op_mens', melding: 'Onbekende of financiële mail in de vervolgplanning.' };
    const actueel = deps.opvolgActueel ? await deps.opvolgActueel(job)
      : await (await import('../operatie/runtime.ts')).verhuurOpvolgmailActueel(job.boeking_id, tekst(p.templateId));
    if (!actueel) return { status: 'geannuleerd', melding: 'Deze vervolgmail is door de actuele dossierstatus niet meer nodig.' };
    if (p.tokenVerlooptOp && new Date(tekst(p.tokenVerlooptOp)).getTime() <= Date.now()) {
      return { status: 'wacht_op_mens', melding: 'De aanleverlink is verlopen. Maak in het dossier een nieuwe klantlink en handel deze uitzonderingsmail af.' };
    }
    if (['booking_content_request','booking_content_reminder'].includes(tekst(p.templateId))) {
      if (!/^[a-f0-9]{64}$/.test(tekst(p.tokenHash))) return { status: 'wacht_op_mens', melding: 'De opgeslagen aanleverlink mist verifieerbaar bewijs.' };
      const token = await client.from('toegangstokens').select('ingetrokken_op,verloopt_op')
        .eq('boeking_id', job.boeking_id).eq('doel','content').eq('token_hash', p.tokenHash).maybeSingle();
      if (token.error) return { status: 'te_doen', melding: 'De aanleverlink kon niet worden gecontroleerd; er is niets verzonden.' };
      if (!token.data || token.data.ingetrokken_op || !(new Date(tekst(token.data.verloopt_op)).getTime() > Date.now())) {
        return { status: 'wacht_op_mens', melding: 'De aanleverlink is ingetrokken of verlopen. Handel de inhoudsvraag vanuit het dossier af.' };
      }
    }
    return verzendStap(client, job, {
      sleutel: tekst(p.automatisering), naar: tekst(p.naar), onderwerp: tekst(p.onderwerp), tekst: tekst(p.tekst),
      html: tekst(p.html) || undefined, replyTo: tekst(p.replyTo) || undefined,
      aanvragerEmail: tekst(p.aanvragerEmail), aanvragerNaam: tekst(p.aanvragerNaam),
      templateId: tekst(p.templateId), richting: p.richting === 'intern' ? 'intern' : 'aanvrager', berichtsoort: 'geen_betaling',
    }, env, deps, true);
  }
  if (job.taak === 'contract') {
    const uitvoer = deps.contract ?? (async j => {
      const { verwerkContractVoorMandaat } = await import('../operatie/verhuur-contract-machine.ts');
      return verwerkContractVoorMandaat({ client: client as never, aanvraagId: j.aanvraag_id, boekingId: j.boeking_id!, actor: MACHINE_ACTOR, env, basisUrl });
    });
    const r = uitDienst(await uitvoer(job));
    if (r.status === 'afgerond') {
      await planVerhuurStap(client, { aanvraagId: job.aanvraag_id, boekingId: job.boeking_id, taak: 'controleer_definitief', sleutel: `contract-klaar:${job.boeking_id}` });
      await planVerhuurStap(client, { aanvraagId: job.aanvraag_id, boekingId: job.boeking_id, taak: 'financieel', sleutel: `financieel:${job.boeking_id}:${ymdInAmsterdam(new Date())}` });
    }
    return r;
  }
  if (job.taak === 'controleer_definitief') {
    const uitvoer = deps.controleerDefinitief ?? (async j => {
      const { promoveerIndienKlaar } = await import('../operatie/definitief-auto.ts');
      return promoveerIndienKlaar(client as never, j.boeking_id!, MACHINE_ACTOR);
    });
    const r = await uitvoer(job);
    return { status: r.ok === false ? 'wacht_op_mens' : 'afgerond', melding: r.melding || (r.gepromoveerd ? 'Boeking definitief.' : 'Wacht op ondertekening of vereiste betaling.') };
  }
  if (job.taak === 'financieel') {
    const uitvoer = deps.financieel ?? (async j => {
      const { verwerkFinancieleTermijnen } = await import('../operatie/verhuur-financieel.ts');
      return verwerkFinancieleTermijnen({ client: client as never, boekingId: j.boeking_id!, actor: MACHINE_ACTOR, env, basisUrl });
    });
    return uitDienst(await uitvoer(job));
  }
  if (job.taak === 'ondertekenbevestiging') {
    const { verwerkOndertekenbevestiging } = await import('../operatie/ondertekenbevestiging.ts');
    return uitDienst(await verwerkOndertekenbevestiging({ client: client as never, boekingId: job.boeking_id, contractversieId: Number(job.payload.contractversie_id), env, sleutel: job.sleutel }));
  }
  if (job.taak === 'agenda') {
    const r = await client.rpc('agenda_bezet_voor_definitieve_boeking', { p_boeking_id: job.boeking_id });
    return r.error ? { status: 'wacht_op_mens', melding: r.error.message } : { status: 'afgerond', melding: 'Agenda bijgewerkt.' };
  }
  return { status: 'wacht_op_mens', melding: 'Deze processtap is onbekend.' };
}

export async function verwerkVerhuurmachine(env: Record<string, unknown> = process.env, opties: { client?: MachineClient; aanvraagId?: number; maxJobs?: number; maxMs?: number; deps?: MachineDependencies } = {}): Promise<{ ok: boolean; verwerkt: number; meldingen: string[] }> {
  if (!verhuurMachineAan(env)) return { ok: true, verwerkt: 0, meldingen: [] };
  const client = opties.client ?? await machineClient(env);
  const max = Math.max(1, Math.min(opties.maxJobs ?? 12, 25));
  const eindigtOp = Date.now() + Math.max(1000, Math.min(opties.maxMs ?? 15000, 45000));
  let verwerkt = 0;
  const meldingen: string[] = [];
  // Eén claim tegelijk voorkomt dat nog niet begonnen mails na een requesttimeout
  // ten onrechte als onzeker achterblijven. Vervolg blijft duurzaam in de wachtrij.
  while (verwerkt < max && Date.now() < eindigtOp) {
    const jobs = await rpc(client, 'verhuur_claim_stappen', { p_limiet: 1, p_aanvraag_id: opties.aanvraagId ?? null }) as ProcesJob[];
    if (!jobs?.length) break;
    for (const job of jobs) {
      let uit: StapResultaat;
      try { uit = await verwerkVerhuurStap(client, job, env, opties.deps); }
      catch (error) { uit = { status: 'wacht_op_mens', melding: error instanceof Error ? error.message : 'Verwerking mislukt; controleer het dossier.' }; }
      const bevestigd = await rpc(client, 'verhuur_rond_stap_af', { p_id: job.id, p_claim: job.claim_token, p_status: uit.status,
        p_resultaat: uit.resultaat ?? {}, p_fout: uit.status === 'afgerond' ? null : uit.melding, p_provider_id: uit.providerId ?? null });
      if (!bevestigd && uit.providerId) meldingen.push('Verzendbewijs ontvangen, maar de claim is gewijzigd. Controleer dit dossier.');
      meldingen.push(`${job.taak}: ${uit.melding}`);
      verwerkt++;
    }
  }
  return { ok: true, verwerkt, meldingen };
}

/** Aangeroepen door de bestaande intake. De trigger houdt een crashbestendige kopie. */
export async function startVerhuurAanvraag(aanvraagId: number, env: Record<string, unknown> = process.env): Promise<boolean> {
  const client = await machineClient(env);
  const scope = await client.rpc('verhuur_machine_in_scope', { p_id: aanvraagId });
  if (scope.error) {
    if (!verhuurMachineAan(env) && ['42883','PGRST202'].includes(scope.error.code ?? '')) return false;
    throw new Error(scope.error.message);
  }
  if (scope.data !== true) return false;
  // Pauzeren laat de opgeslagen opdracht wachten; geen tweede oude bestuursmail.
  if (!verhuurMachineAan(env)) return true;
  const dossier = await leesVerhuurBeoordeling(client, aanvraagId);
  const id = await planVerhuurStap(client, { aanvraagId, taak: 'bestuursmail', sleutel: `bestuursmail:${aanvraagId}:${dossier.aanvraagVersie}` });
  if (id) {
    const r = await client.from('verhuur_proces_jobs').update({ gepland_op: new Date().toISOString() }).eq('id', id).eq('status', 'te_doen');
    if (r.error) throw new Error(r.error.message);
  }
  await verwerkVerhuurmachine(env, { client, aanvraagId });
  return true;
}
