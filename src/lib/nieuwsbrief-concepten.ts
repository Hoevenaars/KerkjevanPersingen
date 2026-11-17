/**
 * Concepten voor de vriendenmail.
 * Een week wordt vier weken voor de verzendvrijdag klaargezet.
 * Verzenden mag pas als dat concept die doorlooptijd heeft gehad.
 */

import { voegDagenToe } from '../platform/datum.ts';
import { WINTERSTOP_TEKST } from './winterstop.ts';
import { maandagVanWeekIso } from './week.ts';

export const NIEUWSBRIEF_DOORLOOPTIJD_WEKEN = 4;
export const NIEUWSBRIEF_DOORLOOPTIJD_DAGEN = NIEUWSBRIEF_DOORLOOPTIJD_WEKEN * 7;

export interface ConceptBron {
  titel: string;
  start: string;
  eind: string;
  tekst: string;
  winterstop: boolean;
}

export function vrijdagVanWeek(maandag: string): string {
  return voegDagenToe(maandag, 4);
}

/** Eerstvolgende verzendvrijdag, met het vaste cronuur in Nederlandse tijd. */
export function verzendMoment(vandaag: string): { vrijdag: string; uur: string } {
  const maandag = maandagVanWeekIso(new Date(`${vandaag}T12:00:00Z`));
  let vrijdag = vrijdagVanWeek(maandag);
  if (vrijdag < vandaag) vrijdag = voegDagenToe(vrijdag, 7);
  const uur = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(`${vrijdag}T09:30:00Z`));
  return { vrijdag, uur };
}

/**
 * Onverstuurde weken, met de eerstvolgende bovenaan.
 * Verstuurde weken vallen weg. Voorbije weken staan onder de komende.
 */
export function nieuwsbrievenOpDatum<T extends { week: string; verstuurd: boolean }>(
  brieven: readonly T[],
  vandaag: string,
): T[] {
  const maandag = maandagVanWeekIso(new Date(`${vandaag}T12:00:00Z`));
  const open = brieven.filter((brief) => !brief.verstuurd);
  const komend = open.filter((brief) => brief.week >= maandag).sort((a, b) => a.week.localeCompare(b.week));
  const voorbij = open.filter((brief) => brief.week < maandag).sort((a, b) => b.week.localeCompare(a.week));
  return [...komend, ...voorbij];
}

/** Maandagen van deze week t/m de week die de minimale doorlooptijd verder ligt. */
export function conceptMaandagen(vandaag: string, weken = NIEUWSBRIEF_DOORLOOPTIJD_WEKEN): string[] {
  const start = maandagVanWeekIso(new Date(`${vandaag}T12:00:00Z`));
  return Array.from({ length: weken + 1 }, (_, stap) => voegDagenToe(start, stap * 7));
}

/**
 * Het concept is op tijd als het op of vóór de vrijdag min de doorlooptijd bestond.
 * Zonder aanmaakdatum is het niet op tijd.
 */
export function conceptIsOpTijd(
  aangemaaktOp: string | undefined,
  weekMaandag: string,
  dagen = NIEUWSBRIEF_DOORLOOPTIJD_DAGEN,
): boolean {
  const aangemaakt = (aangemaaktOp ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(aangemaakt) || !/^\d{4}-\d{2}-\d{2}$/.test(weekMaandag)) return false;
  return aangemaakt <= voegDagenToe(vrijdagVanWeek(weekMaandag), -dagen);
}

export function conceptStatusLabel(input: {
  week: string;
  verstuurd: boolean;
  overgeslagen: boolean;
  goedgekeurd?: boolean;
  aangemaaktOp?: string;
  vandaag: string;
}): string {
  if (input.verstuurd) return 'Verstuurd';
  if (input.overgeslagen) return 'Overgeslagen';
  if (input.goedgekeurd) return 'Goedgekeurd';
  if (vrijdagVanWeek(input.week) < input.vandaag) return 'Concept';
  if (!input.aangemaaktOp) return 'Concept';
  return conceptIsOpTijd(input.aangemaaktOp, input.week)
    ? 'Concept, klaar om te versturen'
    : 'Concept, nog binnen de doorlooptijd';
}

function raaktWeek(bron: ConceptBron, maandag: string): boolean {
  const start = bron.start.slice(0, 10);
  const eind = (bron.eind || bron.start).slice(0, 10);
  const zondag = voegDagenToe(maandag, 6);
  return start <= zondag && eind >= maandag;
}

function tekstVan(bron: ConceptBron): string {
  const titel = bron.titel.trim();
  const tekst = bron.tekst.trim();
  if (!tekst) return titel;
  if (titel && tekst.toLowerCase().includes(titel.toLowerCase())) return tekst;
  return titel ? `${titel}. ${tekst}` : tekst;
}

/** Korte tekst uit het publieke programma van die week. Leeg als er niets publiek is. */
export function kortNieuwsVoorConcept(maandag: string, bronnen: readonly ConceptBron[]): string {
  const inWeek = bronnen.filter((bron) => raaktWeek(bron, maandag) && (bron.titel.trim() || bron.tekst.trim()));
  if (inWeek.length === 0) return '';
  if (inWeek.every((bron) => bron.winterstop)) return WINTERSTOP_TEKST;
  return inWeek.filter((bron) => !bron.winterstop).map(tekstVan).filter(Boolean).join('\n\n');
}
