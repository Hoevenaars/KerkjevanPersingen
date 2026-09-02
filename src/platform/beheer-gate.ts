import { beheerZichtbaar } from './bron.ts';

function leesOmgeving(): Record<string, unknown> {
  const runtime = typeof process !== 'undefined' ? process.env : undefined;
  const meta = import.meta.env as Record<string, unknown>;
  // Bracket-notatie: Vite mag process.env.BEHEER_ENABLED niet op build-time
  // naar undefined inlinen, anders blijft Preview eeuwig dicht.
  return {
    BEHEER_ENABLED: runtime?.['BEHEER_ENABLED'] ?? meta.BEHEER_ENABLED,
    VERCEL_ENV: runtime?.['VERCEL_ENV'] ?? meta.VERCEL_ENV,
    DEV: meta.DEV,
  };
}

export function isBeheerEnabled(): boolean {
  return beheerZichtbaar(leesOmgeving());
}

/**
 * Lege 404 zonder Content-Type laat mobiele browsers (Safari/Chrome) een
 * download starten. Daarom een echte HTML-pagina, dezelfde tekst als /404.
 */
const NIET_GEVONDEN_HTML = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Pagina niet gevonden — Kerkje van Persingen</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #faf8f3;
      color: #1a1a1a;
      font-family: Georgia, "Times New Roman", serif;
      text-align: center;
      padding: 2rem 1.25rem;
    }
    img { width: 130px; height: auto; margin: 0 auto 1.5rem; opacity: 0.85; }
    h1 { font-size: 1.75rem; font-weight: 600; margin: 0 0 0.75rem; }
    p { margin: 0 auto; max-width: 28rem; line-height: 1.5; color: #4a4a44; }
    a {
      display: inline-block;
      margin-top: 1.5rem;
      color: #4a5235;
      font-weight: 600;
      text-decoration: none;
      border-bottom: 1px solid #4a5235;
    }
  </style>
</head>
<body>
  <main>
    <img src="/logo-klein.png" width="130" height="132" alt="" />
    <h1>Deze pagina is er niet</h1>
    <p>Verdwenen, net als het grootste deel van Persingen. Wat er wel is, staat op de voorpagina.</p>
    <a href="/">Naar de voorpagina</a>
  </main>
</body>
</html>
`;

export function beheerUitResponse(): Response {
  return new Response(NIET_GEVONDEN_HTML, {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    },
  });
}
