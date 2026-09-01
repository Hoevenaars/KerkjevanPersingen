/**
 * Schrijvende en lezende bron per datatype.
 *
 * Tot de gecontroleerde omschakeling blijft Sanity leidend. Twee sloten
 * voorkomen dat een per ongeluk gezette omgevingsvariabele de website
 * al op Supabase zet (FO §73: één schrijvende bron, geen stille cutover).
 */

import type { ContentBron, Datatype, SchrijvendeBron } from './types.ts';
import { DATATYPEN } from './types.ts';

export const STANDAARD_SCHRIJVENDE_BRON: SchrijvendeBron = 'sanity';
export const STANDAARD_CONTENT_BRON: ContentBron = 'sanity';

export type BronnenTabel = Record<Datatype, SchrijvendeBron>;

export function standaardBronnen(): BronnenTabel {
  return Object.fromEntries(DATATYPEN.map((type) => [type, STANDAARD_SCHRIJVENDE_BRON])) as BronnenTabel;
}

/**
 * Publieke website leest Sanity, tenzij beide vlaggen bewust aan staan.
 * De website gebruikt deze functie nog niet: eerst parallel controleren.
 */
export function huidigeContentBron(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): ContentBron {
  const toegestaan = env.ALLOW_SUPABASE_CONTENT === 'true';
  const gekozen = env.CONTENT_BRON;
  if (toegestaan && gekozen === 'supabase') return 'supabase';
  return 'sanity';
}

export function beheerIngeschakeld(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): boolean {
  return env.BEHEER_ENABLED === 'true';
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
