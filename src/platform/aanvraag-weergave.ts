/**
 * Zichtbare akkoordstatus. Een ontbrekende waarde blijft onbekend.
 * Niet-exposities die vroeger `false` kregen, tonen geen expliciet nee.
 */

export function labelAkkoordVoorwaarden(soort: string, waarde: boolean | null | undefined): 'Ja' | 'Nee' | '-' {
  if (waarde === true) return 'Ja';
  if (waarde === false && soort === 'expositie') return 'Nee';
  return '-';
}
