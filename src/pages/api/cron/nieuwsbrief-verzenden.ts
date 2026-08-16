import type { APIRoute } from 'astro';
import { verstuurWekelijkseNieuwsbrief } from '../../../lib/nieuwsbrief';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const resultaat = await verstuurWekelijkseNieuwsbrief();
    return new Response(JSON.stringify(resultaat), { status: 200 });
  } catch (err) {
    console.error('Fout bij nieuwsbrief-verzenden:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
};
