import type { APIRoute } from 'astro';
import { cronOnbevoegd } from '../../../lib/nieuwsbrief';
import { draaiWorkflow } from '../../../lib/operatie/runtime';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  if (cronOnbevoegd(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const resultaat = await draaiWorkflow(process.env, url.origin);
    return new Response(JSON.stringify(resultaat), {
      status: resultaat.ok ? 200 : 500,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error('Fout bij workflow-cron:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
};
