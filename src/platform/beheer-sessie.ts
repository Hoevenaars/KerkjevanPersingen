/**
 * Sessie- en View-as-User-model voor /beheer.
 * Pure functies: geen I/O, zodat securitytests zonder Supabase kunnen.
 */

import type { AccountStatus, GebruikerFunctie } from './referentie-gebruikers.ts';
import type { GebruikerRechten, ModuleSleutel, Rechtniveau } from './types.ts';
import { MODULES } from './modules.ts';

export const VIEW_AS_COOKIE = 'beheer_view_as';
export const LAST_ACTIVE_INTERVAL_MS = 5 * 60 * 1000;

export interface BeheerProfiel {
  id: string;
  email: string;
  naam: string;
  functie: GebruikerFunctie | null;
  status: AccountStatus;
  isSuperAdmin: boolean;
  actief: boolean;
  lastActiveAt: string | null;
}

export interface BeheerSessie {
  gebruiker: BeheerProfiel;
  rechten: GebruikerRechten;
  effectieveRechten: GebruikerRechten;
  viewAs: BeheerProfiel | null;
  bron: 'supabase' | 'basic';
}

export function rechtenVanRijen(
  isSuperAdmin: boolean,
  rijen: Iterable<{ module: string; niveau: string }>,
): GebruikerRechten {
  const perModule: GebruikerRechten['perModule'] = {};
  for (const rij of rijen) {
    if (!MODULES.includes(rij.module as ModuleSleutel)) continue;
    if (rij.niveau !== 'verborgen' && rij.niveau !== 'lezen' && rij.niveau !== 'schrijven') continue;
    perModule[rij.module as ModuleSleutel] = rij.niveau as Rechtniveau;
  }
  return { isSuperAdmin, perModule };
}

export function effectieveRechten(actor: GebruikerRechten, viewAs: GebruikerRechten | null): GebruikerRechten {
  return viewAs ?? actor;
}

export function magViewAsStarten(actor: GebruikerRechten): boolean {
  return actor.isSuperAdmin;
}

export function lastActiveMoetBijwerken(laatst: string | null | undefined, nu = Date.now()): boolean {
  if (!laatst) return true;
  const stamp = Date.parse(laatst);
  if (Number.isNaN(stamp)) return true;
  return nu - stamp >= LAST_ACTIVE_INTERVAL_MS;
}

export function magAccountActiveren(status: AccountStatus): boolean {
  return status === 'invited' || status === 'disabled';
}

export function magAccountDeactiveren(status: AccountStatus): boolean {
  return status === 'active' || status === 'invited';
}

export function nieuweStatusNaDeactiveren(): AccountStatus {
  return 'disabled';
}

export function nieuweStatusNaReactiveren(hadOoitSessie: boolean): AccountStatus {
  return hadOoitSessie ? 'active' : 'invited';
}

export function magSuperAdminVlagZetten(actor: GebruikerRechten, gewenst: boolean, doelIsSuperAdmin: boolean): boolean {
  if (gewenst === doelIsSuperAdmin) return true;
  return actor.isSuperAdmin;
}

export function beheerModus(sessie: BeheerSessie, module: ModuleSleutel | null): 'schrijven' | 'lezen' | 'preview' {
  if (sessie.viewAs) return 'preview';
  if (!module) return 'lezen';
  return sessie.effectieveRechten.isSuperAdmin || sessie.effectieveRechten.perModule[module] === 'schrijven'
    ? 'schrijven'
    : 'lezen';
}
