/**
 * De reserve lijst onder Contacten.
 * Alleen relaties met het vinkje. De datum komt uit reservelijst_sinds.
 */

import { ymdAmsterdam } from '../lib/datum.ts';

export interface ReservelijstBron {
  id: string;
  naam: string;
  email: string;
  telefoon: string;
  reservelijst: boolean;
  reservelijstSinds?: string;
}

export interface ReservelijstRegel {
  id: string;
  naam: string;
  email: string;
  telefoon: string;
  /** Kalenderdag in Amsterdam, of leeg als de datum niet is vastgelegd. */
  sinds: string;
}

export function reservelijstDatum(waarde: string | null | undefined): string {
  const ruw = (waarde ?? '').trim();
  if (!ruw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(ruw)) return ruw;
  if (Number.isNaN(Date.parse(ruw))) return '';
  return ymdAmsterdam(ruw);
}

export function reservelijstRegels(relaties: readonly ReservelijstBron[]): ReservelijstRegel[] {
  return relaties
    .filter((relatie) => relatie.reservelijst)
    .map((relatie) => ({
      id: relatie.id,
      naam: relatie.naam,
      email: relatie.email,
      telefoon: relatie.telefoon,
      sinds: reservelijstDatum(relatie.reservelijstSinds),
    }))
    .sort((a, b) => {
      if (a.sinds && b.sinds && a.sinds !== b.sinds) return a.sinds < b.sinds ? -1 : 1;
      if (a.sinds !== b.sinds) return a.sinds ? -1 : 1;
      return a.naam.localeCompare(b.naam, 'nl');
    });
}
