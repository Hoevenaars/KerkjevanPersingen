/**
 * Gestructureerd adres voor nieuwe aanvragen.
 * Het samengestelde veld `adres` blijft de regel die mails en oud beheer lezen.
 * Historische rijen met alleen `adres` worden niet uit elkaar getrokken.
 */

export interface AdresOnderdelen {
  straat: string;
  huisnummer: string;
  toevoeging: string;
  postcode: string;
  woonplaats: string;
}

const NL_POSTCODE = /^(\d{4})\s*([A-Za-z]{2})$/;

export function normaliseerPostcode(waarde: string): string {
  const tekst = waarde.trim().replace(/\s+/g, ' ');
  const nl = NL_POSTCODE.exec(tekst.replace(/\s/g, ''));
  if (nl) return `${nl[1]} ${nl[2].toUpperCase()}`;
  return tekst;
}

export function stelAdresSamen(onderdelen: AdresOnderdelen): string {
  const huis = [onderdelen.huisnummer.trim(), onderdelen.toevoeging.trim()].filter(Boolean).join(' ');
  const straat = [onderdelen.straat.trim(), huis].filter(Boolean).join(' ');
  const plaats = [normaliseerPostcode(onderdelen.postcode), onderdelen.woonplaats.trim()].filter(Boolean).join(' ');
  return [straat, plaats].filter(Boolean).join(', ');
}

export function heeftAdresOnderdelen(onderdelen: AdresOnderdelen): boolean {
  return Boolean(
    onderdelen.straat.trim()
    || onderdelen.huisnummer.trim()
    || onderdelen.toevoeging.trim()
    || onderdelen.postcode.trim()
    || onderdelen.woonplaats.trim(),
  );
}

/** Structured adres als dat er is, anders de oude adresregel. */
export function toonAdres(input: Partial<AdresOnderdelen> & { adres?: string | null }): string {
  const samen = stelAdresSamen({
    straat: input.straat ?? '',
    huisnummer: input.huisnummer ?? '',
    toevoeging: input.toevoeging ?? '',
    postcode: input.postcode ?? '',
    woonplaats: input.woonplaats ?? '',
  });
  if (samen) return samen;
  return (input.adres ?? '').trim();
}
