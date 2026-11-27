/** Strikte voorbereiding van een standaardcontract uit expliciet vastgelegde verhuurregels.
 * Geen gegevens verzinnen. Onbekende of variabele tarieven gaan terug naar de bestaande wizard.
 */
export interface AutocontractProfiel {
  tijdVan: string;
  tijdTot: string;
  opbouw: string;
  afbouw: string;
  aanbetalingEuro: number;
  betalingBinnenDagen: number;
  restantMaandenVoorStart: number;
  kortVoorStartVolledig: boolean;
  restFactuurDagenVoorVerval?: number;
}

export type ContractBetalingVoorstel = {
  aanbetaling: number;
  aanbetalingVerval: string;
  restVerval: string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIJD = /^([01]\d|2[0-3]):[0-5]\d$/;

function geldigEurobedrag(waarde: unknown): waarde is number {
  if (typeof waarde !== 'number' || !Number.isFinite(waarde) || waarde < 0) return false;
  const cent = Math.round(waarde * 100);
  return Number.isSafeInteger(cent) && Math.abs(waarde * 100 - cent) < 0.000001;
}

/** Amsterdamse kalenderdagen; UTC maakt de berekening onafhankelijk van DST. */
function addDagen(datum: string, dagen: number): string {
  const [jaar, maand, dag] = datum.split('-').map(Number);
  const d = new Date(Date.UTC(jaar!, maand! - 1, dag! + dagen));
  return d.toISOString().slice(0, 10);
}

function minMaanden(datum: string, maanden: number): string {
  const [jaar, maand, dag] = datum.split('-').map(Number);
  const grens = new Date(Date.UTC(jaar!, maand! - 1 - maanden, 1));
  const maximum = new Date(Date.UTC(grens.getUTCFullYear(), grens.getUTCMonth() + 1, 0)).getUTCDate();
  grens.setUTCDate(Math.min(dag!, maximum));
  return grens.toISOString().slice(0, 10);
}

function geldigDag(datum: string): boolean {
  if (!DATE.test(datum)) return false;
  const [jaar, maand, dag] = datum.split('-').map(Number);
  const d = new Date(Date.UTC(jaar!, maand! - 1, dag!));
  return d.toISOString().slice(0, 10) === datum;
}

export function leesAutocontractProfiel(waarde: unknown): AutocontractProfiel | null {
  if (!waarde || typeof waarde !== 'object' || Array.isArray(waarde)) return null;
  const v = waarde as Record<string, unknown>;
  const tekstvelden = ['tijdVan', 'tijdTot', 'opbouw', 'afbouw'] as const;
  if (tekstvelden.some((sleutel) => typeof v[sleutel] !== 'string' || !(v[sleutel] as string).trim())) return null;
  if (!TIJD.test(String(v.tijdVan)) || !TIJD.test(String(v.tijdTot)) ||
      String(v.tijdTot) <= String(v.tijdVan)) return null;
  if (!geldigEurobedrag(v.aanbetalingEuro) ||
      !Number.isInteger(v.betalingBinnenDagen) || Number(v.betalingBinnenDagen) < 1 || Number(v.betalingBinnenDagen) > 45 ||
      !Number.isInteger(v.restantMaandenVoorStart) || Number(v.restantMaandenVoorStart) < 1 || Number(v.restantMaandenVoorStart) > 12 ||
      typeof v.kortVoorStartVolledig !== 'boolean') return null;
  if (v.restFactuurDagenVoorVerval != null && (!Number.isInteger(v.restFactuurDagenVoorVerval) || Number(v.restFactuurDagenVoorVerval) < 0 || Number(v.restFactuurDagenVoorVerval) > 90)) return null;
  return v as unknown as AutocontractProfiel;
}

export function berekenAutocontractTermijnen(input: {
  prijsEuro: number;
  profiel: AutocontractProfiel;
  vandaag: string;
  start: string;
}): { ok: true; termijnen: ContractBetalingVoorstel } | { ok: false; melding: string } {
  const { prijsEuro, profiel, vandaag, start } = input;
  if (!geldigDag(vandaag) || !geldigDag(start) || start < vandaag ||
      !geldigEurobedrag(prijsEuro) || prijsEuro <= 0 ||
      !geldigEurobedrag(profiel.aanbetalingEuro) || profiel.aanbetalingEuro > prijsEuro) {
    return { ok: false, melding: 'Prijs, datum of aanbetaling moet door het bestuur worden vastgesteld.' };
  }
  const restGrens = minMaanden(start, profiel.restantMaandenVoorStart);
  const eersteVerval = addDagen(vandaag, profiel.betalingBinnenDagen);
  if (eersteVerval > start) {
    return { ok: false, melding: 'De gewone betalingstermijn eindigt na de activiteit. Maak een expliciete afspraak voor deze korte boeking.' };
  }
  if (restGrens > eersteVerval && profiel.aanbetalingEuro === 0) {
    return { ok: false, melding: 'Er is bij contractverzending geen aanbetaling of volledige huursom verschuldigd. Het bestuur moet eerst het factuurmoment vaststellen.' };
  }
  if (restGrens <= eersteVerval) {
    if (!profiel.kortVoorStartVolledig) {
      return { ok: false, melding: 'De aanbetaling en restbetaling vallen samen. Het bestuur moet de termijn bepalen.' };
    }
    return { ok: true, termijnen: { aanbetaling: 0, aanbetalingVerval: '', restVerval: eersteVerval } };
  }
  const aanbetaling = profiel.aanbetalingEuro;
  if (aanbetaling === prijsEuro) return { ok: true, termijnen: { aanbetaling, aanbetalingVerval: eersteVerval, restVerval: '' } };
  return { ok: true, termijnen: {
    aanbetaling,
    aanbetalingVerval: aanbetaling > 0 ? eersteVerval : '',
    restVerval: restGrens,
  } };
}
