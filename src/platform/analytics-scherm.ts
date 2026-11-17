/**
 * Keuzes voor het analyticscherm: periode, filters en links.
 * De telling zelf staat in `src/analytics`.
 */

import { isDeviceType } from '../analytics/device.ts';
import { leesVerkeerPeriode, ymdInTijdzone } from '../analytics/periode.ts';
import type { DeviceType, Periode, VerkeerSelectie, WebsiteTrafficStats } from '../analytics/types.ts';

export const ANALYTICS_HREF = '/beheer/analytics/';

export interface AnalyticsScherm {
  periode: Periode;
  eigen: boolean;
  ongeldigePeriode: boolean;
  selectie: VerkeerSelectie;
  vandaag: string;
}

export interface AnalyticsWijziging {
  periode?: 7 | 30 | 90;
  van?: string;
  tot?: string;
  pagina?: string | null;
  apparaat?: DeviceType | null;
  bron?: string | null;
  herkomst?: string | null;
  wisFilters?: boolean;
}

export function leesSelectie(params: URLSearchParams): VerkeerSelectie {
  const selectie: VerkeerSelectie = {};
  const pagina = params.get('pagina') ?? '';
  if (/^[a-z0-9-]{1,80}$/.test(pagina)) selectie.pageKey = pagina;
  const apparaat = params.get('apparaat') ?? '';
  if (isDeviceType(apparaat)) selectie.deviceType = apparaat;
  const bron = (params.get('bron') ?? '').toLowerCase();
  if (bron === 'direct' || (/^[a-z0-9.-]{1,253}$/.test(bron) && bron.includes('.'))) selectie.bron = bron;
  const herkomst = params.get('herkomst') ?? '';
  if (/^[\p{L}\p{N} .()_-]{1,80}$/u.test(herkomst)) selectie.bronLabel = herkomst;
  return selectie;
}

export function leesAnalyticsScherm(params: URLSearchParams, nu: Date, timeZone: string): AnalyticsScherm {
  const van = params.get('van');
  const tot = params.get('tot');
  const keuze = leesVerkeerPeriode({ periode: params.get('periode'), van, tot }, nu, timeZone);
  return {
    periode: keuze.periode,
    eigen: keuze.eigen,
    ongeldigePeriode: Boolean(van?.trim() || tot?.trim()) && !keuze.eigen,
    selectie: leesSelectie(params),
    vandaag: ymdInTijdzone(nu, timeZone),
  };
}

export function analyticsHref(scherm: AnalyticsScherm, wijziging: AnalyticsWijziging = {}, actie = ANALYTICS_HREF): string {
  const params = new URLSearchParams();
  const wis = wijziging.wisFilters === true;
  const pagina = wis ? undefined : wijziging.pagina === null ? undefined : (wijziging.pagina ?? scherm.selectie.pageKey);
  const apparaat = wis ? undefined : wijziging.apparaat === null ? undefined : (wijziging.apparaat ?? scherm.selectie.deviceType);
  const kiestHerkomst = wijziging.herkomst !== undefined && wijziging.herkomst !== null;
  const kiestBron = wijziging.bron !== undefined && wijziging.bron !== null;
  const herkomst = wis || kiestBron || wijziging.herkomst === null ? undefined : (wijziging.herkomst ?? scherm.selectie.bronLabel);
  const bron = wis || kiestHerkomst || wijziging.bron === null ? undefined : (wijziging.bron ?? scherm.selectie.bron);

  if (wijziging.van && wijziging.tot) {
    params.set('van', wijziging.van);
    params.set('tot', wijziging.tot);
  } else if (wijziging.periode) {
    if (wijziging.periode !== 30) params.set('periode', String(wijziging.periode));
  } else if (scherm.eigen) {
    params.set('van', scherm.periode.van);
    params.set('tot', scherm.periode.tot);
  } else if (scherm.periode.dagen !== 30) {
    params.set('periode', String(scherm.periode.dagen));
  }

  if (pagina) params.set('pagina', pagina);
  if (apparaat) params.set('apparaat', apparaat);
  if (bron) params.set('bron', bron);
  if (herkomst) params.set('herkomst', herkomst);
  const query = params.toString();
  const basis = actie.endsWith('/') ? actie : `${actie}/`;
  return query ? `${basis}?${query}` : basis;
}

export function filterOpties(stats: WebsiteTrafficStats): {
  paginas: { pageKey: string; label: string }[];
  bronnen: { waarde: string; label: string; hosts: (string | null)[] }[];
} {
  return {
    paginas: stats.paginas.map((pagina) => ({ pageKey: pagina.pageKey, label: pagina.label })),
    bronnen: bundelVerwijzers(stats.verwijzers).map((bron) => ({
      waarde: bron.label,
      label: bron.label,
      hosts: bron.hosts,
    })),
  };
}

export function heeftFilter(selectie: VerkeerSelectie): boolean {
  return Boolean(selectie.pageKey || selectie.deviceType || selectie.bron || selectie.bronLabel);
}

export interface GebundeldeBron {
  label: string;
  pageviews: number;
  aandeel: number;
  hosts: (string | null)[];
}

/** google.com en google.nl blijven één Google. Het aandeel telt over de meegegeven rijen. */
export function bundelVerwijzers(
  verwijzers: readonly { host: string | null; label: string; pageviews: number }[],
): GebundeldeBron[] {
  const totaal = verwijzers.reduce((som, rij) => som + rij.pageviews, 0);
  const perLabel = new Map<string, GebundeldeBron>();
  for (const rij of verwijzers) {
    const bestaand = perLabel.get(rij.label) ?? { label: rij.label, pageviews: 0, aandeel: 0, hosts: [] };
    bestaand.pageviews += rij.pageviews;
    bestaand.hosts.push(rij.host);
    perLabel.set(rij.label, bestaand);
  }
  return [...perLabel.values()]
    .map((bron) => ({ ...bron, aandeel: aandeelVan(bron.pageviews, totaal) }))
    .sort((a, b) => b.pageviews - a.pageviews || a.label.localeCompare(b.label, 'nl'));
}

/** Percentage tegen de even lange periode ervoor. `toen` 0 blijft zonder percentage. */
export function vergelijking(nu: number, toen: number, dagen: number): { tekst: string; richting: 'meer' | 'minder' | 'gelijk' | 'leeg' } {
  const duur = dagen === 1 ? 'de dag ervoor' : `de ${dagen} dagen ervoor`;
  if (toen <= 0) {
    return nu > 0
      ? { tekst: `Geen weergaven in ${duur}.`, richting: 'leeg' }
      : { tekst: `Geen weergaven in deze periode of in ${duur}.`, richting: 'leeg' };
  }
  const pct = Math.round(((nu - toen) / toen) * 100);
  if (pct === 0) return { tekst: `Gelijk aan ${duur}.`, richting: 'gelijk' };
  if (pct > 0) return { tekst: `${pct}% meer dan ${duur}.`, richting: 'meer' };
  return { tekst: `${Math.abs(pct)}% minder dan ${duur}.`, richting: 'minder' };
}

export function aandeelVan(deel: number, geheel: number): number {
  if (geheel <= 0 || deel <= 0) return 0;
  return Math.round((deel / geheel) * 1000) / 10;
}
