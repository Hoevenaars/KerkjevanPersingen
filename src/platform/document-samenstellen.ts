/**
 * Documentinfrastructuur. Zonder goedgekeurd juridisch sjabloon
 * wordt geen overeenkomsttekst verzonnen.
 */

export interface MergeBoeking {
  id: string;
  nummer: string;
  titel: string;
  start: string;
  eind: string;
  huurder: string;
  email: string;
  soort: string;
}

export interface DocumentVersie {
  versie: number;
  type: 'huurovereenkomst' | 'overig';
  sjabloonSleutel: string | null;
  aangemaaktOp: string;
  tekst: string | null;
  ontbreekt: string | null;
}

const VELD = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export function mergeVelden(boeking: MergeBoeking): Record<string, string> {
  return {
    boeking_id: boeking.id,
    nummer: boeking.nummer,
    titel: boeking.titel,
    start: boeking.start,
    eind: boeking.eind,
    huurder: boeking.huurder,
    email: boeking.email,
    soort: boeking.soort,
  };
}

export function vulSjabloon(sjabloon: string, velden: Record<string, string>): { tekst: string; open: string[] } {
  const open = new Set<string>();
  const tekst = sjabloon.replace(VELD, (_heel, naam: string) => {
    const sleutel = naam.toLowerCase();
    if (!(sleutel in velden)) {
      open.add(sleutel);
      return `{{${sleutel}}}`;
    }
    return velden[sleutel] ?? '';
  });
  return { tekst, open: [...open] };
}

export function volgendeDocumentVersie(huidige: readonly { versie: number }[]): number {
  return huidige.reduce((max, item) => Math.max(max, item.versie), 0) + 1;
}

/**
 * Huurovereenkomst alleen als een bestaand, goedgekeurd sjabloon is meegegeven.
 * Een leeg of ontbrekend sjabloon levert geen tekst op.
 */
export function stelDocumentOp(input: {
  type: 'huurovereenkomst' | 'overig';
  boeking: MergeBoeking;
  sjabloon: string | null;
  goedgekeurd: boolean;
  bestaande: readonly { versie: number }[];
  nu?: string;
}): DocumentVersie {
  const versie = volgendeDocumentVersie(input.bestaande);
  const basis = {
    versie,
    type: input.type,
    aangemaaktOp: input.nu ?? new Date().toISOString(),
  };
  if (input.type === 'huurovereenkomst' && (!input.goedgekeurd || !input.sjabloon?.trim())) {
    return {
      ...basis,
      sjabloonSleutel: null,
      tekst: null,
      ontbreekt: 'Geen juridisch goedgekeurd huurovereenkomstsjabloon. Er is geen contracttekst gegenereerd.',
    };
  }
  if (!input.sjabloon?.trim()) {
    return { ...basis, sjabloonSleutel: null, tekst: null, ontbreekt: 'Geen sjabloon.' };
  }
  const gevuld = vulSjabloon(input.sjabloon, mergeVelden(input.boeking));
  if (gevuld.open.length > 0) {
    return {
      ...basis,
      sjabloonSleutel: input.type,
      tekst: null,
      ontbreekt: `Onbekende mergevelden: ${gevuld.open.join(', ')}.`,
    };
  }
  return { ...basis, sjabloonSleutel: input.type, tekst: gevuld.tekst, ontbreekt: null };
}
