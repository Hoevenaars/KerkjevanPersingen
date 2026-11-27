/** Financiële beslisregels zonder netwerk of database. Alle vergelijkingen in centen. */
export interface BetaalontvangstEvent {
  bron: string;
  eventId: string;
  betalingId: number;
  bedragCent: number;
  ontvangenOp: string;
  referentie?: string;
}

export function betaalontvangstFout(event: BetaalontvangstEvent): string | null {
  if (!/^[a-zA-Z0-9_.:-]{1,80}$/.test(event.bron) || !event.eventId.trim() || event.eventId.length > 200) return 'Bron en unieke ontvangst-id zijn verplicht.';
  if (!Number.isSafeInteger(event.betalingId) || event.betalingId <= 0) return 'Een eenduidig gekoppelde betaaltermijn is verplicht.';
  if (!Number.isSafeInteger(event.bedragCent) || event.bedragCent <= 0 || event.bedragCent > 9_999_999_999) return 'Het ontvangen bedrag moet een positief centbedrag zijn.';
  if (!/^\d{4}-\d{2}-\d{2}T/.test(event.ontvangenOp) || !Number.isFinite(Date.parse(event.ontvangenOp))) return 'Het ontvangsttijdstip is ongeldig.';
  if ((event.referentie?.length ?? 0) > 250) return 'De betalingsreferentie is te lang.';
  return null;
}

export interface FinancieleTermijn {
  id: number;
  soort: string;
  bedragCent: number;
  ontvangenCent: number;
  status: string;
  vervaldatum: string;
  factuurId?: number | null;
  factuurVerzondenOp?: string | null;
  factuurMoment?: string | null;
  herinneringen: readonly string[];
}
export type FinancieleStap = { betalingId: number; soort: 'factuur' | 'herinnering_1' | 'herinnering_2'; saldoCent: number };

function dagNa(datum: string, dagen: number): string {
  const d = new Date(`${datum}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + dagen);
  return d.toISOString().slice(0, 10);
}

/** Geen herinnering voor een onuitgegeven nota. Geen oude optie-deadline als betaaltermijn. */
export function planFinancieleTermijnen(input: {
  status: string; vandaag: string; termijnen: readonly FinancieleTermijn[];
  herinneringNaDagen?: number; laatsteNaDagen?: number;
}): FinancieleStap[] {
  if (!['optie', 'definitief'].includes(input.status)) return [];
  const eerste = input.herinneringNaDagen ?? 7;
  const laatste = input.laatsteNaDagen ?? 14;
  if (!Number.isInteger(eerste) || eerste < 1 || !Number.isInteger(laatste) || laatste <= eerste) return [];
  const stappen: FinancieleStap[] = [];
  for (const t of input.termijnen) {
    if (t.status === 'geannuleerd' || !Number.isSafeInteger(t.bedragCent) || t.bedragCent <= 0 ||
        !Number.isSafeInteger(t.ontvangenCent) || t.ontvangenCent < 0 || t.ontvangenCent > t.bedragCent ||
        !/^\d{4}-\d{2}-\d{2}$/.test(t.vervaldatum)) continue;
    const saldo = t.bedragCent - t.ontvangenCent;
    // De eerste nota is onderdeel van het contractpakket. Alleen de latere resttermijn volgt hier.
    if (!t.factuurVerzondenOp) {
      if (t.soort === 'restant' && (t.factuurMoment || t.vervaldatum) <= input.vandaag) {
        stappen.push({ betalingId: t.id, soort: 'factuur', saldoCent: saldo });
      }
      continue;
    }
    if (saldo <= 0 || t.status === 'ontvangen' || t.status === 'betaald') continue;
    const verzondenDag = t.factuurVerzondenOp.slice(0, 10);
    const basis = verzondenDag > t.vervaldatum ? verzondenDag : t.vervaldatum;
    if (!t.herinneringen.includes('herinnering_1') && dagNa(basis, eerste) <= input.vandaag) {
      stappen.push({ betalingId: t.id, soort: 'herinnering_1', saldoCent: saldo });
    } else if (t.herinneringen.includes('herinnering_1') && !t.herinneringen.includes('herinnering_2') && dagNa(basis, laatste) <= input.vandaag) {
      stappen.push({ betalingId: t.id, soort: 'herinnering_2', saldoCent: saldo });
    }
  }
  return stappen;
}

/** Het bronbedrag is een definitieve dossierprijs, geen vanafprijs. */
export function kiesGoedgekeurdePrijs(input: {
  soort: string;
  mandaat?: { huurprijsEuro: number; prijsBron: string; geverifieerd: boolean } | null;
  catalogus: { prijstype: string; bedrag: number | null } | null;
  boekingBedrag: number | null;
}): { ok: true; prijsEuro: number } | { ok: false; melding: string } {
  const mandaat = input.mandaat;
  let bedrag: number | null = null;
  if (mandaat?.geverifieerd) {
    const variabel = input.soort === 'concert' || input.soort === 'diverse';
    if (variabel && mandaat.prijsBron !== 'bestuur') return { ok: false, melding: 'Voor Concert en Overig ontbreekt een vastgestelde bestuursprijs.' };
    if (!variabel && mandaat.prijsBron !== 'tarief') return { ok: false, melding: 'Het prijsmandaat past niet bij dit verhuurtype.' };
    bedrag = mandaat.huurprijsEuro;
  } else if (input.catalogus?.prijstype === 'vast') {
    bedrag = input.catalogus.bedrag;
  }
  if (bedrag == null || !Number.isFinite(bedrag) || bedrag <= 0 || !Number.isSafeInteger(Math.round(bedrag * 100)) ||
      Math.abs(bedrag * 100 - Math.round(bedrag * 100)) > 0.000001 || bedrag >= 100_000_000) {
    return { ok: false, melding: 'Een geldige vaste prijs of gecontroleerde bestuursprijs ontbreekt.' };
  }
  if (input.boekingBedrag != null && Math.round(input.boekingBedrag * 100) !== Math.round(bedrag * 100)) {
    return { ok: false, melding: 'Het boekingstarief wijkt af van de goedgekeurde prijs. Niet automatisch overschrijven.' };
  }
  return { ok: true, prijsEuro: bedrag };
}
