import type { AnalyticsConfig } from './types.ts';

const HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

function isEigenHost(host: string, domeinen: readonly string[]): boolean {
  return domeinen.some((domein) => host === domein || host.endsWith(`.${domein}`));
}

/**
 * Externe hostname, of null bij direct verkeer en eigen domeinen.
 * Alleen het domein; pad en query (tokens, zoektermen) gaan niet mee.
 */
export function externeReferrerHost(
  referrer: string | null | undefined,
  config: Pick<AnalyticsConfig, 'ownDomains'>,
): string | null {
  if (!referrer) return null;
  const ruw = referrer.trim();
  if (!ruw || ruw.length > 2000) return null;

  let url: URL;
  try {
    url = new URL(ruw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  let host = url.hostname.toLowerCase();
  if (host.startsWith('www.')) host = host.slice(4);
  if (!host || host.length > 253 || !HOST.test(host)) return null;
  if (isEigenHost(host, config.ownDomains)) return null;
  return host;
}
