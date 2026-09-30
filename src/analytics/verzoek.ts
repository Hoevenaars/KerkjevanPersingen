import { isEvidenteAutomation } from './bot.ts';
import { classificeerApparaat, isDeviceType } from './device.ts';
import { normaliseerPad } from './pad.ts';
import { externeReferrerHost } from './referrer.ts';
import type { AnalyticsConfig, PageViewInsert, PageViewOntwerp } from './types.ts';

const PAGE_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const gezien = new WeakSet<Request>();

export interface PlanInvoer {
  request: Request;
  pathname: string;
  status: number;
  contentType: string | null;
  config: AnalyticsConfig;
}

function isPrefetch(request: Request): boolean {
  const doel = [
    request.headers.get('purpose'),
    request.headers.get('sec-purpose'),
    request.headers.get('x-purpose'),
    request.headers.get('x-moz'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (doel.includes('prefetch') || doel.includes('preview')) return true;
  if (request.headers.get('x-middleware-prefetch') === '1') return true;

  const dest = request.headers.get('sec-fetch-dest');
  if (dest && dest !== 'document') return true;
  const mode = request.headers.get('sec-fetch-mode');
  if (mode && mode !== 'navigate') return true;
  return false;
}

export function naarInsert(ontwerp: PageViewOntwerp, config: AnalyticsConfig): PageViewInsert | null {
  if (!ontwerp.path.startsWith('/') || ontwerp.path.length > 300) return null;
  if (!PAGE_KEY.test(ontwerp.pageKey) || ontwerp.pageKey.length > 80) return null;
  if (!config.supportedLocales.includes(ontwerp.locale) || ontwerp.locale.length > 12) return null;
  if (!isDeviceType(ontwerp.deviceType)) return null;
  if (ontwerp.referrerHost !== null) {
    if (ontwerp.referrerHost.length < 1 || ontwerp.referrerHost.length > 253) return null;
  }
  return {
    path: ontwerp.path,
    page_key: ontwerp.pageKey,
    locale: ontwerp.locale,
    device_type: ontwerp.deviceType,
    referrer_host: ontwerp.referrerHost,
  };
}

/**
 * Eén normaal documentverzoek → hoogstens één ontwerp.
 * Een tweede aanroep met hetzelfde Request-object levert niets op
 * (rerender, dubbele middleware-aanroep).
 */
export function planPageview(invoer: PlanInvoer): PageViewOntwerp | null {
  if (gezien.has(invoer.request)) return null;

  const ontwerp = ontwerpPageview(invoer);
  if (!ontwerp) return null;
  gezien.add(invoer.request);
  return ontwerp;
}

/** Zelfde regels, zonder deduplicatie. Bedoeld voor tests van de classificatie. */
export function ontwerpPageview(invoer: PlanInvoer): PageViewOntwerp | null {
  if (invoer.request.method !== 'GET') return null;
  if (invoer.status !== 200) return null;
  const type = (invoer.contentType ?? '').toLowerCase();
  if (!type.includes('text/html')) return null;
  if (isPrefetch(invoer.request)) return null;

  const userAgent = invoer.request.headers.get('user-agent');
  if (isEvidenteAutomation(userAgent)) return null;

  const path = normaliseerPad(invoer.pathname);
  if (!path) return null;
  const pageKey = invoer.config.resolvePageKey(path);
  if (!pageKey || !PAGE_KEY.test(pageKey)) return null;
  const locale = invoer.config.resolveLocale(path);
  if (!locale || !invoer.config.supportedLocales.includes(locale)) return null;

  const ontwerp: PageViewOntwerp = {
    path,
    pageKey,
    locale,
    deviceType: classificeerApparaat(userAgent),
    referrerHost: externeReferrerHost(invoer.request.headers.get('referer'), invoer.config),
  };
  return naarInsert(ontwerp, invoer.config) ? ontwerp : null;
}
