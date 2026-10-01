/**
 * Zichtbaarheid van Sanity-activiteiten in de Supabase-agenda.
 * De publieke site toont alleen zichtbaarheid=publiek, daarna nog toonVanafMaanden.
 * Bezet en verborgen blijven buiten die agenda.
 */

import type { InhoudStatus } from '../platform/continuiteit.ts';
import type { PublicatieTrigger } from '../platform/types.ts';

export const CONTENTSTATUSSEN = [
  'niet_aangeleverd',
  'aangeleverd',
  'in_beoordeling',
  'goedgekeurd',
  'aanpassing_nodig',
] as const;

export type ContentstatusBeheer = (typeof CONTENTSTATUSSEN)[number];

export type Publicatiestatus = 'publiek' | 'bezet' | 'verborgen';

export interface AgendaBron {
  zichtbaarheid?: Publicatiestatus | null;
  gepubliceerd: boolean;
  inhoudStatus: InhoudStatus;
  eind: string;
  trigger: string;
  geannuleerd?: boolean;
  contentstatus?: string | null;
  soort?: string | null;
  titel?: string | null;
  korteOmschrijving?: string | null;
  volledigeOmschrijving?: string | null;
  hoofdafbeelding?: string | null;
}

export interface WebsitePoort {
  zichtbaarheid?: Publicatiestatus | null;
  geannuleerd?: boolean;
  contentstatus?: string | null;
  soort?: string | null;
  titel?: string | null;
  korteOmschrijving?: string | null;
  volledigeOmschrijving?: string | null;
  hoofdafbeelding?: string | null;
}

export function maandenVanTrigger(trigger: string): string | undefined {
  const maanden: Record<string, string> = {
    uiterlijk_1_maand: '1',
    uiterlijk_2_maanden: '2',
    uiterlijk_3_maanden: '3',
    uiterlijk_6_maanden: '6',
    uiterlijk_9_maanden: '9',
    uiterlijk_12_maanden: '12',
  };
  return maanden[trigger];
}

export function contentStatusVanInhoud(status: InhoudStatus): 'ontbreekt' | 'gevraagd' | 'ontvangen' | 'goedgekeurd' | undefined {
  if (status === 'niet_gestart') return 'ontbreekt';
  if (status === 'gevraagd') return 'gevraagd';
  if (status === 'ingediend' || status === 'wijziging_gevraagd') return 'ontvangen';
  if (status === 'goedgekeurd') return 'goedgekeurd';
  if (status === 'niet_vereist') return undefined;
  return undefined;
}

const SANITY_CONTENT: Record<string, ContentstatusBeheer> = {
  ontbreekt: 'niet_aangeleverd',
  niet_gestart: 'niet_aangeleverd',
  niet_aangeleverd: 'niet_aangeleverd',
  gevraagd: 'niet_aangeleverd',
  aangeleverd: 'aangeleverd',
  ingediend: 'aangeleverd',
  ontvangen: 'in_beoordeling',
  in_beoordeling: 'in_beoordeling',
  goedgekeurd: 'goedgekeurd',
  afgewezen: 'aanpassing_nodig',
  wijziging_gevraagd: 'aanpassing_nodig',
  aanpassing_nodig: 'aanpassing_nodig',
};

/** Sanity-contentstatus naar de bestuursstatus. Leeg blijft leeg, zodat legacy-agenda niet verschuift. */
export function contentstatusVanSanity(waarde: unknown): ContentstatusBeheer | null {
  if (waarde == null || waarde === '') return null;
  return SANITY_CONTENT[String(waarde)] ?? null;
}

const TRIGGER_VAN_MAANDEN: Record<string, string> = {
  '1': 'uiterlijk_1_maand',
  '2': 'uiterlijk_2_maanden',
  '3': 'uiterlijk_3_maanden',
  '6': 'uiterlijk_6_maanden',
  '9': 'uiterlijk_9_maanden',
  '12': 'uiterlijk_12_maanden',
};

/** Sanity toonVanafMaanden naar de bestaande publicatie_trigger. Leeg betekent: niet overschrijven. */
export function triggerVanToonVanaf(waarde: unknown): string | null {
  if (waarde == null || waarde === '') return null;
  return TRIGGER_VAN_MAANDEN[String(waarde)] ?? null;
}

/**
 * Websitepoort zonder publicatietiming.
 * Zonder contentstatus blijft de huidige regel: zichtbaarheid publiek is genoeg.
 * Een gezet contentstatus-veld telt pas mee als het goedgekeurd is.
 * Een expositie met goedgekeurde content heeft titel, beide teksten en een hoofdafbeelding nodig.
 */
export function magOpWebsiteZonderTiming(rij: WebsitePoort): boolean {
  if (rij.geannuleerd) return false;
  if (rij.zichtbaarheid !== 'publiek') return false;
  if (rij.contentstatus == null || rij.contentstatus === '') return true;
  if (rij.contentstatus !== 'goedgekeurd') return false;
  if ((rij.soort || 'expositie') !== 'expositie') return true;
  return Boolean(
    rij.titel?.trim()
    && rij.korteOmschrijving?.trim()
    && rij.volledigeOmschrijving?.trim()
    && rij.hoofdafbeelding?.trim(),
  );
}

/** Publiek en bezet blokkeren. Verborgen en geannuleerd niet. */
export function blokkeertBeschikbaarheid(input: {
  zichtbaarheid?: string | null;
  geannuleerd?: boolean;
}): boolean {
  if (input.geannuleerd) return false;
  return input.zichtbaarheid === 'publiek' || input.zichtbaarheid === 'bezet';
}

/** Bronset van de publieke agenda, nog zonder toonVanaf-venster. */
export function hoortOpPubliekeAgenda(rij: AgendaBron, vandaag: string): boolean {
  if (rij.eind < vandaag) return false;
  if (rij.geannuleerd) return false;
  if (rij.trigger === 'niet_publiceren') return false;
  if (rij.zichtbaarheid === 'verborgen' || rij.zichtbaarheid === 'bezet') return false;
  if (rij.contentstatus && rij.contentstatus !== 'goedgekeurd') return false;
  if (rij.contentstatus === 'goedgekeurd' && (rij.soort || 'expositie') === 'expositie') {
    const compleet = Boolean(
      rij.titel?.trim()
      && rij.korteOmschrijving?.trim()
      && rij.volledigeOmschrijving?.trim()
      && rij.hoofdafbeelding?.trim(),
    );
    if (!compleet) return false;
  }
  if (rij.zichtbaarheid === 'publiek') return true;
  return rij.gepubliceerd && rij.inhoudStatus === 'goedgekeurd';
}

export function directeFotoUrl(source: unknown): string | null {
  if (typeof source !== 'string') return null;
  if (/^https?:\/\//.test(source) || source.startsWith('/')) return source;
  return null;
}

export function triggerIsBekend(trigger: string): trigger is PublicatieTrigger {
  return (
    trigger === 'zodra_content_compleet' ||
    trigger === 'uiterlijk_1_maand' ||
    trigger === 'uiterlijk_2_maanden' ||
    trigger === 'uiterlijk_3_maanden' ||
    trigger === 'uiterlijk_6_maanden' ||
    trigger === 'uiterlijk_9_maanden' ||
    trigger === 'uiterlijk_12_maanden' ||
    trigger === 'niet_publiceren'
  );
}
