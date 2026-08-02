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
});
