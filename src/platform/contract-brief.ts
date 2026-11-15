/**
 * Contractbrief bij een boeking.
 * De tekst is de bestaande begeleidende contractmail, aangevuld met de
 * feiten van deze boeking, zodat die eerst gelezen kan worden.
 * Zonder die vaste tekst wordt geen overeenkomst verzonnen.
 */

import { formatNl, SOORT_LABEL } from './demo-data.ts';
import { vulSjabloon } from './document-samenstellen.ts';

export const CONTRACT_ONDERWERP = 'Contract voor uw boeking';

const SJABLOON = `Beste {{huurder}},

Bij deze het contract voor uw {{soort}} op {{periode}}. Het tarief is {{tarief}}.

Boeking: {{nummer}}
Activiteit: {{titel}}
Huurder: {{huurder}}
E-mail: {{email}}
Telefoon: {{telefoon}}
Adres: {{adres}}
Periode: {{periode}}
Soort: {{soort}}
Tarief: {{tarief}}

Wilt u het ondertekend terugsturen? Daarna volgt de aanbetaling. Zodra die binnen is, is de boeking definitief. U hoort dat van ons.

De verhuurvoorwaarden staan op https://kerkjepersingen.nl/verhuur/voorwaarden/.

Vragen over het contract: Hans Maas, contractbeheer, of bel 06 52 66 84 49.

Met vriendelijke groet,
Bestuur Het Kerkje van Persingen`;

export interface ContractBron {
  id: string;
  nummer: string;
  titel: string;
  soort: string;
  start: string;
  eind: string;
  huurder: string;
  email: string;
  telefoon: string;
  adres: string;
  tarief: string;
}

export interface ContractBrief {
  onderwerp: string;
  tekst: string;
}

function leegOf(waarde: string | null | undefined): string {
  const tekst = (waarde ?? '').replace(/\s+/g, ' ').trim();
  return tekst || 'niet ingevuld';
}

export function periodeTekst(start: string, eind: string): string {
  const van = formatNl(start);
  const tot = formatNl(eind);
  if (!eind || start === eind || van === tot) return van;
  return `${van} tot en met ${tot}`;
}

export function contractBronUitBoeking(
  boeking: {
    id: string;
    nummer: string;
    interneTitel: string;
    soort: string;
    start: string;
    eind: string;
    huurder: string;
    email: string;
    tarief: string;
  },
  relatie: { naam?: string; email?: string; telefoon?: string; adres?: string } | null,
): ContractBron {
  return {
    id: boeking.id,
    nummer: leegOf(boeking.nummer),
    titel: leegOf(boeking.interneTitel),
    soort: SOORT_LABEL[boeking.soort] ?? leegOf(boeking.soort),
    start: boeking.start,
    eind: boeking.eind,
    huurder: leegOf(boeking.huurder || relatie?.naam),
    email: leegOf(boeking.email || relatie?.email),
    telefoon: leegOf(relatie?.telefoon),
    adres: leegOf(relatie?.adres),
    tarief: leegOf(boeking.tarief),
  };
}

export function genereerContractbrief(bron: ContractBron): ContractBrief | { fout: string } {
  const gevuld = vulSjabloon(SJABLOON, {
    huurder: bron.huurder,
    soort: bron.soort,
    periode: periodeTekst(bron.start, bron.eind),
    tarief: bron.tarief,
    nummer: bron.nummer,
    titel: bron.titel,
    email: bron.email,
    telefoon: bron.telefoon,
    adres: bron.adres,
  });
  if (gevuld.open.length > 0) {
    return { fout: `Het contract is niet compleet. Open veld: ${gevuld.open.join(', ')}.` };
  }
  return { onderwerp: CONTRACT_ONDERWERP, tekst: gevuld.tekst };
}

export function contractBestandsnaam(huurder: string, versie: number): string {
  const schoon = huurder
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'huurder';
  return `contract-${schoon}-v${versie}.txt`;
}
