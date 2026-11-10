/**
 * Lokale acceptatietest voor /beheer.
 * Alleen astro dev, alleen loopback, alleen de exacte omgevingswaarde.
 * Elke schrijfactie wordt geweigerd. Er wordt geen Supabase-client gemaakt.
 * Zonder die waarde blijft de gewone login staan.
 */

import { pasRolWeergaveToe, type BeheerSessie } from './beheer-sessie.ts';
import { rolUitWeergave, standaardRollen } from './rollen.ts';

export const ACCEPTATIE_WAARDE = 'lokaal';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function acceptatieIsoleert(env: Record<string, unknown> | NodeJS.ProcessEnv = process.env): boolean {
  return env.BEHEER_ACCEPTATIE === ACCEPTATIE_WAARDE && env.NODE_ENV !== 'production';
}

export function acceptatieHost(hostname: string): boolean {
  return LOOPBACK.has(hostname);
}

export interface AcceptatieInvoer {
  dev: boolean;
  env: Record<string, unknown> | NodeJS.ProcessEnv;
  hostname: string;
  methode: string;
  url: URL;
}

export type AcceptatieBesluit =
  | { soort: 'uit' }
  | { soort: 'verboden' }
  | { soort: 'redirect'; naar: string }
  | { soort: 'door'; sessie: BeheerSessie };

function leesMethode(methode: string): boolean {
  const normaal = methode.toUpperCase();
  return normaal === 'GET' || normaal === 'HEAD';
}

export function acceptatieSessie(kijk: string | null): BeheerSessie {
  const rechten = { isSuperAdmin: true, perModule: {} };
  const basis: BeheerSessie = {
    gebruiker: {
      id: 'acceptatie-lokaal',
      email: 'acceptatie@voorbeeld.test',
      naam: 'Acceptatietest',
      functie: null,
      status: 'active',
      isSuperAdmin: true,
      actief: true,
      lastActiveAt: null,
    },
    rechten,
    effectieveRechten: rechten,
    viewAs: null,
    bron: 'supabase',
  };
  const rol = rolUitWeergave(kijk);
  if (!rol) return basis;
  const catalogus = standaardRollen().find((item) => item.slug === rol);
  if (!catalogus) return basis;
  return pasRolWeergaveToe(basis, kijk, catalogus);
}

export function acceptatieBesluit(invoer: AcceptatieInvoer): AcceptatieBesluit {
  if (!invoer.dev || !acceptatieIsoleert(invoer.env) || !acceptatieHost(invoer.hostname)) {
    return { soort: 'uit' };
  }
  if (!leesMethode(invoer.methode)) return { soort: 'verboden' };
  if (invoer.url.searchParams.get('bron') !== 'demo') {
    const params = new URLSearchParams(invoer.url.search);
    params.set('bron', 'demo');
    return { soort: 'redirect', naar: `${invoer.url.pathname}?${params.toString()}` };
  }
  return { soort: 'door', sessie: acceptatieSessie(invoer.url.searchParams.get('kijk')) };
}
