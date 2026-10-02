/**
 * Tijdelijke homepage-melding.
 *
 * Geen apart berichtensysteem: de tekst staat in public.instellingen
 * onder de sleutel website_melding en is te bewerken via /beheer.
 */

export const WEBSITE_MELDING_SLEUTEL = 'website_melding';

const MAX_TITEL = 180;
const MAX_TEKST = 1500;

export interface WebsiteMelding {
  actief: boolean;
  titel: string;
  tekst: string;
  /** Leeg = meteen zichtbaar, zodra de melding aan staat. */
  geldigVan: string;
  /** Leeg = geen automatische einddatum. */
  geldigTot: string;
}

export interface WebsiteMeldingWeergave {
  titel: string;
  alinea: string[];
}

export const STANDAARD_WEBSITE_MELDING: WebsiteMelding = {
  actief: true,
  titel: 'LET OP: GEWIJZIGDE BEREIKBAARHEID VAN 5 T/M 30 OKTOBER',
  tekst: [
    'Vanwege werkzaamheden is de N325 (Ubbergseweg) van 5 tot en met 30 oktober 2026 in beide richtingen afgesloten voor auto- en vrachtverkeer.',
    'Het Kerkje van Persingen blijft bereikbaar via de Hubertusweg.',
    'Houd tijdens uw bezoek rekening met een aangepaste aanrijroute.',
  ].join('\n\n'),
  geldigVan: '',
  geldigTot: '2026-10-30',
};

export function alineaVanTekst(tekst: string): string[] {
  return tekst
    .split(/\n\s*\n/)
    .map((deel) => deel.replace(/\s+/g, ' ').trim())
    .filter((deel) => deel.length > 0);
}

export function vandaagInAmsterdam(nu = new Date()): string {
  return nu.toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
}

export function meldingZichtbaar(melding: WebsiteMelding, nu = new Date()): boolean {
  if (!melding.actief) return false;
  if (!melding.titel.trim() && !melding.tekst.trim()) return false;
  const vandaag = vandaagInAmsterdam(nu);
  if (melding.geldigVan && vandaag < melding.geldigVan) return false;
  if (melding.geldigTot && vandaag > melding.geldigTot) return false;
  return true;
}

export function weergaveVanMelding(melding: WebsiteMelding): WebsiteMeldingWeergave {
  return {
    titel: melding.titel.trim(),
    alinea: alineaVanTekst(melding.tekst),
  };
}

export function zichtbareWeergave(melding: WebsiteMelding, nu = new Date()): WebsiteMeldingWeergave | null {
  if (!meldingZichtbaar(melding, nu)) return null;
  const weergave = weergaveVanMelding(melding);
  if (!weergave.titel && weergave.alinea.length === 0) return null;
  return weergave;
}

function tekstVan(waarde: unknown): string {
  return typeof waarde === 'string' ? waarde : '';
}

function datumVan(waarde: unknown): string {
  if (waarde == null) return '';
  const tekst = String(waarde).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(tekst) ? tekst : '';
}

export function parseWebsiteMelding(waarde: unknown): WebsiteMelding | null {
  const bron = typeof waarde === 'string'
    ? veiligeJson(waarde)
    : waarde;
  if (!bron || typeof bron !== 'object') return null;
  const rij = bron as Record<string, unknown>;
  return {
    actief: rij.actief === true || rij.actief === 'true',
    titel: tekstVan(rij.titel).slice(0, MAX_TITEL),
    tekst: tekstVan(rij.tekst).slice(0, MAX_TEKST),
    geldigVan: datumVan(rij.geldig_van ?? rij.geldigVan),
    geldigTot: datumVan(rij.geldig_tot ?? rij.geldigTot),
  };
}

function veiligeJson(tekst: string): unknown {
  try {
    return JSON.parse(tekst);
  } catch {
    return null;
  }
}

export function websiteMeldingRij(melding: WebsiteMelding): {
  sleutel: string;
  groep: string;
  waarde: {
    actief: boolean;
    titel: string;
    tekst: string;
    geldig_van: string | null;
    geldig_tot: string | null;
  };
  toelichting: string;
} {
  return {
    sleutel: WEBSITE_MELDING_SLEUTEL,
    groep: 'website',
    waarde: {
      actief: melding.actief,
      titel: melding.titel.trim().slice(0, MAX_TITEL),
      tekst: melding.tekst.trim().slice(0, MAX_TEKST),
      geldig_van: melding.geldigVan || null,
      geldig_tot: melding.geldigTot || null,
    },
    toelichting: 'Tijdelijke melding op de homepage',
  };
}

function leesDatum(waarde: string, veld: string): string {
  const schoon = waarde.trim();
  if (!schoon) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(schoon)) {
    throw new Error(`Vul bij ${veld} een geldige datum in, of laat het veld leeg.`);
  }
  return schoon;
}

export function meldingUitFormulier(form: {
  get(naam: string): FormDataEntryValue | null;
  getAll(naam: string): FormDataEntryValue[];
}): WebsiteMelding {
  const geldigVan = leesDatum(String(form.get('geldigVan') ?? ''), 'de begindatum');
  const geldigTot = leesDatum(String(form.get('geldigTot') ?? ''), 'de einddatum');
  if (geldigVan && geldigTot && geldigVan > geldigTot) {
    throw new Error('De begindatum ligt na de einddatum.');
  }
  return {
    actief: form.getAll('actief').some((waarde) => String(waarde) === '1'),
    titel: String(form.get('titel') ?? '').trim().slice(0, MAX_TITEL),
    tekst: String(form.get('tekst') ?? '').trim().slice(0, MAX_TEKST),
    geldigVan,
    geldigTot,
  };
}

/**
 * Resultaat van publieke_website_melding().
 * Een fout (functie ontbreekt of de database is niet bereikbaar) toont de
 * standaardmelding, zodat de bereikbaarheidswaarschuwing niet stil verdwijnt.
 * Een lege respons betekent: het bestuur heeft de melding uitgezet of de
 * periode is voorbij.
 */
export function meldingUitRpc(
  data: unknown,
  error: { message: string } | null,
  nu = new Date(),
): WebsiteMeldingWeergave | null {
  if (error) return zichtbareWeergave(STANDAARD_WEBSITE_MELDING, nu);
  if (!data || typeof data !== 'object') return null;
  const rij = data as Record<string, unknown>;
  const titel = tekstVan(rij.titel).trim();
  const alinea = alineaVanTekst(tekstVan(rij.tekst));
  if (!titel && alinea.length === 0) return null;
  return { titel, alinea };
}
