import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// Bewuste keuze: output 'server' zolang de site afgeschermd is.
// Middleware (basic auth) draait alleen op server-gerenderde routes; bij
// prerendering zou de afscherming niet werken.
//
// BIJ LIVEGANG: zet per contentpagina `export const prerender = true` en haal
// SITE_PASSWORD weg. Dat levert statische HTML op en daarmee de Lighthouse-score
// uit 22_PERFORMANCE.md. Alleen /api/* en /verhuur/aanvragen blijven server-side.
export default defineConfig({
  site: 'https://kerkjepersingen.nl',
  output: 'server',
  adapter: vercel({
    imageService: true,
    webAnalytics: { enabled: false },
  }),
  compressHTML: true,

  // Astro's ingebouwde Origin-controle voor POST-verzoeken blokkeerde het
  // aanvraagformulier met "Cross-site POST form submissions are forbidden".
  // Achter Vercel's edge-netwerk komt de Origin-header niet altijd exact overeen
  // met wat Astro verwacht, waardoor legitieme, eigen formulieren ten onrechte
  // worden geweigerd.
  //
  // Bewuste afweging: dit schakelt die specifieke bescherming uit. Dat is hier
  // aanvaardbaar omdat het formulier geen ingelogde sessie of cookie-gebaseerde
  // rechten gebruikt (waar CSRF-bescherming voor bedoeld is) — iedereen die het
  // formulier bereikt mag het sowieso invullen. Bescherming tegen misbruik loopt
  // via de honeypot en rate limiting in src/lib/aanvraag.ts, niet via deze laag.
  security: {
    checkOrigin: false,
  },
});
