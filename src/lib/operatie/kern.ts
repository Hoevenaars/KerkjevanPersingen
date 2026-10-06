/**
 * Operationele dossierdienst.
 * Plannen is puur; `pasToe` bootst de database-mutaties na voor tests.
 * Supabase voert dezelfde mutaties atomisch uit.
 */

import { createHash } from 'node:crypto';
import { magStatusZetten } from '../../platform/aanvraag.ts';
import { MAX_VERZENDPOGINGEN, mailFoutNaPoging } from '../../platform/continuiteit.ts';
import {
  actueleVerzendingen,
  berekenReadiness,
  contentVereist,
  geplandeJobsTeAnnuleren,
  magAutomatischSluiten,
  publicatieTriggerVoor,
  type CommunicatieContext,
  type CommunicatieStap,
  type Eigenaar,
  type InhoudStatus,
  type Readiness,
} from '../../platform/continuiteit.ts';
import { ymdInAmsterdam, voegDagenToe, periodesOverlappen } from '../../platform/datum.ts';
import { statusActieToegestaan, statusTeltVoorOverlap } from '../../platform/status-overgang.ts';
import { kiesTarief, naAanbetalingOntvangen, tariefSnapshot, INITIELE_TARIEVEN, STANDAARD_AANBETALING_EURO } from '../../platform/finance.ts';
import { MailGeblokkeerd } from '../../platform/automatisering.ts';
import { bewaakUitgaandeMail } from '../../platform/mailguard.ts';
import { hashToegangstoken, nieuwToegangstoken, tokenIsVerlopen } from '../../platform/magictoken.ts';
import { standaardTemplate } from '../../platform/mailtemplates/catalog.ts';
import { onderwerpUitTemplate, plainTekstUitTemplate } from '../../platform/mailtemplates/render.ts';
import { optieSnapshot, STANDAARD_OPTIETERMIJN_DAGEN } from '../../platform/optie.ts';
import { beoordeelPublicatie } from '../../platform/publicatie.ts';
import type { AanvraagStatus, BoekingStatus, GebruikerRechten, PublicatieTrigger } from '../../platform/types.ts';

export interface Actor {
  type: 'gebruiker' | 'systeem' | 'klant';
  id?: string;
  naam: string;
  rechten?: GebruikerRechten;
}

export interface RelatieRij {
  id: string;
  naam: string;
  email: string;
  telefoon: string;
  adres: string;
  rollen: string[];
}

export interface AanvraagRij {
  id: string;
  status: AanvraagStatus;
  naam: string;
  email: string;
  telefoon: string;
  adres: string;
  verhuurtype: string;
  start: string;
  eind: string;
  toelichting: string;
  website: string;
  personen: string;
  relatieId: string | null;
  boekingId: string | null;
  beoordelingDeadline: string | null;
  informatievraag: string | null;
}

export interface BoekingRij {
  id: string;
  nummer: string;
  status: BoekingStatus;
  verhuurtype: string;
  titel: string;
  start: string;
  eind: string;
  relatieId: string | null;
  gastheerId: string | null;
  aanvraagId: string | null;
  naam: string;
  email: string;
  telefoon: string;
  adres: string;
  aanbetalingBedrag: number;
  aanbetalingOntvangen: boolean;
  optieAangemaaktOp: string | null;
  optieEind: string | null;
}

export interface PubliekRij {
  id: string;
  boekingId: string;
  titel: string;
  slug: string;
  omschrijving: string;
  start: string;
  eind: string;
  trigger: PublicatieTrigger;
  zichtbaarheid?: 'publiek' | 'bezet' | 'verborgen' | null;
  gepubliceerd: boolean;
  inhoudStatus: InhoudStatus;
  praktisch: string;
  versie: number;
  foto: boolean;
  fotoPad: string;
  toelichting: string;
  contentstatus?: string | null;
  korteOmschrijving?: string;
  volledigeOmschrijving?: string;
  exposanten?: string;
  geannuleerd?: boolean;
}

export interface TaakRij {
  id: string;
  boekingId: string | null;
  aanvraagId: string | null;
  taakType: string;
  status: 'open' | 'bezig' | 'afgerond' | 'geannuleerd' | 'geescaleerd';
  eigenaar: Eigenaar;
  deadline: string | null;
  dedup: string;
  toelichting: string;
}

export interface JobRij {
  id: string;
  boekingId: string | null;
  aanvraagId: string | null;
  relatieId: string | null;
  templateSleutel: string;
  status: 'gepland' | 'concept' | 'wachtrij' | 'verzonden' | 'fout' | 'geannuleerd' | 'geblokkeerd';
  modus: 'automatisch' | 'concept' | 'handmatig';
  geplandOp: string;
  dedup: string;
  ontvangerEmail: string;
  onderwerp: string;
  pogingen: number;
  foutmelding: string | null;
}

export interface TokenRij {
  id: string;
  boekingId: string | null;
  aanvraagId: string | null;
  doel: 'content' | 'meer_informatie';
  tokenHash: string;
  verlooptOp: string;
  ingetrokkenOp: string | null;
}

export interface BetalingRij {
  id: string;
  boekingId: string;
  soort: string;
  status: string;
  bedrag: number;
}

export interface IncidentRij {
  id: string;
  boekingId: string;
  status: 'open' | 'opgevolgd' | 'gesloten';
  omschrijving: string;
}

export interface AuditRij {
  dedup: string;
  actie: string;
  onderwerpType: string;
  onderwerpId: string;
  van: string;
  naar: string;
  reden: string;
}

export interface Wereld {
  relaties: RelatieRij[];
  aanvragen: AanvraagRij[];
  boekingen: BoekingRij[];
  publiek: PubliekRij[];
  taken: TaakRij[];
  jobs: JobRij[];
  tokens: TokenRij[];
  betalingen: BetalingRij[];
  incidenten: IncidentRij[];
  audits: AuditRij[];
  seq: number;
  /** Gezet door de Supabase-runtime. Ontbreekt die lijst, dan geldt de code-catalogus alleen voor unit-tests. */
  mailtemplates?: import('../../platform/mailtemplates/types.ts').MailTemplateDef[];
}

export interface Mutatie {
  soort: string;
  ref?: string;
  id?: string;
  relatie_ref?: string;
  aanvraag_ref?: string;
  boeking_ref?: string;
  job_ref?: string;
  velden?: Record<string, string | number | boolean | null>;
}

export interface VerzendOpdracht {
  dedup: string;
  naar: string;
  onderwerp: string;
  tekst: string;
  pogingen: number;
  jobRef: string;
}

export interface Plan {
  ok: boolean;
  mutaties: Mutatie[];
  teVersturen: VerzendOpdracht[];
  resultaat: Resultaat;
}

export interface Resultaat {
  ok: boolean;
  melding: string;
  aanvraagId?: string;
  boekingId?: string;
  links?: { doel: string; url: string }[];
  alVerwerkt?: boolean;
}

export interface MailTransport {
  verstuur(input: { naar: string; onderwerp: string; tekst: string; templateSleutel?: string }): Promise<void>;
}

export interface DienstContext {
  nu: Date;
  env: Record<string, unknown>;
  actor: Actor;
  basisUrl: string;
  internEmail: string;
}

export function legeWereld(): Wereld {
  return {
    relaties: [],
    aanvragen: [],
    boekingen: [],
    publiek: [],
    taken: [],
    jobs: [],
    tokens: [],
    betalingen: [],
    incidenten: [],
    audits: [],
    seq: 0,
  };
}

function kloon<T>(waarde: T): T {
  return structuredClone(waarde);
}

export function pasToe(wereld: Wereld, mutaties: readonly Mutatie[]): Wereld {
  const volgende = kloon(wereld);
  const refs = new Map<string, string>();
  const idVoor = (mutatie: Mutatie, sleutel: 'id' | 'relatie_ref' | 'aanvraag_ref' | 'boeking_ref' | 'job_ref'): string | null => {
    if (sleutel === 'id' && mutatie.id) return mutatie.id;
    const ref = mutatie[sleutel];
    if (typeof ref === 'string' && refs.has(ref)) return refs.get(ref) ?? null;
    return null;
  };

  for (const mutatie of mutaties) {
    const velden = mutatie.velden ?? {};
    const tekst = (sleutel: string, anders = ''): string => {
      const waarde = velden[sleutel];
      return waarde == null ? anders : String(waarde);
    };
    if (mutatie.soort === 'insert_relatie') {
      const id = String(++volgende.seq);
      if (mutatie.ref) refs.set(mutatie.ref, id);
      volgende.relaties.push({
        id,
        naam: tekst('naam'),
        email: tekst('email'),
        telefoon: tekst('telefoon'),
        adres: tekst('adres'),
        rollen: ['huurder'],
      });
    } else if (mutatie.soort === 'insert_aanvraag') {
      const id = String(++volgende.seq);
      if (mutatie.ref) refs.set(mutatie.ref, id);
      const relatieId = tekst('relatie_id') || (mutatie.relatie_ref ? refs.get(mutatie.relatie_ref) ?? '' : '');
      volgende.aanvragen.push({
        id,
        status: (tekst('status', 'nieuw') as AanvraagStatus),
        naam: tekst('naam'),
        email: tekst('email'),
        telefoon: tekst('telefoon'),
        adres: tekst('adres'),
        verhuurtype: tekst('verhuurtype_sleutel'),
        start: tekst('start_datum'),
        eind: tekst('eind_datum'),
        toelichting: tekst('toelichting'),
        website: tekst('website'),
        personen: tekst('aantal_personen'),
        relatieId: relatieId || null,
        boekingId: null,
        beoordelingDeadline: tekst('beoordeling_deadline') || null,
        informatievraag: tekst('informatievraag') || null,
      });
    } else if (mutatie.soort === 'update_aanvraag') {
      const id = idVoor(mutatie, 'id') ?? (mutatie.ref ? refs.get(mutatie.ref) : undefined);
      const rij = volgende.aanvragen.find((item) => item.id === id);
      if (!rij) continue;
      if ('status' in velden) rij.status = tekst('status') as AanvraagStatus;
      if ('afwijsreden' in velden) rij.toelichting = rij.toelichting;
      if ('informatievraag' in velden) rij.informatievraag = tekst('informatievraag') || null;
      if ('toelichting' in velden) rij.toelichting = tekst('toelichting');
      if ('boeking_id' in velden) rij.boekingId = tekst('boeking_id') || null;
      if (mutatie.boeking_ref && refs.has(mutatie.boeking_ref)) rij.boekingId = refs.get(mutatie.boeking_ref) ?? null;
    } else if (mutatie.soort === 'insert_boeking') {
      const id = String(++volgende.seq);
      if (mutatie.ref) refs.set(mutatie.ref, id);
      const relatieId = tekst('huurder_relatie_id') || (mutatie.relatie_ref ? refs.get(mutatie.relatie_ref) ?? '' : '');
      const aanvraagId = tekst('aanvraag_id') || (mutatie.aanvraag_ref ? refs.get(mutatie.aanvraag_ref) ?? '' : '');
      volgende.boekingen.push({
        id,
        nummer: tekst('nummer', `KVP-${id}`),
        status: tekst('status', 'optie') as BoekingStatus,
        verhuurtype: tekst('verhuurtype_sleutel'),
        titel: tekst('interne_titel'),
        start: tekst('start_datum'),
        eind: tekst('eind_datum'),
        relatieId: relatieId || null,
        gastheerId: tekst('gastheer_relatie_id') || null,
        aanvraagId: aanvraagId || null,
        naam: tekst('huurder_naam_snapshot'),
        email: tekst('huurder_email_snapshot'),
        telefoon: tekst('huurder_telefoon_snapshot'),
        adres: tekst('huurder_adres_snapshot'),
        aanbetalingBedrag: Number(velden.aanbetaling_bedrag ?? STANDAARD_AANBETALING_EURO),
        aanbetalingOntvangen: velden.aanbetaling_ontvangen === true || velden.aanbetaling_ontvangen === 'true',
        optieAangemaaktOp: tekst('optie_aangemaakt_op') || null,
        optieEind: tekst('optie_einddatum') || null,
      });
    } else if (mutatie.soort === 'update_boeking') {
      const id = mutatie.id ?? (mutatie.ref ? refs.get(mutatie.ref) : undefined);
      const rij = volgende.boekingen.find((item) => item.id === id);
      if (!rij) continue;
      if ('status' in velden) {
        rij.status = tekst('status') as BoekingStatus;
        if (rij.status === 'geannuleerd') {
          for (const item of volgende.publiek) {
            if (item.boekingId === rij.id) item.geannuleerd = true;
          }
        }
      }
      if ('gastheer_relatie_id' in velden) rij.gastheerId = tekst('gastheer_relatie_id') || null;
      if ('aanbetaling_ontvangen' in velden) {
        rij.aanbetalingOntvangen = velden.aanbetaling_ontvangen === true || velden.aanbetaling_ontvangen === 'true';
      }
      if ('optie_einddatum' in velden) rij.optieEind = tekst('optie_einddatum') || null;
    } else if (mutatie.soort === 'upsert_publiek') {
      const boekingId = tekst('boeking_id') || (mutatie.boeking_ref ? refs.get(mutatie.boeking_ref) ?? '' : '');
      const bestaand = volgende.publiek.find((item) => item.boekingId === boekingId);
      const rij: PubliekRij = {
        id: bestaand?.id ?? String(++volgende.seq),
        boekingId,
        titel: tekst('titel', bestaand?.titel ?? ''),
        slug: tekst('slug', bestaand?.slug ?? ''),
        omschrijving: tekst('omschrijving', bestaand?.omschrijving ?? ''),
        start: tekst('start_datum', bestaand?.start ?? ''),
        eind: tekst('eind_datum', bestaand?.eind ?? ''),
        trigger: (tekst('publicatie_trigger', bestaand?.trigger ?? 'zodra_content_compleet') as PublicatieTrigger),
        gepubliceerd: 'gepubliceerd' in velden ? velden.gepubliceerd === true || velden.gepubliceerd === 'true' : (bestaand?.gepubliceerd ?? false),
        inhoudStatus: (tekst('inhoud_status', bestaand?.inhoudStatus ?? 'niet_gestart') as InhoudStatus),
        praktisch: tekst('praktische_informatie', bestaand?.praktisch ?? ''),
        versie: 'inhoud_versie' in velden ? Number(velden.inhoud_versie) : (bestaand?.versie ?? 0),
        foto: 'foto_pad' in velden ? Boolean(tekst('foto_pad')) : (bestaand?.foto ?? false),
        fotoPad: 'foto_pad' in velden ? tekst('foto_pad') : (bestaand?.fotoPad ?? ''),
        toelichting: tekst('beoordeling_toelichting', bestaand?.toelichting ?? ''),
      };
      if (bestaand) Object.assign(bestaand, rij);
      else volgende.publiek.push(rij);
    } else if (mutatie.soort === 'upsert_taak') {
      const dedup = tekst('dedup_sleutel');
      const bestaand = volgende.taken.find((item) => item.dedup === dedup);
      const rij: TaakRij = {
        id: bestaand?.id ?? String(++volgende.seq),
        boekingId: tekst('boeking_id') || (mutatie.boeking_ref ? refs.get(mutatie.boeking_ref) ?? null : bestaand?.boekingId ?? null),
        aanvraagId: tekst('aanvraag_id') || (mutatie.aanvraag_ref ? refs.get(mutatie.aanvraag_ref) ?? null : bestaand?.aanvraagId ?? null),
        taakType: tekst('taak_type'),
        status: tekst('status', 'open') as TaakRij['status'],
        eigenaar: tekst('eigenaar_type') as Eigenaar,
        deadline: tekst('deadline') || null,
        dedup,
        toelichting: tekst('toelichting'),
      };
      if (bestaand && bestaand.status !== 'afgerond') Object.assign(bestaand, rij);
      else if (!bestaand) volgende.taken.push(rij);
    } else if (mutatie.soort === 'upsert_job') {
      const dedup = tekst('dedup_sleutel');
      const bestaand = volgende.jobs.find((item) => item.dedup === dedup);
      if (bestaand?.status === 'verzonden') {
        if (mutatie.ref) refs.set(mutatie.ref, bestaand.id);
        continue;
      }
      const id = bestaand?.id ?? String(++volgende.seq);
      if (mutatie.ref) refs.set(mutatie.ref, id);
      const rij: JobRij = {
        id,
        boekingId: tekst('boeking_id') || (mutatie.boeking_ref ? refs.get(mutatie.boeking_ref) ?? null : bestaand?.boekingId ?? null),
        aanvraagId: tekst('aanvraag_id') || (mutatie.aanvraag_ref ? refs.get(mutatie.aanvraag_ref) ?? null : bestaand?.aanvraagId ?? null),
        relatieId: tekst('relatie_id') || bestaand?.relatieId || null,
        templateSleutel: tekst('template_sleutel'),
        status: tekst('status', 'gepland') as JobRij['status'],
        modus: tekst('modus', 'automatisch') as JobRij['modus'],
        geplandOp: tekst('gepland_op'),
        dedup,
        ontvangerEmail: tekst('ontvanger_email'),
        onderwerp: tekst('onderwerp'),
        pogingen: Number(velden.pogingen ?? bestaand?.pogingen ?? 0),
        foutmelding: tekst('foutmelding') || null,
      };
      if (bestaand) Object.assign(bestaand, rij);
      else volgende.jobs.push(rij);
    } else if (mutatie.soort === 'insert_audit') {
      const dedup = tekst('dedup_sleutel');
      if (dedup && volgende.audits.some((item) => item.dedup === dedup)) continue;
      volgende.audits.push({
        dedup,
        actie: tekst('actie'),
        onderwerpType: tekst('onderwerp_type'),
        onderwerpId: tekst('onderwerp_id'),
        van: tekst('van'),
        naar: tekst('naar'),
        reden: tekst('reden'),
      });
    } else if (mutatie.soort === 'insert_token') {
      const hash = tekst('token_hash');
      if (volgende.tokens.some((item) => item.tokenHash === hash)) continue;
      volgende.tokens.push({
        id: String(++volgende.seq),
        boekingId: tekst('boeking_id') || (mutatie.boeking_ref ? refs.get(mutatie.boeking_ref) ?? null : null),
        aanvraagId: tekst('aanvraag_id') || (mutatie.aanvraag_ref ? refs.get(mutatie.aanvraag_ref) ?? null : null),
        doel: tekst('doel') as TokenRij['doel'],
        tokenHash: hash,
        verlooptOp: tekst('verloopt_op'),
        ingetrokkenOp: null,
      });
    } else if (mutatie.soort === 'update_token') {
      const rij = volgende.tokens.find((item) => item.id === mutatie.id);
      if (!rij) continue;
      if ('ingetrokken_op' in velden) rij.ingetrokkenOp = tekst('ingetrokken_op') || null;
    } else if (mutatie.soort === 'upsert_betaling') {
      const boekingId = tekst('boeking_id') || (mutatie.boeking_ref ? refs.get(mutatie.boeking_ref) ?? '' : '');
      const soort = tekst('soort');
      if (soort === 'aanbetaling' && volgende.betalingen.some((item) => item.boekingId === boekingId && item.soort === 'aanbetaling')) {
        continue;
      }
      volgende.betalingen.push({
        id: String(++volgende.seq),
        boekingId,
        soort,
        status: tekst('status'),
        bedrag: Number(velden.bedrag ?? 0),
      });
    } else if (mutatie.soort === 'insert_incident') {
      volgende.incidenten.push({
        id: String(++volgende.seq),
        boekingId: tekst('boeking_id') || (mutatie.boeking_ref ? refs.get(mutatie.boeking_ref) ?? '' : ''),
        status: 'open',
        omschrijving: tekst('omschrijving'),
      });
    } else if (mutatie.soort === 'update_incident') {
      const rij = volgende.incidenten.find((item) => item.id === mutatie.id);
      if (!rij) continue;
      if ('status' in velden) rij.status = tekst('status') as IncidentRij['status'];
    }
  }
  return volgende;
}

function actorMag(actor: Actor, module: 'aanvragen' | 'boekingen' | 'finance' | 'agenda' | 'planning'): boolean {
  if (actor.type !== 'gebruiker' || !actor.rechten) return false;
  if (actor.rechten.isSuperAdmin) return true;
  return actor.rechten.perModule[module] === 'schrijven';
}

function mislukt(melding: string): Plan {
  return { ok: false, mutaties: [], teVersturen: [], resultaat: { ok: false, melding } };
}

function gelukt(melding: string, extra: Partial<Resultaat> = {}, mutaties: Mutatie[] = [], teVersturen: VerzendOpdracht[] = []): Plan {
  return { ok: true, mutaties, teVersturen, resultaat: { ok: true, melding, ...extra } };
}

function audit(input: {
  dedup: string;
  actie: string;
  type: string;
  id: string;
  van?: string;
  naar?: string;
  reden?: string;
  actor: Actor;
}): Mutatie {
  return {
    soort: 'insert_audit',
    velden: {
      dedup_sleutel: input.dedup,
      actie: input.actie,
      onderwerp_type: input.type,
      onderwerp_id: input.id,
      van: input.van ?? '',
      naar: input.naar ?? '',
      reden: input.reden ?? '',
      actor_naam: input.actor.naam,
      actor_type: input.actor.type,
      actor_id: input.actor.id ?? '',
    },
  };
}

function slugVan(titel: string, id: string): string {
  const basis = titel
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${basis || 'activiteit'}-${id}`.slice(0, 80);
}

function periodeVrij(wereld: Wereld, start: string, eind: string, behalveId?: string): boolean {
  return !wereld.boekingen.some(
    (boeking) =>
      boeking.id !== behalveId &&
      statusTeltVoorOverlap(boeking.status) &&
      periodesOverlappen({ start: boeking.start, eind: boeking.eind }, { start, eind }),
  );
}

function contextVan(wereld: Wereld, boeking: BoekingRij, vandaag: string): CommunicatieContext {
  const publiek = wereld.publiek.find((item) => item.boekingId === boeking.id);
  const trigger = publiek?.trigger ?? publicatieTriggerVoor(boeking.verhuurtype);
  return {
    status: boeking.status,
    start: boeking.start,
    verhuurtype: boeking.verhuurtype,
    publicatieTrigger: trigger,
    inhoudStatus: publiek?.inhoudStatus ?? (contentVereist(trigger) ? 'niet_gestart' : 'niet_vereist'),
    aanbetalingOntvangen: boeking.aanbetalingOntvangen,
    aanbetalingVerplicht: true,
    optieAangemaaktOp: boeking.optieAangemaaktOp,
    betaaldeadline: boeking.optieEind,
    gastheerAanwezig: Boolean(boeking.gastheerId),
    verzonden: new Set(
      wereld.jobs
        .filter((job) => job.boekingId === boeking.id && job.status === 'verzonden')
        .map((job) => job.templateSleutel),
    ),
    vandaag,
  };
}

function templateVoor(wereld: Wereld, id: string): import('../../platform/mailtemplates/types.ts').MailTemplateDef | undefined {
  if (wereld.mailtemplates) return wereld.mailtemplates.find((item) => item.id === id);
  return standaardTemplate(id);
}

function mailTekst(wereld: Wereld, stapItem: CommunicatieStap, boeking: BoekingRij, link?: string): { onderwerp: string; tekst: string } {
  const template = templateVoor(wereld, stapItem.templateId);
  const vars = {
    voornaam: boeking.naam.split(' ')[0] || boeking.naam,
    naam: boeking.naam,
    activiteitstype: boeking.verhuurtype,
    activiteitnaam: boeking.titel,
    datum: boeking.start,
    bedrag: String(boeking.aanbetalingBedrag),
  };
  const onderwerp = template ? onderwerpUitTemplate(template, vars) : stapItem.templateId;
  const tekst = `${template ? plainTekstUitTemplate(template, vars) : stapItem.conditie}${link ? `\n\n${link}` : ''}`;
  return { onderwerp, tekst };
}

function ontvangerVoor(stapItem: CommunicatieStap, wereld: Wereld, boeking: BoekingRij, internEmail: string): string {
  if (stapItem.ontvangerRol === 'huurder') return boeking.email;
  if (stapItem.ontvangerRol === 'gastheer') {
    return wereld.relaties.find((relatie) => relatie.id === boeking.gastheerId)?.email ?? '';
  }
  return internEmail;
}

function communicatieMutaties(
  wereld: Wereld,
  ctx: DienstContext,
  alleenBoekingId?: string,
): { mutaties: Mutatie[]; teVersturen: VerzendOpdracht[]; links: { doel: string; url: string }[] } {
  const mutaties: Mutatie[] = [];
  const teVersturen: VerzendOpdracht[] = [];
  const links: { doel: string; url: string }[] = [];
  const vandaag = ymdInAmsterdam(ctx.nu);
  const boekingen = wereld.boekingen.filter((boeking) => !alleenBoekingId || boeking.id === alleenBoekingId);

  for (const boeking of boekingen) {
    const comm = contextVan(wereld, boeking, vandaag);
    const openTemplates = wereld.jobs
      .filter(
        (job) =>
          job.boekingId === boeking.id &&
          (job.status === 'gepland' || job.status === 'wachtrij' || job.status === 'concept' || job.status === 'geblokkeerd'),
      )
      .map((job) => job.templateSleutel);
    for (const templateId of geplandeJobsTeAnnuleren(comm, openTemplates)) {
      const job = wereld.jobs.find((item) => item.boekingId === boeking.id && item.templateSleutel === templateId);
      if (!job || job.modus === 'concept') continue;
      mutaties.push(jobMutatie(boeking, job, { status: 'geannuleerd' }));
    }

    for (const stapItem of actueleVerzendingen(comm)) {
      const dedup = `job:${boeking.id}:${stapItem.templateId}`;
      const bestaand = wereld.jobs.find((job) => job.dedup === dedup);
      if (bestaand && (bestaand.status === 'verzonden' || bestaand.status === 'fout' || bestaand.status === 'geannuleerd')) {
        continue;
      }
      let link: string | undefined;
      if (stapItem.templateId === 'booking_content_request' || stapItem.templateId === 'booking_content_reminder') {
        const token = nieuwToegangstoken();
        const verloopt = new Date(ctx.nu.getTime() + 21 * 86_400_000).toISOString();
        mutaties.push({
          soort: 'insert_token',
          boeking_ref: undefined,
          velden: {
            boeking_id: boeking.id,
            doel: 'content',
            token_hash: token.hash,
            verloopt_op: verloopt,
          },
        });
        link = `${ctx.basisUrl}/klant/aanleveren/?token=${token.plain}`;
        links.push({ doel: 'content', url: link });
      }
      const bericht = mailTekst(wereld, stapItem, boeking, link);
      const naar = ontvangerVoor(stapItem, wereld, boeking, ctx.internEmail);
      const status = stapItem.modus === 'automatisch' ? 'gepland' : 'concept';
      mutaties.push({
        soort: 'upsert_job',
        ref: `job:${dedup}`,
        velden: {
          boeking_id: boeking.id,
          relatie_id: boeking.relatieId ?? '',
          template_sleutel: stapItem.templateId,
          dedup_sleutel: dedup,
          status,
          modus: stapItem.modus,
          gepland_op: `${ctx.nu.toISOString()}`,
          ontvanger_email: naar,
          onderwerp: bericht.onderwerp,
          pogingen: bestaand?.pogingen ?? 0,
          foutmelding: '',
        },
      });
      mutaties.push({
        soort: 'upsert_taak',
        velden: {
          boeking_id: boeking.id,
          taak_type: stapItem.taakType,
          status: stapItem.keten === 'gastheer' || stapItem.templateId.startsWith('internal_') ? 'geescaleerd' : 'open',
          eigenaar_type: stapItem.eigenaar,
          deadline: stapItem.geplandOp < vandaag ? vandaag : stapItem.geplandOp,
          dedup_sleutel: `taak:${boeking.id}:${stapItem.taakType}`,
          toelichting: stapItem.conditie,
        },
      });
      if (stapItem.modus === 'automatisch' && naar) {
        teVersturen.push({
          dedup,
          naar,
          onderwerp: bericht.onderwerp,
          tekst: bericht.tekst,
          pogingen: bestaand?.pogingen ?? 0,
          jobRef: `job:${dedup}`,
        });
      }
    }
  }
  return { mutaties, teVersturen, links };
}

function jobMutatie(boeking: BoekingRij, job: JobRij, patch: { status: JobRij['status']; pogingen?: number; fout?: string }): Mutatie {
  return {
    soort: 'upsert_job',
    ref: `job:${job.dedup}`,
    velden: {
      boeking_id: boeking.id,
      relatie_id: job.relatieId ?? '',
      template_sleutel: job.templateSleutel,
      dedup_sleutel: job.dedup,
      status: patch.status,
      modus: job.modus,
      gepland_op: job.geplandOp,
      ontvanger_email: job.ontvangerEmail,
      onderwerp: job.onderwerp,
      pogingen: patch.pogingen ?? job.pogingen,
      foutmelding: patch.fout ?? '',
    },
  };
}

function afrondenTaak(wereld: Wereld, boekingId: string, taakType: string, nuIso: string): Mutatie | null {
  const taak = wereld.taken.find((item) => item.boekingId === boekingId && item.taakType === taakType && item.status !== 'afgerond');
  if (!taak) return null;
  return {
    soort: 'upsert_taak',
    velden: {
      boeking_id: boekingId,
      taak_type: taak.taakType,
      status: 'afgerond',
      eigenaar_type: taak.eigenaar,
      deadline: taak.deadline ?? '',
      dedup_sleutel: taak.dedup,
      toelichting: taak.toelichting,
      afgerond_op: nuIso,
    },
  };
}

export type Opdracht =
  | {
      soort: 'dien_aanvraag';
      naam: string;
      email: string;
      telefoon?: string;
      adres?: string;
      verhuurtype: string;
      start: string;
      eind: string;
      toelichting?: string;
      website?: string;
      personen?: string;
    }
  | { soort: 'beoordeel'; aanvraagId: string; besluit: 'in_behandeling' | 'goedkeuren' | 'afwijzen' | 'meer_informatie'; reden?: string; vraag?: string }
  | { soort: 'aanvulling'; token: string; toelichting: string }
  | { soort: 'betaling'; boekingId: string }
  | { soort: 'content_indienen'; token: string; titel: string; omschrijving: string; praktisch?: string; foto?: boolean }
  | { soort: 'content_beoordelen'; boekingId: string; besluit: 'goedkeuren' | 'wijziging'; toelichting?: string }
  | { soort: 'gastheer'; boekingId: string; gastheerId: string }
  | { soort: 'incident'; boekingId: string; omschrijving: string }
  | { soort: 'incident_sluiten'; incidentId: string }
  | { soort: 'sluit'; boekingId: string; reden?: string }
  | { soort: 'handmatig_definitief'; boekingId: string; reden: string }
  | { soort: 'annuleer'; boekingId: string; reden?: string }
  | { soort: 'verleng'; boekingId: string }
  | { soort: 'scheduler' };

function tokenBij(wereld: Wereld, plain: string, ctx: DienstContext): TokenRij | undefined {
  const hash = hashToegangstoken(plain);
  return wereld.tokens.find((token) => token.tokenHash === hash && !token.ingetrokkenOp && !tokenIsVerlopen(token.verlooptOp, ctx.nu));
}

export function bouwPlan(wereld: Wereld, opdracht: Opdracht, ctx: DienstContext): Plan {
  const vandaag = ymdInAmsterdam(ctx.nu);
  const nuIso = ctx.nu.toISOString();

  if (opdracht.soort === 'dien_aanvraag') {
    const bestaand = wereld.aanvragen.find(
      (item) => item.email.toLowerCase() === opdracht.email.toLowerCase() && item.start === opdracht.start && item.status !== 'afgewezen',
    );
    if (bestaand) return gelukt('Deze aanvraag staat al geregistreerd.', { aanvraagId: bestaand.id, alVerwerkt: true });
    const deadline = voegDagenToe(vandaag, 7);
    const mutaties: Mutatie[] = [
      {
        soort: 'insert_relatie',
        ref: 'rel',
        velden: {
          naam: opdracht.naam,
          email: opdracht.email,
          telefoon: opdracht.telefoon ?? '',
          adres: opdracht.adres ?? '',
        },
      },
      {
        soort: 'insert_aanvraag',
        ref: 'aan',
        relatie_ref: 'rel',
        velden: {
          status: 'nieuw',
          naam: opdracht.naam,
          email: opdracht.email,
          telefoon: opdracht.telefoon ?? '',
          adres: opdracht.adres ?? '',
          verhuurtype_sleutel: opdracht.verhuurtype,
          start_datum: opdracht.start,
          eind_datum: opdracht.eind,
          toelichting: opdracht.toelichting ?? '',
          website: opdracht.website ?? '',
          aantal_personen: opdracht.personen ?? '',
          beoordeling_deadline: deadline,
        },
      },
      {
        soort: 'upsert_taak',
        aanvraag_ref: 'aan',
        velden: {
          taak_type: 'beoordelen',
          status: 'open',
          eigenaar_type: 'bestuur',
          deadline,
          dedup_sleutel: `taak:aanvraag:${opdracht.email}:${opdracht.start}:beoordelen`,
          toelichting: 'Beoordeel of deze aanvraag bij het Kerkje past.',
        },
      },
      audit({
        dedup: `aanvraag:${opdracht.email}:${opdracht.start}`,
        actie: 'aangemaakt',
        type: 'aanvraag',
        id: `${opdracht.email}:${opdracht.start}`,
        naar: 'nieuw',
        actor: ctx.actor,
      }),
    ];
    const geprojecteerd = pasToe(wereld, mutaties);
    const aanvraag = geprojecteerd.aanvragen.at(-1);
    if (!aanvraag) return mislukt('Aanvraag kon niet worden opgebouwd.');
    const jobs = conceptJob(wereld,aanvraag, 'booking_request_received', 'automatisch', ctx);
    const intern = conceptJob(wereld,aanvraag, 'internal_booking_review_required', 'automatisch', ctx, ctx.internEmail);
    for (const mail of [jobs, intern]) {
      mail.mutatie.aanvraag_ref = 'aan';
      if (mail.mutatie.velden) delete mail.mutatie.velden.aanvraag_id;
    }
    return gelukt('Aanvraag vastgelegd.', { aanvraagId: aanvraag.id }, [...mutaties, jobs.mutatie, intern.mutatie], [jobs.verzend, intern.verzend].filter((item): item is VerzendOpdracht => item !== null));
  }

  if (opdracht.soort === 'beoordeel') {
    if (!actorMag(ctx.actor, 'aanvragen')) return mislukt('Geen schrijfrecht op aanvragen.');
    const aanvraag = wereld.aanvragen.find((item) => item.id === opdracht.aanvraagId);
    if (!aanvraag) return mislukt('Aanvraag niet gevonden.');
    if (opdracht.besluit === 'in_behandeling') {
      const check = magStatusZetten(aanvraag.status, 'in_behandeling', ctx.actor.rechten!);
      if (!check.ok) return mislukt(check.melding ?? 'Overgang geweigerd.');
      return gelukt('In behandeling.', { aanvraagId: aanvraag.id }, [
        { soort: 'update_aanvraag', id: aanvraag.id, velden: { status: 'in_behandeling' } },
        audit({ dedup: `aanvraag:${aanvraag.id}:in_behandeling`, actie: 'status', type: 'aanvraag', id: aanvraag.id, van: aanvraag.status, naar: 'in_behandeling', actor: ctx.actor }),
      ]);
    }
    if (opdracht.besluit === 'afwijzen') {
      const check = magStatusZetten(aanvraag.status, 'afgewezen', ctx.actor.rechten!);
      if (!check.ok) return mislukt(check.melding ?? 'Overgang geweigerd.');
      const mutaties: Mutatie[] = [
        { soort: 'update_aanvraag', id: aanvraag.id, velden: { status: 'afgewezen', afwijsreden: opdracht.reden ?? '' } },
        audit({ dedup: `aanvraag:${aanvraag.id}:afgewezen`, actie: 'afgewezen', type: 'aanvraag', id: aanvraag.id, van: aanvraag.status, naar: 'afgewezen', reden: opdracht.reden, actor: ctx.actor }),
      ];
      const taak = afrondenTaak(wereld, '', 'beoordelen', nuIso);
      void taak;
      const beoordeling = wereld.taken.find((item) => item.aanvraagId === aanvraag.id && item.taakType === 'beoordelen');
      if (beoordeling) {
        mutaties.push({
          soort: 'upsert_taak',
          velden: {
            aanvraag_id: aanvraag.id,
            taak_type: 'beoordelen',
            status: 'afgerond',
            eigenaar_type: 'bestuur',
            deadline: beoordeling.deadline ?? '',
            dedup_sleutel: beoordeling.dedup,
            afgerond_op: nuIso,
          },
        });
      }
      if (aanvraag.boekingId) {
        mutaties.push({ soort: 'update_boeking', id: aanvraag.boekingId, velden: { status: 'afgewezen' } });
      }
      const mail = conceptJob(wereld,aanvraag, 'booking_request_rejected', 'concept', ctx);
      mutaties.push(mail.mutatie);
      return gelukt('Aanvraag afgewezen. Conceptmail staat klaar.', { aanvraagId: aanvraag.id }, mutaties);
    }
    if (opdracht.besluit === 'meer_informatie') {
      const check = magStatusZetten(aanvraag.status, 'wacht_op_aanvrager', ctx.actor.rechten!);
      if (!check.ok) return mislukt(check.melding ?? 'Overgang geweigerd.');
      if (!opdracht.vraag?.trim()) return mislukt('Een informatievraag is verplicht.');
      const token = nieuwToegangstoken();
      const url = `${ctx.basisUrl}/klant/aanvullen/?token=${token.plain}`;
      const mutaties: Mutatie[] = [
        { soort: 'update_aanvraag', id: aanvraag.id, velden: { status: 'wacht_op_aanvrager', informatievraag: opdracht.vraag.trim() } },
        {
          soort: 'insert_token',
          velden: {
            aanvraag_id: aanvraag.id,
            doel: 'meer_informatie',
            token_hash: token.hash,
            verloopt_op: new Date(ctx.nu.getTime() + 21 * 86_400_000).toISOString(),
          },
        },
        audit({ dedup: `aanvraag:${aanvraag.id}:meer_informatie:${hashToegangstoken(opdracht.vraag).slice(0, 12)}`, actie: 'meer_informatie', type: 'aanvraag', id: aanvraag.id, van: aanvraag.status, naar: 'wacht_op_aanvrager', reden: opdracht.vraag.trim(), actor: ctx.actor }),
        conceptJob(wereld,aanvraag, 'booking_more_information_requested', 'concept', ctx).mutatie,
      ];
      return gelukt('Wacht op de aanvrager.', { aanvraagId: aanvraag.id, links: [{ doel: 'meer_informatie', url }] }, mutaties);
    }
    const check = magStatusZetten(aanvraag.status, 'goedgekeurd', ctx.actor.rechten!);
    if (!check.ok) return mislukt(check.melding ?? 'Overgang geweigerd.');
    if (aanvraag.boekingId) {
      return gelukt('Deze aanvraag heeft al een boeking.', { aanvraagId: aanvraag.id, boekingId: aanvraag.boekingId, alVerwerkt: true });
    }
    if (!periodeVrij(wereld, aanvraag.start, aanvraag.eind)) return mislukt('Er loopt al een optie of definitieve boeking voor deze periode.');
    const optie = optieSnapshot(vandaag, STANDAARD_OPTIETERMIJN_DAGEN);
    const tarief = kiesTarief(INITIELE_TARIEVEN, aanvraag.verhuurtype, aanvraag.start);
    const snapshot = tarief ? tariefSnapshot(tarief, vandaag) : null;
    const trigger = publicatieTriggerVoor(aanvraag.verhuurtype);
    const mutaties: Mutatie[] = [
      {
        soort: 'insert_boeking',
        ref: 'boek',
        velden: {
          nummer: `KVP-${aanvraag.start.replaceAll('-', '')}-${aanvraag.id}`,
          status: 'optie',
          verhuurtype_sleutel: aanvraag.verhuurtype,
          interne_titel: aanvraag.naam,
          start_datum: aanvraag.start,
          eind_datum: aanvraag.eind,
          huurder_relatie_id: aanvraag.relatieId ?? '',
          aanvraag_id: aanvraag.id,
          huurder_naam_snapshot: aanvraag.naam,
          huurder_email_snapshot: aanvraag.email,
          huurder_telefoon_snapshot: aanvraag.telefoon,
          huurder_adres_snapshot: aanvraag.adres,
          aantal_personen: aanvraag.personen,
          toelichting: aanvraag.toelichting,
          website: aanvraag.website,
          tarief_prijstype: snapshot?.prijstype ?? '',
          tarief_bedrag: snapshot?.bedrag ?? '',
          tarief_geldig_vanaf: snapshot?.geldigVanaf ?? '',
          tarief_vastgelegd_op: vandaag,
          aanbetaling_standaard: STANDAARD_AANBETALING_EURO,
          aanbetaling_bedrag: STANDAARD_AANBETALING_EURO,
          aanbetaling_ontvangen: false,
          optie_aangemaakt_op: optie.optieAangemaaktOp,
          optietermijn_dagen: optie.optietermijnDagen,
          optie_einddatum: optie.optieEinddatum,
        },
      },
      { soort: 'update_aanvraag', id: aanvraag.id, boeking_ref: 'boek', velden: { status: 'goedgekeurd' } },
      audit({ dedup: `aanvraag:${aanvraag.id}:goedgekeurd`, actie: 'goedgekeurd', type: 'aanvraag', id: aanvraag.id, van: aanvraag.status, naar: 'goedgekeurd', actor: ctx.actor }),
    ];
    if (contentVereist(trigger)) {
      mutaties.push({
        soort: 'upsert_publiek',
        boeking_ref: 'boek',
        velden: {
          titel: aanvraag.naam,
          slug: slugVan(aanvraag.naam, aanvraag.id),
          start_datum: aanvraag.start,
          eind_datum: aanvraag.eind,
          publicatie_trigger: trigger,
          gepubliceerd: false,
          inhoud_status: 'niet_gestart',
          inhoud_versie: 0,
        },
      });
    }
    const geprojecteerd = pasToe(wereld, mutaties);
    const boeking = geprojecteerd.boekingen.find((item) => item.aanvraagId === aanvraag.id);
    const mail = conceptJob(wereld,aanvraag, 'booking_approved_payment_required', 'concept', ctx);
    mutaties.push(mail.mutatie);
    const planComm = boeking ? communicatieMutaties(geprojecteerd, ctx, boeking.id) : { mutaties: [], teVersturen: [], links: [] };
    return gelukt('Optie vastgelegd. Voorbereiding start pas na definitief.', { aanvraagId: aanvraag.id, boekingId: boeking?.id }, [...mutaties, ...planComm.mutaties], planComm.teVersturen);
  }

  if (opdracht.soort === 'aanvulling') {
    const token = tokenBij(wereld, opdracht.token, ctx);
    if (!token || token.doel !== 'meer_informatie' || !token.aanvraagId) return mislukt('Deze link is ongeldig of verlopen.');
    const aanvraag = wereld.aanvragen.find((item) => item.id === token.aanvraagId);
    if (!aanvraag) return mislukt('Aanvraag niet gevonden.');
    const check = magStatusZetten(aanvraag.status, 'in_behandeling', { isSuperAdmin: true, perModule: {} });
    if (!check.ok && aanvraag.status !== 'wacht_op_aanvrager') return mislukt('Deze aanvraag wacht niet op aanvulling.');
    return gelukt('Aanvulling ontvangen.', { aanvraagId: aanvraag.id }, [
      { soort: 'update_aanvraag', id: aanvraag.id, velden: { status: 'in_behandeling', toelichting: opdracht.toelichting, informatie_ontvangen_op: nuIso } },
      { soort: 'update_token', id: token.id, velden: { ingetrokken_op: nuIso } },
      {
        soort: 'upsert_taak',
        velden: {
          aanvraag_id: aanvraag.id,
          taak_type: 'beoordelen',
          status: 'open',
          eigenaar_type: 'bestuur',
          deadline: voegDagenToe(vandaag, 7),
          dedup_sleutel: `taak:aanvraag:${aanvraag.id}:beoordelen-opnieuw`,
          toelichting: 'Aanvulling ontvangen.',
        },
      },
      audit({ dedup: `aanvraag:${aanvraag.id}:aanvulling:${createHash('sha256').update(opdracht.toelichting).digest('hex').slice(0, 12)}`, actie: 'aanvulling', type: 'aanvraag', id: aanvraag.id, van: aanvraag.status, naar: 'in_behandeling', actor: ctx.actor }),
    ]);
  }

  if (opdracht.soort === 'betaling') {
    if (!actorMag(ctx.actor, 'finance') && !actorMag(ctx.actor, 'boekingen')) return mislukt('Geen recht om een betaling te registreren.');
    const boeking = wereld.boekingen.find((item) => item.id === opdracht.boekingId);
    if (!boeking) return mislukt('Boeking niet gevonden.');
    if (boeking.aanbetalingOntvangen || wereld.audits.some((item) => item.dedup === `betaling:${boeking.id}:aanbetaling`)) {
      return gelukt('Betaling was al geregistreerd.', { boekingId: boeking.id, alVerwerkt: true });
    }
    const gevolg = naAanbetalingOntvangen(true);
    const mutaties: Mutatie[] = [
      {
        soort: 'upsert_betaling',
        velden: {
          boeking_id: boeking.id,
          soort: 'aanbetaling',
          bedrag: boeking.aanbetalingBedrag,
          status: 'ontvangen',
          ontvangen_op: nuIso,
          referentie: `aanbetaling:${boeking.id}`,
        },
      },
      {
        soort: 'update_boeking',
        id: boeking.id,
        velden: { status: gevolg.boekingStatus, aanbetaling_ontvangen: true, aanbetaling_ontvangen_op: nuIso },
      },
      audit({ dedup: `betaling:${boeking.id}:aanbetaling`, actie: 'betaling_ontvangen', type: 'boeking', id: boeking.id, van: boeking.status, naar: gevolg.boekingStatus, actor: ctx.actor }),
    ];
    const taak = afrondenTaak(wereld, boeking.id, 'betaling_herinneren', nuIso);
    if (taak) mutaties.push(taak);
    const geprojecteerd = pasToe(wereld, mutaties);
    const comm = communicatieMutaties(geprojecteerd, ctx, boeking.id);
    const bevestiging = wereld.jobs.find((job) => job.dedup === `job:${boeking.id}:booking_confirmed`);
    if (!bevestiging) {
      const aanvraag = wereld.aanvragen.find((item) => item.id === boeking.aanvraagId) ?? {
        ...boeking,
        id: boeking.aanvraagId ?? boeking.id,
        status: 'goedgekeurd' as const,
        verhuurtype: boeking.verhuurtype,
        relatieId: boeking.relatieId,
        boekingId: boeking.id,
        beoordelingDeadline: null,
        informatievraag: null,
        personen: '',
        website: '',
      };
      const mail = conceptJob(wereld,aanvraag as AanvraagRij, 'booking_confirmed', 'automatisch', ctx);
      mail.mutatie.velden = { ...(mail.mutatie.velden ?? {}), boeking_id: boeking.id };
      if (mail.verzend) comm.teVersturen.push(mail.verzend);
      comm.mutaties.push(mail.mutatie);
    }
    return gelukt('Boeking is definitief.', { boekingId: boeking.id, links: comm.links }, [...mutaties, ...comm.mutaties], comm.teVersturen);
  }

  if (opdracht.soort === 'content_indienen') {
    const token = tokenBij(wereld, opdracht.token, ctx);
    if (!token || token.doel !== 'content' || !token.boekingId) return mislukt('Deze link is ongeldig of verlopen.');
    const publiek = wereld.publiek.find((item) => item.boekingId === token.boekingId);
    const boeking = wereld.boekingen.find((item) => item.id === token.boekingId);
    if (!publiek || !boeking) return mislukt('Geen contentdossier.');
    if (publiek.titel === opdracht.titel && publiek.omschrijving === opdracht.omschrijving && publiek.praktisch === (opdracht.praktisch ?? '') && publiek.inhoudStatus === 'ingediend') {
      return gelukt('Deze content was al ontvangen.', { boekingId: boeking.id, alVerwerkt: true });
    }
    const versie = publiek.versie + 1;
    const publicatie = beoordeelPublicatie({
      gekoppeldeBoekingStatus: boeking.status,
      publiekeTitel: opdracht.titel,
      datum: boeking.start,
      omschrijving: opdracht.omschrijving,
      foto: publiek.foto,
      trigger: publiek.trigger,
      startYmd: boeking.start,
      nuYmd: vandaag,
    });
    return gelukt(publicatie.reden, { boekingId: boeking.id }, [
      {
        soort: 'upsert_publiek',
        velden: {
          boeking_id: boeking.id,
          titel: opdracht.titel,
          slug: publiek.slug || slugVan(opdracht.titel, boeking.id),
          omschrijving: opdracht.omschrijving,
          praktische_informatie: opdracht.praktisch ?? '',
          foto_pad: opdracht.foto ? 'aangeleverd' : '',
          start_datum: boeking.start,
          eind_datum: boeking.eind,
          publicatie_trigger: publiek.trigger,
          gepubliceerd: false,
          inhoud_status: 'ingediend',
          ingediend_op: nuIso,
          inhoud_versie: versie,
        },
      },
      { soort: 'update_token', id: token.id, velden: { ingetrokken_op: nuIso } },
      {
        soort: 'upsert_taak',
        velden: {
          boeking_id: boeking.id,
          taak_type: 'content_beoordelen',
          status: 'open',
          eigenaar_type: 'bestuur',
          deadline: voegDagenToe(vandaag, 7),
          dedup_sleutel: `taak:${boeking.id}:content_beoordelen`,
          toelichting: 'Content is aangeleverd.',
        },
      },
      audit({
        dedup: `content:${boeking.id}:${versie}`,
        actie: 'content_ingediend',
        type: 'boeking',
        id: boeking.id,
        naar: 'ingediend',
        actor: ctx.actor,
      }),
    ]);
  }

  if (opdracht.soort === 'content_beoordelen') {
    if (!actorMag(ctx.actor, 'agenda') && !actorMag(ctx.actor, 'boekingen')) return mislukt('Geen recht om content te beoordelen.');
    const boeking = wereld.boekingen.find((item) => item.id === opdracht.boekingId);
    const publiek = wereld.publiek.find((item) => item.boekingId === opdracht.boekingId);
    if (!boeking || !publiek) return mislukt('Geen publieke activiteit.');
    if (opdracht.besluit === 'wijziging') {
      if (!opdracht.toelichting?.trim()) return mislukt('Feedback is verplicht bij een wijzigingsverzoek.');
      const token = nieuwToegangstoken();
      const url = `${ctx.basisUrl}/klant/aanleveren/?token=${token.plain}`;
      return gelukt('Wijziging gevraagd.', { boekingId: boeking.id, links: [{ doel: 'content', url }] }, [
        {
          soort: 'upsert_publiek',
          velden: {
            boeking_id: boeking.id,
            titel: publiek.titel,
            slug: publiek.slug,
            omschrijving: publiek.omschrijving,
            praktische_informatie: publiek.praktisch,
            start_datum: boeking.start,
            eind_datum: boeking.eind,
            publicatie_trigger: publiek.trigger,
            gepubliceerd: false,
            inhoud_status: 'wijziging_gevraagd',
            beoordeling_toelichting: opdracht.toelichting.trim(),
            inhoud_versie: publiek.versie,
          },
        },
        {
          soort: 'insert_token',
          velden: {
            boeking_id: boeking.id,
            doel: 'content',
            token_hash: token.hash,
            verloopt_op: new Date(ctx.nu.getTime() + 21 * 86_400_000).toISOString(),
          },
        },
        audit({ dedup: `content:${boeking.id}:wijziging:${publiek.versie}`, actie: 'wijziging_gevraagd', type: 'boeking', id: boeking.id, reden: opdracht.toelichting.trim(), actor: ctx.actor }),
      ]);
    }
    const publicatie = beoordeelPublicatie({
      gekoppeldeBoekingStatus: boeking.status,
      publiekeTitel: publiek.titel,
      datum: boeking.start,
      omschrijving: publiek.omschrijving,
      foto: publiek.foto,
      fotoAlt: publiek.titel,
      trigger: publiek.trigger,
      startYmd: boeking.start,
      nuYmd: vandaag,
    });
    const taak = afrondenTaak(wereld, boeking.id, 'content_beoordelen', nuIso);
    const mutaties: Mutatie[] = [
      {
        soort: 'upsert_publiek',
        velden: {
          boeking_id: boeking.id,
          titel: publiek.titel,
          slug: publiek.slug,
          omschrijving: publiek.omschrijving,
          praktische_informatie: publiek.praktisch,
          start_datum: boeking.start,
          eind_datum: boeking.eind,
          publicatie_trigger: publiek.trigger,
          gepubliceerd: publicatie.magOnline,
          gepubliceerd_op: publicatie.magOnline ? nuIso : '',
          inhoud_status: 'goedgekeurd',
          goedgekeurd_op: nuIso,
          goedgekeurd_door: ctx.actor.id ?? '',
          inhoud_versie: publiek.versie,
        },
      },
      audit({ dedup: `content:${boeking.id}:goedgekeurd:${publiek.versie}`, actie: 'content_goedgekeurd', type: 'boeking', id: boeking.id, naar: publicatie.magOnline ? 'gepubliceerd' : 'goedgekeurd', actor: ctx.actor }),
    ];
    if (taak) mutaties.push(taak);
    return gelukt(publicatie.magOnline ? 'Content goedgekeurd en gepubliceerd.' : publicatie.reden, { boekingId: boeking.id }, mutaties);
  }

  if (opdracht.soort === 'gastheer') {
    if (!actorMag(ctx.actor, 'planning') && !actorMag(ctx.actor, 'boekingen')) return mislukt('Geen recht om een gastheer te koppelen.');
    const boeking = wereld.boekingen.find((item) => item.id === opdracht.boekingId);
    if (!boeking) return mislukt('Boeking niet gevonden.');
    const gastheer = wereld.relaties.find((item) => item.id === opdracht.gastheerId);
    if (!gastheer) return mislukt('Gastheer niet gevonden.');
    const mutaties: Mutatie[] = [
      { soort: 'update_boeking', id: boeking.id, velden: { gastheer_relatie_id: gastheer.id } },
      audit({ dedup: `gastheer:${boeking.id}:${gastheer.id}`, actie: 'gastheer_gekoppeld', type: 'boeking', id: boeking.id, naar: gastheer.id, actor: ctx.actor }),
    ];
    const taak = afrondenTaak(wereld, boeking.id, 'gastheer_ontbreekt', nuIso);
    if (taak) mutaties.push(taak);
    for (const job of wereld.jobs.filter(
      (item) =>
        item.boekingId === boeking.id &&
        item.templateSleutel === 'internal_host_required' &&
        item.status !== 'verzonden' &&
        item.status !== 'geannuleerd',
    )) {
      mutaties.push(jobMutatie(boeking, job, { status: 'geannuleerd' }));
    }
    return gelukt('Gastheer gekoppeld.', { boekingId: boeking.id }, mutaties);
  }

  if (opdracht.soort === 'incident') {
    if (!actorMag(ctx.actor, 'boekingen')) return mislukt('Geen recht om een incident te melden.');
    const boeking = wereld.boekingen.find((item) => item.id === opdracht.boekingId);
    if (!boeking) return mislukt('Boeking niet gevonden.');
    if (!opdracht.omschrijving.trim()) return mislukt('Een incident heeft een omschrijving nodig.');
    return gelukt('Incident vastgelegd. Het dossier sluit niet automatisch.', { boekingId: boeking.id }, [
      { soort: 'insert_incident', velden: { boeking_id: boeking.id, omschrijving: opdracht.omschrijving, status: 'open', gemeld_door: ctx.actor.id ?? '' } },
      {
        soort: 'upsert_taak',
        velden: {
          boeking_id: boeking.id,
          taak_type: 'incident',
          status: 'open',
          eigenaar_type: 'bestuur',
          deadline: vandaag,
          dedup_sleutel: `taak:${boeking.id}:incident:${createHash('sha256').update(opdracht.omschrijving).digest('hex').slice(0, 8)}`,
          toelichting: opdracht.omschrijving,
        },
      },
      audit({ dedup: `incident:${boeking.id}:${nuIso}`, actie: 'incident', type: 'boeking', id: boeking.id, reden: opdracht.omschrijving, actor: ctx.actor }),
    ]);
  }

  if (opdracht.soort === 'incident_sluiten') {
    if (!actorMag(ctx.actor, 'boekingen')) return mislukt('Geen recht om een incident te sluiten.');
    const incident = wereld.incidenten.find((item) => item.id === opdracht.incidentId);
    if (!incident) return mislukt('Incident niet gevonden.');
    return gelukt('Incident gesloten.', { boekingId: incident.boekingId }, [
      { soort: 'update_incident', id: incident.id, velden: { status: 'gesloten', gesloten_op: nuIso } },
      audit({ dedup: `incident:${incident.id}:gesloten`, actie: 'incident_gesloten', type: 'incident', id: incident.id, actor: ctx.actor }),
    ]);
  }

  if (opdracht.soort === 'sluit') {
    if (!actorMag(ctx.actor, 'boekingen')) return mislukt('Geen recht om een dossier te sluiten.');
    const boeking = wereld.boekingen.find((item) => item.id === opdracht.boekingId);
    if (!boeking) return mislukt('Boeking niet gevonden.');
    const openIncidenten = wereld.incidenten.filter((item) => item.boekingId === boeking.id && item.status !== 'gesloten').length;
    const openTaken = wereld.taken.filter((item) => item.boekingId === boeking.id && (item.status === 'open' || item.status === 'geescaleerd' || item.status === 'bezig')).length;
    const poort = magAutomatischSluiten({ openIncidenten, openTaken });
    if (!poort.ok) return mislukt(poort.reden);
    const mutaties: Mutatie[] = [
      { soort: 'update_boeking', id: boeking.id, velden: { status: 'afgerond' } },
      audit({ dedup: `boeking:${boeking.id}:afgerond`, actie: 'afgerond', type: 'boeking', id: boeking.id, van: boeking.status, naar: 'afgerond', reden: opdracht.reden, actor: ctx.actor }),
    ];
    if (boeking.aanvraagId) {
      mutaties.push({ soort: 'update_aanvraag', id: boeking.aanvraagId, velden: { status: 'gesloten' } });
    }
    return gelukt('Dossier afgerond.', { boekingId: boeking.id }, mutaties);
  }

  if (opdracht.soort === 'handmatig_definitief') {
    if (!actorMag(ctx.actor, 'boekingen')) return mislukt('Geen recht om handmatig definitief te maken.');
    if (!opdracht.reden.trim()) return mislukt('Een reden is verplicht bij een handmatige override.');
    const boeking = wereld.boekingen.find((item) => item.id === opdracht.boekingId);
    if (!boeking) return mislukt('Boeking niet gevonden.');
    const poort = statusActieToegestaan(boeking.status, 'definitief');
    if (!poort.ok) return mislukt(poort.melding);
    if (poort.melding === 'al') return gelukt('Boeking is al definitief.', { boekingId: boeking.id, alVerwerkt: true });
    if (!periodeVrij(wereld, boeking.start, boeking.eind, boeking.id)) return mislukt('De periode is al bezet.');
    const mutaties: Mutatie[] = [
      { soort: 'update_boeking', id: boeking.id, velden: { status: 'definitief' } },
      audit({ dedup: `boeking:${boeking.id}:handmatig_definitief`, actie: 'override_definitief', type: 'boeking', id: boeking.id, van: boeking.status, naar: 'definitief', reden: opdracht.reden.trim(), actor: ctx.actor }),
    ];
    const geprojecteerd = pasToe(wereld, mutaties);
    const comm = communicatieMutaties(geprojecteerd, ctx, boeking.id);
    return gelukt('Handmatig definitief. Voorbereiding is gestart.', { boekingId: boeking.id, links: comm.links }, [...mutaties, ...comm.mutaties], comm.teVersturen);
  }

  if (opdracht.soort === 'annuleer') {
    if (!actorMag(ctx.actor, 'boekingen')) return mislukt('Geen recht om te annuleren.');
    const boeking = wereld.boekingen.find((item) => item.id === opdracht.boekingId);
    if (!boeking) return mislukt('Boeking niet gevonden.');
    const mutaties: Mutatie[] = [
      { soort: 'update_boeking', id: boeking.id, velden: { status: 'geannuleerd' } },
      audit({ dedup: `boeking:${boeking.id}:geannuleerd`, actie: 'geannuleerd', type: 'boeking', id: boeking.id, van: boeking.status, naar: 'geannuleerd', reden: opdracht.reden, actor: ctx.actor }),
    ];
    for (const job of wereld.jobs.filter((item) => item.boekingId === boeking.id && item.status !== 'verzonden')) {
      mutaties.push(jobMutatie(boeking, job, { status: 'geannuleerd' }));
    }
    return gelukt('Boeking geannuleerd.', { boekingId: boeking.id }, mutaties);
  }

  if (opdracht.soort === 'verleng') {
    if (!actorMag(ctx.actor, 'boekingen')) return mislukt('Geen recht om een optie te verlengen.');
    const boeking = wereld.boekingen.find((item) => item.id === opdracht.boekingId);
    if (!boeking) return mislukt('Boeking niet gevonden.');
    const poort = statusActieToegestaan(boeking.status, 'verleng');
    if (!poort.ok) return mislukt(poort.melding);
    const optie = optieSnapshot(vandaag, STANDAARD_OPTIETERMIJN_DAGEN);
    return gelukt('Optie verlengd.', { boekingId: boeking.id }, [
      { soort: 'update_boeking', id: boeking.id, velden: { status: 'optie', optie_einddatum: optie.optieEinddatum, optietermijn_dagen: optie.optietermijnDagen } },
      audit({ dedup: `boeking:${boeking.id}:verlengd:${vandaag}`, actie: 'optie_verlengd', type: 'boeking', id: boeking.id, naar: optie.optieEinddatum, actor: ctx.actor }),
    ]);
  }

  if (opdracht.soort === 'scheduler') {
    const comm = communicatieMutaties(wereld, ctx);
    return gelukt('Planner bijgewerkt.', { links: comm.links }, comm.mutaties, comm.teVersturen);
  }

  return mislukt('Onbekende opdracht.');
}

function conceptJob(
  wereld: Wereld,
  aanvraag: AanvraagRij,
  templateId: string,
  modus: 'automatisch' | 'concept',
  ctx: DienstContext,
  naar = aanvraag.email,
): { mutatie: Mutatie; verzend: VerzendOpdracht | null } {
  const template = templateVoor(wereld, templateId);
  const vars = { voornaam: aanvraag.naam.split(' ')[0] || aanvraag.naam, naam: aanvraag.naam, datum: aanvraag.start, activiteitstype: aanvraag.verhuurtype };
  const onderwerp = template ? onderwerpUitTemplate(template, vars) : templateId;
  const tekst = template ? plainTekstUitTemplate(template, vars) : templateId;
  const dedup = `job:aanvraag:${aanvraag.id}:${templateId}`;
  const mutatie: Mutatie = {
    soort: 'upsert_job',
    ref: `job:${dedup}`,
    aanvraag_ref: aanvraag.id.startsWith('new') ? 'aan' : undefined,
    velden: {
      aanvraag_id: aanvraag.id,
      template_sleutel: templateId,
      dedup_sleutel: dedup,
      status: modus === 'automatisch' ? 'gepland' : 'concept',
      modus,
      gepland_op: ctx.nu.toISOString(),
      ontvanger_email: naar,
      onderwerp,
      pogingen: 0,
    },
  };
  const verzend = modus === 'automatisch'
    ? { dedup, naar, onderwerp, tekst, pogingen: 0, jobRef: `job:${dedup}` }
    : null;
  return { mutatie, verzend };
}

export async function voerOpdrachtUit(
  wereld: Wereld,
  opdracht: Opdracht,
  ctx: DienstContext,
  transport?: MailTransport,
): Promise<{ wereld: Wereld; resultaat: Resultaat; mutaties: Mutatie[] }> {
  const plan = bouwPlan(wereld, opdracht, ctx);
  if (!plan.ok) return { wereld, resultaat: plan.resultaat, mutaties: [] };
  const mutaties = [...plan.mutaties];
  if (transport) {
    for (const mail of plan.teVersturen) {
      const guard = bewaakUitgaandeMail(ctx.env, mail.naar);
      if (!guard.toegestaan || !guard.naar) {
        mutaties.push({
          soort: 'upsert_job',
          ref: mail.jobRef,
          velden: {
            dedup_sleutel: mail.dedup,
            template_sleutel: mail.dedup.split(':').at(-1) ?? '',
            status: 'fout',
            modus: 'automatisch',
            gepland_op: ctx.nu.toISOString(),
            ontvanger_email: mail.naar,
            onderwerp: mail.onderwerp,
            pogingen: MAX_VERZENDPOGINGEN,
            foutmelding: 'Staging blokkeert dit adres.',
          },
        });
        continue;
      }
      try {
        await transport.verstuur({
          naar: guard.naar,
          onderwerp: `${guard.onderwerpPrefix}${mail.onderwerp}`,
          tekst: mail.tekst,
          templateSleutel: mail.dedup.split(':').at(-1) ?? '',
        });
        mutaties.push({
          soort: 'upsert_job',
          ref: mail.jobRef,
          velden: {
            dedup_sleutel: mail.dedup,
            template_sleutel: mail.dedup.split(':').at(-1) ?? '',
            status: 'verzonden',
            modus: 'automatisch',
            gepland_op: ctx.nu.toISOString(),
            ontvanger_email: guard.naar,
            onderwerp: `${guard.onderwerpPrefix}${mail.onderwerp}`,
            pogingen: mail.pogingen,
            foutmelding: '',
          },
        });
        mutaties.push({
          soort: 'insert_audit',
          velden: {
            dedup_sleutel: `mail:${mail.dedup}`,
            actie: 'verzonden',
            onderwerp_type: 'communicatie',
            onderwerp_id: mail.dedup,
            naar: guard.reden,
            actor_type: 'systeem',
            actor_naam: 'mail',
          },
        });
      } catch (error) {
        if (error instanceof MailGeblokkeerd) {
          mutaties.push({
            soort: 'upsert_job',
            ref: mail.jobRef,
            velden: {
              dedup_sleutel: mail.dedup,
              template_sleutel: mail.dedup.split(':').at(-1) ?? '',
              status: 'geblokkeerd',
              modus: 'automatisch',
              gepland_op: ctx.nu.toISOString(),
              ontvanger_email: mail.naar,
              onderwerp: mail.onderwerp,
              pogingen: mail.pogingen,
              foutmelding: 'geblokkeerd door automatisering; niet verzonden; geen provider-call',
            },
          });
          mutaties.push({
            soort: 'insert_audit',
            velden: {
              dedup_sleutel: `mail-geblokkeerd:${mail.dedup}`,
              actie: 'geblokkeerd',
              onderwerp_type: 'communicatie',
              onderwerp_id: mail.dedup,
              naar: 'geen provider-call',
              reden: error.message,
              actor_type: 'systeem',
              actor_naam: 'automatisering',
            },
          });
          continue;
        }
        const pogingen = mail.pogingen + 1;
        const fout = mailFoutNaPoging(pogingen);
        mutaties.push({
          soort: 'upsert_job',
          ref: mail.jobRef,
          velden: {
            dedup_sleutel: mail.dedup,
            template_sleutel: mail.dedup.split(':').at(-1) ?? '',
            status: fout.status,
            modus: 'automatisch',
            gepland_op: ctx.nu.toISOString(),
            ontvanger_email: mail.naar,
            onderwerp: mail.onderwerp,
            pogingen,
            foutmelding: error instanceof Error ? error.message : 'verzenden mislukt',
            laatste_poging_op: ctx.nu.toISOString(),
          },
        });
      }
    }
  }
  return { wereld: pasToe(wereld, mutaties), resultaat: plan.resultaat, mutaties };
}

export function readinessVanBoeking(wereld: Wereld, boekingId: string, vandaag: string): Readiness {
  const boeking = wereld.boekingen.find((item) => item.id === boekingId);
  if (!boeking) return { uitkomst: 'actie_vereist', issues: [] };
  const publiek = wereld.publiek.find((item) => item.boekingId === boeking.id);
  const trigger = publiek?.trigger ?? publicatieTriggerVoor(boeking.verhuurtype);
  return berekenReadiness({
    status: boeking.status,
    start: boeking.start,
    vandaag,
    verhuurtype: boeking.verhuurtype,
    publicatieTrigger: trigger,
    inhoudStatus: publiek?.inhoudStatus ?? (contentVereist(trigger) ? 'niet_gestart' : 'niet_vereist'),
    gepubliceerd: publiek?.gepubliceerd ?? false,
    aanbetalingOntvangen: boeking.aanbetalingOntvangen,
    aanbetalingVerplicht: true,
    gastheerAanwezig: Boolean(boeking.gastheerId),
    praktischeInformatie: Boolean(publiek?.praktisch),
    dagmailVerzonden: wereld.jobs.some((job) => job.boekingId === boeking.id && job.templateSleutel === 'booking_final_instructions' && job.status === 'verzonden'),
    openIncidenten: wereld.incidenten.filter((item) => item.boekingId === boeking.id && item.status !== 'gesloten').length,
  });
}

export function productieslot(env: Record<string, unknown>): boolean {
  return env.VERCEL_ENV === 'production' && env.ALLOW_SUPABASE_CONTENT !== 'true' && env.ALLOW_SUPABASE_CONTENT !== true;
}
