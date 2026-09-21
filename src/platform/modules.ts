/**
 * Centrale registry van /beheer-modules.
 *
 * Navigatie, permission-editor, route-autorisatie en View as User
 * lezen hieruit. Een nieuwe module hoort alleen hier te worden toegevoegd.
 */

export const BEHEER_MODULES = {
  dashboard: {
    label: 'Dashboard',
    href: '/beheer/',
    groep: 'hoofd',
  },
  aanvragen: {
    label: 'Aanvragen',
    href: '/beheer/aanvragen/',
    groep: 'hoofd',
  },
  boekingen: {
    label: 'Boekingen',
    href: '/beheer/boekingen/',
    groep: 'hoofd',
  },
  kalender: {
    label: 'Kalender',
    href: '/beheer/kalender/',
    groep: 'hoofd',
  },
  agenda: {
    label: 'Agenda',
    href: '/beheer/agenda/',
    groep: 'hoofd',
  },
  planning: {
    label: 'Planning',
    href: '/beheer/planning/',
    groep: 'hoofd',
  },
  relaties: {
    label: 'Relaties',
    href: '/beheer/relaties/',
    groep: 'hoofd',
  },
  finance: {
    label: 'Finance',
    href: '/beheer/finance/',
    groep: 'hoofd',
  },
  vrienden: {
    label: 'Vrienden',
    href: '/beheer/vrienden/',
    groep: 'hoofd',
  },
  nieuwsbrief: {
    label: 'Nieuwsbrief',
    href: '/beheer/nieuwsbrief/',
    groep: 'hoofd',
  },
  templates: {
    label: 'Templates',
    href: '/beheer/instellingen/templates/',
    groep: 'instellingen',
  },
  gebruikers: {
    label: 'Gebruikers',
    href: '/beheer/instellingen/gebruikers/',
    groep: 'instellingen',
  },
  instellingen: {
    label: 'Instellingen',
    href: '/beheer/instellingen/',
    groep: 'instellingen',
  },
} as const;

export type ModuleSleutel = keyof typeof BEHEER_MODULES;
export type ModuleGroep = (typeof BEHEER_MODULES)[ModuleSleutel]['groep'];

export const MODULES = Object.keys(BEHEER_MODULES) as ModuleSleutel[];

export function moduleDefinitie(sleutel: ModuleSleutel) {
  return BEHEER_MODULES[sleutel];
}

export function modulesInGroep(groep: ModuleGroep): ModuleSleutel[] {
  return MODULES.filter((sleutel) => BEHEER_MODULES[sleutel].groep === groep);
}

export const INSTELLINGEN_PAGINAS = [
  { module: 'instellingen', href: '/beheer/instellingen/', label: 'Algemeen' },
  { module: 'instellingen', href: '/beheer/instellingen/verhuur/', label: 'Verhuur' },
  { module: 'instellingen', href: '/beheer/instellingen/finance/', label: 'Finance' },
  { module: 'instellingen', href: '/beheer/instellingen/gastheren/', label: 'Gastheren' },
  { module: 'templates', href: '/beheer/instellingen/templates/', label: 'Templates' },
  { module: 'gebruikers', href: '/beheer/instellingen/gebruikers/', label: 'Gebruikers' },
] as const;

export const SNEL_NIEUW = [
  { module: 'aanvragen', href: '/beheer/aanvragen/', label: 'Aanvraag bekijken' },
  { module: 'relaties', href: '/beheer/relaties/', label: 'Relatie' },
  { module: 'agenda', href: '/beheer/agenda/', label: 'Agenda-item' },
  { module: 'boekingen', href: '/beheer/boekingen/', label: 'Boeking' },
] as const;
