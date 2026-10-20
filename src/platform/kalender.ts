/**
 * Kalenderbezetting (FO §20, §32–§34).
 *
 * Twee kalenders:
 * - Intern: aanvraag, optie, optie verlopen, definitief, intern, afgerond.
 * - Publiek: alleen Vrij of Bezet. Geen namen, geen type, geen finance.
 *
 * Deze hulp is de oude projectie voor migratievergelijking.
 * De live verhuurkalender gebruikt public.publieke_bezetting. Die telt
 * optie, optie_verlopen, definitief, migratie_vastgelegd, interne blokkades
 * en activiteiten met zichtbaarheid publiek of bezet als bezet.
 * Zichtbaarheid "bezet" blijft de kalender blokkeren zolang er geen expliciete
 * annulering in lokale_override staat. Alleen de levenscyclus op geannuleerd
 * zetten is daar niet genoeg voor.
 * Een losse aanvraag, een geannuleerde boeking en een afgeronde boeking niet.
 *
 * `huidigeBezetteDagen` vergelijkt nog met de oude Sanity-zichtbaarheid.
 * De website leest die functie niet als bron voor verhuurbezetting.
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
  if (treffers.some((item) => item.status === 'definitief' || item.status === 'migratie_vastgelegd')) {
    return 'definitief';
  }
  if (treffers.some((item) => item.status === 'interne_blokkade')) return 'interne_activiteit';
  if (treffers.some((item) => item.status === 'optie')) return 'optie';
  if (treffers.some((item) => item.status === 'optie_verlopen')) return 'optie_verlopen';
  if (treffers.some((item) => item.status === 'aanvraag' || item.status === 'migratie_aanvraag')) {
    return 'aanvraag';
  }
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
 * Legacy-vergelijking met de oude Sanity-kalender.
 * Dit is niet de live verhuurbezetting. Die staat in public.publieke_bezetting.
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
