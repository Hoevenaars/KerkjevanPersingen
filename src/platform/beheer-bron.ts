/**
 * Databron voor /beheer: live Sanity (alleen lezen) of voorbeelddata.
 *
 * Live data alleen als Sanity geconfigureerd is én /beheer al achter een
 * wachtwoord zit (BEHEER_PASSWORD of SITE_PASSWORD). Zonder dat blijft de
 * klikbare demo staan — persoonsgegevens komen nooit op een open URL.
 */

import { ymdInAmsterdam } from './datum.ts';
import { beheerWachtwoord } from './beheer-gate.ts';
import {
  DEMO_AANVRAGEN,
  DEMO_AGENDA,
  DEMO_BANNER,
  DEMO_BOEKINGEN,
  DEMO_COMMUNICATIE,
  DEMO_DOCUMENTEN,
  DEMO_FLASH,
  DEMO_GASTHEREN,
  DEMO_GEBRUIKERS,
  DEMO_INSTELLINGEN,
  DEMO_INTERN,
  DEMO_NIEUWSBRIEVEN,
  DEMO_RELATIES,
  DEMO_TEMPLATES,
  DEMO_VRIENDEN,
  dashboardBronVan,
  type DemoAanvraag,
  type DemoActiviteit,
  type DemoBoeking,
  type DemoGastheer,
  type DemoGebruiker,
  type DemoInstellingen,
  type DemoIntern,
  type DemoNieuwsbrief,
  type DemoRelatie,
  type DemoTemplate,
  type DemoVriend,
} from './demo-data.ts';
import { transformSanityDump, type MigratieResultaat } from './migratie-transform.ts';

export type BeheerBronSoort = 'demo' | 'sanity';

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
  gebruikers: DemoGebruiker[];
  instellingen: DemoInstellingen;
  communicatie: { id: string; boekingId: string; template: string; status: string; wanneer: string; ontvanger: string }[];
  documenten: { id: string; boekingId: string; naam: string; soort: string; datum: string }[];
  migratie: MigratieResultaat | null;
}

const LIVE_BANNER =
  'Live Sanity, alleen lezen. Schrijven blijft in Studio. Niets wordt opgeslagen, gemaild of naar de website gestuurd.';

export function omgevingsRecord(): Record<string, unknown> {
  const runtime = typeof process !== 'undefined' ? process.env : {};
  const meta = (typeof import.meta !== 'undefined' ? import.meta.env : {}) as Record<string, unknown>;
  return { ...runtime, ...meta };
}

/**
 * Live Sanity in /beheer mag alleen als er al een wachtwoord op /beheer staat.
 * BEHEER_LIVE_SANITY=false forceert voorbeelddata.
 */
export function magLiveSanityLezen(env: Record<string, unknown> = omgevingsRecord()): boolean {
  if (env.BEHEER_LIVE_SANITY === false || env.BEHEER_LIVE_SANITY === 'false') return false;
  const projectId = String(env.SANITY_PROJECT_ID ?? '').trim();
  if (!projectId) return false;
  return beheerWachtwoord(env).length > 0;
}

export function demoSnapshot(reden = 'Voorbeelddata — niet gekoppeld aan Sanity of de live site.'): BeheerSnapshot {
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
    templates: DEMO_TEMPLATES,
    gebruikers: DEMO_GEBRUIKERS,
    instellingen: DEMO_INSTELLINGEN,
    communicatie: [...DEMO_COMMUNICATIE],
    documenten: [...DEMO_DOCUMENTEN],
    migratie: null,
  };
}

export function snapshotVanMigratie(resultaat: MigratieResultaat): BeheerSnapshot {
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
    templates: resultaat.templates,
    gebruikers: DEMO_GEBRUIKERS,
    instellingen: resultaat.instellingen,
    communicatie: [],
    documenten: [],
    migratie: resultaat,
  };
}

export function schrijfActieFlash(bron: BeheerBronSoort): string {
  if (bron === 'sanity') {
    return 'Actie niet uitgevoerd — /beheer schrijft nog niet. Wijzigingen gaan via Sanity Studio.';
  }
  return DEMO_FLASH;
}

let cache: { key: string; at: number; waarde: Promise<BeheerSnapshot> } | null = null;

export function resetBeheerBronCache(): void {
  cache = null;
}

export async function laadBeheerSnapshot(opties: {
  url?: URL;
  env?: Record<string, unknown>;
  forceDemo?: boolean;
} = {}): Promise<BeheerSnapshot> {
  const env = opties.env ?? omgevingsRecord();
  const forceDemo =
    opties.forceDemo === true || opties.url?.searchParams.get('bron') === 'demo';
  const key = `${forceDemo ? 'demo' : 'auto'}:${String(env.SANITY_PROJECT_ID ?? '')}`;
  const nu = Date.now();
  if (cache && cache.key === key && nu - cache.at < 8_000) return cache.waarde;

  const waarde = laadBeheerSnapshotOngecached({ env, forceDemo });
  cache = { key, at: nu, waarde };
  return waarde;
}

async function laadBeheerSnapshotOngecached(opties: {
  env: Record<string, unknown>;
  forceDemo: boolean;
}): Promise<BeheerSnapshot> {
  if (opties.forceDemo) {
    return demoSnapshot('Voorbeelddata — bewust gekozen via ?bron=demo.');
  }
  if (!magLiveSanityLezen(opties.env)) {
    const heeftProject = String(opties.env.SANITY_PROJECT_ID ?? '').trim().length > 0;
    const reden = heeftProject
      ? 'Sanity is geconfigureerd, maar /beheer heeft geen wachtwoord. Voorbeelddata blijft staan tot BEHEER_PASSWORD of SITE_PASSWORD is gezet.'
      : 'Geen Sanity-project in deze omgeving — voorbeelddata.';
    return demoSnapshot(reden);
  }

  try {
    const { haalSanityDump } = await import('../lib/sanity-beheer.ts');
    const dump = await haalSanityDump(opties.env);
    return snapshotVanMigratie(transformSanityDump(dump));
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'onbekende fout';
    console.error('[beheer] Sanity-dump mislukt, val terug op voorbeelddata', error);
    return demoSnapshot(`Sanity kon niet worden gelezen (${detail}). Voorbeelddata als vangnet.`);
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
