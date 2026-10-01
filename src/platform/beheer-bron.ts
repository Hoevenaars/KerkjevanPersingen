/**
 * Databron voor /beheer: Supabase. Geen Sanity-fallback.
 * Voorbeelddata alleen via ?bron=demo.
 */

import { supabaseLoginUitOmgeving, STANDAARD_SUPER_ADMIN_EMAIL, STANDAARD_SUPABASE_PUBLISHABLE_KEY, STANDAARD_SUPABASE_URL } from '../lib/supabase-project.ts';
import { huidigeContentBron } from './bron.ts';
import { ymdInAmsterdam } from './datum.ts';
import { leesSupabaseBeheer, supabaseFoutSnapshot, type SupabaseLeesClient } from './beheer-supabase-lees.ts';
import { bewaarRequestSnapshot, gekoppeldeSupabaseClient, leesRequestSnapshot } from './sanity-registratie.ts';
import {
  DEMO_AANVRAGEN,
  DEMO_AGENDA,
  DEMO_BANNER,
  DEMO_BOEKINGEN,
  DEMO_COMMUNICATIE,
  DEMO_DOCUMENTEN,
  DEMO_FLASH,
  DEMO_GASTHEREN,
  DEMO_INSTELLINGEN,
  DEMO_INTERN,
  DEMO_NIEUWSBRIEVEN,
  DEMO_RELATIES,
  DEMO_VRIENDEN,
  dashboardBronVan,
  type DemoAanvraag,
  type DemoActiviteit,
  type DemoBoeking,
  type DemoGastheer,
  type DemoInstellingen,
  type DemoIntern,
  type DemoNieuwsbrief,
  type DemoRelatie,
  type DemoTemplate,
  type DemoVriend,
} from './demo-data.ts';
import type { MigratieResultaat } from './migratie-transform.ts';
import { laadMailtemplates, mailtemplatesNaarDemo } from './mailtemplates/index.ts';

export type BeheerBronSoort = 'demo' | 'sanity' | 'supabase';

export interface BeheerSnapshot {
  bron: BeheerBronSoort;
  banner: string;
  reden: string;
  aanvragen: DemoAanvraag[];
  boekingen: DemoBoeking[];
  agenda: DemoActiviteit[];
  intern: DemoIntern[];
  relaties: DemoRelatie[];
  gastheren: DemoGastheer[];
  vrienden: DemoVriend[];
  nieuwsbrieven: DemoNieuwsbrief[];
  templates: DemoTemplate[];
  instellingen: DemoInstellingen;
  communicatie: { id: string; boekingId: string; template: string; status: string; wanneer: string; ontvanger: string }[];
  documenten: { id: string; boekingId: string; naam: string; soort: string; datum: string }[];
  migratie: MigratieResultaat | null;
  betalingen?: import('./beheer-supabase-lees.ts').BeheerBetaling[];
  toewijzingen?: import('./beheer-supabase-lees.ts').BeheerToewijzing[];
  fout?: string | null;
  alleenLezen?: boolean;
  instellingenHerkomst?: 'supabase' | 'demo' | 'leeg';
  tarieven?: {
    verhuurtype: string;
    prijstype: string;
    bedrag: number | null;
    geldigVanaf: string;
    geldigTot: string | null;
    toelichting: string;
  }[];
  incidenten?: { id: string; boekingId: string; omschrijving: string; status: string }[];
  signalen?: {
    boekingId: string;
    titel: string;
    start: string;
    uitkomst: 'gereed' | 'actie_vereist';
    issues: { oorzaak: string; eigenaar: string; deadline: string | null; actie: string }[];
  }[];
  technisch?: number;
}

const LIVE_BANNER =
  'Live Sanity, alleen lezen. Schrijven blijft in Studio. Niets wordt opgeslagen, gemaild of naar de website gestuurd.';

export function omgevingsRecord(): Record<string, unknown> {
  const runtime = typeof process !== 'undefined' ? process.env : {};
  const meta = (typeof import.meta !== 'undefined' ? import.meta.env : {}) as Record<string, unknown>;
  const samen: Record<string, unknown> = { ...runtime, ...meta };
  if (!supabaseLoginUitOmgeving(samen)) {
    samen.SUPABASE_URL = STANDAARD_SUPABASE_URL;
    samen.SUPABASE_PUBLISHABLE_KEY = STANDAARD_SUPABASE_PUBLISHABLE_KEY;
  }
  if (!String(samen.SUPER_ADMIN_EMAIL ?? '').trim()) {
    samen.SUPER_ADMIN_EMAIL = STANDAARD_SUPER_ADMIN_EMAIL;
  }
  return samen;
}

/**
 * Live Sanity in /beheer mag alleen als individuele Supabase-login aan staat.
 * BEHEER_LIVE_SANITY=false forceert voorbeelddata. Een gedeeld sitewachtwoord telt niet.
 */
export function magLiveSanityLezen(env: Record<string, unknown> = omgevingsRecord()): boolean {
  if (env.BEHEER_LIVE_SANITY === false || env.BEHEER_LIVE_SANITY === 'false') return false;
  const projectId = String(env.SANITY_PROJECT_ID ?? '').trim();
  if (!projectId) return false;
  return supabaseLoginUitOmgeving(env) !== null;
}

export async function demoSnapshot(reden = 'Voorbeelddata — niet gekoppeld aan Sanity of de live site.'): Promise<BeheerSnapshot> {
  const mailtemplates = await laadMailtemplates();
  return {
    bron: 'demo',
    banner: DEMO_BANNER,
    reden,
    aanvragen: DEMO_AANVRAGEN,
    boekingen: DEMO_BOEKINGEN,
    agenda: DEMO_AGENDA,
    intern: DEMO_INTERN,
    relaties: DEMO_RELATIES,
    gastheren: DEMO_GASTHEREN,
    vrienden: DEMO_VRIENDEN,
    nieuwsbrieven: DEMO_NIEUWSBRIEVEN,
    templates: mailtemplatesNaarDemo(mailtemplates),
    instellingen: DEMO_INSTELLINGEN,
    communicatie: [...DEMO_COMMUNICATIE],
    documenten: [...DEMO_DOCUMENTEN],
    migratie: null,
  };
}

export async function snapshotVanMigratie(resultaat: MigratieResultaat): Promise<BeheerSnapshot> {
  const mailtemplates = await laadMailtemplates();
  return {
    bron: 'sanity',
    banner: LIVE_BANNER,
    reden: 'Sanity-productiedata, alleen-lezen mapping naar het beheerdatamodel.',
    aanvragen: resultaat.aanvragen,
    boekingen: resultaat.boekingen,
    agenda: resultaat.agenda,
    intern: resultaat.intern,
    relaties: resultaat.relaties,
    gastheren: resultaat.gastheren,
    vrienden: resultaat.vrienden,
    nieuwsbrieven: resultaat.nieuwsbrieven,
    templates: mailtemplatesNaarDemo(mailtemplates),
    instellingen: resultaat.instellingen,
    communicatie: [],
    documenten: [],
    migratie: resultaat,
  };
}

export function schrijfActieFlash(bron: BeheerBronSoort): string {
  if (bron === 'supabase') return 'Opgeslagen in Supabase. Sanity en de productiesite zijn niet gewijzigd.';
  if (bron === 'sanity') {
    return 'Actie niet uitgevoerd — /beheer schrijft nog niet. Wijzigingen gaan via Sanity Studio.';
  }
  return DEMO_FLASH;
}

let cache: { key: string; at: number; waarde: Promise<BeheerSnapshot> } | null = null;

export function resetBeheerBronCache(): void {
  cache = null;
}

interface BeheerCookieBron {
  set: (name: string, value: string, options?: Record<string, unknown>) => void;
}

/**
 * Welke client het beheeroverzicht leest.
 * Een meegegeven of uit het verzoek opgebouwde sessie wint.
 * De service-role is alleen de terugval voor scripts zonder verzoek.
 * Een expliciet lege client zonder verzoek blijft leeg, zodat een
 * afgekeurde service-role geen "Invalid API key" op de banner zet.
 */
export function kiesBeheerLezer(input: {
  meegegeven: SupabaseLeesClient | null;
  clientMeegegeven: boolean;
  sessieUitVerzoek: SupabaseLeesClient | null;
  heeftVerzoek: boolean;
  admin: SupabaseLeesClient | null;
}): SupabaseLeesClient | null {
  if (input.meegegeven) return input.meegegeven;
  if (input.heeftVerzoek) return input.sessieUitVerzoek;
  if (!input.clientMeegegeven) return input.admin;
  return null;
}

export function beheerSnapshotOpties(astro: {
  url: URL;
  request: Request;
  cookies: BeheerCookieBron;
  locals: { supabase?: SupabaseLeesClient | null; supabaseCookies?: Headers };
}) {
  return {
    url: astro.url,
    client: astro.locals.supabase ?? null,
    request: astro.request,
    cookies: astro.cookies,
    responseHeaders: astro.locals.supabaseCookies,
  };
}

export async function laadBeheerSnapshot(opties: {
  url?: URL;
  env?: Record<string, unknown>;
  forceDemo?: boolean;
  client?: SupabaseLeesClient | null;
  request?: Request;
  cookies?: BeheerCookieBron;
  responseHeaders?: Headers;
} = {}): Promise<BeheerSnapshot> {
  const env = opties.env ?? omgevingsRecord();
  const gekozen = opties.url?.searchParams.get('bron');
  const forceDemo = opties.forceDemo === true || gekozen === 'demo';
  const forceSupabase = gekozen === 'supabase';
  const key = forceDemo ? 'demo' : 'supabase';
  const nu = Date.now();
  if (forceSupabase) {
    const bestaand = leesRequestSnapshot<BeheerSnapshot>();
    if (bestaand) return bestaand;
  }
  const clientMeegegeven = Object.prototype.hasOwnProperty.call(opties, 'client');
  const meegegeven = clientMeegegeven ? (opties.client ?? null) : gekoppeldeSupabaseClient();
  const heeftVerzoek = Boolean(opties.request && opties.cookies);
  const client = await losBeheerLezerOp({ env, meegegeven, clientMeegegeven, heeftVerzoek, opties });
  const gedeeldeCache = !client && !forceDemo && !forceSupabase;
  if (gedeeldeCache && cache && cache.key === key && nu - cache.at < 8_000) return cache.waarde;
  const waarde = laadBeheerSnapshotOngecached({ env, forceDemo, client });
  if (forceSupabase) bewaarRequestSnapshot(waarde);
  else if (!client) cache = { key, at: nu, waarde };
  return waarde;
}

async function losBeheerLezerOp(input: {
  env: Record<string, unknown>;
  meegegeven: SupabaseLeesClient | null;
  clientMeegegeven: boolean;
  heeftVerzoek: boolean;
  opties: {
    request?: Request;
    cookies?: BeheerCookieBron;
    responseHeaders?: Headers;
  };
}): Promise<SupabaseLeesClient | null> {
  let sessieUitVerzoek: SupabaseLeesClient | null = null;
  let admin: SupabaseLeesClient | null = null;
  if (!input.meegegeven && input.heeftVerzoek && input.opties.request && input.opties.cookies) {
    const { maakBeheerServerClient } = await import('../lib/supabase.ts');
    sessieUitVerzoek = maakBeheerServerClient({
      request: input.opties.request,
      cookies: input.opties.cookies as import('astro').AstroCookies,
      env: input.env,
      responseHeaders: input.opties.responseHeaders,
    }) as SupabaseLeesClient | null;
  } else if (!input.meegegeven && !input.clientMeegegeven && !input.heeftVerzoek) {
    const { maakBeheerAdminClient } = await import('../lib/supabase.ts');
    admin = maakBeheerAdminClient(input.env) as SupabaseLeesClient | null;
  }
  return kiesBeheerLezer({
    meegegeven: input.meegegeven,
    clientMeegegeven: input.clientMeegegeven,
    sessieUitVerzoek,
    heeftVerzoek: input.heeftVerzoek,
    admin,
  });
}

async function supabaseTestSnapshot(
  env: Record<string, unknown>,
  client: SupabaseLeesClient | null,
): Promise<BeheerSnapshot> {
  if (!client) {
    throw new Error('Geen ingelogde Supabase-client. De service-role wordt niet gebruikt voor dit overzicht.');
  }
  return leesSupabaseBeheer(client, {
    vandaag: ymdInAmsterdam(new Date()),
    testmodus: huidigeContentBron(env) !== 'supabase',
  });
}

async function laadBeheerSnapshotOngecached(opties: {
  env: Record<string, unknown>;
  forceDemo: boolean;
  client: SupabaseLeesClient | null;
}): Promise<BeheerSnapshot> {
  if (opties.forceDemo) {
    return demoSnapshot('Voorbeelddata — bewust gekozen via ?bron=demo.');
  }
  try {
    return await supabaseTestSnapshot(opties.env, opties.client);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'onbekende fout';
    return supabaseFoutSnapshot(detail);
  }
}

export function snapshotDashboard(snapshot: BeheerSnapshot, vandaag = ymdInAmsterdam(new Date())) {
  return dashboardBronVan(
    {
      aanvragen: snapshot.aanvragen,
      boekingen: snapshot.boekingen,
      agenda: snapshot.agenda,
      nieuwsbrieven: snapshot.nieuwsbrieven,
      communicatie: snapshot.communicatie,
    },
    vandaag,
  );
}

export function beheerId(waarde: string | undefined): string {
  return decodeURIComponent(waarde ?? '');
}
