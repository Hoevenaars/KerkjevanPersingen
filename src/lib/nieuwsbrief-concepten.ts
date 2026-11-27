/**
 * Concepten voor de vriendenmail.
 * Een week wordt vier weken voor de verzendwoensdag klaargezet.
 * Verzenden mag pas als dat concept die doorlooptijd heeft gehad.
 * De cron vuurt maandag elke vijf minuten; alleen 10:30 in Amsterdam begint een nieuwe brief.
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

/** Woensdag van de kalenderweek die op deze maandag begint. */
export function woensdagVanWeek(maandag: string): string {
  return voegDagenToe(maandag, 2);
}

/** Eerstvolgende verzendmaandag. Het uur is 10:30 in Amsterdam, zomer en winter. */
export function verzendMoment(vandaag: string): { datum: string; uur: string } {
  let maandag = maandagVanWeekIso(new Date(`${vandaag}T12:00:00Z`));
  if (maandag < vandaag) maandag = voegDagenToe(maandag, 7);
  return { datum: maandag, uur: '10:30' };
}

/** Minuten sinds middernacht in Amsterdam, of null als de klok niet te lezen is. */
function minutenAmsterdam(datum: Date): { datum: string; minuten: number } | null {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(datum);
  const waarde = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const jaar = waarde('year');
  const maand = waarde('month');
  const dag = waarde('day');
  const uur = Number(waarde('hour'));
  const minuut = Number(waarde('minute'));
  if (!jaar || !maand || !dag || Number.isNaN(uur) || Number.isNaN(minuut)) return null;
  return { datum: `${jaar}-${maand}-${dag}`, minuten: uur * 60 + minuut };
}

const START_VAN = 10 * 60 + 30;
const START_TOT = 11 * 60 + 20;
/** Een lopende ronde mag door tot 15:00 Amsterdam. */
const VERVOLG_TOT = 15 * 60;

function maandagKlok(datum: Date): { minuten: number } | null {
  const klok = minutenAmsterdam(datum);
  if (!klok) return null;
  const maandag = maandagVanWeekIso(new Date(`${klok.datum}T12:00:00Z`));
  if (klok.datum !== maandag) return null;
  return klok;
}

/**
 * De vijf-minutencron dekt winter- en zomertijd.
 * Een nieuwe brief begint tussen 10:30 en 11:20 Amsterdam.
 * 11:30 is het uur erna en begint geen nieuwe brief.
 */
export function isNieuwsbriefVerzendmoment(datum: Date): boolean {
  const klok = maandagKlok(datum);
  if (!klok) return false;
  return klok.minuten >= START_VAN && klok.minuten <= START_TOT;
}

/** Zelfde maandag, na 11:20, tot 15:00. Alleen om een lopende verzending af te maken. */
export function isNieuwsbriefVervolgmoment(datum: Date): boolean {
  const klok = maandagKlok(datum);
  if (!klok) return false;
  return klok.minuten > START_TOT && klok.minuten <= VERVOLG_TOT;
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
 * Het concept is op tijd als het op of vóór de woensdag min de doorlooptijd bestond.
 * Zonder aanmaakdatum is het niet op tijd.
 */
export function conceptIsOpTijd(
  aangemaaktOp: string | undefined,
  weekMaandag: string,
  dagen = NIEUWSBRIEF_DOORLOOPTIJD_DAGEN,
): boolean {
  const aangemaakt = (aangemaaktOp ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(aangemaakt) || !/^\d{4}-\d{2}-\d{2}$/.test(weekMaandag)) return false;
  return aangemaakt <= voegDagenToe(woensdagVanWeek(weekMaandag), -dagen);
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
  if (woensdagVanWeek(input.week) < input.vandaag) return 'Concept';
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
