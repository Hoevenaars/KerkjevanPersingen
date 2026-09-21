import type { APIRoute } from 'astro';
import {
  nodigGebruikerUit,
  verstuurUitnodigingOpnieuw,
  werkGebruikerBij,
  zetGebruikerStatus,
  matrixVanFormulier,
} from '../../../lib/beheer-gebruikers.ts';
import { maakBeheerAdminClient } from '../../../lib/supabase.ts';

export const prerender = false;

function terug(context: Parameters<APIRoute>[0], pad: string, params: Record<string, string> = {}) {
  const url = new URL(pad, context.url);
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
  if (!sessie || sessie.bron !== 'supabase') {
    return terug(context, '/beheer/instellingen/gebruikers/', {
      fout: 'niet_geconfigureerd',
      melding: 'Supabase Auth is nog niet gekoppeld.',
    });
  }
  if (sessie.viewAs) {
    return terug(context, '/beheer/instellingen/gebruikers/', {
      fout: 'preview',
      melding: 'Wijzigingen zijn uitgeschakeld in preview.',
    });
  }

  const admin = maakBeheerAdminClient();
  if (!admin) {
    return terug(context, '/beheer/instellingen/gebruikers/', {
      fout: 'niet_geconfigureerd',
      melding: 'SUPABASE_SERVICE_ROLE_KEY ontbreekt op de server.',
    });
  }

  const data = await context.request.formData();
  const actie = String(data.get('actie') ?? '');
  const actor = { id: sessie.gebruiker.id, naam: sessie.gebruiker.naam, rechten: sessie.rechten };
  const redirectTo = new URL('/beheer/auth/callback', context.url).toString();

  if (actie === 'invite') {
    const resultaat = await nodigGebruikerUit(admin, actor, {
      naam: String(data.get('naam') ?? ''),
      email: String(data.get('email') ?? ''),
      functie: String(data.get('functie') ?? ''),
      rechten: matrixVanFormulier(data.entries()),
      redirectTo,
    });
    if ('fout' in resultaat) {
      return terug(context, '/beheer/instellingen/gebruikers/', {
        fout: resultaat.fout,
        melding: resultaat.melding,
      });
    }
    return terug(context, '/beheer/instellingen/gebruikers/', { ok: 'uitgenodigd' });
  }

  const doelId = String(data.get('id') ?? '');
  if (!doelId) {
    return terug(context, '/beheer/instellingen/gebruikers/', { fout: 'ongeldig', melding: 'Geen gebruiker gekozen.' });
  }

  if (actie === 'bewaar') {
    const resultaat = await werkGebruikerBij(admin, actor, doelId, {
      naam: String(data.get('naam') ?? ''),
      functie: String(data.get('functie') ?? ''),
      rechten: matrixVanFormulier(data.entries()),
    });
    if ('fout' in resultaat) {
      return terug(context, '/beheer/instellingen/gebruikers/', {
        fout: resultaat.fout,
        melding: resultaat.melding,
        id: doelId,
      });
    }
    return terug(context, '/beheer/instellingen/gebruikers/', { ok: 'bewaard', id: doelId });
  }

  if (actie === 'disable' || actie === 'reactivate') {
    const resultaat = await zetGebruikerStatus(admin, actor, doelId, actie);
    if ('fout' in resultaat) {
      return terug(context, '/beheer/instellingen/gebruikers/', {
        fout: resultaat.fout,
        melding: resultaat.melding,
        id: doelId,
      });
    }
    return terug(context, '/beheer/instellingen/gebruikers/', { ok: actie, id: doelId });
  }

  if (actie === 'resend') {
    const resultaat = await verstuurUitnodigingOpnieuw(admin, actor, doelId, redirectTo);
    if ('fout' in resultaat) {
      return terug(context, '/beheer/instellingen/gebruikers/', {
        fout: resultaat.fout,
        melding: resultaat.melding,
        id: doelId,
      });
    }
    return terug(context, '/beheer/instellingen/gebruikers/', { ok: 'opnieuw', id: doelId });
  }

  return terug(context, '/beheer/instellingen/gebruikers/', { fout: 'ongeldig', melding: 'Onbekende actie.' });
};
