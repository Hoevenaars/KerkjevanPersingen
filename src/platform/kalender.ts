/**
 * Kalenderbezetting (FO §20, §32–§34).
 *
 * Twee kalenders:
 * - Intern: aanvraag, optie, optie verlopen, definitief, intern, afgerond.
 * - Publiek: alleen Vrij of Bezet. Geen namen, geen type, geen finance.
 *
 * Publiek Bezet alleen bij:
 *   definitieve boeking, of interne activiteit met blokkeert_verhuurkalender.
 * Een optie blokkeert de publieke kalender niet.
 *
 * `huidigeBezetteDagen` spiegelt de huidige Sanity-logica (zichtbaarheid !=
 * verborgen), zodat later output 1-op-1 vergeleken kan worden zonder de
 * website nu al om te zetten.
 */

import { dagenInPeriode } from './datum.ts';
import type { BoekingStatus, Periode } from './types.ts';

export type InterneKalenderStatus =
  | 'vrij'
  | 'aanvraag'
  | 'optie'
  | 'optie_verlopen'
  | 'definitief'
  | 'interne_activiteit'
  | 'afgerond';

export type PubliekeKalenderStatus = 'vrij' | 'bezet';

export interface BezettingsItem {
  periode: Periode;
  status: BoekingStatus | 'interne_blokkade' | 'aanvraag';
  blokkeertPubliek: boolean;
  zichtbaarheid?: 'verborgen' | 'bezet' | 'publiek';
}

export function blokkeertPubliekeKalender(item: {
  status?: BoekingStatus | 'interne_blokkade' | 'aanvraag';
  blokkeertVerhuurkalender?: boolean;
}): boolean {
  if (item.status === 'definitief') return true;
  if (item.status === 'interne_blokkade' && item.blokkeertVerhuurkalender === true) return true;
  return false;
}

export function publiekeBezetteDagen(items: readonly BezettingsItem[]): Set<string> {
  const dagen = new Set<string>();
  for (const item of items) {
    if (!item.blokkeertPubliek && !blokkeertPubliekeKalender(item)) continue;
    for (const dag of dagenInPeriode(item.periode.start, item.periode.eind)) {
      dagen.add(dag);
    }
  }
  return dagen;
}

export function interneStatusVoorDag(
  dag: string,
  items: readonly BezettingsItem[],
): InterneKalenderStatus {
  const treffers = items.filter(
    (item) => item.periode.start <= dag && dag <= item.periode.eind,
  );
  if (treffers.some((item) => item.status === 'definitief')) return 'definitief';
  if (treffers.some((item) => item.status === 'interne_blokkade')) return 'interne_activiteit';
  if (treffers.some((item) => item.status === 'optie')) return 'optie';
  if (treffers.some((item) => item.status === 'optie_verlopen')) return 'optie_verlopen';
  if (treffers.some((item) => item.status === 'aanvraag')) return 'aanvraag';
  if (treffers.some((item) => item.status === 'afgerond')) return 'afgerond';
  return 'vrij';
}

export function publiekeStatusVoorDag(
  dag: string,
  bezet: ReadonlySet<string>,
): PubliekeKalenderStatus {
  return bezet.has(dag) ? 'bezet' : 'vrij';
}

/**
 * Huidige website-logica, 1-op-1 met Kalender.astro + getBezetteData():
 * alles met zichtbaarheid anders dan "verborgen" telt als bezet, inclusief
 * de hele periode start t/m eind. Opties die in Sanity nog "verborgen"
 * staan, blokkeren dus nu ook niet — totdat het bestuur de zichtbaarheid
 * op "bezet" zet.
 */
export function huidigeBezetteDagen(
  activiteiten: readonly {
    startYmd: string;
    eindYmd?: string;
    zichtbaarheid: 'verborgen' | 'bezet' | 'publiek';
  }[],
): Set<string> {
  const dagen = new Set<string>();
  for (const item of activiteiten) {
    if (item.zichtbaarheid === 'verborgen') continue;
    const eind = item.eindYmd ?? item.startYmd;
    for (const dag of dagenInPeriode(item.startYmd, eind)) dagen.add(dag);
  }
  return dagen;
}
