/**
 * Vriendenbestand (FO §54–§55).
 *
 * Bestaand e-mailadres opnieuw aangemeld → bestaande profiel heractiveren,
 * geen duplicaat. Export alleen Super Admin.
 */

import type { GebruikerRechten, VriendFrequentie } from './types.ts';
import { magLezen, magSchrijven, magVriendenExporteren } from './rechten.ts';

export interface VriendProfiel {
  id: string;
  email: string;
  actief: boolean;
  frequentie: VriendFrequentie;
}

export function normaliseerEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function aanmeldActie(
  bestaand: Pick<VriendProfiel, 'actief'> | null,
): 'aanmaken' | 'heractiveren' | 'ongewijzigd' {
  if (!bestaand) return 'aanmaken';
  if (!bestaand.actief) return 'heractiveren';
  return 'ongewijzigd';
}

export function magVriendenBekijken(rechten: GebruikerRechten): boolean {
  return magLezen(rechten, 'vrienden');
}

export function magVriendenWijzigen(rechten: GebruikerRechten): boolean {
  return magSchrijven(rechten, 'vrienden');
}

export function magExport(rechten: GebruikerRechten): boolean {
  return magVriendenExporteren(rechten);
}
