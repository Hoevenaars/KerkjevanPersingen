/**
 * Supabase is de enige lees- en schrijfbron.
 * `beheer` in public.bronnen is de schrijvende bron per datatype.
 */

import type { ContentBron, Datatype, SchrijvendeBron } from './types.ts';
import { DATATYPEN } from './types.ts';

export const STANDAARD_SCHRIJVENDE_BRON: SchrijvendeBron = 'beheer';
export const STANDAARD_CONTENT_BRON: ContentBron = 'supabase';

export type BronnenTabel = Record<Datatype, SchrijvendeBron>;

export function standaardBronnen(_env: NodeJS.ProcessEnv | Record<string, unknown> = process.env): BronnenTabel {
  return Object.fromEntries(DATATYPEN.map((type) => [type, STANDAARD_SCHRIJVENDE_BRON])) as BronnenTabel;
}

export function vlagAan(waarde: unknown): boolean {
  return waarde === true || waarde === 'true';
}

export function huidigeContentBron(_env: NodeJS.ProcessEnv | Record<string, unknown> = process.env): ContentBron {
  return 'supabase';
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
