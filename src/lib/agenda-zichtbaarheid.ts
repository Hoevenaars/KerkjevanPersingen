/**
 * Zichtbaarheid van Sanity-activiteiten in de Supabase-agenda.
 * De publieke site toont alleen zichtbaarheid=publiek, daarna nog toonVanafMaanden.
 * Bezet en verborgen blijven buiten die agenda.
 */

import type { InhoudStatus } from '../platform/continuiteit.ts';
import type { PublicatieTrigger } from '../platform/types.ts';

export interface AgendaBron {
  zichtbaarheid?: 'publiek' | 'bezet' | 'verborgen' | null;
  gepubliceerd: boolean;
  inhoudStatus: InhoudStatus;
  eind: string;
  trigger: string;
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

/** Bronset van de publieke agenda, nog zonder toonVanaf-venster. */
export function hoortOpPubliekeAgenda(rij: AgendaBron, vandaag: string): boolean {
  if (rij.eind < vandaag) return false;
  if (rij.trigger === 'niet_publiceren') return false;
  if (rij.zichtbaarheid === 'verborgen' || rij.zichtbaarheid === 'bezet') return false;
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
