/**
 * Misbruikrem in het geheugen van één serverinstantie.
 * Los van de pageview-tabel: de sleutel (tijdelijk requestadres) wordt niet opgeslagen.
 * Zelfde grens als de formulierlimiter: dit stopt simpel misbruik, geen verdeelde aanval.
 */

export interface VensterOpties {
  vensterMs: number;
  maxPerSleutel: number;
  maxGlobaal: number;
}

const GLOBAAL = '\0globaal';

export const ANALYTICS_VENSTER: VensterOpties = {
  vensterMs: 10 * 60 * 1000,
  maxPerSleutel: 80,
  maxGlobaal: 600,
};

const staat = new Map<string, number[]>();

function bump(huidig: Map<string, number[]>, sleutel: string, nu: number, vensterMs: number, max: number): boolean {
  const vers = (huidig.get(sleutel) ?? []).filter((tijdstip) => nu - tijdstip < vensterMs);
  if (vers.length >= max) {
    huidig.set(sleutel, vers);
    return true;
  }
  vers.push(nu);
  huidig.set(sleutel, vers);
  return false;
}

/** True = deze registratie laten vallen. De website zelf blijft bereikbaar. */
export function blokeerInVenster(
  huidig: Map<string, number[]>,
  sleutel: string,
  nu: number,
  opties: VensterOpties,
): boolean {
  if (huidig.size > 4000) {
    for (const [key, tijden] of huidig) {
      const vers = tijden.filter((tijdstip) => nu - tijdstip < opties.vensterMs);
      if (vers.length === 0) huidig.delete(key);
      else huidig.set(key, vers);
    }
  }
  if (bump(huidig, GLOBAAL, nu, opties.vensterMs, opties.maxGlobaal)) return true;
  return bump(huidig, sleutel, nu, opties.vensterMs, opties.maxPerSleutel);
}

export function analyticsTeVaak(sleutel: string, nu = Date.now()): boolean {
  return blokeerInVenster(staat, sleutel || 'zonder-adres', nu, ANALYTICS_VENSTER);
}
