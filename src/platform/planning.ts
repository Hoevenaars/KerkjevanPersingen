/**
 * Operationeel overzicht voor /beheer/planning.
 * Boeking, publieke activiteit, Sanity-bron en interne bezetting blijven aparte records.
 * Dezelfde periode wordt één keer getoond.
 */

import type { Publicatiestatus } from '../lib/agenda-zichtbaarheid.ts';

export const PLANNING_FILTERS = [
  'alles',
  'deze_maand',
  'opties',
  'definitief',
  'publiek',
  'website',
  'niet_openbaar',
  'geannuleerd',
] as const;

export type PlanningFilter = (typeof PLANNING_FILTERS)[number];

export const PLANNING_TYPEN = ['expositie', 'bruiloft', 'concert', 'diverse'] as const;

export interface PlanningInvoer {
  sleutel: string;
  href: string;
  start: string;
  eind: string;
  titel: string;
  type: string;
  status: string;
  publicatiestatus: Publicatiestatus | null;
  zichtbaarOpWebsite: boolean;
  huurder?: string;
  gastbegeleiders?: string;
  bron: 'boeking' | 'activiteit' | 'sanity' | 'intern';
  geannuleerd?: boolean;
  boekingId?: string;
  legacyId?: string;
  aandacht?: string;
}

export interface PlanningItem extends PlanningInvoer {
  gastbegeleiders: string;
  huurder: string;
  aandacht: string;
  geannuleerd: boolean;
}

const PRIORITEIT: Record<PlanningInvoer['bron'], number> = {
  boeking: 0,
  activiteit: 1,
  sanity: 2,
  intern: 3,
};

function overlapt(a: { start: string; eind: string }, b: { start: string; eind: string }): boolean {
  return a.start <= b.eind && b.start <= a.eind;
}

function zelfdeEvenement(a: PlanningInvoer, b: PlanningInvoer): boolean {
  if (a.boekingId && a.boekingId === b.boekingId) return true;
  if (a.legacyId && a.legacyId === b.legacyId) return true;
  if (!overlapt(a, b)) return false;
  if (a.bron === 'boeking' && b.bron === 'boeking') return false;
  if (a.bron === 'intern' || b.bron === 'intern') return a.start === b.start && a.eind === b.eind;
  return true;
}

export function dedupliceerPlanning(items: readonly PlanningInvoer[]): PlanningInvoer[] {
  const gesorteerd = [...items].sort(
    (a, b) => PRIORITEIT[a.bron] - PRIORITEIT[b.bron] || a.start.localeCompare(b.start) || a.titel.localeCompare(b.titel),
  );
  const gehouden: PlanningInvoer[] = [];
  for (const item of gesorteerd) {
    if (gehouden.some((ander) => zelfdeEvenement(ander, item))) continue;
    gehouden.push(item);
  }
  return gehouden;
}

function maandBereik(vandaag: string): { van: string; tot: string } {
  const [jaar, maand] = vandaag.split('-').map(Number);
  const van = `${vandaag.slice(0, 7)}-01`;
  const laatste = new Date(Date.UTC(jaar, maand, 0, 12)).getUTCDate();
  const tot = `${vandaag.slice(0, 7)}-${String(laatste).padStart(2, '0')}`;
  return { van, tot };
}

function pastFilter(item: PlanningInvoer, filter: PlanningFilter, vandaag: string): boolean {
  if (filter === 'deze_maand') {
    const maand = maandBereik(vandaag);
    return overlapt(item, { start: maand.van, eind: maand.tot });
  }
  if (filter === 'opties') return item.status === 'optie';
  if (filter === 'definitief') return item.status === 'definitief';
  if (filter === 'publiek') return item.publicatiestatus === 'publiek';
  if (filter === 'website') return item.zichtbaarOpWebsite;
  if (filter === 'niet_openbaar') return !item.zichtbaarOpWebsite;
  return true;
}

export function stelPlanning(
  items: readonly PlanningInvoer[],
  opties: { vandaag: string; filter?: PlanningFilter; type?: string },
): PlanningItem[] {
  const filter = opties.filter ?? 'alles';
  const type = opties.type && opties.type !== 'alles' ? opties.type : '';
  return dedupliceerPlanning(items)
    .filter((item) => (filter === 'geannuleerd' ? Boolean(item.geannuleerd) : !item.geannuleerd))
    .filter((item) => item.eind >= opties.vandaag)
    .filter((item) => pastFilter(item, filter, opties.vandaag))
    .filter((item) => !type || item.type === type)
    .sort((a, b) => a.start.localeCompare(b.start) || a.titel.localeCompare(b.titel))
    .map((item) => ({
      ...item,
      huurder: item.huurder ?? '',
      gastbegeleiders: item.gastbegeleiders ?? '',
      aandacht: item.aandacht ?? '',
      geannuleerd: Boolean(item.geannuleerd),
    }));
}
