import type { APIRoute } from 'astro';
import { cronOnbevoegd, verstuurWekelijkseNieuwsbrief, vulNieuwsbriefConcepten } from '../../../lib/nieuwsbrief';
import { besluitVoor } from '../../../lib/automatisering-register';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (cronOnbevoegd(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const concepten = await vulNieuwsbriefConcepten();
    const besluit = await besluitVoor('nieuwsbrief');
    if (besluit.modus !== 'aan') {
      return new Response(JSON.stringify({ verstuurd: 0, gepland: 0, overgeslagen: `niet verzonden: ${besluit.reden}`, concepten }), { status: 200 });
    }
    const resultaat = await verstuurWekelijkseNieuwsbrief();
    return new Response(JSON.stringify({ ...resultaat, concepten }), { status: 200 });
  } catch (err) {
    console.error('Fout bij nieuwsbrief-verzenden:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
};
