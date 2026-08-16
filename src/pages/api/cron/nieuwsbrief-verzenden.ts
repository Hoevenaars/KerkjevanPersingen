import type { APIRoute } from 'astro';
import { cronOnbevoegd, verstuurWekelijkseNieuwsbrief } from '../../../lib/nieuwsbrief';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (cronOnbevoegd(request)) {
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
