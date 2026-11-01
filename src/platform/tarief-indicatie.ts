/**
 * Korte tariefregel voor het aanvraagformulier.
 * De keuze van de regel blijft `kiesTarief` in finance.ts.
 */

import type { Tariefregel } from './finance.ts';

export function formatTariefBedrag(bedrag: number): string {
  if (Number.isInteger(bedrag)) return String(bedrag);
  return bedrag.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function tariefIndicatie(regel: Tariefregel | null): string {
  if (!regel || regel.prijstype === 'op_aanvraag' || regel.bedrag == null) {
    return regel ? 'op aanvraag' : '';
  }
  const bedrag = formatTariefBedrag(regel.bedrag);
  if (regel.prijstype === 'vanaf') return `vanaf €${bedrag}`;
  return `€${bedrag}`;
}
