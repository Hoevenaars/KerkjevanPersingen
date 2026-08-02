import type { APIRoute } from 'astro';
import { getPubliekeActiviteiten } from '../lib/sanity';

export const prerender = false;

const SITE = 'https://kerkjepersingen.nl';

const vast = [
  { pad: '/', prioriteit: '1.0' },
  { pad: '/verhuur/', prioriteit: '0.9' },
  { pad: '/verhuur/aanvragen/', prioriteit: '0.9' },
  { pad: '/agenda/', prioriteit: '0.8' },
  { pad: '/het-kerkje/', prioriteit: '0.7' },
  { pad: '/het-kerkje/geschiedenis/', prioriteit: '0.7' },
  { pad: '/het-kerkje/omgeving/', prioriteit: '0.7' },
  { pad: '/steun-ons/', prioriteit: '0.6' },
  { pad: '/contact/', prioriteit: '0.6' },
  { pad: '/organisatie/', prioriteit: '0.3' },
];

export const GET: APIRoute = async () => {
  const activiteiten = await getPubliekeActiviteiten();
  const vandaag = new Date().toISOString().split('T')[0];

  const urls = [
    ...vast.map((v) => `  <url>\n    <loc>${SITE}${v.pad}</loc>\n    <lastmod>${vandaag}</lastmod>\n    <priority>${v.prioriteit}</priority>\n  </url>`),
    ...activiteiten
      .filter((a) => a.slug)
      .map((a) => `  <url>\n    <loc>${SITE}/agenda/${a.slug}/</loc>\n    <lastmod>${vandaag}</lastmod>\n    <priority>0.5</priority>\n  </url>`),
  ].join('\n');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } }
  );
};
