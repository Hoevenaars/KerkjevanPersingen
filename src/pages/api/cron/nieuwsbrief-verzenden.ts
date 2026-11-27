import type { APIRoute } from 'astro';
import { cronOnbevoegd, verstuurWekelijkseNieuwsbrief, vulNieuwsbriefConcepten } from '../../../lib/nieuwsbrief';
import { isNieuwsbriefVervolgmoment, isNieuwsbriefVerzendmoment } from '../../../lib/nieuwsbrief-concepten';
import { besluitVoor } from '../../../lib/automatisering-register';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (cronOnbevoegd(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const concepten = await vulNieuwsbriefConcepten();
    const nu = new Date();
    const start = isNieuwsbriefVerzendmoment(nu);
    if (!start && !isNieuwsbriefVervolgmoment(nu)) {
      return new Response(JSON.stringify({ verstuurd: 0, gepland: 0, overgeslagen: 'buiten verzendmoment maandag 10:30', concepten }), { status: 200 });
    }
    const besluit = await besluitVoor('nieuwsbrief');
    if (besluit.modus !== 'aan') {
      return new Response(JSON.stringify({ verstuurd: 0, gepland: 0, overgeslagen: `niet verzonden: ${besluit.reden}`, concepten }), { status: 200 });
    }
    const resultaat = await verstuurWekelijkseNieuwsbrief({ alleenVervolg: !start });
    return new Response(JSON.stringify({ ...resultaat, concepten }), { status: 200 });
  } catch (err) {
    console.error('Fout bij nieuwsbrief-verzenden:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
};
