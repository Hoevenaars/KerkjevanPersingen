/**
 * Uitsluitend de termijn die bij dit contractpakket hoort wordt gefactureerd.
 * Dit is geen tweede betalingsadministratie: bedragen komen uit betalingen.
 * Een proef/preview mag geen officieel factuurnummer uitgeven.
 */
import { pdfBytes, pdfBevatTekst } from './documenten/pdf.ts';
import type { PdfBijlage } from './contract-pakket.ts';

export type FactuurFase = 'aanbetaling' | 'restant';
export type BtwRegime = 'belast_9' | 'belast_21' | 'vrijgesteld' | 'geen_btw';

export interface BetaalregelFactuur {
  id: number;
  soort: string;
  bedrag: number;
  status: string;
  vervaldatum: string;
}

export interface FactuurMoment {
  betalingId: number;
  fase: FactuurFase;
  bedragCent: number;
  vervaldatum: string;
}

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const euroTekst = (cent: number) => `${Math.floor(cent / 100)},${String(cent % 100).padStart(2, '0')}`;

/** Bestaande betaalregels blijven de enige bron voor de bedragen. */
export function kiesFactuurVanMoment(input: {
  huurprijsCent: number;
  aanbetalingCent: number;
  regels: readonly BetaalregelFactuur[];
  vandaag: string;
}): { ok: true; moment: FactuurMoment } | { ok: false; melding: string } {
  const { huurprijsCent: totaal, aanbetalingCent: aan, regels } = input;
  if (!Number.isSafeInteger(totaal) || totaal <= 0 || !Number.isSafeInteger(aan) || aan < 0 || aan > totaal || !DATUM.test(input.vandaag)) {
    return { ok: false, melding: 'De huurprijs of aanbetaling is niet betrouwbaar vastgesteld.' };
  }
  const relevant = regels.filter((r) => r.soort === 'aanbetaling' || r.soort === 'restant');
  const actief = relevant.filter((r) => r.status !== 'geannuleerd');
  const perSoort = (fase: FactuurFase) => actief.filter((r) => r.soort === fase);
  const fouteStatus = actief.some((r) => r.status !== 'open' && r.status !== 'ontvangen');
  if (fouteStatus || perSoort('aanbetaling').length !== (aan > 0 ? 1 : 0) || perSoort('restant').length !== (totaal - aan > 0 ? 1 : 0)) {
    return { ok: false, melding: 'De betalingsregels zijn dubbel of onvolledig; er wordt geen factuur gemaakt.' };
  }
  for (const regel of actief) {
    if (!Number.isSafeInteger(regel.id) || regel.id <= 0 || !Number.isFinite(regel.bedrag) || !DATUM.test(regel.vervaldatum)) {
      return { ok: false, melding: 'Een betaalregel heeft geen geldig bedrag, ID of vervaldatum.' };
    }
  }
  const cent = (r: BetaalregelFactuur) => Math.round(r.bedrag * 100);
  if (perSoort('aanbetaling').some((r) => cent(r) !== aan) || perSoort('restant').some((r) => cent(r) !== totaal - aan)) {
    return { ok: false, melding: 'De betaalregels sluiten niet aan op de overeengekomen huurprijs.' };
  }
  if (aan > 0 && perSoort('restant')[0]?.vervaldatum <= input.vandaag) {
    return { ok: false, melding: 'Aanbetaling en restant zijn beide al opeisbaar. Leg eerst een eenduidig betaalschema voor het volledige bedrag vast.' };
  }
  const fase: FactuurFase = aan > 0 ? 'aanbetaling' : 'restant';
  const regel = perSoort(fase)[0];
  if (!regel) return { ok: false, melding: 'Er is geen termijn om op dit moment te factureren.' };
  return { ok: true, moment: { betalingId: regel.id, fase, bedragCent: cent(regel), vervaldatum: regel.vervaldatum } };
}


/** Controleer of de huidige betaalregels nog gelijk zijn aan het BEVROREN contract.
 *  Bij twijfel geen factuur uitgeven voor een mogelijk gewijzigde huurprijs.
 */
function euroNaarCent(waarde: unknown): number | null {
  if (typeof waarde !== 'string') return null;
  const schoon = waarde.replace(/€/g, '').replace(/\s/g, '').trim();
  const normaal = schoon.includes(',') ? schoon.replace(/\./g, '').replace(',', '.') : schoon;
  if (!/^\d+(\.\d{1,2})?$/.test(normaal)) return null;
  const cent = Math.round(Number(normaal) * 100);
  return Number.isSafeInteger(cent) ? cent : null;
}
export function vasteContractbedragenFout(input: {
  wizard: unknown;
  huurprijsCent: number;
  aanbetalingCent: number;
  aanbetalingVerval: string;
  restVerval: string;
  periodeVan: string;
  periodeTot: string;
}): string | null {
  const v = input.wizard;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'De bevroren contractafspraken ontbreken; controleer de contractversie.';
  const w = v as Record<string, unknown>;
  const huur = euroNaarCent(w.huurprijs);
  const aan = euroNaarCent(w.aanbetaling);
  if (huur !== input.huurprijsCent || aan !== input.aanbetalingCent ||
      w.periodeVan !== input.periodeVan || w.periodeTot !== input.periodeTot ||
      (aan > 0 && w.aanbetalingVerval !== input.aanbetalingVerval) ||
      (huur != null && aan != null && huur > aan && w.restVerval !== input.restVerval)) {
    return 'Het betaalschema of de huurperiode wijkt af van de bevroren contractversie. Maak eerst een nieuwe contractversie.';
  }
  return null;
}

export interface FactuurSnapshot {
  factuurnummer: string;
  factuurdatum: string;
  vervaldatum: string;
  fase: FactuurFase;
  bedragCent: number;
  btwRegime: BtwRegime;
  btwCent: number;
  exclusiefCent: number;
  btwNummer: string;
  btwToelichting: string;
  verhuurderNaam: string;
  verhuurderAdres: string;
  verhuurderKvk: string;
  verhuurderIban: string;
  huurderNaam: string;
  huurderAdres: string;
  omschrijving: string;
  contractnummer: string;
  boekingsnummer: string;
  periodeVan: string;
  periodeTot: string;
}

export function factuurSnapshotFout(f: FactuurSnapshot, isConcept = false): string | null {
  const vereist = [f.factuurdatum, f.vervaldatum, f.verhuurderNaam, f.verhuurderAdres, f.verhuurderKvk, f.verhuurderIban,
    f.huurderNaam, f.huurderAdres, f.omschrijving, f.contractnummer, f.periodeVan, f.periodeTot];
  if (!isConcept && !/^KVPF-\d{4}-\d{6}$/.test(f.factuurnummer)) return 'Ongeldig of ontbrekend factuurnummer.';
  if (vereist.some((v) => !v.trim()) || !DATUM.test(f.factuurdatum) || !DATUM.test(f.vervaldatum) || !DATUM.test(f.periodeVan) || !DATUM.test(f.periodeTot)) {
    return 'Verplichte factuurgegevens ontbreken.';
  }
  if (!Number.isSafeInteger(f.bedragCent) || f.bedragCent <= 0 || !Number.isSafeInteger(f.btwCent) || f.btwCent < 0 ||
      !Number.isSafeInteger(f.exclusiefCent) || f.exclusiefCent + f.btwCent !== f.bedragCent) {
    return 'Het factuurbedrag en de btw sluiten niet op elkaar aan.';
  }
  if (!['belast_9', 'belast_21', 'vrijgesteld', 'geen_btw'].includes(f.btwRegime)) return 'De btw-behandeling is niet vastgesteld.';
  if (f.btwRegime.startsWith('belast_') && !f.btwNummer.trim()) return 'Het btw-identificatienummer ontbreekt.';
  if (!f.btwRegime.startsWith('belast_') && !f.btwToelichting.trim()) return 'De onderbouwing van de btw-behandeling ontbreekt.';
  return null;
}

export function factuurTekst(f: FactuurSnapshot, concept = false): string {
  const fout = factuurSnapshotFout(f, concept);
  if (fout) throw new Error(fout);
  const belasting = f.btwRegime === 'belast_9' ? '9%' : f.btwRegime === 'belast_21' ? '21%' : f.btwRegime === 'vrijgesteld' ? 'Vrijgesteld' : 'Geen btw';
  return [
    concept ? 'CONCEPTFACTUUR - NIET VERZENDEN / GEEN FACTUURNUMMER' : 'FACTUUR',
    `Factuurnummer: ${concept ? 'WORDT BIJ AKKOORD TOEGEKEND' : f.factuurnummer}`,
    `Factuurdatum: ${f.factuurdatum}`,
    `Vervaldatum: ${f.vervaldatum}`,
    `Verhuurder: ${f.verhuurderNaam}`,
    `Adres verhuurder: ${f.verhuurderAdres}`,
    `KVK: ${f.verhuurderKvk}`,
    ...(f.btwNummer ? [`Btw-identificatienummer: ${f.btwNummer}`] : []),
    `Huurder: ${f.huurderNaam}`,
    `Adres huurder: ${f.huurderAdres}`,
    '',
    `Omschrijving: ${f.omschrijving}`,
    `Huurperiode: ${f.periodeVan} t/m ${f.periodeTot}`,
    `Contractnummer: ${f.contractnummer}`,
    ...(f.boekingsnummer ? [`Boekingsnummer: ${f.boekingsnummer}`] : []),
    `Termijn: ${f.fase === 'aanbetaling' ? 'Aanbetaling' : 'Restbetaling / volledige huursom'}`,
    '',
    `Bedrag exclusief btw: EUR ${euroTekst(f.exclusiefCent)}`,
    `Btw-behandeling: ${belasting}`,
    `Btw-bedrag: EUR ${euroTekst(f.btwCent)}`,
    ...(f.btwToelichting ? [`Toelichting btw: ${f.btwToelichting}`] : []),
    `Totaal deze factuur: EUR ${euroTekst(f.bedragCent)}`,
    '',
    `Betaling op IBAN: ${f.verhuurderIban}`,
    `Ten name van: ${f.verhuurderNaam}`,
    `Betalingskenmerk: ${concept ? 'WORDT TOEGEKEND' : f.factuurnummer}`,
    'Dit document betreft uitsluitend deze betaaltermijn. Een eventueel restant volgt op de overeengekomen vervaldatum.',
  ].join('\n');
}

export function maakFactuurBijlage(f: FactuurSnapshot, concept = false): PdfBijlage {
  const naam = concept ? `CONCEPTFACTUUR-${f.contractnummer}.pdf` : `Factuur-${f.factuurnummer}.pdf`;
  const inhoud = pdfBytes(factuurTekst(f, concept));
  if (!pdfBevatTekst(inhoud, f.contractnummer) || !pdfBevatTekst(inhoud, concept ? 'CONCEPTFACTUUR' : f.factuurnummer)) {
    throw new Error('De factuur-PDF is niet verifieerbaar. Er is niets verzonden.');
  }
  return { bestandsnaam: naam, inhoud };
}

/** Voor iedere live contractmail exact de drie afgesproken PDF-documenten. */
export function maakDrieContractBijlagen(
  bron: { tekst: string; voorwaardenTekst: string; huisregelsTekst: string; plattegrondTekst: string; soort: string },
  contractnummer: string,
  factuur: FactuurSnapshot,
  concept = false,
): readonly [PdfBijlage, PdfBijlage, PdfBijlage] {
  if (!bron.tekst.includes(contractnummer) || factuur.contractnummer !== contractnummer ||
      !bron.voorwaardenTekst.includes('Verhuurvoorwaarden') || !bron.huisregelsTekst.trim()) {
    throw new Error('Het contract en de voorwaarden komen niet overeen. Er is niets verzonden.');
  }
  const overeenkomst: PdfBijlage = { bestandsnaam: `Huurovereenkomst-${contractnummer}.pdf`, inhoud: pdfBytes(bron.tekst) };
  const voorwaardenLijf = [bron.voorwaardenTekst.trim(), bron.huisregelsTekst.trim(),
    ...(bron.soort.trim().toLowerCase() === 'expositie' && bron.plattegrondTekst.trim() ? [bron.plattegrondTekst.trim()] : [])].join('\n\f\n');
  const voorwaarden: PdfBijlage = { bestandsnaam: `Voorwaarden-en-huisregels-${contractnummer}.pdf`, inhoud: pdfBytes(voorwaardenLijf) };
  const rekening = maakFactuurBijlage(factuur, concept);
  return [overeenkomst, voorwaarden, rekening];
}
