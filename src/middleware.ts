import type { MiddlewareHandler } from 'astro';
import {
  isBeheerEnabled,
  beheerUitResponse,
} from './platform/beheer-gate';
import {
  beheerToegang,
  isBeheerAuthPad,
  isBeheerPad,
  isMutatieMethode,
  isViewAsWisselPad,
  moduleVoorPad,
} from './platform/autorisatie.ts';
import { VIEW_AS_COOKIE } from './platform/beheer-sessie.ts';
import { bouwSessie } from './lib/beheer-auth.ts';
import { beheerWeigering, loginRedirect, zelfdeOorsprong } from './lib/beheer-http.ts';
import { koppelSupabaseClient, metSanityRegistratie } from './platform/sanity-registratie.ts';
import { maakBeheerServerClient, supabaseGeconfigureerd } from './lib/supabase.ts';
import { volgPubliekePageview } from './analytics/volg.ts';
import { analyticsTeVaak } from './analytics/rate-limit.ts';
import { bewaarPageview, wachtNietOp } from './platform/analytics-opslag.ts';
import { kerkjeAnalytics } from './platform/analytics-config.ts';

/**
 * Afscherming tot livegang.
 *
 * Aan/uit via twee omgevingsvariabelen (alleen de publieke site):
 *   SITE_PASSWORD gezet, LIVE_VANAF niet gezet/nog niet bereikt -> afgeschermd + noindex
 *   SITE_PASSWORD gezet, LIVE_VANAF bereikt of gepasseerd        -> automatisch open
 *   SITE_PASSWORD leeg                                          -> altijd open
 *
 * /beheer volgt LIVE_VANAF niet en gebruikt geen gedeeld wachtwoord.
 * Elke beheerder logt in met een eigen Supabase-account op /beheer/login.
 */

const USER = 'kerkje';

function leesAdres(context: { clientAddress: string }): string | null {
  try {
    return context.clientAddress;
  } catch {
    return null;
  }
}

function metAnalytics(context: Parameters<MiddlewareHandler>[0], response: Response): Response {
  const pad = context.url.pathname;
  if (
    pad.startsWith('/beheer') ||
    pad.startsWith('/api') ||
    pad.startsWith('/klant') ||
    pad.startsWith('/admin')
  ) {
    return response;
  }
  volgPubliekePageview({
    request: context.request,
    pathname: pad,
    response,
    config: kerkjeAnalytics,
    adresSleutel: leesAdres(context),
    rateLimit: analyticsTeVaak,
    schrijf(ontwerp) {
      wachtNietOp(context, bewaarPageview(ontwerp));
    },
  });
  return response;
}

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
  const authPad = isBeheerAuthPad(pad);

  if (!supabaseGeconfigureerd()) {
    if (authPad) return plakBeheerHeaders(await next());
    return plakBeheerHeaders(alsJson ? beheerWeigering('login', true) : loginRedirect(context));
  }

  const supabase = maakBeheerServerClient({
    request: context.request,
    cookies: context.cookies,
    responseHeaders: cookieHeaders,
  });
  if (supabase) {
    context.locals.supabase = supabase;
    koppelSupabaseClient(supabase);
  }
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const user = data.user;

  if (!user) {
    if (authPad) {
      return plakBeheerHeaders(metAnalytics(context, await next()), cookieHeaders);
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
    if (authPad) return plakBeheerHeaders(metAnalytics(context, await next()), cookieHeaders);
    const doel = new URL('/beheer/login', context.url);
    doel.searchParams.set('fout', sessie.fout);
    return plakBeheerHeaders(alsJson ? beheerWeigering('disabled', true) : context.redirect(doel.pathname + doel.search), cookieHeaders);
  }

  context.locals.beheer = sessie;

  if (authPad) {
    if (pad.replace(/\/+$/, '') === '/beheer/login' && context.request.method === 'GET') {
      return plakBeheerHeaders(context.redirect('/beheer/'), cookieHeaders);
    }
    return plakBeheerHeaders(metAnalytics(context, await next()), cookieHeaders);
  }

  const wissel = isViewAsWisselPad(pad);
  const uitkomst = beheerToegang({
    methode: context.request.method,
    module: moduleVoorPad(pad),
    ingelogd: true,
    actief: sessie.gebruiker.status !== 'disabled',
    rechten: wissel ? sessie.rechten : sessie.effectieveRechten,
    viewAsActief: wissel ? false : Boolean(sessie.viewAs),
  });
  if (uitkomst !== 'ok') {
    return plakBeheerHeaders(
      beheerWeigering(uitkomst, alsJson, { previewStop: Boolean(sessie.viewAs) && !alsJson }),
      cookieHeaders,
    );
  }

  return plakBeheerHeaders(metAnalytics(context, await next()), cookieHeaders);
};

export const onRequest: MiddlewareHandler = async (context, next) => {
  const pad = context.url.pathname;

  // Cron heeft een eigen Bearer-secret. Afmelden moet zonder sitewachtwoord (AVG).
  if (pad.startsWith('/api/cron/') || pad.startsWith('/vrienden/afmelden') || pad.startsWith('/klant/')) {
    return metAnalytics(context, await next());
  }

  if (isBeheerPad(pad)) {
    if (context.url.searchParams.get('bron') === 'supabase') {
      return metSanityRegistratie(() => beheerMiddleware(context, next));
    }
    return await beheerMiddleware(context, next);
  }

  const password = import.meta.env.SITE_PASSWORD ?? process.env.SITE_PASSWORD;

  if (!password || isLive()) {
    return metAnalytics(context, await next());
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

  const response = metAnalytics(context, await next());
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
};
