/**
 * Rollenvoorstel voor het bestuur.
 * Dit wordt niet op bestaande accounts toegepast.
 */

import type { RechtenMatrix } from './rollen.ts';

export const ROLVOORSTEL: Record<'hans' | 'nelleke' | 'paul', RechtenMatrix> = {
  hans: {
    dashboard: 'lezen',
    planning: 'schrijven',
    gastheerbeheer: 'schrijven',
    boekingen: 'lezen',
    aanvragen: 'lezen',
    kalender: 'lezen',
    agenda: 'lezen',
  },
  nelleke: {
    dashboard: 'lezen',
    aanvragen: 'schrijven',
    boekingen: 'schrijven',
    relaties: 'schrijven',
    planning: 'lezen',
    agenda: 'lezen',
    kalender: 'lezen',
    templates: 'lezen',
  },
  paul: {
    dashboard: 'lezen',
    finance: 'lezen',
    finance_instellingen: 'lezen',
    boekingen: 'lezen',
  },
};

export const ROLVOORSTEL_TOELICHTING = {
  hans: 'Planning en gastheerbeheer. Geen finance, geen automatiseringen, geen systeembeheer.',
  nelleke: 'Aanvragen, boekingen en relaties. Geen automatiseringen en geen systeembeheer.',
  paul: 'Finance alleen lezen. Geen finance-automatisering en geen schrijven op instellingen.',
} as const;
