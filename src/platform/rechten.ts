/**
 * Modulaire rechten (FO §4–§8, §55).
 *
 * Geen starre rollen. Per module: verborgen / lezen / schrijven.
 * Super Admin (Nick) heeft altijd volledige toegang en kan niet beperkt worden.
 * Schrijfrecht binnen een module = domeinverantwoordelijkheid.
 * Export van vrienden is exclusief Super Admin.
 */

import { MODULES, type GebruikerRechten, type ModuleSleutel, type Rechtniveau } from './types.ts';

const VOLGORDE: Record<Rechtniveau, number> = {
  verborgen: 0,
  lezen: 1,
  schrijven: 2,
};

export function rechtVoor(
  rechten: GebruikerRechten,
  module: ModuleSleutel,
): Rechtniveau {
  if (rechten.isSuperAdmin) return 'schrijven';
  return rechten.perModule[module] ?? 'verborgen';
}

export function magZien(rechten: GebruikerRechten, module: ModuleSleutel): boolean {
  return VOLGORDE[rechtVoor(rechten, module)] >= VOLGORDE.lezen;
}

export function magLezen(rechten: GebruikerRechten, module: ModuleSleutel): boolean {
  return magZien(rechten, module);
}

export function magSchrijven(rechten: GebruikerRechten, module: ModuleSleutel): boolean {
  return rechtVoor(rechten, module) === 'schrijven';
}

/** Schrijfrecht = domeinverantwoordelijke (FO §6). */
export function isDomeinVerantwoordelijke(
  rechten: GebruikerRechten,
  module: ModuleSleutel,
): boolean {
  return magSchrijven(rechten, module);
}

export function zichtbareModules(rechten: GebruikerRechten): ModuleSleutel[] {
  return MODULES.filter((module) => magZien(rechten, module));
}

export function magVriendenExporteren(rechten: GebruikerRechten): boolean {
  return rechten.isSuperAdmin;
}

export function magGebruikersBeheren(rechten: GebruikerRechten): boolean {
  return magSchrijven(rechten, 'gebruikers');
}

/**
 * Super Admin-rechten mogen niet door een andere gebruiker worden beperkt.
 * Alleen een Super Admin zelf (of een technische seed) mag dit veld wijzigen.
 */
export function magSuperAdminWijzigen(
  actor: GebruikerRechten,
  doelIsSuperAdmin: boolean,
): boolean {
  if (!doelIsSuperAdmin) return actor.isSuperAdmin && magGebruikersBeheren(actor);
  return actor.isSuperAdmin;
}

export function magRechtWijzigen(
  actor: GebruikerRechten,
  doel: GebruikerRechten,
): boolean {
  if (doel.isSuperAdmin && !actor.isSuperAdmin) return false;
  return magGebruikersBeheren(actor);
}
