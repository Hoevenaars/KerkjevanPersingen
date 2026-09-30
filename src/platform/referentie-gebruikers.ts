/**
 * Accountstatus en de lege startmatrix voor een rol.
 * De rollen zelf (naam + rechten) staan in de rolcatalogus, niet meer vast in code.
 */

import { isRolSlug, legeMatrix, rolUitWeergave as rolUitSlug, rolWeergaveId as rolId } from './rollen.ts';
import type { RechtenMatrix } from './rollen.ts';

export type { RechtenMatrix };

export const ACCOUNT_STATUSSEN = ['invited', 'active', 'disabled'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSSEN)[number];

export const GEBRUIKER_FUNCTIES = ['hans', 'nelleke', 'paul'] as const;
export type StandaardRol = (typeof GEBRUIKER_FUNCTIES)[number];
/** Slug van een rol. Nieuwe namen zijn toegestaan; die staan niet vast in code. */
export type GebruikerFunctie = string;

export const AUDIT_ACTIES = [
  'USER_INVITED',
  'USER_ACTIVATED',
  'USER_DISABLED',
  'USER_REACTIVATED',
  'PERMISSIONS_CHANGED',
  'VIEW_AS_STARTED',
  'VIEW_AS_ENDED',
] as const;
export type AuditActie = (typeof AUDIT_ACTIES)[number];

export const FUNCTIE_LABELS: Record<StandaardRol, string> = {
  hans: 'Hans',
  nelleke: 'Nelleke',
  paul: 'Paul',
};

export const REFERENTIE_RECHTEN: Record<StandaardRol, RechtenMatrix> = {
  hans: legeMatrix(),
  nelleke: legeMatrix(),
  paul: legeMatrix(),
};

export function rolWeergaveId(rol: string): string {
  return rolId(rol);
}

export function rolUitWeergave(waarde: string | null | undefined): string | null {
  return rolUitSlug(waarde);
}

export function isGebruikerFunctie(waarde: string): waarde is GebruikerFunctie {
  return isRolSlug(waarde);
}

export function isAccountStatus(waarde: string): waarde is AccountStatus {
  return (ACCOUNT_STATUSSEN as readonly string[]).includes(waarde);
}

export function rechtenVoorFunctie(functie: string | null | undefined): RechtenMatrix {
  if (!functie || !isRolSlug(functie)) return {};
  if ((GEBRUIKER_FUNCTIES as readonly string[]).includes(functie)) {
    return { ...REFERENTIE_RECHTEN[functie as StandaardRol] };
  }
  return legeMatrix();
}

export function labelVoorFunctie(functie: string | null | undefined): string {
  if (!functie) return 'Geen rol';
  if ((GEBRUIKER_FUNCTIES as readonly string[]).includes(functie)) {
    return FUNCTIE_LABELS[functie as StandaardRol];
  }
  return functie;
}
