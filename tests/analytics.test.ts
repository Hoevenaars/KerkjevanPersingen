import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregeerPageviews } from '../src/analytics/aggregate.ts';
import { isEvidenteAutomation } from '../src/analytics/bot.ts';
import { classificeerApparaat } from '../src/analytics/device.ts';
import { leesPeriode, periodeVan, startVanDag } from '../src/analytics/periode.ts';
import { blokeerInVenster } from '../src/analytics/rate-limit.ts';
import { externeReferrerHost } from '../src/analytics/referrer.ts';
import type { AnalyticsConfig, PageViewOntwerp, PageViewRecord } from '../src/analytics/types.ts';
import { registreerPageview, volgPubliekePageview } from '../src/analytics/volg.ts';
import { naarInsert, ontwerpPageview, planPageview } from '../src/analytics/verzoek.ts';
import { beheerToegang, moduleVoorPad } from '../src/platform/autorisatie.ts';
import { kerkjeAnalytics, resolvePageKey } from '../src/platform/analytics-config.ts';
import { REFERENTIE_RECHTEN } from '../src/platform/referentie-gebruikers.ts';
import type { GebruikerRechten } from '../src/platform/types.ts';

const NU = new Date('2026-09-29T12:00:00.000Z');
const ZONE = 'Europe/Amsterdam';

const tweetalig: AnalyticsConfig = {
  ownDomains: ['example.test'],
  supportedLocales: ['nl', 'en'],
  timeZone: ZONE,
  resolveLocale(pathname) {
    if (pathname.startsWith('/en')) return 'en';
    if (pathname.startsWith('/nl')) return 'nl';
    return null;
  },
  resolvePageKey(pathname) {
    if (pathname === '/nl' || pathname === '/en') return 'home';
    if (pathname === '/nl/tarieven' || pathname === '/en/rates') return 'rates';
    return null;
  },
  pageLabels: { home: 'Home', rates: 'Tarieven' },
  localeLabels: { nl: 'Nederlands', en: 'Engels' },
  referrerLabels: { 'google.com': 'Google' },
};

function verzoek(pad: string, headers: Record<string, string> = {}, methode = 'GET'): Request {
  return new Request(`https://kerkjepersingen.nl${pad}`, { method: methode, headers });
}

function html(status = 200): { status: number; contentType: string | null } {
  return { status, contentType: 'text/html; charset=utf-8' };
}

function ontwerp(pad: string, headers: Record<string, string> = {}, status = 200): PageViewOntwerp | null {
  const antwoord = html(status);
  return ontwerpPageview({
    request: verzoek(pad, {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      ...headers,
    }),
    pathname: pad.split('?')[0] ?? pad,
    status: antwoord.status,
    contentType: antwoord.contentType,
    config: kerkjeAnalytics,
  });
}

function rij(gedeeltelijk: Partial<PageViewRecord> & Pick<PageViewRecord, 'createdAt' | 'path' | 'pageKey'>): PageViewRecord {
  return {
    locale: 'nl',
    deviceType: 'desktop',
    referrerHost: null,
    ...gedeeltelijk,
  };
}

describe('registratie', () => {
  test('een publieke paginaweergave levert één pageview op', () => {
    const plan = ontwerp('/verhuur/');
    assert.ok(plan);
    assert.equal(plan.path, '/verhuur');
    assert.equal(plan.pageKey, 'verhuur');
    assert.equal(plan.locale, 'nl');
    assert.equal(plan.deviceType, 'desktop');
    const insert = naarInsert(plan, kerkjeAnalytics);
    assert.deepEqual(Object.keys(insert ?? {}).sort(), ['device_type', 'locale', 'page_key', 'path', 'referrer_host']);
  });

  test('dezelfde navigatie wordt niet dubbel geregistreerd', () => {
    const request = verzoek('/contact', {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
    });
    const response = new Response('<html></html>', { headers: { 'content-type': 'text/html' } });
    const geschreven: PageViewOntwerp[] = [];
    const invoer = {
      request,
      pathname: '/contact',
      response,
      config: kerkjeAnalytics,
      adresSleutel: 'test',
      rateLimit: () => false,
      schrijf(ontwerpRij: PageViewOntwerp) {
        geschreven.push(ontwerpRij);
      },
    };
    volgPubliekePageview(invoer);
    volgPubliekePageview(invoer);
    assert.equal(geschreven.length, 1);
    assert.equal(planPageview({
      request,
      pathname: '/contact',
      status: 200,
      contentType: 'text/html',
      config: kerkjeAnalytics,
    }), null);
  });

  test('prefetch, beheer, api en een mislukte status tellen niet', () => {
    assert.equal(ontwerp('/verhuur', { purpose: 'prefetch' }), null);
    assert.equal(ontwerp('/beheer/analytics'), null);
    assert.equal(ontwerp('/api/cron/workflow'), null);
    assert.equal(ontwerp('/klant/aanleveren'), null);
    assert.equal(ontwerp('/verhuur', {}, 404), null);
    assert.equal(ontwerp('/verhuur', { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' }), null);
    assert.equal(isEvidenteAutomation('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), true);
  });

  test('een querystring met een mailadres wordt niet opgeslagen', () => {
    const plan = ontwerp('/verhuur/aanvragen/?datum=2027-05-01&email=iemand@example.nl');
    assert.ok(plan);
    assert.equal(plan.path, '/verhuur/aanvragen');
    assert.equal(plan.path.includes('email'), false);
    assert.equal(plan.pageKey, 'aanvraag');
  });
});

describe('beheerautorisatie', () => {
  const superAdmin: GebruikerRechten = { isSuperAdmin: true, perModule: {} };
  const lezer: GebruikerRechten = { isSuperAdmin: false, perModule: { analytics: 'lezen' } };
  const zonder: GebruikerRechten = { isSuperAdmin: false, perModule: { dashboard: 'lezen' } };
  const hans: GebruikerRechten = { isSuperAdmin: false, perModule: REFERENTIE_RECHTEN.hans };

  test('de route hoort bij de analyticsmodule', () => {
    assert.equal(moduleVoorPad('/beheer/analytics'), 'analytics');
    assert.equal(moduleVoorPad('/beheer/analytics/'), 'analytics');
  });

  test('een bevoegde beheerder mag kijken', () => {
    assert.equal(beheerToegang({
      methode: 'GET',
      module: 'analytics',
      ingelogd: true,
      actief: true,
      rechten: superAdmin,
      viewAsActief: false,
    }), 'ok');
    assert.equal(beheerToegang({
      methode: 'GET',
      module: 'analytics',
      ingelogd: true,
      actief: true,
      rechten: lezer,
      viewAsActief: false,
    }), 'ok');
  });

  test('een onbevoegde gebruiker krijgt geen toegang', () => {
    assert.equal(beheerToegang({
      methode: 'GET',
      module: 'analytics',
      ingelogd: true,
      actief: true,
      rechten: zonder,
      viewAsActief: false,
    }), 'verborgen');
    assert.equal(beheerToegang({
      methode: 'GET',
      module: 'analytics',
      ingelogd: true,
      actief: true,
      rechten: hans,
      viewAsActief: false,
    }), 'verborgen');
    assert.equal(beheerToegang({
      methode: 'GET',
      module: 'analytics',
      ingelogd: false,
      actief: true,
      rechten: superAdmin,
      viewAsActief: false,
    }), 'login');
  });
});

describe('locale, page key, apparaat en referrer', () => {
  test('de site registreert alleen de ondersteunde locale nl', () => {
    assert.deepEqual(kerkjeAnalytics.supportedLocales, ['nl']);
    assert.equal(ontwerp('/')?.locale, 'nl');
    assert.equal(ontwerp('/het-kerkje/omgeving/')?.locale, 'nl');
  });

  test('functionele pagina’s worden gegroepeerd, ook over talen in de kern', () => {
    assert.equal(resolvePageKey('/'), 'home');
    assert.equal(resolvePageKey('/agenda'), 'agenda');
    assert.equal(resolvePageKey('/agenda/ooijpolder'), 'agenda-item');
    assert.equal(resolvePageKey('/agenda/lenteconcert'), 'agenda-item');
    assert.equal(resolvePageKey('/en/rates'), null);

    const nl = ontwerpPageview({
      request: verzoek('/nl/tarieven', {
        'user-agent': 'Mozilla/5.0',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
      }),
      pathname: '/nl/tarieven',
      status: 200,
      contentType: 'text/html',
      config: tweetalig,
    });
    const en = ontwerpPageview({
      request: verzoek('/en/rates', {
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
      }),
      pathname: '/en/rates',
      status: 200,
      contentType: 'text/html',
      config: tweetalig,
    });
    assert.equal(nl?.pageKey, 'rates');
    assert.equal(en?.pageKey, 'rates');
    assert.equal(nl?.locale, 'nl');
    assert.equal(en?.locale, 'en');
    assert.equal(ontwerpPageview({
      request: verzoek('/nl', { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate', 'user-agent': 'Mozilla/5.0' }),
      pathname: '/nl',
      status: 200,
      contentType: 'text/html',
      config: tweetalig,
    })?.pageKey, 'home');
    assert.equal(ontwerpPageview({
      request: verzoek('/en', { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate', 'user-agent': 'Mozilla/5.0' }),
      pathname: '/en',
      status: 200,
      contentType: 'text/html',
      config: tweetalig,
    })?.pageKey, 'home');
  });

  test('apparaten vallen in vier klassen en de user-agent blijft achterwege', () => {
    assert.equal(classificeerApparaat('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'), 'desktop');
    assert.equal(classificeerApparaat('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148'), 'mobile');
    assert.equal(classificeerApparaat('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'tablet');
    assert.equal(classificeerApparaat('Mozilla/5.0 (Linux; Android 13; Pixel Tablet)'), 'tablet');
    assert.equal(classificeerApparaat(''), 'unknown');
    assert.equal(classificeerApparaat(null), 'unknown');
    const plan = ontwerp('/contact', {
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148',
    });
    assert.equal(plan?.deviceType, 'mobile');
    assert.equal(JSON.stringify(plan).includes('iPhone'), false);
  });

  test('eigen domeinen zijn geen externe verwijzer, externe hostnames wel', () => {
    assert.equal(externeReferrerHost('https://www.kerkjepersingen.nl/verhuur/', kerkjeAnalytics), null);
    assert.equal(externeReferrerHost('https://send.kerkjepersingen.nl/iets', kerkjeAnalytics), null);
    assert.equal(externeReferrerHost('https://www.google.com/search?q=geheim+token', kerkjeAnalytics), 'google.com');
    assert.equal(externeReferrerHost('https://facebook.com/share?u=https%3A%2F%2Fkerkjepersingen.nl', kerkjeAnalytics), 'facebook.com');
    assert.equal(externeReferrerHost(null, kerkjeAnalytics), null);
    const extern = ontwerp('/agenda/', { referer: 'https://www.instagram.com/p/abc?utm=geheim' });
    assert.equal(extern?.referrerHost, 'instagram.com');
    const eigen = ontwerp('/', { referer: 'https://kerkjevanpersingen.com/oude-pagina?email=x' });
    assert.equal(eigen?.referrerHost, null);
  });
});

describe('periode, lege staat en fail-safe', () => {
  test('7, 30 en 90 dagen bevatten alleen die periode', () => {
    const dagen = {
      7: periodeVan(7, NU, ZONE),
      30: periodeVan(30, NU, ZONE),
      90: periodeVan(90, NU, ZONE),
    };
    assert.equal(dagen[7].van, '2026-09-23');
    assert.equal(dagen[7].tot, '2026-09-29');
    assert.equal(dagen[30].van, '2026-08-31');
    assert.equal(dagen[90].van, '2026-07-02');
    assert.equal(startVanDag('2026-09-29', ZONE).toISOString(), '2026-09-28T22:00:00.000Z');
    assert.equal(leesPeriode('nope', NU, ZONE).dagen, 30);

    const rijen: PageViewRecord[] = [
      rij({ createdAt: '2026-09-23T10:00:00.000Z', path: '/', pageKey: 'home' }),
      rij({ createdAt: '2026-08-31T10:00:00.000Z', path: '/verhuur', pageKey: 'verhuur' }),
      rij({ createdAt: '2026-07-02T10:00:00.000Z', path: '/agenda', pageKey: 'agenda' }),
      rij({ createdAt: '2026-07-01T10:00:00.000Z', path: '/contact', pageKey: 'contact' }),
    ];

    assert.deepEqual(aggregeerPageviews(rijen, dagen[7], kerkjeAnalytics).paginas.map((pagina) => pagina.pageKey), ['home']);
    assert.deepEqual(
      aggregeerPageviews(rijen, dagen[30], kerkjeAnalytics).paginas.map((pagina) => pagina.pageKey).sort(),
      ['home', 'verhuur'],
    );
    assert.equal(aggregeerPageviews(rijen, dagen[90], kerkjeAnalytics).totalen.pageviews, 3);
    assert.equal(aggregeerPageviews(rijen, dagen[90], kerkjeAnalytics).paginas.some((pagina) => pagina.pageKey === 'contact'), false);
  });

  test('geen data geeft een leeg rapport zonder NaN', () => {
    const stats = aggregeerPageviews([], periodeVan(30, NU, ZONE), kerkjeAnalytics);
    assert.equal(stats.totalen.pageviews, 0);
    assert.equal(stats.totalen.gemiddeldPerDag, 0);
    assert.equal(stats.dagelijks.length, 30);
    assert.equal(stats.paginas.length, 0);
    assert.equal(stats.locales.length, 0);
    assert.equal(stats.apparaten.length, 0);
    assert.equal(stats.verwijzers.length, 0);
    assert.equal(stats.dagelijks.every((dag) => dag.pageviews === 0), true);
  });

  test('verdeling groepeert page keys en directe verwijzers', () => {
    const periode = periodeVan(7, NU, ZONE);
    const stats = aggregeerPageviews([
      rij({ createdAt: '2026-09-28T12:00:00.000Z', path: '/agenda/een', pageKey: 'agenda-item', deviceType: 'mobile', referrerHost: 'google.com' }),
      rij({ createdAt: '2026-09-28T13:00:00.000Z', path: '/agenda/twee', pageKey: 'agenda-item', deviceType: 'mobile', referrerHost: 'google.com' }),
      rij({ createdAt: '2026-09-28T14:00:00.000Z', path: '/', pageKey: 'home', deviceType: 'desktop', referrerHost: null }),
    ], periode, kerkjeAnalytics);
    const activiteit = stats.paginas.find((pagina) => pagina.pageKey === 'agenda-item');
    assert.equal(activiteit?.pageviews, 2);
    assert.equal(activiteit?.meerderePaden, true);
    assert.equal(activiteit?.label, 'Activiteit');
    assert.equal(stats.locales[0]?.label, 'Nederlands');
    assert.equal(stats.apparaten.find((apparaat) => apparaat.deviceType === 'mobile')?.pageviews, 2);
    assert.equal(stats.verwijzers.find((bron) => bron.host === 'google.com')?.label, 'Google');
    assert.equal(stats.verwijzers.find((bron) => bron.host === null)?.label, 'Direct');
    assert.equal(stats.paginas.every((pagina) => Number.isFinite(pagina.aandeel)), true);
  });

  test('een mislukte registratie gooit niet', async () => {
    const ontwerpRij = ontwerp('/steun-ons');
    assert.ok(ontwerpRij);
    const uitkomst = await registreerPageview(ontwerpRij, kerkjeAnalytics, async () => {
      throw new Error('database offline');
    });
    assert.equal(uitkomst, 'mislukt');

    const request = verzoek('/steun-ons', {
      'user-agent': 'Mozilla/5.0',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
    });
    assert.doesNotThrow(() => {
      volgPubliekePageview({
        request,
        pathname: '/steun-ons',
        response: new Response('ok', { headers: { 'content-type': 'text/html' } }),
        config: kerkjeAnalytics,
        adresSleutel: null,
        rateLimit: () => false,
        schrijf() {
          throw new Error('kapot');
        },
      });
    });
  });

  test('rate limiting laat een stortvloed vallen zonder profiel op te slaan', () => {
    const staat = new Map<string, number[]>();
    const opties = { vensterMs: 60_000, maxPerSleutel: 3, maxGlobaal: 10 };
    assert.equal(blokeerInVenster(staat, 'adres-a', 1_000, opties), false);
    assert.equal(blokeerInVenster(staat, 'adres-a', 1_100, opties), false);
    assert.equal(blokeerInVenster(staat, 'adres-a', 1_200, opties), false);
    assert.equal(blokeerInVenster(staat, 'adres-a', 1_300, opties), true);
    assert.equal(blokeerInVenster(staat, 'adres-b', 1_400, opties), false);
    assert.equal(JSON.stringify([...staat.values()]).includes('ip_address'), false);
  });
});

describe('privacygrenzen in de bron', () => {
  test('de analyticsmodule zet geen browseridentiteit', () => {
    const bestanden = verzamelBron(['src/analytics', 'src/platform/analytics-config.ts', 'src/platform/analytics-opslag.ts']);
    const verboden = ['localStorage', 'sessionStorage', 'document.cookie', 'fingerprint', 'ip_address', 'visitor_id', 'navigator.webdriver'];
    for (const woord of verboden) {
      assert.equal(bestanden.includes(woord), false, woord);
    }
  });
});

function verzamelBron(paden: string[]): string {
  const stukken: string[] = [];
  for (const pad of paden) {
    const stat = statSync(pad);
    if (stat.isDirectory()) {
      for (const naam of readdirSync(pad)) stukken.push(readFileSync(join(pad, naam), 'utf8'));
    } else {
      stukken.push(readFileSync(pad, 'utf8'));
    }
  }
  return stukken.join('\n');
}
