/**
 * Nieuwsbriefregels (FO §56–§60).
 *
 * Test naar mezelf telt niet als verzending.
 * "Deze keer niet verzenden" vervangt geannuleerd.
 */

import type { GebruikerRechten } from './types.ts';
import { magSchrijven } from './rechten.ts';

export type NieuwsbriefStatus = 'concept' | 'overgeslagen' | 'verstuurd';

export function naTestVerzending(huidige: NieuwsbriefStatus): NieuwsbriefStatus {
  return huidige;
}

export function isEchteVerzending(soort: 'test' | 'live'): boolean {
  return soort === 'live';
}

export function magOverslaan(rechten: GebruikerRechten): boolean {
  return magSchrijven(rechten, 'nieuwsbrief');
}

export function overslaan(huidige: NieuwsbriefStatus): {
  ok: boolean;
  nieuweStatus?: 'overgeslagen';
  melding?: string;
} {
  if (huidige === 'verstuurd') {
    return { ok: false, melding: 'Een al verstuurde nieuwsbrief kan niet meer worden overgeslagen.' };
  }
  return { ok: true, nieuweStatus: 'overgeslagen' };
}

export function naLiveVerzending(): { status: 'verstuurd'; teltAlsVerzonden: true } {
  return { status: 'verstuurd', teltAlsVerzonden: true };
}
