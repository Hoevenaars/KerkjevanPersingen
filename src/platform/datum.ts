/**
 * Kalenderdata voor het beheerplatform, altijd als YYYY-MM-DD.
 *
 * Een datum is een kalenderdag, geen tijdstip. Rekenen gebeurt op UTC-middag
 * van die kalenderdag, zodat zomer- en wintertijd geen dagverschuiving geven.
 * Geplande communicatie gebruikt Europe/Amsterdam (FO §61).
 */

import { TIJDZONE } from './types.ts';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function isYmd(waarde: string): boolean {
  return YMD.test(waarde);
}

export function utcMiddag(ymd: string): Date {
  if (!isYmd(ymd)) {
    throw new Error(`Ongeldige datum: ${waardeOfLeeg(ymd)}`);
  }
  const [jaar, maand, dag] = ymd.split('-').map(Number);
  return new Date(Date.UTC(jaar, maand - 1, dag, 12, 0, 0));
}

function waardeOfLeeg(waarde: string): string {
  return waarde || '(leeg)';
}

/** 0 = zondag … 6 = zaterdag, op de kalenderdag zelf. */
export function weekdag(ymd: string): number {
  return utcMiddag(ymd).getUTCDay();
}

export function isZaterdag(ymd: string): boolean {
  return weekdag(ymd) === 6;
}

export function isZondag(ymd: string): boolean {
  return weekdag(ymd) === 0;
}

export function isWeekend(ymd: string): boolean {
  const dag = weekdag(ymd);
  return dag === 0 || dag === 6;
}

export function isDoordeweeks(ymd: string): boolean {
  return !isWeekend(ymd);
}

export function dagenVerschil(start: string, eind: string): number {
  return Math.round((utcMiddag(eind).getTime() - utcMiddag(start).getTime()) / 86_400_000);
}

export function voegDagenToe(ymd: string, dagen: number): string {
  const d = utcMiddag(ymd);
  d.setUTCDate(d.getUTCDate() + dagen);
  return d.toISOString().slice(0, 10);
}

export function dagenInPeriode(start: string, eind: string): string[] {
  if (eind < start) return [];
  const resultaat: string[] = [];
  let loper = start;
  let veiligheid = 0;
  while (loper <= eind && veiligheid < 400) {
    resultaat.push(loper);
    loper = voegDagenToe(loper, 1);
    veiligheid++;
  }
  return resultaat;
}

export function periodesOverlappen(
  a: { start: string; eind: string },
  b: { start: string; eind: string },
): boolean {
  return a.start <= b.eind && a.eind >= b.start;
}

/** Zaterdag + zondag van het weekend waarin `ymd` valt. */
export function weekendVan(ymd: string): { zaterdag: string; zondag: string } {
  const dag = weekdag(ymd);
  if (dag === 6) return { zaterdag: ymd, zondag: voegDagenToe(ymd, 1) };
  if (dag === 0) return { zaterdag: voegDagenToe(ymd, -1), zondag: ymd };
  const naarZaterdag = 6 - dag;
  const zaterdag = voegDagenToe(ymd, naarZaterdag);
  return { zaterdag, zondag: voegDagenToe(zaterdag, 1) };
}

export function ymdInAmsterdam(datum: Date): string {
  return datum.toLocaleDateString('en-CA', { timeZone: TIJDZONE });
}

export function formatWeekendLabel(zaterdag: string, zondag: string, locale = 'nl-NL'): string {
  const za = utcMiddag(zaterdag);
  const zo = utcMiddag(zondag);
  const dagZa = za.getUTCDate();
  const dagZo = zo.getUTCDate();
  const maandZa = za.toLocaleDateString(locale, { month: 'long', timeZone: 'UTC' });
  const maandZo = zo.toLocaleDateString(locale, { month: 'long', timeZone: 'UTC' });
  const jaarZa = za.getUTCFullYear();
  const jaarZo = zo.getUTCFullYear();

  if (maandZa === maandZo && jaarZa === jaarZo) {
    return `${dagZa} en ${dagZo} ${maandZa} ${jaarZa}`;
  }
  return `${dagZa} ${maandZa} ${jaarZa} en ${dagZo} ${maandZo} ${jaarZo}`;
}
