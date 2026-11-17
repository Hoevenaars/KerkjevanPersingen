/**
 * Supabase-adapter voor de generieke analyticskern.
 * Service role blijft server-side. Ontbrekende configuratie of een mislukte
 * insert stopt de publieke site niet.
 */

import { aggregeerPageviews } from '../analytics/aggregate.ts';
import { isDeviceType } from '../analytics/device.ts';
import type { PageViewInsert, PageViewOntwerp, PageViewRecord, Periode, VerkeerSelectie, WebsiteTrafficStats } from '../analytics/types.ts';
import { naarInsert } from '../analytics/verzoek.ts';
import { maakBeheerAdminClient } from '../lib/supabase.ts';
import { filterOpties } from './analytics-scherm.ts';
import { kerkjeAnalytics } from './analytics-config.ts';

const PAGINA = 1000;
const MAX_RIJEN = 50_000;

let laatsteLog = 0;

function logAnalytics(code: string): void {
  const nu = Date.now();
  if (nu - laatsteLog < 60_000) return;
  laatsteLog = nu;
  console.error('[analytics]', code);
}

export function wachtNietOp(context: object, taak: Promise<void>): void {
  const veilig = taak.catch(() => {
    logAnalytics('achtergrond');
  });
  const drager = context as {
    waitUntil?: (lopend: Promise<unknown>) => void;
    locals?: { waitUntil?: (lopend: Promise<unknown>) => void };
  };
  const wacht = drager.locals?.waitUntil ?? drager.waitUntil;
  try {
    if (typeof wacht === 'function') wacht(veilig);
    else {
      const vercel = (globalThis as Record<symbol, { get?: () => { waitUntil?: (lopend: Promise<unknown>) => void } }>)[
        Symbol.for('@vercel/request-context')
      ]?.get?.();
      vercel?.waitUntil?.(veilig);
    }
  } catch {
    logAnalytics('waitUntil');
  }
  void veilig;
}

export async function bewaarPageview(ontwerp: PageViewOntwerp): Promise<void> {
  const rij = naarInsert(ontwerp, kerkjeAnalytics);
  if (!rij) return;
  try {
    const admin = maakBeheerAdminClient();
    if (!admin) return;
    const { error } = await admin.from('page_views').insert(rij);
    if (error) logAnalytics(error.code ?? 'insert');
  } catch {
    logAnalytics('insert');
  }
}

export type VerkeerResultaat =
  | { ok: true; stats: WebsiteTrafficStats; afgekapt: boolean }
  | { ok: false; reden: 'niet-gekoppeld' | 'mislukt' };

function naarRecord(rij: {
  created_at: string;
  path: string;
  page_key: string;
  locale: string;
  device_type: string;
  referrer_host: string | null;
}): PageViewRecord | null {
  if (!isDeviceType(rij.device_type)) return null;
  return {
    createdAt: rij.created_at,
    path: rij.path,
    pageKey: rij.page_key,
    locale: rij.locale,
    deviceType: rij.device_type,
    referrerHost: rij.referrer_host,
  };
}

async function leesPageviews(
  admin: NonNullable<ReturnType<typeof maakBeheerAdminClient>>,
  vanaf: Date,
  totExclusief: Date,
): Promise<{ rijen: PageViewRecord[]; afgekapt: boolean } | { fout: true }> {
  const rijen: PageViewRecord[] = [];
  let afgekapt = false;
  for (let start = 0; start < MAX_RIJEN; start += PAGINA) {
    const { data, error } = await admin
      .from('page_views')
      .select('created_at,path,page_key,locale,device_type,referrer_host')
      .gte('created_at', vanaf.toISOString())
      .lt('created_at', totExclusief.toISOString())
      .order('created_at', { ascending: true })
      .range(start, start + PAGINA - 1);
    if (error) {
      logAnalytics(error.code ?? 'select');
      return { fout: true };
    }
    for (const rij of data ?? []) {
      const record = naarRecord(rij);
      if (record) rijen.push(record);
    }
    if (!data || data.length < PAGINA) break;
    if (start + PAGINA >= MAX_RIJEN) afgekapt = true;
  }
  return { rijen, afgekapt };
}

export async function getWebsiteTrafficStats(periode: Periode): Promise<VerkeerResultaat> {
  try {
    const admin = maakBeheerAdminClient();
    if (!admin) return { ok: false, reden: 'niet-gekoppeld' };
    const geladen = await leesPageviews(admin, periode.vanaf, periode.totExclusief);
    if ('fout' in geladen) return { ok: false, reden: 'mislukt' };
    return { ok: true, stats: aggregeerPageviews(geladen.rijen, periode, kerkjeAnalytics), afgekapt: geladen.afgekapt };
  } catch {
    logAnalytics('select');
    return { ok: false, reden: 'mislukt' };
  }
}

export type VerkeerOverzicht =
  | {
      ok: true;
      stats: WebsiteTrafficStats;
      vorig: { pageviews: number; gemiddeldPerDag: number };
      ongefilterd: number;
      paginas: { pageKey: string; label: string }[];
      bronnen: { waarde: string; label: string; hosts: (string | null)[] }[];
      afgekapt: boolean;
    }
  | { ok: false; reden: 'niet-gekoppeld' | 'mislukt' };

/** Huidige periode, dezelfde selectie in de periode ervoor, en de filterlijsten van het geheel. */
export async function getWebsiteVerkeer(
  periode: Periode,
  vorige: Periode,
  selectie: VerkeerSelectie = {},
): Promise<VerkeerOverzicht> {
  try {
    const admin = maakBeheerAdminClient();
    if (!admin) return { ok: false, reden: 'niet-gekoppeld' };
    const [huidig, eerder] = await Promise.all([
      leesPageviews(admin, periode.vanaf, periode.totExclusief),
      leesPageviews(admin, vorige.vanaf, vorige.totExclusief),
    ]);
    if ('fout' in huidig || 'fout' in eerder) return { ok: false, reden: 'mislukt' };
    const geheel = aggregeerPageviews(huidig.rijen, periode, kerkjeAnalytics);
    const opties = filterOpties(geheel);
    const vorig = aggregeerPageviews(eerder.rijen, vorige, kerkjeAnalytics, selectie);
    return {
      ok: true,
      stats: aggregeerPageviews(huidig.rijen, periode, kerkjeAnalytics, selectie),
      vorig: { pageviews: vorig.totalen.pageviews, gemiddeldPerDag: vorig.totalen.gemiddeldPerDag },
      ongefilterd: geheel.totalen.pageviews,
      paginas: opties.paginas,
      bronnen: opties.bronnen,
      afgekapt: huidig.afgekapt || eerder.afgekapt,
    };
  } catch {
    logAnalytics('select');
    return { ok: false, reden: 'mislukt' };
  }
}

export type { PageViewInsert };
