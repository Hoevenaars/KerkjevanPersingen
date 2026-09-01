/**
 * Aanvraagstatussen en overgang naar optie (FO §16–§17).
 *
 * Een aanvraag wordt nooit automatisch gesloten. Ook na een boeking blijft
 * hij bestaan tot een domeinverantwoordelijke hem sluit.
 */

import type { AanvraagStatus, GebruikerRechten } from './types.ts';
import { isDomeinVerantwoordelijke } from './rechten.ts';

export const AANVRAAG_OVERGANGEN: Record<AanvraagStatus, readonly AanvraagStatus[]> = {
  nieuw: ['in_behandeling', 'goedgekeurd', 'afgewezen', 'gesloten'],
  in_behandeling: ['goedgekeurd', 'afgewezen', 'gesloten', 'nieuw'],
  goedgekeurd: ['gesloten'],
  afgewezen: ['gesloten', 'in_behandeling'],
  gesloten: [],
};

export function magAanvraagWijzigen(rechten: GebruikerRechten): boolean {
  return isDomeinVerantwoordelijke(rechten, 'aanvragen');
}

export function magAanvraagSluiten(rechten: GebruikerRechten): boolean {
  return magAanvraagWijzigen(rechten);
}

export function magStatusZetten(
  van: AanvraagStatus,
  naar: AanvraagStatus,
  rechten: GebruikerRechten,
): { ok: boolean; melding?: string } {
  if (!magAanvraagWijzigen(rechten)) {
    return { ok: false, melding: 'Alleen een domeinverantwoordelijke mag een aanvraag beoordelen.' };
  }
  if (naar === 'gesloten' && !magAanvraagSluiten(rechten)) {
    return { ok: false, melding: 'Alleen een gebruiker met schrijfrechten mag een aanvraag sluiten.' };
  }
  if (!AANVRAAG_OVERGANGEN[van].includes(naar)) {
    return { ok: false, melding: `Van "${van}" naar "${naar}" is niet toegestaan.` };
  }
  return { ok: true };
}

/** Goedkeuring maakt een boeking met status Optie. De aanvraag blijft open. */
export function gevolgGoedkeuring(): {
  boekingStatus: 'optie';
  aanvraagBlijftOpen: true;
} {
  return { boekingStatus: 'optie', aanvraagBlijftOpen: true };
}
