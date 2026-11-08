/**
 * Het nieuwe verhuuroverzicht blijft dicht tot VERHUUR_OVERZICHT=true.
 * Preview, development en BEHEER_ENABLED zetten deze vlag niet aan.
 */

function leesOmgeving(): Record<string, unknown> {
  const runtime = typeof process !== 'undefined' ? process.env : undefined;
  const meta = import.meta.env as Record<string, unknown>;
  return {
    VERHUUR_OVERZICHT: runtime?.['VERHUUR_OVERZICHT'] ?? meta.VERHUUR_OVERZICHT,
  };
}

export function verhuurOverzichtAan(env: Record<string, unknown> = leesOmgeving()): boolean {
  const waarde = env.VERHUUR_OVERZICHT;
  return waarde === true || waarde === 'true';
}

export function verhuurVerzoekToegestaan(methode: string): boolean {
  const normaal = methode.toUpperCase();
  return normaal === 'GET' || normaal === 'HEAD';
}
