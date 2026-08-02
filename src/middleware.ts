import type { MiddlewareHandler } from 'astro';

/**
 * Afscherming tot livegang.
 *
 * Vervangt het eerdere wachtwoordscherm in client-side JavaScript. Daar stond het
 * wachtwoord leesbaar in de paginabron; iedereen die "paginabron bekijken" koos, kwam
 * erlangs zonder in te loggen. Dit draait server-side: de HTML wordt pas verstuurd
 * nadat de credentials kloppen (03_SECURITY_PRIVACY.md §3 en §4).
 *
 * Aan/uit via één omgevingsvariabele:
 *   SITE_PASSWORD gezet   -> site afgeschermd + noindex
 *   SITE_PASSWORD leeg    -> site open, geen noindex
 *
 * BIJ LIVEGANG: verwijder SITE_PASSWORD in Vercel. Verder is er geen actie nodig;
 * de noindex-header verdwijnt automatisch mee. Dat is bewust zo gekoppeld, omdat een
 * achtergebleven noindex de meest voorkomende en duurste livegang-fout is.
 */

const USER = 'kerkje';

export const onRequest: MiddlewareHandler = async (context, next) => {
  const password = import.meta.env.SITE_PASSWORD ?? process.env.SITE_PASSWORD;

  if (!password) {
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
