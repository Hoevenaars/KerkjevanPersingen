/**
 * Het nieuwe verhuuroverzicht blijft dicht tot het bestuur het aanzet.
 * Afwezig of iets anders dan true betekent uit. Productie zet deze vlag niet.
 */

import { vlagAan } from './bron.ts';

export function verhuurOverzichtAan(env: Record<string, unknown>): boolean {
  return vlagAan(env.VERHUUR_OVERZICHT);
}
