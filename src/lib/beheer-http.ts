import type { APIContext } from 'astro';
import type { BeheerToegang } from '../platform/autorisatie.ts';

const CANONIEKE_OORSPRONGEN = ['https://kerkjepersingen.nl', 'https://www.kerkjepersingen.nl'];

function voegOriginToe(doelen: Set<string>, waarde: string | null | undefined): void {
  if (!waarde) return;
  try {
    doelen.add(new URL(waarde).origin);
  } catch {
    /* geen bruikbare url */
  }
}

/**
 * Eigen formulier, ook achter de Vercel-proxy.
 * Daar is request.url soms een intern adres, terwijl de browser Origin
 * het publieke domein stuurt. Een vreemde site blijft geweigerd.
 */
export function toegestaneOorsprongen(request: Request): Set<string> {
  const doelen = new Set<string>(CANONIEKE_OORSPRONGEN);
  voegOriginToe(doelen, request.url);

  const host = request.headers.get('host')?.split(',')[0]?.trim();
  if (host) {
    doelen.add(`https://${host}`);
    doelen.add(`http://${host}`);
  }

  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
  if (forwardedHost) doelen.add(`${forwardedProto}://${forwardedHost}`);

  return doelen;
}

export function zelfdeOorsprong(request: Request): boolean {
  const oorsprong = request.headers.get('origin');
  let bron = oorsprong;
  if (!bron) {
    const referer = request.headers.get('referer');
    if (!referer) return request.method === 'GET' || request.method === 'HEAD';
    try {
      bron = new URL(referer).origin;
    } catch {
      return false;
    }
  }
  return toegestaneOorsprongen(request).has(bron);
}

export function loginRedirect(context: APIContext, nextPad?: string): Response {
  const doel = new URL('/beheer/login', context.url);
  const next = nextPad ?? context.url.pathname + context.url.search;
  if (next && next !== '/beheer/login') doel.searchParams.set('next', next);
  return context.redirect(doel.pathname + doel.search);
}

export function beheerWeigering(
  soort: BeheerToegang,
  alsJson: boolean,
  opties: { previewStop?: boolean } = {},
): Response {
  const teksten: Record<BeheerToegang, { status: number; titel: string; tekst: string }> = {
    ok: { status: 200, titel: '', tekst: '' },
    login: { status: 401, titel: 'Niet ingelogd', tekst: 'Log in om /beheer te openen.' },
    disabled: { status: 403, titel: 'Account gedeactiveerd', tekst: 'Dit account kan niet meer inloggen.' },
    verborgen: { status: 403, titel: 'Geen toegang', tekst: 'Deze module is voor jou verborgen.' },
    alleen_lezen: { status: 403, titel: 'Alleen lezen', tekst: 'Je mag deze gegevens zien, niet wijzigen.' },
    preview: { status: 403, titel: 'Previewmodus', tekst: 'Wijzigingen zijn uitgeschakeld zolang je als een andere gebruiker kijkt.' },
  };
  const keuze = teksten[soort];
  if (alsJson) {
    return new Response(JSON.stringify({ fout: soort, melding: keuze.tekst }), {
      status: keuze.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }

  return new Response(
    `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${keuze.titel} — Beheer</title>
  <style>
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
      background:#faf8f3; color:#1a1a1a; font-family:Georgia,serif; text-align:center; padding:2rem; }
    h1 { font-size:1.6rem; margin:0 0 .75rem; }
    p { margin:0; color:#4a4a44; max-width:28rem; line-height:1.5; }
    a { display:inline-block; margin-top:1.5rem; color:#4a5235; font-weight:600; }
  </style>
</head>
<body>
  <main>
    <h1>${keuze.titel}</h1>
    <p>${keuze.tekst}</p>
    <a href="/beheer/">Naar het dashboard</a>
    ${
      opties.previewStop
        ? `<form method="post" action="/api/beheer/view-as" style="margin-top:1rem">
      <input type="hidden" name="actie" value="stop" />
      <button type="submit" style="font:inherit;background:#4a5235;color:#faf8f3;border:0;border-radius:4px;padding:.6rem 1rem;cursor:pointer">Terug naar Super Admin</button>
    </form>`
        : ''
    }
  </main>
</body>
</html>`,
    {
      status: keuze.status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    },
  );
}

/**
 * Redirects uit Response.redirect hebben een onwijzigbare headerlijst.
 * Zonder kopie gooit het zetten van Cache-Control en eindigt Annuleer op HTTP 500.
 */
export function metBeheerHeaders(response: Response, extra?: Headers): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  headers.set('Cache-Control', 'no-store');
  extra?.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') headers.append(key, value);
    else headers.set(key, value);
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
