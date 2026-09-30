/**
 * Supabase-adapter voor de generieke analyticskern.
 * Service role blijft server-side. Ontbrekende configuratie of een mislukte
 * insert stopt de publieke site niet.
 */

import { aggregeerPageviews } from '../analytics/aggregate.ts';
import { isDeviceType } from '../analytics/device.ts';
import type { PageViewInsert, PageViewOntwerp, PageViewRecord, Periode, WebsiteTrafficStats } from '../analytics/types.ts';
import { naarInsert } from '../analytics/verzoek.ts';
import { maakBeheerAdminClient } from '../lib/supabase.ts';
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

export async function getWebsiteTrafficStats(periode: Periode): Promise<VerkeerResultaat> {
  try {
    const admin = maakBeheerAdminClient();
    if (!admin) return { ok: false, reden: 'niet-gekoppeld' };

    const rijen: PageViewRecord[] = [];
    let afgekapt = false;
    for (let vanaf = 0; vanaf < MAX_RIJEN; vanaf += PAGINA) {
      const { data, error } = await admin
        .from('page_views')
        .select('created_at,path,page_key,locale,device_type,referrer_host')
        .gte('created_at', periode.vanaf.toISOString())
        .lt('created_at', periode.totExclusief.toISOString())
        .order('created_at', { ascending: true })
        .range(vanaf, vanaf + PAGINA - 1);
      if (error) {
        logAnalytics(error.code ?? 'select');
        return { ok: false, reden: 'mislukt' };
      }
      for (const rij of data ?? []) {
        const record = naarRecord(rij);
        if (record) rijen.push(record);
      }
      if (!data || data.length < PAGINA) break;
      if (vanaf + PAGINA >= MAX_RIJEN) afgekapt = true;
    }

    return { ok: true, stats: aggregeerPageviews(rijen, periode, kerkjeAnalytics), afgekapt };
  } catch {
    logAnalytics('select');
    return { ok: false, reden: 'mislukt' };
  }
}

export type { PageViewInsert };
