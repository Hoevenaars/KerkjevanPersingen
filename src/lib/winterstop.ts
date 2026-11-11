/**
 * Vaste publieke tekst en foto van een winterstop.
 * De periode komt uit de blokkades; de woorden en de foto op de site blijven deze.
 */

export const WINTERSTOP_TITEL = 'Winterstop';

export const WINTERSTOP_TEKST =
  'In deze periode krijgt het kerkje de rust en aandacht die nodig zijn voor onderhoud en behoud. Vanaf het voorjaar openen de deuren weer voor nieuwe exposities, ontmoetingen en bijzondere momenten.';

export const WINTERSTOP_FOTO = '/foto/winterstop.jpg';
export const WINTERSTOP_FOTO_ABSOLUUT = `https://kerkjepersingen.nl${WINTERSTOP_FOTO}`;
export const WINTERSTOP_FOTO_ALT = 'Het kerkje van Persingen in de sneeuw, met de vlag in top';

export function winterstopFoto(opties: { absoluut?: boolean } = {}): string {
  return opties.absoluut ? WINTERSTOP_FOTO_ABSOLUUT : WINTERSTOP_FOTO;
}

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
