import type { APIContext } from 'astro';
import type { BeheerToegang } from '../platform/autorisatie.ts';

export function zelfdeOorsprong(request: Request): boolean {
  const oorsprong = request.headers.get('origin');
  if (!oorsprong) {
    const referer = request.headers.get('referer');
    if (!referer) return request.method === 'GET' || request.method === 'HEAD';
    try {
      return new URL(referer).origin === new URL(request.url).origin;
    } catch {
      return false;
    }
  }
  try {
    return oorsprong === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function loginRedirect(context: APIContext, nextPad?: string): Response {
  const doel = new URL('/beheer/login', context.url);
  const next = nextPad ?? context.url.pathname + context.url.search;
  if (next && next !== '/beheer/login') doel.searchParams.set('next', next);
  return context.redirect(doel.pathname + doel.search);
}

export function beheerWeigering(soort: BeheerToegang, alsJson: boolean): Response {
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
