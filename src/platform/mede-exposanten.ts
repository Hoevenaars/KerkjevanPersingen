/**
 * Mede-exposanten. De hoofdaanvrager telt niet mee.
 * Nieuwe aanvragen bewaren een JSON-array in het bestaande tekstveld.
 * Oude vrije tekst blijft leesbaar.
 */

export const MAX_MEDE_EXPOSANTEN = 4;
export const MEDE_EXPOSANT_MAX_LENGTE = 120;

export function serialiseerMedeExposanten(namen: readonly string[]): string {
  const schoon = namen.map((naam) => naam.trim()).filter(Boolean);
  return schoon.length === 0 ? '' : JSON.stringify(schoon);
}

export function parseMedeExposanten(waarde: string | null | undefined): string[] {
  const tekst = (waarde ?? '').trim();
  if (!tekst) return [];
  if (tekst.startsWith('[')) {
    try {
      const parsed = JSON.parse(tekst) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }
  if (tekst.includes('\n')) {
    return tekst.split('\n').map((regel) => regel.trim()).filter(Boolean);
  }
  return [tekst];
}

export function medeExposantenFout(waarde: string | null | undefined): string | null {
  const tekst = (waarde ?? '').trim();
  if (!tekst) return null;
  if (tekst.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(tekst);
    } catch {
      return 'De mede-exposanten zijn niet leesbaar.';
    }
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
      return 'De mede-exposanten zijn niet leesbaar.';
    }
  }
  const namen = parseMedeExposanten(tekst);
  if (namen.length > MAX_MEDE_EXPOSANTEN) {
    return 'Je kunt maximaal 4 mede-exposanten toevoegen.';
  }
  if (namen.some((naam) => naam.length > MEDE_EXPOSANT_MAX_LENGTE)) {
    return 'Een naam van een mede-exposant is te lang.';
  }
  return null;
}

/** Eén leesbare regel voor mail en beheer. */
export function toonMedeExposanten(waarde: string | null | undefined): string {
  return parseMedeExposanten(waarde).join(', ');
}
