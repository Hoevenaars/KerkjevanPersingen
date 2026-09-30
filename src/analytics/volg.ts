import type { AnalyticsConfig, PageViewInsert, PageViewOntwerp } from './types.ts';
import { naarInsert, planPageview } from './verzoek.ts';

export interface VolgInvoer {
  request: Request;
  pathname: string;
  response: Response;
  config: AnalyticsConfig;
  adresSleutel: string | null;
  rateLimit: (sleutel: string) => boolean;
  schrijf: (ontwerp: PageViewOntwerp) => void;
}

/**
 * Beslist of een afgerond HTTP-antwoord een pageview is en start dan het schrijven.
 * Gooit nooit: een analyticsfout mag het antwoord niet vervangen.
 */
export function volgPubliekePageview(invoer: VolgInvoer): void {
  try {
    const ontwerp = planPageview({
      request: invoer.request,
      pathname: invoer.pathname,
      status: invoer.response.status,
      contentType: invoer.response.headers.get('content-type'),
      config: invoer.config,
    });
    if (!ontwerp) return;
    const sleutel = invoer.adresSleutel?.trim() || 'zonder-adres';
    if (invoer.rateLimit(sleutel)) return;
    invoer.schrijf(ontwerp);
  } catch {
    // Bewust leeg: de publieke pagina is al opgebouwd.
  }
}

export async function registreerPageview(
  ontwerp: PageViewOntwerp,
  config: AnalyticsConfig,
  schrijf: (rij: PageViewInsert) => Promise<void>,
): Promise<'opgeslagen' | 'mislukt' | 'ongeldig'> {
  const rij = naarInsert(ontwerp, config);
  if (!rij) return 'ongeldig';
  try {
    await schrijf(rij);
    return 'opgeslagen';
  } catch {
    return 'mislukt';
  }
}
