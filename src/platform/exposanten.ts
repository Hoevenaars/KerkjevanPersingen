/**
 * Meerdere exposanten in het bestaande tekstveld.
 * Nieuwe lijsten staan op aparte regels, zodat de volgorde vastligt.
 * Een oude enkele regel blijft één naam, ook als daar een komma in staat.
 */

export function parseExposanten(tekst: string | null | undefined): string[] {
  const ruw = (tekst ?? '').replace(/\r\n/g, '\n').trim();
  if (!ruw) return [];
  if (ruw.includes('\n')) {
    return ruw.split('\n').map((naam) => naam.trim()).filter(Boolean);
  }
  return [ruw];
}

export function serializeExposanten(namen: readonly string[]): string {
  return namen.map((naam) => naam.trim()).filter(Boolean).join('\n');
}

/** Leesbare lijst voor agenda en expositiepagina. Eén oude regel blijft zoals hij was. */
export function formatExposantenWeergave(tekst: string | null | undefined): string {
  const namen = parseExposanten(tekst);
  if (namen.length <= 1) return namen[0] ?? '';
  return namen.join(', ');
}

export function exposantenUitFormulier(waarden: readonly unknown[]): string[] {
  return waarden.map((waarde) => String(waarde ?? '').trim()).filter(Boolean);
}
