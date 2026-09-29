/**
 * Benoemde beheerdersrollen. Maximaal een kleine vaste groep.
 * De matrix hieronder is bewust leeg (alleen het dashboard): de super admin
 * richt de echte rechten later per rol in. Toegang volgt die matrix, niet de naam.
 */

import { MODULES } from './modules.ts';
import type { ModuleSleutel, Rechtniveau } from './types.ts';

export const ACCOUNT_STATUSSEN = ['invited', 'active', 'disabled'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSSEN)[number];

export const GEBRUIKER_FUNCTIES = ['hans', 'nelleke', 'paul'] as const;
export type GebruikerFunctie = (typeof GEBRUIKER_FUNCTIES)[number];

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

export type RechtenMatrix = Partial<Record<ModuleSleutel, Rechtniveau>>;

export const FUNCTIE_LABELS: Record<GebruikerFunctie, string> = {
  hans: 'Hans',
  nelleke: 'Nelleke',
  paul: 'Paul',
};

/** Startpunt tot de super admin de rol zelf inricht. Dashboard blijft zichtbaar zodat je kunt terugschakelen. */
function legeRol(): RechtenMatrix {
  const matrix: RechtenMatrix = {};
  for (const module of MODULES) {
    matrix[module] = module === 'dashboard' ? 'lezen' : 'verborgen';
  }
  return matrix;
}

export const REFERENTIE_RECHTEN: Record<GebruikerFunctie, RechtenMatrix> = {
  hans: legeRol(),
  nelleke: legeRol(),
  paul: legeRol(),
};

export function rolWeergaveId(rol: GebruikerFunctie): string {
  return `rol:${rol}`;
}

export function rolUitWeergave(waarde: string | null | undefined): GebruikerFunctie | null {
  if (!waarde?.startsWith('rol:')) return null;
  const rol = waarde.slice('rol:'.length);
  return isGebruikerFunctie(rol) ? rol : null;
}

export function isGebruikerFunctie(waarde: string): waarde is GebruikerFunctie {
  return (GEBRUIKER_FUNCTIES as readonly string[]).includes(waarde);
}

export function isAccountStatus(waarde: string): waarde is AccountStatus {
  return (ACCOUNT_STATUSSEN as readonly string[]).includes(waarde);
}

export function rechtenVoorFunctie(functie: string | null | undefined): RechtenMatrix {
  if (!functie || !isGebruikerFunctie(functie)) return {};
  return { ...REFERENTIE_RECHTEN[functie] };
}
