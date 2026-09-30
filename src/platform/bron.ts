/**
 * Schrijvende en lezende bron per datatype.
 *
 * Na de cutover is Supabase de enige runtimebron wanneer beide vlaggen aan staan.
 * `beheer` in public.bronnen is die schrijvende bron. Sanity blijft alleen
 * bereikbaar als de vlaggen teruggezet worden.
 */

import type { ContentBron, Datatype, SchrijvendeBron } from './types.ts';
import { DATATYPEN } from './types.ts';

export const STANDAARD_SCHRIJVENDE_BRON: SchrijvendeBron = 'sanity';
export const STANDAARD_CONTENT_BRON: ContentBron = 'sanity';

export type BronnenTabel = Record<Datatype, SchrijvendeBron>;

export function standaardBronnen(env: NodeJS.ProcessEnv | Record<string, unknown> = process.env): BronnenTabel {
  const bron: SchrijvendeBron = huidigeContentBron(env) === 'supabase' ? 'beheer' : STANDAARD_SCHRIJVENDE_BRON;
  return Object.fromEntries(DATATYPEN.map((type) => [type, bron])) as BronnenTabel;
}

export function vlagAan(waarde: unknown): boolean {
  return waarde === true || waarde === 'true';
}

/**
 * Astro kan `import.meta.env.X=true` naar boolean `true` omzetten; daarom
 * accepteren we zowel de string als de boolean. Zonder beide vlaggen blijft
 * de rollbackbron Sanity.
 */
export function huidigeContentBron(env: NodeJS.ProcessEnv | Record<string, unknown> = process.env): ContentBron {
  const toegestaan = vlagAan(env.ALLOW_SUPABASE_CONTENT);
  const gekozen = env.CONTENT_BRON;
  if (toegestaan && gekozen === 'supabase') return 'supabase';
  return 'sanity';
}

export function beheerIngeschakeld(env: NodeJS.ProcessEnv | Record<string, unknown> = process.env): boolean {
  return vlagAan(env.BEHEER_ENABLED);
}

/**
 * Mag /beheer getoond worden?
 *
 * Production: alleen met BEHEER_ENABLED=true.
 * Vercel Preview: altijd, omdat Preview vaak niet dezelfde env heeft als Production.
 * Anders krijg je een lege 404 (geen site-404) en lijkt het of de bouwplaats weg is.
 */
export function beheerZichtbaar(env: NodeJS.ProcessEnv | Record<string, unknown> = process.env): boolean {
  if (beheerIngeschakeld(env)) return true;
  if (env.VERCEL_ENV === 'preview') return true;
  return env.DEV === true || env.DEV === 'true';
}

export function magSchrijvenNaarBeheer(
  datatype: Datatype,
  bronnen: BronnenTabel = standaardBronnen(),
): boolean {
  return bronnen[datatype] === 'beheer';
}

export function magSchrijvenNaarSanity(
  datatype: Datatype,
  bronnen: BronnenTabel = standaardBronnen(),
): boolean {
  return bronnen[datatype] === 'sanity';
}
