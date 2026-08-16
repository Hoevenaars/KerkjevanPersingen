import type { APIRoute } from 'astro';
import { verstuurPreview } from '../../../lib/nieuwsbrief';

export const prerender = false;

const PREVIEW_ADRES = 'nhoevenaars@gmail.com'; // <-- vul hier je eigen e-mailadres in

export const GET: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    await verstuurPreview(PREVIEW_ADRES);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('Fout bij nieuwsbrief-preview:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
};
