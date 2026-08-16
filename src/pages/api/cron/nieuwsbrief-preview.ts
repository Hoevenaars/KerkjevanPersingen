import type { APIRoute } from 'astro';
import { cronOnbevoegd, datumVoorPreview, verstuurPreview } from '../../../lib/nieuwsbrief';

export const prerender = false;

const PREVIEW_ADRES =
  process.env.NIEUWSBRIEF_PREVIEW_ADRES ??
  import.meta.env.NIEUWSBRIEF_PREVIEW_ADRES ??
  'nhoevenaars@gmail.com';

export const GET: APIRoute = async ({ request }) => {
  if (cronOnbevoegd(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const week = new URL(request.url).searchParams.get('week');
    await verstuurPreview(PREVIEW_ADRES, datumVoorPreview(week));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('Fout bij nieuwsbrief-preview:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
};
