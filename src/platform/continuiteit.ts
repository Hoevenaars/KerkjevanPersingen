/**
 * Continuïteit 3.0: conditionele communicatie, catch-up, readiness.
 * Regels blijven hier. Concrete taken en jobs staan in de database.
 */

import { volgendeFoutStatus, MAX_VERZENDPOGINGEN } from './communicatie.ts';
import { voegDagenToe } from './datum.ts';
import type { BoekingStatus, PublicatieTrigger } from './types.ts';

export const INHOUD_STATUSSEN = [
  'niet_vereist',
  'niet_gestart',
  'gevraagd',
  'ingediend',
  'wijziging_gevraagd',
  'goedgekeurd',
] as const;
export type InhoudStatus = (typeof INHOUD_STATUSSEN)[number];

export type Eigenaar = 'klant' | 'bestuur' | 'finance' | 'planning' | 'systeem';
export type Keten =
  | 'content'
  | 'betaling'
  | 'gastheer'
  | 'praktisch'
  | 'praktisch_gastheer'
  | 'dag'
  | 'dag_gastheer'
  | 'nazorg'
  | 'nazorg_gastheer';

export interface CommunicatieStap {
  templateId: string;
  keten: Keten;
  volgorde: number;
  modus: 'automatisch' | 'concept' | 'handmatig';
  ontvangerRol: 'huurder' | 'gastheer' | 'bestuur' | 'finance' | 'planning';
  eigenaar: Eigenaar;
  taakType: string;
  geplandOp: string;
  conditie: string;
}

export interface CommunicatieContext {
  status: BoekingStatus;
  start: string;
  verhuurtype: string;
  publicatieTrigger: PublicatieTrigger;
  inhoudStatus: InhoudStatus;
  aanbetalingOntvangen: boolean;
  aanbetalingVerplicht: boolean;
  optieAangemaaktOp: string | null;
  betaaldeadline: string | null;
  gastheerAanwezig: boolean;
  verzonden: ReadonlySet<string>;
  vandaag: string;
}

/** Publicatie volgt de bestaande trigger, niet het activiteitstype alleen. */
export function contentVereist(trigger: PublicatieTrigger): boolean {
  return trigger !== 'niet_publiceren';
}

/**
 * Standaardtrigger bij een nieuwe boeking.
 * Exposities zijn publiek (huidige praktijk). Andere types starten zonder
 * publicatie; een latere trigger zet de contentflow alsnog aan.
 */
export function publicatieTriggerVoor(verhuurtype: string): PublicatieTrigger {
  return verhuurtype === 'expositie' ? 'zodra_content_compleet' : 'niet_publiceren';
}

/** Gastheer volgt de bestaande planningsregel: publieke expositie. */
export function gastheerVereist(verhuurtype: string, trigger: PublicatieTrigger): boolean {
  return verhuurtype === 'expositie' && contentVereist(trigger);
}

export function inhoudIncompleet(status: InhoudStatus): boolean {
  return status === 'niet_gestart' || status === 'gevraagd' || status === 'wijziging_gevraagd';
}

export function inhoudWachtOpBeoordeling(status: InhoudStatus): boolean {
  return status === 'ingediend';
}

function betaalDeadlineVan(ctx: CommunicatieContext): string | null {
  if (ctx.betaaldeadline) return ctx.betaaldeadline;
  if (!ctx.optieAangemaaktOp) return null;
  return voegDagenToe(ctx.optieAangemaaktOp, 14);
}

function stap(
  deel: Omit<CommunicatieStap, 'geplandOp' | 'conditie'> & { geplandOp: string; conditie: string },
): CommunicatieStap {
  return deel;
}

/** Alle structureel geldige stappen, ook die nog in de toekomst liggen. */
export function communicatieStappen(ctx: CommunicatieContext): CommunicatieStap[] {
  const actief = ctx.status === 'definitief' || ctx.status === 'optie' || ctx.status === 'optie_verlopen';
  if (!actief) return [];
  const stappen: CommunicatieStap[] = [];
  const definitief = ctx.status === 'definitief';

  if (!ctx.aanbetalingOntvangen && ctx.aanbetalingVerplicht && ctx.status !== 'definitief') {
    const deadline = betaalDeadlineVan(ctx);
    const start = ctx.optieAangemaaktOp;
    if (start) {
      stappen.push(
        stap({
          templateId: 'booking_payment_reminder',
          keten: 'betaling',
          volgorde: 1,
          modus: 'automatisch',
          ontvangerRol: 'huurder',
          eigenaar: 'klant',
          taakType: 'betaling_herinneren',
          geplandOp: voegDagenToe(start, 7),
          conditie: 'betaling_open',
        }),
      );
    }
    if (deadline) {
      stappen.push(
        stap({
          templateId: 'booking_payment_final_reminder',
          keten: 'betaling',
          volgorde: 2,
          modus: 'automatisch',
          ontvangerRol: 'huurder',
          eigenaar: 'klant',
          taakType: 'betaling_laatste_herinnering',
          geplandOp: voegDagenToe(deadline, -2),
          conditie: 'betaling_open_na_eerste_herinnering',
        }),
        stap({
          templateId: 'internal_payment_overdue',
          keten: 'betaling',
          volgorde: 3,
          modus: 'automatisch',
          ontvangerRol: 'finance',
          eigenaar: 'finance',
          taakType: 'betaling_escalatie',
          geplandOp: voegDagenToe(deadline, 1),
          conditie: 'betaling_open_na_laatste_herinnering',
        }),
      );
    }
  }

  if (!definitief) return stappen;

  if (contentVereist(ctx.publicatieTrigger)) {
    const incompleet = inhoudIncompleet(ctx.inhoudStatus);
    stappen.push(
      stap({
        templateId: 'booking_content_request',
        keten: 'content',
        volgorde: 1,
        modus: 'automatisch',
        ontvangerRol: 'huurder',
        eigenaar: 'klant',
        taakType: 'content_uitvragen',
        geplandOp: voegDagenToe(ctx.start, -84),
        conditie: incompleet ? 'content_incompleet' : 'content_al_compleet',
      }),
      stap({
        templateId: 'booking_content_reminder',
        keten: 'content',
        volgorde: 2,
        modus: 'automatisch',
        ontvangerRol: 'huurder',
        eigenaar: 'klant',
        taakType: 'content_herinneren',
        geplandOp: voegDagenToe(ctx.start, -70),
        conditie: incompleet ? 'content_incompleet' : 'content_al_compleet',
      }),
      stap({
        templateId: 'internal_content_overdue',
        keten: 'content',
        volgorde: 3,
        modus: 'automatisch',
        ontvangerRol: 'bestuur',
        eigenaar: 'bestuur',
        taakType: 'content_escalatie',
        geplandOp: voegDagenToe(ctx.start, -56),
        conditie: incompleet ? 'content_incompleet' : 'content_al_compleet',
      }),
    );
  }

  stappen.push(
    stap({
      templateId: 'booking_practical_information',
      keten: 'praktisch',
      volgorde: 1,
      modus: 'automatisch',
      ontvangerRol: 'huurder',
      eigenaar: 'systeem',
      taakType: 'praktische_informatie',
      geplandOp: voegDagenToe(ctx.start, -28),
      conditie: 'definitief',
    }),
    stap({
      templateId: 'booking_final_instructions',
      keten: 'dag',
      volgorde: 1,
      modus: 'automatisch',
      ontvangerRol: 'huurder',
      eigenaar: 'systeem',
      taakType: 'daginformatie_klant',
      geplandOp: voegDagenToe(ctx.start, -2),
      conditie: 'definitief',
    }),
    stap({
      templateId: 'booking_review_request',
      keten: 'nazorg',
      volgorde: 1,
      modus: 'automatisch',
      ontvangerRol: 'huurder',
      eigenaar: 'systeem',
      taakType: 'review',
      geplandOp: voegDagenToe(ctx.start, 1),
      conditie: 'definitief',
    }),
  );

  if (gastheerVereist(ctx.verhuurtype, ctx.publicatieTrigger) && !ctx.gastheerAanwezig) {
    stappen.push(
      stap({
        templateId: 'internal_host_required',
        keten: 'gastheer',
        volgorde: 1,
        modus: 'automatisch',
        ontvangerRol: 'planning',
        eigenaar: 'planning',
        taakType: 'gastheer_ontbreekt',
        geplandOp: voegDagenToe(ctx.start, -28),
        conditie: 'gastheer_ontbreekt',
      }),
    );
  }

  if (ctx.gastheerAanwezig) {
    stappen.push(
      stap({
        templateId: 'host_practical_information',
        keten: 'praktisch_gastheer',
        volgorde: 1,
        modus: 'automatisch',
        ontvangerRol: 'gastheer',
        eigenaar: 'planning',
        taakType: 'gastheer_praktisch',
        geplandOp: voegDagenToe(ctx.start, -28),
        conditie: 'gastheer_aanwezig',
      }),
      stap({
        templateId: 'host_final_instructions',
        keten: 'dag_gastheer',
        volgorde: 1,
        modus: 'automatisch',
        ontvangerRol: 'gastheer',
        eigenaar: 'planning',
        taakType: 'daginformatie_gastheer',
        geplandOp: voegDagenToe(ctx.start, -1),
        conditie: 'gastheer_aanwezig',
      }),
      stap({
        templateId: 'host_post_event_check',
        keten: 'nazorg_gastheer',
        volgorde: 1,
        modus: 'automatisch',
        ontvangerRol: 'gastheer',
        eigenaar: 'planning',
        taakType: 'afloopcheck_gastheer',
        geplandOp: voegDagenToe(ctx.start, 1),
        conditie: 'gastheer_aanwezig',
      }),
    );
  }

  return stappen;
}

function conditieWaar(stapItem: CommunicatieStap, ctx: CommunicatieContext): boolean {
  if (stapItem.conditie === 'content_al_compleet') return false;
  if (stapItem.keten === 'content' && !inhoudIncompleet(ctx.inhoudStatus)) return false;
  if (stapItem.keten === 'betaling' && (ctx.aanbetalingOntvangen || !ctx.aanbetalingVerplicht)) return false;
  if (stapItem.keten === 'gastheer' && ctx.gastheerAanwezig) return false;
  if (
    (stapItem.keten === 'praktisch_gastheer' ||
      stapItem.keten === 'dag_gastheer' ||
      stapItem.keten === 'nazorg_gastheer') &&
    !ctx.gastheerAanwezig
  ) {
    return false;
  }
  if (stapItem.volgorde > 1) {
    const eerdere = communicatieStappen(ctx).find(
      (kandidaat) => kandidaat.keten === stapItem.keten && kandidaat.volgorde === stapItem.volgorde - 1,
    );
    if (eerdere && !ctx.verzonden.has(eerdere.templateId)) return false;
  }
  return true;
}

/**
 * Per keten hoogstens de eerstvolgende stap waarvan de datum bereikt is
 * én de actuele conditie nog waar is. Gemiste eerdere reminders worden
 * niet alsnog allemaal verstuurd.
 */
export function actueleVerzendingen(ctx: CommunicatieContext): CommunicatieStap[] {
  const gekozen: CommunicatieStap[] = [];
  const ketens = new Set(communicatieStappen(ctx).map((item) => item.keten));
  for (const keten of ketens) {
    const reeks = communicatieStappen(ctx)
      .filter((item) => item.keten === keten)
      .sort((a, b) => a.volgorde - b.volgorde);
    for (const item of reeks) {
      if (ctx.verzonden.has(item.templateId)) continue;
      if (!conditieWaar(item, ctx)) continue;
      if (item.geplandOp > ctx.vandaag) break;
      gekozen.push(item);
      break;
    }
  }
  return gekozen;
}

export function geplandeJobsTeAnnuleren(ctx: CommunicatieContext, openTemplateIds: readonly string[]): string[] {
  const geldig = new Set(
    communicatieStappen(ctx)
      .filter((item) => conditieWaar(item, ctx) || ctx.verzonden.has(item.templateId))
      .map((item) => item.templateId),
  );
  return openTemplateIds.filter((id) => !geldig.has(id) && !ctx.verzonden.has(id));
}

export interface ReadinessIssue {
  code: string;
  oorzaak: string;
  eigenaar: Eigenaar;
  deadline: string | null;
  actie: string;
}

export interface Readiness {
  uitkomst: 'gereed' | 'actie_vereist';
  issues: ReadinessIssue[];
}

export function berekenReadiness(input: {
  status: BoekingStatus;
  start: string;
  vandaag: string;
  verhuurtype: string;
  publicatieTrigger: PublicatieTrigger;
  inhoudStatus: InhoudStatus;
  gepubliceerd: boolean;
  aanbetalingOntvangen: boolean;
  aanbetalingVerplicht: boolean;
  gastheerAanwezig: boolean;
  praktischeInformatie: boolean;
  dagmailVerzonden: boolean;
  openIncidenten: number;
}): Readiness {
  if (input.status !== 'definitief' && input.status !== 'afgerond') {
    return { uitkomst: 'actie_vereist', issues: [] };
  }
  const issues: ReadinessIssue[] = [];
  if (input.aanbetalingVerplicht && !input.aanbetalingOntvangen) {
    issues.push({
      code: 'betaling',
      oorzaak: 'Aanbetaling is niet ontvangen.',
      eigenaar: 'finance',
      deadline: input.vandaag,
      actie: 'Controleer de betaling en registreer hem eenmalig.',
    });
  }
  if (contentVereist(input.publicatieTrigger) && input.inhoudStatus !== 'goedgekeurd') {
    const wachtBeoordeling = inhoudWachtOpBeoordeling(input.inhoudStatus);
    issues.push({
      code: 'content',
      oorzaak: wachtBeoordeling ? 'Content wacht op beoordeling.' : 'Content is nog niet compleet goedgekeurd.',
      eigenaar: wachtBeoordeling ? 'bestuur' : 'klant',
      deadline: voegDagenToe(input.start, wachtBeoordeling ? -56 : -84),
      actie: wachtBeoordeling ? 'Keur de content goed of vraag een wijziging.' : 'Vraag de ontbrekende content uit.',
    });
  }
  if (contentVereist(input.publicatieTrigger) && input.inhoudStatus === 'goedgekeurd' && !input.gepubliceerd) {
    issues.push({
      code: 'publicatie',
      oorzaak: 'Goedgekeurde content staat nog niet online.',
      eigenaar: 'bestuur',
      deadline: input.start,
      actie: 'Publiceer de activiteit.',
    });
  }
  if (gastheerVereist(input.verhuurtype, input.publicatieTrigger) && !input.gastheerAanwezig) {
    issues.push({
      code: 'gastheer',
      oorzaak: 'Er is geen gastheer gekoppeld.',
      eigenaar: 'planning',
      deadline: voegDagenToe(input.start, -28),
      actie: 'Koppel een gastheer.',
    });
  }
  if (input.vandaag >= voegDagenToe(input.start, -28) && !input.praktischeInformatie && contentVereist(input.publicatieTrigger)) {
    issues.push({
      code: 'praktisch',
      oorzaak: 'Praktische informatie ontbreekt.',
      eigenaar: 'klant',
      deadline: voegDagenToe(input.start, -28),
      actie: 'Vraag de praktische gegevens op.',
    });
  }
  if (input.vandaag >= voegDagenToe(input.start, -2) && !input.dagmailVerzonden) {
    issues.push({
      code: 'dagcommunicatie',
      oorzaak: 'Laatste daginformatie is nog niet verzonden.',
      eigenaar: 'systeem',
      deadline: voegDagenToe(input.start, -2),
      actie: 'Verstuur de daginformatie.',
    });
  }
  if (input.openIncidenten > 0) {
    issues.push({
      code: 'incident',
      oorzaak: 'Er staat een incident of open nazorgactie open.',
      eigenaar: 'bestuur',
      deadline: null,
      actie: 'Rond het incident af voordat het dossier sluit.',
    });
  }
  return { uitkomst: issues.length === 0 ? 'gereed' : 'actie_vereist', issues };
}

export function magAutomatischSluiten(input: { openIncidenten: number; openTaken: number }): {
  ok: boolean;
  reden: string;
} {
  if (input.openIncidenten > 0) {
    return { ok: false, reden: 'Een open incident houdt het dossier open.' };
  }
  if (input.openTaken > 0) {
    return { ok: false, reden: 'Er staan nog open acties op dit dossier.' };
  }
  return { ok: true, reden: 'Geen open incidenten of acties.' };
}

export function mailFoutNaPoging(pogingen: number): { status: 'wachtrij' | 'fout'; dashboardTaak: boolean } {
  return volgendeFoutStatus(pogingen);
}

export { MAX_VERZENDPOGINGEN };
