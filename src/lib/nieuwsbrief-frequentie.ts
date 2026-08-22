import { maandagVanWeekIso } from './week.ts';

export type VriendFrequentie = 'wekelijks' | 'tweewekelijks' | 'maandelijks';

export const FREQUENTIE_LABELS: Record<VriendFrequentie, string> = {
  wekelijks: 'Elke week',
  tweewekelijks: 'Elke twee weken',
  maandelijks: 'Eens per maand',
};

const GELDIGE_FREQUENTIES = new Set<string>(Object.keys(FREQUENTIE_LABELS));

export function isGeldigeFrequentie(waarde: string): waarde is VriendFrequentie {
  return GELDIGE_FREQUENTIES.has(waarde);
}

/** ISO-weeknummer (1–53) van de kalenderweek waarin `datum` valt (Amsterdam). */
export function isoWeekNummer(datum: Date): number {
  const maandag = maandagVanWeekIso(datum);
  const d = new Date(`${maandag}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const week1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4, 12, 0, 0));
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86_400_000 - 3 + ((week1.getUTCDay() + 6) % 7)) / 7,
    )
  );
}

/** Vrijdag van de nieuwsbriefverzending in Amsterdam (YYYY-MM-DD). */
function vrijdagAmsterdam(datum: Date): { jaar: number; maand: number; dag: number } {
  const ymd = datum.toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
  const [jaar, maand, dag] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(jaar, maand - 1, dag, 12, 0, 0));
  const weekdag = utc.getUTCDay();
  const naarVrijdag = weekdag <= 5 ? 5 - weekdag : 5 - weekdag + 7;
  utc.setUTCDate(utc.getUTCDate() + naarVrijdag);
  return {
    jaar: utc.getUTCFullYear(),
    maand: utc.getUTCMonth() + 1,
    dag: utc.getUTCDate(),
  };
}

/** Eerste vrijdag van de maand (dag 1–7). */
export function isEersteVrijdagVanMaand(datum: Date): boolean {
  const { dag } = vrijdagAmsterdam(datum);
  return dag <= 7;
}

/**
 * Bepaalt of een vriend de nieuwsbrief van deze verzendronde moet ontvangen.
 * - wekelijks: elke vrijdag
 * - tweewekelijks: om de week (even ISO-weeknummers)
 * - maandelijks: alleen op de eerste vrijdag van de maand
 */
export function ontvangtDezeVerzending(
  frequentie: VriendFrequentie | undefined,
  datum = new Date(),
): boolean {
  const keuze = frequentie ?? 'wekelijks';
  switch (keuze) {
    case 'wekelijks':
      return true;
    case 'tweewekelijks':
      return isoWeekNummer(datum) % 2 === 0;
    case 'maandelijks':
      return isEersteVrijdagVanMaand(datum);
  }
}
