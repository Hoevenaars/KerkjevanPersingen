/**
 * Visuele en functionele acceptatie van /beheer.
 * Start astro dev op loopback met BEHEER_ACCEPTATIE=lokaal.
 * Alleen voorbeelddata. Schrijven wordt door de poort geweigerd.
 * Productie wordt niet aangeroepen.
 *
 * Gebruik: node scripts/acceptatie-beheer.mjs [map-voor-screenshots]
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const poort = 4399;
const basis = `http://127.0.0.1:${poort}`;
const uitvoer = path.resolve(process.argv[2] || '/tmp/acceptatie-shots');
const uitslag = [];

const HOOFD = [
  { sleutel: 'overzicht', pad: '/beheer/', nav: 'Overzicht', shot: 'beheer-overzicht' },
  { sleutel: 'verhuur', pad: '/beheer/verhuur/?jaar=2026&maand=9', nav: 'Verhuur', shot: 'beheer-verhuur' },
  { sleutel: 'website', pad: '/beheer/website/', nav: 'Website', shot: 'beheer-website' },
  { sleutel: 'contacten', pad: '/beheer/contacten/', nav: 'Contacten', shot: 'beheer-contacten' },
  { sleutel: 'financien', pad: '/beheer/finance/', nav: 'Financiën', shot: 'beheer-financien' },
  { sleutel: 'instellingen', pad: '/beheer/instellingen/', nav: 'Instellingen', shot: 'beheer-instellingen' },
];

const SUB = [
  '/beheer/zoeken/?q=Marieke',
  '/beheer/aanvragen/',
  '/beheer/aanvragen/a-101/',
  '/beheer/boekingen/',
  '/beheer/boekingen/b-042/',
  '/beheer/boekingen/nieuw/',
  '/beheer/kalender/?maand=2026-09',
  '/beheer/planning/',
  '/beheer/agenda/',
  '/beheer/agenda/p-040/',
  '/beheer/publiceren/',
  '/beheer/relaties/',
  '/beheer/relaties/r-817/',
  '/beheer/vrienden/',
  '/beheer/nieuwsbrief/',
  '/beheer/nieuwsbrief/nb-2026-08-31/',
  '/beheer/instellingen/verhuur/',
  '/beheer/instellingen/finance/',
  '/beheer/instellingen/gastheren/',
  '/beheer/instellingen/gastheren/g-1/',
  '/beheer/instellingen/gebruikers/',
  '/beheer/instellingen/meldingen/',
  '/beheer/instellingen/automatiseringen/',
  '/beheer/instellingen/mailtemplates/',
  '/beheer/instellingen/systeem/',
  '/beheer/instellingen/templates/',
  '/beheer/analytics/',
  '/beheer/migratie/',
];

function punt(naam, ok, detail = '') {
  uitslag.push({ naam, status: ok ? 'geslaagd' : 'gefaald', detail });
  console.log(`${ok ? 'geslaagd' : 'GEFAALD'}  ${naam}${detail ? ` — ${detail}` : ''}`);
}

function startServer(extra) {
  const env = {
    ...process.env,
    BEHEER_ENABLED: 'true',
    BEHEER_ACCEPTATIE: 'lokaal',
    SUPABASE_URL: 'http://127.0.0.1:9',
    SUPABASE_PUBLISHABLE_KEY: 'acceptatie-geen-productie',
    SUPABASE_SERVICE_ROLE_KEY: '',
    SITE_PASSWORD: '',
    RESEND_API_KEY: '',
    ...extra,
  };
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(poort)], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  const bij = (stuk) => {
    log += stuk.toString();
    if (log.length > 80_000) log = log.slice(-40_000);
  };
  child.stdout?.on('data', bij);
  child.stderr?.on('data', bij);
  return {
    child,
    log: () => log,
    stop() {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    },
  };
}

async function wachtOpServer(server) {
  const eind = Date.now() + 120_000;
  let laatste = '';
  while (Date.now() < eind) {
    if (server.child.exitCode != null) {
      throw new Error(`astro stopte met ${server.child.exitCode}\n${server.log().slice(-2000)}`);
    }
    try {
      const antwoord = await fetch(`${basis}/beheer/`, { redirect: 'manual' });
      if (antwoord.status < 500) return;
      laatste = String(antwoord.status);
    } catch (error) {
      laatste = error instanceof Error ? error.message : 'geen verbinding';
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`server niet klaar (${laatste})\n${server.log().slice(-2000)}`);
}

async function maten(page) {
  return page.evaluate(() => {
    const inScroll = (el) => {
      let ouder = el.parentElement;
      while (ouder && ouder !== document.documentElement) {
        const stijl = getComputedStyle(ouder);
        if (stijl.overflowX === 'auto' || stijl.overflowX === 'scroll') return true;
        ouder = ouder.parentElement;
      }
      return false;
    };
    const uit = [];
    for (const el of document.body.querySelectorAll('*')) {
      const stijl = getComputedStyle(el);
      if (stijl.display === 'none' || stijl.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      if (inScroll(el)) continue;
      if (rect.right > window.innerWidth + 1 || rect.left < -1) {
        const klas = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
        uit.push(`${el.tagName.toLowerCase()}${klas ? `.${klas}` : ''}`);
        if (uit.length >= 5) break;
      }
    }
    const dozen = [...document.querySelectorAll('[data-beheer-nav] a, .bh-menu a')]
      .map((el) => el.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    let overlap = false;
    for (let i = 0; i < dozen.length; i += 1) {
      for (let j = i + 1; j < dozen.length; j += 1) {
        const a = dozen[i];
        const b = dozen[j];
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (x > 2 && y > 2) overlap = true;
      }
    }
    const box = (el) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        pad: getComputedStyle(el).paddingLeft,
      };
    };
    const balk = document.querySelector('[data-beheer-balk]');
    const kop = document.querySelector('h1');
    const balkBox = box(balk);
    const kopBox = box(kop);
    return {
      uit,
      overlap,
      balk: balkBox,
      pagina: box(document.querySelector('[data-beheer-pagina], .kc-pagina, .bh-main')),
      kopOnderBalk: !balkBox || !kopBox || kopBox.x === undefined ? true : kop.getBoundingClientRect().top >= balk.getBoundingClientRect().bottom - 1,
      scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bron: document.querySelector('[data-beheer-bron]')?.getAttribute('data-beheer-bron') ?? '',
      fout: document.body.innerText.includes('Supabase-fout'),
    };
  });
}

async function openPagina(page, pad) {
  const fouten = [];
  const onPage = (error) => fouten.push(String(error));
  const onConsole = (bericht) => {
    if (bericht.type() !== 'error') return;
    const tekst = bericht.text();
    if (/fonts\.(googleapis|gstatic)|favicon|Failed to load resource/i.test(tekst)) return;
    fouten.push(tekst);
  };
  page.on('pageerror', onPage);
  page.on('console', onConsole);
  const antwoord = await page.goto(pad.startsWith('http') ? pad : `${basis}${pad}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForTimeout(150);
  page.off('pageerror', onPage);
  page.off('console', onConsole);
  return { status: antwoord?.status() ?? 0, url: page.url(), fouten };
}

function gelijk(a, b) {
  return a != null && b != null && Math.abs(a - b) <= 1;
}

function schoon(lijst) {
  return lijst.map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

async function scenarioNieuw(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'nl-NL' });
  await context.route(/supabase\.co/, (route) => route.abort());
  const page = await context.newPage();
  const breedtes = [
    { naam: 'desktop', width: 1440, height: 900, pad: '34px' },
    { naam: 'tablet', width: 1024, height: 800, pad: '34px' },
    { naam: 'mobiel', width: 390, height: 844, pad: '13px' },
  ];

  for (const venster of breedtes) {
    await page.setViewportSize({ width: venster.width, height: venster.height });
    const gemeten = [];
    for (const onderdeel of HOOFD) {
      const geopend = await openPagina(page, onderdeel.pad);
      const lichaam = (await page.locator('h1').first().textContent().catch(() => '')) ?? '';
      const huidig = schoon(await page.locator('[data-beheer-nav] a[aria-current="page"]').allTextContents());
      const meting = await maten(page);
      const ok =
        geopend.status === 200 &&
        huidig[0] === onderdeel.nav &&
        lichaam.trim().length > 0 &&
        geopend.fouten.length === 0 &&
        meting.uit.length === 0 &&
        !meting.overlap &&
        meting.scroll <= 1 &&
        meting.kopOnderBalk &&
        !meting.fout &&
        meting.pagina?.pad === venster.pad;
      punt(
        `${onderdeel.sleutel} ${venster.width}px`,
        ok,
        ok
          ? ''
          : `status ${geopend.status}, nav "${huidig.join(', ')}", kop "${lichaam.trim()}", pad ${meting.pagina?.pad}, uit ${meting.uit.join(', ')}, overlap ${meting.overlap}, scroll ${meting.scroll}, js ${geopend.fouten.slice(0, 2).join(' | ')}`,
      );
      gemeten.push({ sleutel: onderdeel.sleutel, ...meting });
      if (venster.width === 1440 || (venster.width !== 1440 && (onderdeel.sleutel === 'verhuur' || onderdeel.sleutel === 'overzicht'))) {
        await page.screenshot({ path: path.join(uitvoer, `${onderdeel.shot}-${venster.width}.png`) });
      }
    }
    const eerste = gemeten[0];
    const zelfdeBreedte = gemeten.every(
      (item) =>
        gelijk(item.balk?.x, eerste.balk?.x) &&
        gelijk(item.balk?.w, eerste.balk?.w) &&
        gelijk(item.pagina?.x, eerste.pagina?.x) &&
        gelijk(item.pagina?.w, eerste.pagina?.w),
    );
    punt(
      `gelijke balk en werkgebied ${venster.width}px`,
      zelfdeBreedte,
      gemeten.map((item) => `${item.sleutel} balk ${item.balk?.x}/${item.balk?.w} pagina ${item.pagina?.x}/${item.pagina?.w}`).join('; '),
    );
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  const subFout = [];
  const gezien = new Set(SUB.map((pad) => pad.split('?')[0]));
  for (const pad of SUB) {
    const geopend = await openPagina(page, pad);
    const meting = await maten(page);
    const demo = meting.bron === 'demo' || meting.bron === '';
    if (geopend.status !== 200 || geopend.fouten.length || meting.uit.length || meting.scroll > 1 || meting.fout || !demo || !page.url().includes('bron=demo')) {
      subFout.push(`${pad} → ${geopend.status} ${geopend.fouten[0] ?? ''} ${meting.uit[0] ?? ''} ${meting.fout ? 'supabase' : ''} ${page.url()}`);
    }
    const links = await page.$$eval('a[href]', (lijst, origin) => {
      const uit = [];
      for (const link of lijst) {
        const ruw = link.getAttribute('href');
        if (!ruw || ruw.startsWith('#') || ruw.startsWith('mailto:') || ruw.startsWith('javascript:')) continue;
        let url;
        try {
          url = new URL(ruw, origin);
        } catch {
          continue;
        }
        if (url.origin !== origin || !url.pathname.startsWith('/beheer') || url.pathname.includes('uitloggen')) continue;
        uit.push(url.pathname + url.search);
      }
      return uit;
    }, basis);
    for (const link of links) {
      const kaal = link.split('?')[0];
      if (gezien.has(kaal)) continue;
      gezien.add(kaal);
      const vervolg = await openPagina(page, link);
      if (vervolg.status >= 400 || !vervolg.url.includes('bron=demo')) {
        subFout.push(`link ${link} → ${vervolg.status} ${vervolg.url}`);
      }
    }
  }
  punt('subpagina’s en links, nieuwe navigatie', subFout.length === 0, subFout.slice(0, 8).join(' || '));

  await page.setViewportSize({ width: 1440, height: 900 });
  await openPagina(page, '/beheer/verhuur/?jaar=2026&maand=9');
  const voor = await maten(page);
  const rijTekst = async () => (await page.locator('.kc-rij').allTextContents()).join('\n');
  const september = await rijTekst();
  await Promise.all([page.waitForURL(/maand=10/, { timeout: 20_000 }), page.selectOption('#maand', '10')]);
  const oktober = await rijTekst();
  await Promise.all([page.waitForURL(/[?&]maand=9(?:&|$)/, { timeout: 20_000 }), page.selectOption('#maand', '9')]);
  const terug = await rijTekst();
  punt(
    'verhuuragenda wisselt van maand zonder de lijst te verliezen',
    september.includes('Sanne Bakker') && september.includes('Marieke Jansen') && !oktober.includes('Sanne Bakker') && terug.includes('Sanne Bakker'),
    `september ${september.includes('Sanne Bakker')} oktober ${oktober.includes('Sanne Bakker')} terug ${terug.includes('Sanne Bakker')}`,
  );

  await page.getByRole('link', { name: /Open Marieke Jansen/ }).click();
  await page.waitForSelector('[data-kc-dossier]');
  const dossierTekst = await page.locator('[data-kc-dossier]').innerText();
  const openMeting = await maten(page);
  await page.screenshot({ path: path.join(uitvoer, 'beheer-dossier-1440.png') });
  await page.locator('#kc-sluit').click();
  await page.waitForURL((url) => !url.searchParams.has('dossier'));
  await page.getByRole('heading', { name: 'Verhuuragenda' }).waitFor();
  const dicht = (await page.locator('[data-kc-dossier]').count()) === 0;
  await page.getByRole('link', { name: /Open Marieke Jansen/ }).click();
  await page.waitForSelector('[data-kc-dossier]');
  await page.keyboard.press('Escape');
  await page.waitForURL((url) => !url.searchParams.has('dossier'));
  await page.getByRole('heading', { name: 'Verhuuragenda' }).waitFor();
  punt(
    'verhuurdossier openen en sluiten, balk blijft even breed',
    dossierTekst.includes('Marieke Jansen') &&
      dicht &&
      (await page.locator('[data-kc-dossier]').count()) === 0 &&
      gelijk(voor.balk?.w, openMeting.balk?.w) &&
      gelijk(voor.pagina?.w, openMeting.pagina?.w),
    `balk ${voor.balk?.w} → ${openMeting.balk?.w}`,
  );

  const knoppen = await page.evaluate(() => {
    const hoog = (sel) =>
      [...document.querySelectorAll(sel)]
        .map((el) => Math.round(el.getBoundingClientRect().height))
        .filter((waarde) => waarde > 0);
    return {
      knop: hoog('.kc-knop, .kc .bh-btn'),
      veld: hoog('.kc-veld select, .kc-veld input:not([type="checkbox"]), .bh-form input:not([type="checkbox"]):not([type="hidden"]):not([type="radio"]), .bh-form select, .bh-form textarea'),
    };
  });
  await openPagina(page, '/beheer/contacten/');
  const contactKnoppen = await page.evaluate(() => ({
    primair: document.querySelectorAll('a.bh-btn:not(.bh-btn--sec), button.bh-btn:not(.bh-btn--sec)').length,
    secundair: document.querySelectorAll('a.bh-btn--sec').length,
  }));
  await openPagina(page, '/beheer/instellingen/');
  const velden = await page.evaluate(() =>
    [...document.querySelectorAll('.bh-form input:not([type="checkbox"]):not([type="hidden"]), .bh-form select, .bh-form textarea')]
      .map((el) => Math.round(el.getBoundingClientRect().height))
      .filter((waarde) => waarde > 0),
  );
  await openPagina(page, '/beheer/finance/');
  const tabel = await page.evaluate(() => {
    const tabelEl = document.querySelector('table');
    if (!tabelEl) return { aanwezig: false, inKaart: false };
    let ouder = tabelEl.parentElement;
    let scroll = false;
    while (ouder) {
      const stijl = getComputedStyle(ouder);
      if (stijl.overflowX === 'auto' || stijl.overflowX === 'scroll') scroll = true;
      ouder = ouder.parentElement;
    }
    return { aanwezig: true, inKaart: scroll || tabelEl.getBoundingClientRect().width <= window.innerWidth + 1 };
  });
  punt(
    'knoppen, velden, contacten en tabel',
    knoppen.knop.length >= 2 &&
      knoppen.knop.every((hoogte) => hoogte >= 48) &&
      knoppen.veld.length >= 3 &&
      knoppen.veld.every((hoogte) => hoogte >= 52) &&
      velden.length >= 2 &&
      velden.every((hoogte) => hoogte >= 52) &&
      contactKnoppen.primair === 0 &&
      contactKnoppen.secundair === 3 &&
      tabel.aanwezig &&
      tabel.inKaart,
    `knoppen ${knoppen.knop.join(',')} velden ${[...knoppen.veld, ...velden].join(',')} contact ${contactKnoppen.secundair} tabel ${tabel.aanwezig}/${tabel.inKaart}`,
  );

  const zoek = await openPagina(page, '/beheer/zoeken/?q=Marieke');
  const zoekTekst = await page.locator('body').innerText();
  punt('zoeken op voorbeelddata', zoek.status === 200 && zoekTekst.includes('Marieke') && zoekTekst.includes('Voorbeelddata'), '');

  const banner = await openPagina(page, '/beheer/');
  const bannerTekst = await page.locator('[data-beheer-bron]').innerText();
  punt('voorbeeldbanner op overzicht', banner.status === 200 && bannerTekst.includes('Voorbeelddata'), bannerTekst.slice(0, 140));

  await context.close();
}

async function scenarioOudMenu(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'nl-NL' });
  await context.route(/supabase\.co/, (route) => route.abort());
  const page = await context.newPage();
  const geopend = await openPagina(page, '/beheer/');
  const menu = schoon(await page.locator('.bh-menu a').allTextContents());
  const schil = await page.locator('[data-beheer-nav]').count();
  await page.screenshot({ path: path.join(uitvoer, 'beheer-oude-navigatie-1440.png') });
  punt(
    'oude navigatie met BEHEER_HOOFDNAV uit',
    geopend.status === 200 && schil === 0 && menu.includes('Migratie') && menu.includes('Boekingen'),
    menu.join(', '),
  );
  await openPagina(page, '/beheer/verhuur/?jaar=2026&maand=9');
  const nav = schoon(await page.locator('[data-beheer-nav] a').allTextContents());
  const heeftMarieke = (await page.locator('body').innerText()).includes('Marieke Jansen');
  punt(
    'verhuuragenda blijft met oude navigatie',
    nav.includes('Verhuur') && nav.includes('Website') && !nav.includes('Contacten') && heeftMarieke,
    nav.join(', '),
  );
  await page.getByRole('link', { name: /Open Marieke Jansen/ }).click();
  await page.waitForSelector('[data-kc-dossier]');
  await page.locator('#kc-sluit').click();
  await page.waitForSelector('[data-kc-dossier]', { state: 'detached' });
  punt('dossier in de oude navigatie', (await page.locator('[data-kc-dossier]').count()) === 0, '');
  await page.setViewportSize({ width: 390, height: 844 });
  const smalleFout = [];
  for (const pad of ['/beheer/', '/beheer/boekingen/', '/beheer/aanvragen/', '/beheer/finance/']) {
    const smal = await openPagina(page, pad);
    const smalMeting = await maten(page);
    if (smal.status !== 200 || smalMeting.scroll > 1 || smalMeting.uit.length > 0) {
      smalleFout.push(`${pad} ${smal.status} ${smalMeting.uit.join(', ')} scroll ${smalMeting.scroll}`);
    }
  }
  punt('oude navigatie op 390px zonder horizontale pagina-overflow', smalleFout.length === 0, smalleFout.join(' || '));
  await context.close();
}

async function scenarioZonderAgenda(browser, hoofdnav) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'nl-NL' });
  await context.route(/supabase\.co/, (route) => route.abort());
  const page = await context.newPage();
  const label = hoofdnav ? 'nieuwe navigatie zonder VERHUUR_OVERZICHT' : 'oude navigatie zonder VERHUUR_OVERZICHT';
  await openPagina(page, '/beheer/');
  if (hoofdnav) {
    const verhuur = await page.locator('[data-beheer-nav] a', { hasText: 'Verhuur' }).getAttribute('href');
    const website = await page.locator('[data-beheer-nav] a', { hasText: 'Website' }).getAttribute('href');
    const agenda = await openPagina(page, '/beheer/verhuur/');
    const site = await openPagina(page, '/beheer/website/');
    const boekingen = await openPagina(page, '/beheer/boekingen/');
    punt(
      label,
      verhuur?.includes('/beheer/boekingen/') &&
        website?.includes('/beheer/agenda/') &&
        agenda.status === 404 &&
        site.status === 404 &&
        boekingen.status === 200,
      `verhuur ${verhuur} website ${website} agenda ${agenda.status} site ${site.status} boekingen ${boekingen.status}`,
    );
  } else {
    const hrefs = await page.locator('a').evaluateAll((lijst) => lijst.map((el) => el.getAttribute('href') ?? ''));
    const agenda = await openPagina(page, '/beheer/verhuur/');
    const site = await openPagina(page, '/beheer/website/');
    const boekingen = await openPagina(page, '/beheer/boekingen/');
    punt(
      label,
      !hrefs.some((href) => href.includes('/beheer/verhuur')) &&
        !hrefs.some((href) => href.includes('/beheer/website')) &&
        agenda.status === 404 &&
        site.status === 404 &&
        boekingen.status === 200,
      `agenda ${agenda.status} site ${site.status} boekingen ${boekingen.status}`,
    );
  }
  await context.close();
}

async function scenarioRechten(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'nl-NL' });
  await context.route(/supabase\.co/, (route) => route.abort());
  const page = await context.newPage();
  await openPagina(page, '/beheer/?kijk=rol:hans');
  const nav = schoon(await page.locator('[data-beheer-nav] a').allTextContents());
  const finance = await openPagina(page, '/beheer/finance/?kijk=rol:hans');
  const financeTekst = await page.locator('body').innerText();
  const admin = await openPagina(page, '/beheer/finance/');
  punt(
    'rechten: beperkte rol ziet geen financiën, super admin wel',
    nav.join('|') === 'Overzicht' && finance.status === 403 && financeTekst.includes('Geen toegang') && admin.status === 200,
    `nav ${nav.join(', ')} finance ${finance.status} admin ${admin.status}`,
  );
  const post = await page.request.post(`${basis}/beheer/instellingen/?bron=demo`, {
    headers: { origin: basis, 'content-type': 'application/x-www-form-urlencoded' },
    data: 'tijden=gewijzigd',
  });
  const postTekst = await post.text();
  const dossierPost = await page.request.post(`${basis}/beheer/verhuur/dossier?bron=demo`, {
    headers: { origin: basis, 'content-type': 'application/x-www-form-urlencoded' },
    data: 'id=b-042',
  });
  punt(
    'acceptatietest schrijft niets',
    post.status() === 403 && postTekst.includes('wijzigt niets') && dossierPost.status() === 403,
    `instellingen ${post.status()} dossier ${dossierPost.status()}`,
  );
  await context.close();
}

async function metServer(extra, werk) {
  const server = startServer(extra);
  try {
    await wachtOpServer(server);
    await werk();
  } finally {
    server.stop();
    await new Promise((r) => setTimeout(r, 600));
  }
}

const browser = await chromium.launch({ headless: true });
await mkdir(uitvoer, { recursive: true });
try {
  await metServer({ BEHEER_HOOFDNAV: 'true', VERHUUR_OVERZICHT: 'true' }, async () => {
    await scenarioNieuw(browser);
    await scenarioRechten(browser);
  });
  await metServer({ BEHEER_HOOFDNAV: 'false', VERHUUR_OVERZICHT: 'true' }, async () => {
    await scenarioOudMenu(browser);
  });
  await metServer({ BEHEER_HOOFDNAV: 'true', VERHUUR_OVERZICHT: 'false' }, async () => {
    await scenarioZonderAgenda(browser, true);
  });
  await metServer({ BEHEER_HOOFDNAV: 'false', VERHUUR_OVERZICHT: 'false' }, async () => {
    await scenarioZonderAgenda(browser, false);
  });
} finally {
  await browser.close();
}

const rapport = {
  wanneer: new Date().toISOString(),
  omgeving: 'astro dev op 127.0.0.1, BEHEER_ACCEPTATIE=lokaal, ?bron=demo, geen Supabase',
  uitslag,
};
await writeFile(path.join(uitvoer, 'acceptatie-rapport.json'), JSON.stringify(rapport, null, 2));
const gefaald = uitslag.filter((item) => item.status === 'gefaald');
console.log(`\n${uitslag.length - gefaald.length}/${uitslag.length} geslaagd`);
if (gefaald.length) process.exitCode = 1;
