/**
 * Supabase-uitvoering van de dossierdienst.
 * Alleen wanneer CONTENT_BRON=supabase én ALLOW_SUPABASE_CONTENT=true.
 * Zonder die twee vlaggen blijft Sanity de productiebron.
 */

import { automatiseringVoorTemplate } from '../../platform/automatisering.ts';
import { eisProviderToegestaan } from '../mail-transport.ts';
import type { Activiteit } from '../sanity.ts';
import { maakBeheerAdminClient } from '../supabase.ts';
import { huidigeContentBron } from '../../platform/bron.ts';
import { DEMO_INSTELLINGEN } from '../../platform/demo-data.ts';
import type { BeheerSnapshot } from '../../platform/beheer-bron.ts';
import type { InhoudStatus } from '../../platform/continuiteit.ts';
import { ymdInAmsterdam } from '../../platform/datum.ts';
import { laadMailtemplatesUitSupabase } from '../../platform/mailtemplates/supabase-bron.ts';
import type { AanvraagStatus, BoekingStatus, GebruikerRechten, PublicatieTrigger } from '../../platform/types.ts';
import type { Json } from '../database.types.ts';
import { contentStatusVanInhoud, directeFotoUrl, hoortOpPubliekeAgenda, maandenVanTrigger, triggerIsBekend } from '../agenda-zichtbaarheid.ts';
import { leesbareAuthFout, voerDossierViaSessie, type DossierSessie } from './dossier-sessie.ts';
import {
  legeWereld,
  readinessVanBoeking,
  voerOpdrachtUit,
  type Actor,
  type Mutatie,
  type Opdracht,
  type PubliekRij,
  type Wereld,
} from './kern.ts';

const VAN = 'Het Kerkje van Persingen <noreply@send.kerkjepersingen.nl>';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function operationeelSupabase(env: Record<string, unknown> = process.env): boolean {
  return huidigeContentBron(env) === 'supabase';
}

export function actorVanSessie(sessie: {
  gebruiker: { id: string; naam: string };
  effectieveRechten: GebruikerRechten;
} | undefined): Actor {
  if (!sessie) {
    return { type: 'gebruiker', naam: 'Beheer', rechten: { isSuperAdmin: false, perModule: {} } };
  }
  return {
    type: 'gebruiker',
    id: sessie.gebruiker.id,
    naam: sessie.gebruiker.naam || 'Beheer',
    rechten: sessie.effectieveRechten,
  };
}

function isDossierSessie(waarde: unknown): waarde is DossierSessie {
  return Boolean(waarde && typeof waarde === 'object' && 'from' in waarde && typeof (waarde as { from?: unknown }).from === 'function');
}

const NIET_BESCHIKBAAR = new Set(['mail', 'concept', 'upload']);

function schoon(mutaties: Mutatie[]): Mutatie[] {
  return mutaties.map((mutatie) => {
    const velden = { ...(mutatie.velden ?? {}) };
    for (const sleutel of ['actor_id', 'gemeld_door', 'goedgekeurd_door']) {
      const waarde = velden[sleutel];
      if (typeof waarde === 'string' && waarde && !UUID.test(waarde)) velden[sleutel] = '';
    }
    return { ...mutatie, velden };
  });
}

async function laadWereld(): Promise<Wereld> {
  const client = maakBeheerAdminClient();
  if (!client) throw new Error('Supabase service-role ontbreekt. De 3.0-flow kan niet schrijven.');
  const [relaties, aanvragen, boekingen, publiek, taken, jobs, tokens, betalingen, incidenten, audits] = await Promise.all([
    client.from('relaties').select('id,naam,email,telefoon,adres'),
    client.from('aanvragen').select('id,status,naam,email,telefoon,adres,verhuurtype_sleutel,start_datum,eind_datum,toelichting,website,aantal_personen,relatie_id,boeking_id,beoordeling_deadline,informatievraag'),
    client.from('boekingen').select('id,nummer,status,verhuurtype_sleutel,interne_titel,start_datum,eind_datum,huurder_relatie_id,gastheer_relatie_id,aanvraag_id,huurder_naam_snapshot,huurder_email_snapshot,huurder_telefoon_snapshot,huurder_adres_snapshot,aanbetaling_bedrag,aanbetaling_ontvangen,optie_aangemaakt_op,optie_einddatum'),
    (client.from('publieke_activiteiten') as unknown as {
      select: (kolommen: string) => PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
    }).select('id,boeking_id,titel,slug,omschrijving,korte_omschrijving,volledige_omschrijving,start_datum,eind_datum,publicatie_trigger,zichtbaarheid,gepubliceerd,inhoud_status,contentstatus,levenscyclus,praktische_informatie,inhoud_versie,foto_pad,beoordeling_toelichting,exposanten'),
    client.from('workflow_taken').select('id,boeking_id,aanvraag_id,taak_type,status,eigenaar_type,deadline,dedup_sleutel,toelichting'),
    client.from('communicatie_jobs').select('id,boeking_id,aanvraag_id,relatie_id,template_sleutel,status,modus,gepland_op,dedup_sleutel,ontvanger_email,onderwerp,pogingen,foutmelding'),
    client.from('toegangstokens').select('id,boeking_id,aanvraag_id,doel,token_hash,verloopt_op,ingetrokken_op'),
    client.from('betalingen').select('id,boeking_id,soort,status,bedrag'),
    client.from('incidenten').select('id,boeking_id,status,omschrijving'),
    client.from('auditlog').select('dedup_sleutel,actie,onderwerp_type,onderwerp_id,van,naar,reden'),
  ]);
  const fout = [relaties, aanvragen, boekingen, publiek, taken, jobs, tokens, betalingen, incidenten, audits].find((antwoord) => antwoord.error);
  if (fout?.error) throw new Error(fout.error.message);
  const tekst = (waarde: unknown): string => (waarde == null ? '' : String(waarde));
  const wereld = legeWereld();
  wereld.relaties = (relaties.data ?? []).map((rij) => ({
    id: tekst(rij.id),
    naam: tekst(rij.naam),
    email: tekst(rij.email),
    telefoon: tekst(rij.telefoon),
    adres: tekst(rij.adres),
    rollen: [],
  }));
  wereld.aanvragen = (aanvragen.data ?? []).map((rij) => ({
    id: tekst(rij.id),
    status: rij.status as AanvraagStatus,
    naam: tekst(rij.naam),
    email: tekst(rij.email),
    telefoon: tekst(rij.telefoon),
    adres: tekst(rij.adres),
    verhuurtype: tekst(rij.verhuurtype_sleutel),
    start: tekst(rij.start_datum),
    eind: tekst(rij.eind_datum),
    toelichting: tekst(rij.toelichting),
    website: tekst(rij.website),
    personen: tekst(rij.aantal_personen),
    relatieId: rij.relatie_id == null ? null : tekst(rij.relatie_id),
    boekingId: rij.boeking_id == null ? null : tekst(rij.boeking_id),
    beoordelingDeadline: tekst(rij.beoordeling_deadline) || null,
    informatievraag: tekst(rij.informatievraag) || null,
  }));
  wereld.boekingen = (boekingen.data ?? []).map((rij) => ({
    id: tekst(rij.id),
    nummer: tekst(rij.nummer),
    status: rij.status as BoekingStatus,
    verhuurtype: tekst(rij.verhuurtype_sleutel),
    titel: tekst(rij.interne_titel),
    start: tekst(rij.start_datum),
    eind: tekst(rij.eind_datum),
    relatieId: rij.huurder_relatie_id == null ? null : tekst(rij.huurder_relatie_id),
    gastheerId: rij.gastheer_relatie_id == null ? null : tekst(rij.gastheer_relatie_id),
    aanvraagId: rij.aanvraag_id == null ? null : tekst(rij.aanvraag_id),
    naam: tekst(rij.huurder_naam_snapshot),
    email: tekst(rij.huurder_email_snapshot),
    telefoon: tekst(rij.huurder_telefoon_snapshot),
    adres: tekst(rij.huurder_adres_snapshot),
    aanbetalingBedrag: Number(rij.aanbetaling_bedrag ?? 0),
    aanbetalingOntvangen: Boolean(rij.aanbetaling_ontvangen),
    optieAangemaaktOp: tekst(rij.optie_aangemaakt_op) || null,
    optieEind: tekst(rij.optie_einddatum) || null,
  }));
  wereld.publiek = (publiek.data ?? []).map((rij) => ({
    id: tekst(rij.id),
    boekingId: tekst(rij.boeking_id),
    titel: tekst(rij.titel),
    slug: tekst(rij.slug),
    omschrijving: tekst(rij.omschrijving),
    start: tekst(rij.start_datum),
    eind: tekst(rij.eind_datum),
    trigger: triggerIsBekend(tekst(rij.publicatie_trigger)) ? (rij.publicatie_trigger as PublicatieTrigger) : 'zodra_content_compleet',
    zichtbaarheid:
      rij.zichtbaarheid === 'publiek' || rij.zichtbaarheid === 'bezet' || rij.zichtbaarheid === 'verborgen'
        ? rij.zichtbaarheid
        : null,
    gepubliceerd: Boolean(rij.gepubliceerd),
    inhoudStatus: (rij.inhoud_status ?? 'niet_gestart') as InhoudStatus,
    praktisch: tekst(rij.praktische_informatie),
    versie: Number(rij.inhoud_versie ?? 0),
    foto: Boolean(rij.foto_pad),
    fotoPad: tekst(rij.foto_pad),
    toelichting: tekst(rij.beoordeling_toelichting),
    contentstatus: tekst(rij.contentstatus) || null,
    korteOmschrijving: tekst(rij.korte_omschrijving),
    volledigeOmschrijving: tekst(rij.volledige_omschrijving),
    exposanten: tekst(rij.exposanten),
    geannuleerd: tekst(rij.levenscyclus) === 'geannuleerd',
  }));
  wereld.taken = (taken.data ?? []).map((rij) => ({
    id: tekst(rij.id),
    boekingId: rij.boeking_id == null ? null : tekst(rij.boeking_id),
    aanvraagId: rij.aanvraag_id == null ? null : tekst(rij.aanvraag_id),
    taakType: tekst(rij.taak_type),
    status: rij.status as 'open' | 'bezig' | 'afgerond' | 'geannuleerd' | 'geescaleerd',
    eigenaar: rij.eigenaar_type as 'klant' | 'bestuur' | 'finance' | 'planning' | 'systeem',
    deadline: tekst(rij.deadline) || null,
    dedup: tekst(rij.dedup_sleutel),
    toelichting: tekst(rij.toelichting),
  }));
  wereld.jobs = (jobs.data ?? []).filter((rij) => rij.dedup_sleutel).map((rij) => ({
    id: tekst(rij.id),
    boekingId: rij.boeking_id == null ? null : tekst(rij.boeking_id),
    aanvraagId: rij.aanvraag_id == null ? null : tekst(rij.aanvraag_id),
    relatieId: rij.relatie_id == null ? null : tekst(rij.relatie_id),
    templateSleutel: tekst(rij.template_sleutel),
    status: rij.status,
    modus: (rij.modus ?? 'automatisch') as 'automatisch' | 'concept' | 'handmatig',
    geplandOp: tekst(rij.gepland_op),
    dedup: tekst(rij.dedup_sleutel),
    ontvangerEmail: tekst(rij.ontvanger_email),
    onderwerp: tekst(rij.onderwerp),
    pogingen: Number(rij.pogingen ?? 0),
    foutmelding: tekst(rij.foutmelding) || null,
  }));
  wereld.tokens = (tokens.data ?? []).map((rij) => ({
    id: tekst(rij.id),
    boekingId: rij.boeking_id == null ? null : tekst(rij.boeking_id),
    aanvraagId: rij.aanvraag_id == null ? null : tekst(rij.aanvraag_id),
    doel: rij.doel as 'content' | 'meer_informatie',
    tokenHash: tekst(rij.token_hash),
    verlooptOp: tekst(rij.verloopt_op),
    ingetrokkenOp: tekst(rij.ingetrokken_op) || null,
  }));
  wereld.betalingen = (betalingen.data ?? []).map((rij) => ({
    id: tekst(rij.id),
    boekingId: tekst(rij.boeking_id),
    soort: tekst(rij.soort),
    status: tekst(rij.status),
    bedrag: Number(rij.bedrag ?? 0),
  }));
  wereld.incidenten = (incidenten.data ?? []).map((rij) => ({
    id: tekst(rij.id),
    boekingId: tekst(rij.boeking_id),
    status: rij.status as 'open' | 'opgevolgd' | 'gesloten',
    omschrijving: tekst(rij.omschrijving),
  }));
  wereld.audits = (audits.data ?? []).filter((rij) => rij.dedup_sleutel).map((rij) => ({
    dedup: tekst(rij.dedup_sleutel),
    actie: tekst(rij.actie),
    onderwerpType: tekst(rij.onderwerp_type),
    onderwerpId: tekst(rij.onderwerp_id),
    van: tekst(rij.van),
    naar: tekst(rij.naar),
    reden: tekst(rij.reden),
  }));
  const ids = [
    ...wereld.relaties,
    ...wereld.aanvragen,
    ...wereld.boekingen,
    ...wereld.publiek,
    ...wereld.taken,
    ...wereld.jobs,
    ...wereld.tokens,
    ...wereld.betalingen,
    ...wereld.incidenten,
  ].map((rij) => Number(rij.id) || 0);
  wereld.seq = Math.max(0, ...ids);
  wereld.mailtemplates = await laadMailtemplatesUitSupabase(client);
  return wereld;
}

function mailTransport(env: Record<string, unknown>) {
  const sleutel = String(env.RESEND_API_KEY ?? '');
  return {
    async verstuur(input: { naar: string; onderwerp: string; tekst: string; templateSleutel?: string }) {
      const automatisering = input.templateSleutel ? automatiseringVoorTemplate(input.templateSleutel) : null;
      await eisProviderToegestaan(automatisering ?? 'workflow', undefined, env);
      if (!sleutel) throw new Error('RESEND_API_KEY ontbreekt');
      const { Resend } = await import('resend');
      const resend = new Resend(sleutel);
      const { error } = await resend.emails.send({
        from: VAN,
        to: [input.naar],
        subject: input.onderwerp,
        text: input.tekst,
      });
      if (error) throw new Error(error.message);
    },
  };
}

export async function voerOperationeel(
  opdracht: Opdracht,
  opties: { env?: Record<string, unknown>; actor: Actor; basisUrl: string; nu?: Date },
): Promise<{ ok: boolean; melding: string; links?: { doel: string; url: string }[] }> {
  const env = opties.env ?? process.env;
  const wereld = await laadWereld();
  const uit = await voerOpdrachtUit(wereld, opdracht, {
    nu: opties.nu ?? new Date(),
    env,
    actor: opties.actor,
    basisUrl: opties.basisUrl,
    internEmail: String(env.CONTACT_FALLBACK_EMAIL ?? env.MAIL_STAGING_OVERRIDE ?? ''),
  }, mailTransport(env));
  if (!uit.resultaat.ok || uit.mutaties.length === 0) return uit.resultaat;
  const client = maakBeheerAdminClient(env);
  if (!client) return { ok: false, melding: 'Supabase service-role ontbreekt.' };
  const { error } = await client.rpc('pas_continuiteit_mutaties', { p_mutaties: schoon(uit.mutaties) as unknown as Json });
  if (error) return { ok: false, melding: error.message };
  return uit.resultaat;
}

export async function draaiWorkflow(env: Record<string, unknown> = process.env, basisUrl = 'https://kerkjepersingen.nl'): Promise<{ ok: boolean; melding: string }> {
  if (!operationeelSupabase(env)) return { ok: true, melding: 'Overgeslagen: productie blijft op Sanity.' };
  const { besluitVoor } = await import('../automatisering-register.ts');
  const besluit = await besluitVoor('workflow', undefined, env);
  if (!besluit.provider) return { ok: true, melding: `Workflowmail geblokkeerd: ${besluit.reden}` };
  return voerOperationeel({ soort: 'scheduler' }, {
    env,
    actor: { type: 'systeem', naam: 'planner' },
    basisUrl,
  });
}

function fotoUrl(pad: string, env: Record<string, unknown>): string {
  const direct = directeFotoUrl(pad);
  if (direct) return direct;
  if (!pad) return '';
  const basis = String(env.SUPABASE_URL ?? env.PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  return basis ? `${basis}/storage/v1/object/public/public-media/${pad}` : pad;
}

export function activiteitVanPubliek(rij: PubliekRij, soort: string, env: Record<string, unknown>): Activiteit {
  const foto = fotoUrl(rij.fotoPad, env);
  return {
    _id: `publiek-${rij.id}`,
    slug: rij.slug,
    interneTitel: rij.titel,
    publiekeTitel: rij.titel,
    start: rij.start,
    eind: rij.eind,
    soort,
    zichtbaarheid: rij.zichtbaarheid === 'publiek' ? 'publiek' : 'bezet',
    omschrijving: rij.omschrijving,
    foto: foto || undefined,
    fotoAlt: rij.titel,
    toonVanafMaanden: maandenVanTrigger(rij.trigger),
    contentStatus: contentStatusVanInhoud(rij.inhoudStatus),
    aangeleverdeTekst: rij.omschrijving,
  };
}

export async function publiekeActiviteiten(env: Record<string, unknown> = process.env): Promise<Activiteit[]> {
  const wereld = await laadWereld();
  const vandaag = ymdInAmsterdam(new Date());
  return wereld.publiek
    .filter((rij) => hoortOpPubliekeAgenda({
      ...rij,
      soort: wereld.boekingen.find((boeking) => boeking.id === rij.boekingId)?.verhuurtype ?? 'expositie',
      titel: rij.titel,
      korteOmschrijving: rij.korteOmschrijving,
      volledigeOmschrijving: rij.volledigeOmschrijving,
      hoofdafbeelding: rij.fotoPad,
    }, vandaag))
    .map((rij) => activiteitVanPubliek(rij, wereld.boekingen.find((boeking) => boeking.id === rij.boekingId)?.verhuurtype ?? 'expositie', env))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export async function bezetteActiviteiten(env: Record<string, unknown> = process.env): Promise<Activiteit[]> {
  const wereld = await laadWereld();
  const client = maakBeheerAdminClient(env);
  const intern = client
    ? await client.from('interne_activiteiten').select('id,titel,start_datum,eind_datum,blokkeert_verhuurkalender').eq('blokkeert_verhuurkalender', true)
    : { data: [] };
  const uitBoeking: Activiteit[] = wereld.boekingen
    .filter((boeking) => boeking.status === 'definitief')
    .map((boeking) => ({
      _id: `boeking-${boeking.id}`,
      slug: '',
      interneTitel: 'Bezet',
      start: boeking.start,
      eind: boeking.eind,
      soort: 'blokkade',
      zichtbaarheid: 'bezet' as const,
    }));
  const uitIntern: Activiteit[] = (intern.data ?? []).map((rij) => ({
    _id: `intern-${rij.id}`,
    slug: '',
    interneTitel: String(rij.titel),
    start: String(rij.start_datum),
    eind: String(rij.eind_datum),
    soort: 'blokkade',
    zichtbaarheid: 'bezet' as const,
  }));
  return [...uitBoeking, ...uitIntern];
}

export async function activiteitOpSlug(slug: string, env: Record<string, unknown> = process.env): Promise<Activiteit | null> {
  const lijst = await publiekeActiviteiten(env);
  return lijst.find((item) => item.slug === slug) ?? null;
}

export async function beheerSnapshotUitSupabase(env: Record<string, unknown>): Promise<BeheerSnapshot> {
  const wereld = await laadWereld();
  const vandaag = ymdInAmsterdam(new Date());
  const gastheren = wereld.relaties.map((relatie) => ({
    id: relatie.id,
    naam: relatie.naam,
    email: relatie.email,
    telefoon: relatie.telefoon,
    actief: true,
  }));
  return {
    bron: 'supabase',
    banner: 'Supabase-staging. Dit is de toekomstige dossierstroom. Productie en Sanity worden niet geraakt.',
    reden: 'Operationele bron is Supabase.',
    aanvragen: wereld.aanvragen.map((aanvraag) => ({
      id: aanvraag.id,
      status: aanvraag.status,
      naam: aanvraag.naam,
      email: aanvraag.email,
      telefoon: aanvraag.telefoon,
      adres: aanvraag.adres,
      soort: aanvraag.verhuurtype,
      start: aanvraag.start,
      eind: aanvraag.eind,
      personen: aanvraag.personen,
      toelichting: aanvraag.toelichting,
      binnengekomen: aanvraag.beoordelingDeadline ?? vandaag,
      website: aanvraag.website,
      boekingId: aanvraag.boekingId ?? undefined,
    })),
    boekingen: wereld.boekingen.map((boeking) => ({
      id: boeking.id,
      nummer: boeking.nummer || `KVP-${boeking.id}`,
      status: boeking.status,
      interneTitel: boeking.titel,
      soort: boeking.verhuurtype,
      start: boeking.start,
      eind: boeking.eind,
      huurder: boeking.naam,
      email: boeking.email,
      tarief: '',
      aanbetaling: String(boeking.aanbetalingBedrag),
      aanbetalingBinnen: boeking.aanbetalingOntvangen,
      optieEind: boeking.optieEind ?? undefined,
      publiek: wereld.publiek.some((item) => item.boekingId === boeking.id && item.gepubliceerd),
      notities: '',
      aanvraagId: boeking.aanvraagId ?? undefined,
      relatieId: boeking.relatieId ?? '',
      gastheerId: boeking.gastheerId ?? undefined,
    })),
    agenda: wereld.publiek.map((item) => ({
      id: item.boekingId || item.id,
      boekingId: item.boekingId,
      titel: item.titel,
      slug: item.slug,
      start: item.start,
      eind: item.eind,
      status: item.gepubliceerd ? 'online' as const : item.inhoudStatus === 'goedgekeurd' ? 'wacht_op_definitief' as const : 'mist_content' as const,
      omschrijving: item.omschrijving,
    })),
    intern: [],
    relaties: wereld.relaties.map((relatie) => ({
      id: relatie.id,
      naam: relatie.naam,
      email: relatie.email,
      telefoon: relatie.telefoon,
      rollen: relatie.rollen,
      reservelijst: false,
    })),
    gastheren,
    incidenten: wereld.incidenten.map((incident) => ({
      id: incident.id,
      boekingId: incident.boekingId,
      omschrijving: incident.omschrijving,
      status: incident.status,
    })),
    vrienden: [],
    nieuwsbrieven: [],
    templates: [],
    instellingen: DEMO_INSTELLINGEN,
    communicatie: wereld.jobs.map((job) => ({
      id: job.id,
      boekingId: job.boekingId ?? '',
      template: job.templateSleutel,
      status: job.status,
      wanneer: job.geplandOp,
      ontvanger: job.ontvangerEmail,
    })),
    documenten: [],
    migratie: null,
    signalen: wereld.boekingen
      .filter((boeking) => boeking.status === 'definitief' || boeking.status === 'optie')
      .map((boeking) => {
        const readiness = readinessVanBoeking(wereld, boeking.id, vandaag);
        return {
          boekingId: boeking.id,
          titel: boeking.titel,
          start: boeking.start,
          uitkomst: readiness.uitkomst,
          issues: readiness.issues.map((issue) => ({
            oorzaak: issue.oorzaak,
            eigenaar: issue.eigenaar,
            deadline: issue.deadline,
            actie: issue.actie,
          })),
        };
      }),
    technisch: wereld.jobs.filter((job) => job.status === 'fout').length,
  };
}

function opdrachtUitFormulier(url: URL, data: FormData): Opdracht | null {
  const actie = String(data.get('actie') ?? '');
  const delen = url.pathname.split('/').filter(Boolean);
  const padId = delen.length >= 3 ? decodeURIComponent(delen[2]) : '';
  const boekingId = String(data.get('boekingId') ?? (delen[1] === 'boekingen' ? padId : ''));
  const aanvraagId = delen[1] === 'aanvragen' ? padId : String(data.get('aanvraagId') ?? '');
  const reden = String(data.get('reden') ?? data.get('toelichting') ?? '');
  if ((actie === 'optie' || actie === 'akkoord') && aanvraagId) return { soort: 'beoordeel', aanvraagId, besluit: 'goedkeuren' };
  if (actie === 'weiger' && aanvraagId) return { soort: 'beoordeel', aanvraagId, besluit: 'afwijzen', reden };
  if (actie === 'meer' && aanvraagId) return { soort: 'beoordeel', aanvraagId, besluit: 'meer_informatie', vraag: String(data.get('vraag') ?? '') };
  if (actie === 'behandeling' && aanvraagId) return { soort: 'beoordeel', aanvraagId, besluit: 'in_behandeling' };
  if ((actie === 'check' || actie === 'betaling') && boekingId) return { soort: 'betaling', boekingId };
  if ((actie === 'gastheer' || actie === 'bewaar') && boekingId && data.has('gastheerId')) {
    return { soort: 'gastheer', boekingId, gastheerId: String(data.get('gastheerId') ?? '') };
  }
  if (actie === 'definitief' && boekingId) return { soort: 'handmatig_definitief', boekingId, reden };
  if (actie === 'annuleer' && boekingId) return { soort: 'annuleer', boekingId, reden };
  if (actie === 'verleng' && boekingId) return { soort: 'verleng', boekingId };
  if (actie === 'publiceren' && (boekingId || padId)) return { soort: 'content_beoordelen', boekingId: boekingId || padId, besluit: 'goedkeuren' };
  if (actie === 'content' && (boekingId || padId)) {
    return { soort: 'content_beoordelen', boekingId: boekingId || padId, besluit: 'wijziging', toelichting: String(data.get('vraag') ?? reden) };
  }
  if (actie === 'incident' && boekingId) return { soort: 'incident', boekingId, omschrijving: String(data.get('omschrijving') ?? '') };
  if (actie === 'incident_sluiten' && data.get('incidentId')) return { soort: 'incident_sluiten', incidentId: String(data.get('incidentId')) };
  if (actie === 'sluit' && boekingId) return { soort: 'sluit', boekingId, reden };
  return null;
}

export async function postAlsSupabase(input: {
  request: Request;
  url: URL;
  env: Record<string, unknown>;
  actor: Actor;
  sessie?: unknown;
}): Promise<Response | null> {
  if (!operationeelSupabase(input.env)) return null;
  const doel = new URL(input.url.pathname, input.url.origin);
  try {
    const data = await input.request.formData();
    const actie = String(data.get('actie') ?? '');
    if (NIET_BESCHIKBAAR.has(actie)) {
      doel.searchParams.set('fout', 'Nog niet beschikbaar. Er is niets opgeslagen en er is geen mail verstuurd.');
      return Response.redirect(doel, 303);
    }
    const opdracht = opdrachtUitFormulier(input.url, data);
    if (!opdracht || opdracht.soort === 'scheduler') {
      doel.searchParams.set('fout', 'Deze actie is niet beschikbaar. Er is niets gewijzigd.');
      return Response.redirect(doel, 303);
    }
    if (!isDossierSessie(input.sessie)) {
      doel.searchParams.set('fout', 'Geen ingelogde sessie. Er is niets gewijzigd. De service-role is niet gebruikt.');
      return Response.redirect(doel, 303);
    }
    const uit = await voerDossierViaSessie(input.sessie, opdracht, input.actor);
    doel.searchParams.set(uit.ok ? 'melding' : 'fout', uit.melding);
  } catch (error) {
    const tekst = error instanceof Error ? error.message : 'Opslaan mislukt.';
    doel.searchParams.set('fout', leesbareAuthFout(tekst));
  }
  return Response.redirect(doel, 303);
}
