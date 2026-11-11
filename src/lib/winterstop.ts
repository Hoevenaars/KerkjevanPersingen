/**
 * Vaste publieke tekst van een winterstop.
 * De periode komt uit de blokkades; de woorden op de site blijven deze.
 */

export const WINTERSTOP_TITEL = 'Winterstop';

export const WINTERSTOP_TEKST =
  'In deze periode krijgt het kerkje de rust en aandacht die nodig zijn voor onderhoud en behoud. Vanaf het voorjaar openen de deuren weer voor nieuwe exposities, ontmoetingen en bijzondere momenten.';

export function isWinterstop(soort: string | null | undefined): boolean {
  return (soort ?? '').trim().toLowerCase() === 'winterstop';
}

/** Een seizoen is langer dan een weekend. Daarom altijd "t/m", ook binnen één maand. */
export function formatWinterstopDatum(start: string, eind?: string): string {
  const opties: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Amsterdam',
  };
  const begin = new Date(start).toLocaleDateString('nl-NL', opties);
  const slot = new Date(eind ?? start).toLocaleDateString('nl-NL', opties);
  if (begin === slot) return begin;
  return `${begin} t/m ${slot}`;
}
