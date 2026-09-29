import type { APIRoute } from 'astro';
import { matrixVanFormulier } from '../../../lib/beheer-gebruikers.ts';
import { pasRollenAan } from '../../../lib/rollen-opslag.ts';
import { maakBeheerAdminClient } from '../../../lib/supabase.ts';

export const prerender = false;

function terug(context: Parameters<APIRoute>[0], params: Record<string, string>) {
  const url = new URL('/beheer/instellingen/gebruikers/', context.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (context.request.headers.get('accept')?.includes('application/json')) {
    return new Response(JSON.stringify(params), {
      status: params.fout ? 400 : 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
  return context.redirect(url.pathname + url.search);
}

export const POST: APIRoute = async (context) => {
  const sessie = context.locals.beheer;
  if (!sessie?.rechten.isSuperAdmin) {
    return terug(context, { fout: 'geen_recht', melding: 'Alleen Super Admin richt rollen in.' });
  }
  if (sessie.viewAs) {
    return terug(context, { fout: 'preview', melding: 'Wijzigingen zijn uitgeschakeld in preview.' });
  }

  const data = await context.request.formData();
  const actie = String(data.get('actie') ?? '');
  const admin = maakBeheerAdminClient();

  try {
    if (actie === 'nieuw') {
      const resultaat = await pasRollenAan({ soort: 'nieuw', naam: String(data.get('naam') ?? '') }, admin);
      if ('fout' in resultaat) return terug(context, { fout: 'ongeldig', melding: resultaat.fout });
      return terug(context, { ok: 'rol-nieuw', rol: resultaat.slug ?? '' });
    }

    const slug = String(data.get('slug') ?? '');
    if (actie === 'verwijder') {
      const resultaat = await pasRollenAan({ soort: 'verwijder', slug }, admin);
      if ('fout' in resultaat) return terug(context, { fout: 'ongeldig', melding: resultaat.fout, rol: slug });
      return terug(context, { ok: 'rol-weg' });
    }

    if (actie === 'opslaan') {
      const resultaat = await pasRollenAan(
        {
          soort: 'opslaan',
          slug,
          naam: String(data.get('naam') ?? ''),
          rechten: matrixVanFormulier(data.entries()),
        },
        admin,
      );
      if ('fout' in resultaat) return terug(context, { fout: 'ongeldig', melding: resultaat.fout, rol: slug });
      return terug(context, { ok: 'rol', rol: resultaat.slug ?? slug });
    }
  } catch (error) {
    const melding = error instanceof Error ? error.message : 'De rol kon niet worden opgeslagen.';
    return terug(context, { fout: 'ongeldig', melding });
  }

  return terug(context, { fout: 'ongeldig', melding: 'Onbekende actie.' });
};
