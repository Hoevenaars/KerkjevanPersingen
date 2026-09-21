/**
 * Referentierechten van de voormalige demo-gebruikers.
 * Alleen als uitgangspunt bij uitnodigen (functie vult de matrix voor).
 * Toegang wordt nooit op deze labels gebaseerd.
 */

import type { ModuleSleutel, Rechtniveau } from './types.ts';

export const ACCOUNT_STATUSSEN = ['invited', 'active', 'disabled'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSSEN)[number];

export const GEBRUIKER_FUNCTIES = ['operationeel', 'finance', 'planning'] as const;
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
  operationeel: 'Operationeel',
  finance: 'Finance',
  planning: 'Planning',
};

export const REFERENTIE_RECHTEN: Record<GebruikerFunctie, RechtenMatrix> = {
  operationeel: {
    dashboard: 'lezen',
    aanvragen: 'schrijven',
    boekingen: 'schrijven',
    kalender: 'schrijven',
    agenda: 'schrijven',
    planning: 'lezen',
    finance: 'lezen',
    nieuwsbrief: 'schrijven',
    vrienden: 'schrijven',
    relaties: 'schrijven',
    templates: 'schrijven',
    gebruikers: 'verborgen',
    instellingen: 'lezen',
  },
  finance: {
    dashboard: 'lezen',
    aanvragen: 'verborgen',
    boekingen: 'lezen',
    kalender: 'lezen',
    agenda: 'verborgen',
    planning: 'verborgen',
    finance: 'schrijven',
    nieuwsbrief: 'verborgen',
    vrienden: 'verborgen',
    relaties: 'verborgen',
    templates: 'verborgen',
    gebruikers: 'verborgen',
    instellingen: 'lezen',
  },
  planning: {
    dashboard: 'lezen',
    aanvragen: 'verborgen',
    boekingen: 'lezen',
    kalender: 'lezen',
    agenda: 'lezen',
    planning: 'schrijven',
    finance: 'verborgen',
    nieuwsbrief: 'verborgen',
    vrienden: 'verborgen',
    relaties: 'lezen',
    templates: 'verborgen',
    gebruikers: 'verborgen',
    instellingen: 'lezen',
  },
};

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
