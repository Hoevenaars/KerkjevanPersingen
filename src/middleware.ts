import type { MiddlewareHandler } from 'astro';
import {
  isBeheerEnabled,
  beheerUitResponse,
  beheerAuthOk,
  beheerAuthResponse,
  beheerGateEnv,
} from './platform/beheer-gate';
import {
  beheerToegang,
  isBeheerAuthPad,
  isBeheerPad,
  isMutatieMethode,
  moduleVoorPad,
} from './platform/autorisatie.ts';
import { VIEW_AS_COOKIE } from './platform/beheer-sessie.ts';
import { basisSessie, bouwSessie } from './lib/beheer-auth.ts';
import { beheerWeigering, loginRedirect, zelfdeOorsprong } from './lib/beheer-http.ts';
import { maakBeheerServerClient, supabaseGeconfigureerd } from './lib/supabase.ts';

/**
 * Afscherming tot livegang.
 *
 * Aan/uit via twee omgevingsvariabelen (alleen de publieke site):
 *   SITE_PASSWORD gezet, LIVE_VANAF niet gezet/nog niet bereikt -> afgeschermd + noindex
 *   SITE_PASSWORD gezet, LIVE_VANAF bereikt of gepasseerd        -> automatisch open
 *   SITE_PASSWORD leeg                                          -> altijd open
 *
 * /beheer volgt LIVE_VANAF niet. Met Supabase-auth: individuele login.
 * Zonder Supabase-configuratie blijft de oude Basic Auth staan, zodat bestaande
 * omgevingen niet op slot gaan voordat de projectkeys er zijn.
 */

const USER = 'kerkje';

function isLive(): boolean {
  const liveVanaf = import.meta.env.LIVE_VANAF ?? process.env.LIVE_VANAF;
  if (!liveVanaf) return false;

  const moment = new Date(liveVanaf);
  if (Number.isNaN(moment.getTime())) {
    console.error('[middleware] LIVE_VANAF kan niet worden gelezen als datum:', liveVanaf);
    return false;
  }

  return new Date() >= moment;
}

function plakBeheerHeaders(response: Response, extra?: Headers): Response {
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  response.headers.set('Cache-Control', 'no-store');
  extra?.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') response.headers.append(key, value);
    else response.headers.set(key, value);
  });
  return response;
}

async function beheerMiddleware(context: Parameters<MiddlewareHandler>[0], next: Parameters<MiddlewareHandler>[1]): Promise<Response> {
  const pad = context.url.pathname;
  const alsJson = pad.startsWith('/api/beheer');

  if (!isBeheerEnabled()) {
    return alsJson
      ? new Response(JSON.stringify({ fout: 'uit', melding: 'Beheer is uitgeschakeld.' }), { status: 404 })
      : beheerUitResponse();
  }

  if (isMutatieMethode(context.request.method) && !zelfdeOorsprong(context.request)) {
    return beheerWeigering('verborgen', alsJson);
  }

  const cookieHeaders = new Headers();
  context.locals.supabaseCookies = cookieHeaders;

  if (supabaseGeconfigureerd()) {
    const supabase = maakBeheerServerClient({
      request: context.request,
      cookies: context.cookies,
      responseHeaders: cookieHeaders,
    });
    const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    const user = data.user;
    const authPad = isBeheerAuthPad(pad);

    if (!user) {
      if (authPad) {
        return plakBeheerHeaders(await next(), cookieHeaders);
      }
      return plakBeheerHeaders(alsJson ? beheerWeigering('login', true) : loginRedirect(context), cookieHeaders);
    }

    if (!supabase) {
      return plakBeheerHeaders(beheerWeigering('login', alsJson), cookieHeaders);
    }

    const sessie = await bouwSessie({
      client: supabase,
      userId: user.id,
      viewAsId: context.cookies.get(VIEW_AS_COOKIE)?.value ?? null,
    });

    if ('fout' in sessie) {
      await supabase.auth.signOut();
      if (authPad) return plakBeheerHeaders(await next(), cookieHeaders);
      const doel = new URL('/beheer/login', context.url);
      doel.searchParams.set('fout', sessie.fout);
      return plakBeheerHeaders(alsJson ? beheerWeigering('disabled', true) : context.redirect(doel.pathname + doel.search), cookieHeaders);
    }

    context.locals.beheer = sessie;

    if (authPad) {
      if (pad.replace(/\/+$/, '') === '/beheer/login' && context.request.method === 'GET') {
        return plakBeheerHeaders(context.redirect('/beheer/'), cookieHeaders);
      }
      return plakBeheerHeaders(await next(), cookieHeaders);
    }

    const uitkomst = beheerToegang({
      methode: context.request.method,
      module: moduleVoorPad(pad),
      ingelogd: true,
      actief: sessie.gebruiker.status !== 'disabled',
      rechten: sessie.effectieveRechten,
      viewAsActief: Boolean(sessie.viewAs),
    });
    if (uitkomst !== 'ok') {
      return plakBeheerHeaders(beheerWeigering(uitkomst, alsJson), cookieHeaders);
    }

    return plakBeheerHeaders(await next(), cookieHeaders);
  }

  if (isBeheerAuthPad(pad)) {
    return plakBeheerHeaders(await next());
  }

  const header = context.request.headers.get('authorization');
  if (!beheerAuthOk(header, beheerGateEnv())) {
    return beheerAuthResponse();
  }
  context.locals.beheer = basisSessie();
  return plakBeheerHeaders(await next());
};

export const onRequest: MiddlewareHandler = async (context, next) => {
  const pad = context.url.pathname;

  // Cron heeft een eigen Bearer-secret. Afmelden moet zonder sitewachtwoord (AVG).
  if (pad.startsWith('/api/cron/') || pad.startsWith('/vrienden/afmelden')) {
    return await next();
  }

  if (isBeheerPad(pad)) {
    return await beheerMiddleware(context, next);
  }

  const password = import.meta.env.SITE_PASSWORD ?? process.env.SITE_PASSWORD;

  if (!password || isLive()) {
    return await next();
  }

  const header = context.request.headers.get('authorization');
  const expected = 'Basic ' + btoa(`${USER}:${password}`);

  if (header !== expected) {
    return new Response('Deze site is nog niet openbaar.', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Kerkje van Persingen", charset="UTF-8"',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }

  const response = await next();
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
};
