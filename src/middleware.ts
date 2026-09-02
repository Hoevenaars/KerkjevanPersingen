import type { MiddlewareHandler } from 'astro';
import { isBeheerEnabled, beheerUitResponse } from './platform/beheer-gate';

/**
 * Afscherming tot livegang.
 *
 * Vervangt het eerdere wachtwoordscherm in client-side JavaScript. Daar stond het
 * wachtwoord leesbaar in de paginabron; iedereen die "paginabron bekijken" koos, kwam
 * erlangs zonder in te loggen. Dit draait server-side: de HTML wordt pas verstuurd
 * nadat de credentials kloppen (03_SECURITY_PRIVACY.md §3 en §4).
 *
 * Aan/uit via twee omgevingsvariabelen:
 *   SITE_PASSWORD gezet, LIVE_VANAF niet gezet/nog niet bereikt -> afgeschermd + noindex
 *   SITE_PASSWORD gezet, LIVE_VANAF bereikt of gepasseerd        -> automatisch open
 *   SITE_PASSWORD leeg                                          -> altijd open
 *
 * LIVE_VANAF is een ISO-datumtijd, bijv. "2026-08-08T00:00:00+02:00" voor middernacht
 * Nederlandse tijd. Zodra de serverklok dat moment bereikt, valt de afscherming en de
 * noindex-header automatisch weg — niemand hoeft er 's nachts voor op te blijven om
 * handmatig een omgevingsvariabele te verwijderen.
 *
 * Werkt de datum-check onverwacht niet (bijv. verkeerde tijdzone-notatie), dan blijft
 * de site gewoon afgeschermd — de veilige kant om in te falen.
 */

const USER = 'kerkje';

function isLive(): boolean {
  const liveVanaf = import.meta.env.LIVE_VANAF ?? process.env.LIVE_VANAF;
  if (!liveVanaf) return false;

  const moment = new Date(liveVanaf);
  if (Number.isNaN(moment.getTime())) {
    console.error('[middleware] LIVE_VANAF kan niet worden gelezen als datum:', liveVanaf);
    return false;
  }

  return new Date() >= moment;
}

export const onRequest: MiddlewareHandler = async (context, next) => {
  const pad = context.url.pathname;

  // Cron heeft een eigen Bearer-secret; basic-auth zou die aanroep altijd 401 geven.
  // Afmelden moet ook zonder sitewachtwoord werken — dat is een AVG-plicht.
  if (pad.startsWith('/api/cron/') || pad.startsWith('/vrienden/afmelden')) {
    return next();
  }

  if (pad.startsWith('/beheer') && !isBeheerEnabled()) {
    return beheerUitResponse();
  }

  const password = import.meta.env.SITE_PASSWORD ?? process.env.SITE_PASSWORD;

  if (!password || isLive()) {
    return next();
  }

  const header = context.request.headers.get('authorization');
  const expected = 'Basic ' + btoa(`${USER}:${password}`);

  if (header !== expected) {
    return new Response('Deze site is nog niet openbaar.', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Kerkje van Persingen", charset="UTF-8"',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }

  const response = await next();
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
};
