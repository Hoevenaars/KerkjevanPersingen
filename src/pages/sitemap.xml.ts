import type { APIRoute } from 'astro';
import { getPubliekeAgenda } from '../lib/content';
import { bouwSitemap } from '../lib/seo';

export const prerender = false;

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
  { pad: '/privacyverklaring/', prioriteit: '0.2' },
  { pad: '/verhuur/voorwaarden/', prioriteit: '0.2' },
];

export const GET: APIRoute = async () => {
  const activiteiten = await getPubliekeAgenda(100);
  const items = [
    ...vast,
    ...activiteiten
      .filter((a) => a.slug)
      .map((a) => ({ pad: `/agenda/${a.slug}/`, prioriteit: '0.5' })),
  ];

  return new Response(bouwSitemap(items), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
