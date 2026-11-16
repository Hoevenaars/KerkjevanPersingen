/**
 * Vult een PDF-sjabloon met de gegevens uit de bevroren contracttekst.
 * De velden zijn AcroForm-tekstvelden. Losse tekst zoals {{huurder}}
 * in een alinea blijft staan: een PDF bewaart die niet als één invulveld.
 */

import { PDFDocument, PDFName, PDFTextField, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { pdfBevatTekst, pdfBytes, winAnsiCode } from './pdf.ts';

export const VOORWAARDEN_MARKER = 'biedt nog geen aanspraak op verhuur';

export const CONTRACT_MERGEVELDEN = [
  ['contractnummer', 'Contractnummer'],
  ['documentversie', 'Documentversie'],
  ['opgesteld_op', 'Datum opgesteld'],
  ['verhuurder', 'Verhuurder'],
  ['ondertekenaar', 'Namens verhuurder'],
  ['huurder', 'Huurder'],
  ['adres', 'Adres'],
  ['postcode_woonplaats', 'Postcode en woonplaats'],
  ['email', 'E-mailadres'],
  ['telefoon', 'Telefoon'],
  ['soort', 'Soort activiteit'],
  ['activiteit', 'Omschrijving'],
  ['periode', 'Datum / periode'],
  ['periode_van', 'Begindatum'],
  ['periode_tot', 'Einddatum'],
  ['gebruikstijden', 'Gebruikstijden'],
  ['tijd_van', 'Begintijd'],
  ['tijd_tot', 'Eindtijd'],
  ['opbouw', 'Opbouw / toegang'],
  ['afbouw', 'Afbouw / oplevering'],
  ['personen', 'Aantal personen'],
  ['contactpersoon', 'Contactpersoon'],
  ['huurprijs', 'Totale huurprijs'],
  ['aanbetaling', 'Aanbetaling'],
  ['aanbetaling_verval', 'Vervaldatum aanbetaling'],
  ['restbetaling', 'Restbetaling'],
  ['rest_verval', 'Vervaldatum restbetaling'],
  ['betalingskenmerk', 'Betalingskenmerk'],
  ['betaalgegevens', 'Betaalgegevens'],
  ['voorwaarden', 'Verhuurvoorwaarden, versieregel'],
  ['huisregels', 'Huisregels, versieregel'],
] as const;

const LABEL_NAAR_VELD: Record<string, string> = {
  Verhuurder: 'verhuurder',
  'Namens verhuurder': 'ondertekenaar',
  Huurder: 'huurder',
  Adres: 'adres',
  'Postcode / woonplaats': 'postcode_woonplaats',
  'E-mailadres': 'email',
  Telefoon: 'telefoon',
  'Soort activiteit': 'soort',
  Omschrijving: 'activiteit',
  'Datum / periode': 'periode',
  Gebruikstijden: 'gebruikstijden',
  'Opbouw / toegang': 'opbouw',
  'Afbouw / oplevering': 'afbouw',
  'Aantal personen': 'personen',
  Contactpersoon: 'contactpersoon',
  'Totale overeengekomen huurprijs': 'huurprijs',
  'Aanbetaling / reserveringsbedrag': 'aanbetaling',
  'Vervaldatum aanbetaling': 'aanbetaling_verval',
  Restbetaling: 'restbetaling',
  'Vervaldatum restbetaling': 'rest_verval',
  Betalingskenmerk: 'betalingskenmerk',
  Betaalgegevens: 'betaalgegevens',
  Verhuurvoorwaarden: 'voorwaarden',
  Huisregels: 'huisregels',
};

const BEKENDE_VELDEN = new Set<string>(CONTRACT_MERGEVELDEN.map(([sleutel]) => sleutel));

export interface SjabloonBijlage {
  voorwaardenTekst: string;
  huisregelsTekst: string;
  plattegrondTekst: string;
  soort: string;
}

export function normaliseerVeldnaam(naam: string): string {
  return naam.trim().toLowerCase().replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '').replace(/\s+/g, '_');
}

export function veldenUitContracttekst(tekst: string): Record<string, string> | null {
  const kop = tekst.match(/Contractnummer: (.+?) \| Documentversie: (.+?) \| Datum opgesteld: ([^\n]+)/);
  if (!kop) return null;
  const velden: Record<string, string> = {};
  for (const [sleutel] of CONTRACT_MERGEVELDEN) velden[sleutel] = '';
  velden.contractnummer = kop[1].trim();
  velden.documentversie = kop[2].trim();
  velden.opgesteld_op = kop[3].trim();
  for (const regel of tekst.split('\n')) {
    const idx = regel.indexOf(': ');
    if (idx < 1) continue;
    const sleutel = LABEL_NAAR_VELD[regel.slice(0, idx)];
    if (!sleutel) continue;
    velden[sleutel] = regel.slice(idx + 2).trim();
  }
  const periode = velden.periode.split(' t/m ');
  if (periode.length === 2) {
    velden.periode_van = periode[0].trim();
    velden.periode_tot = periode[1].trim();
  } else if (velden.periode) {
    velden.periode_van = velden.periode.trim();
    velden.periode_tot = velden.periode.trim();
  }
  const tijden = velden.gebruikstijden.split(' - ');
  if (tijden.length === 2) {
    velden.tijd_van = tijden[0].trim();
    velden.tijd_tot = tijden[1].trim();
  }
  if (!velden.contractnummer) return null;
  return velden;
}

export function sjabloonBevatVoorwaarden(bytes: Uint8Array): boolean {
  return pdfBevatTekst(bytes, 'Verhuurvoorwaarden') && pdfBevatTekst(bytes, VOORWAARDEN_MARKER);
}

function tekenVelden(doc: PDFDocument, form: ReturnType<PDFDocument['getForm']>, letter: PDFFont): void {
  const paginas = new Map(doc.getPages().map((pagina) => [pagina.ref.toString(), pagina]));
  for (const veld of form.getFields()) {
    if (!(veld instanceof PDFTextField)) continue;
    const tekst = veld.getText()?.trim() ?? '';
    if (!tekst) continue;
    for (const widget of veld.acroField.getWidgets()) {
      const pagina = paginas.get(widget.P()?.toString() ?? '') ?? doc.getPages()[0];
      if (!pagina) continue;
      tekenInVak(pagina, letter, tekst, widget.getRectangle());
    }
  }
}

function verpakVak(letter: PDFFont, tekst: string, grootte: number, max: number): string[] {
  const regels: string[] = [];
  let regel = '';
  const stukken: string[] = [];
  for (const woord of tekst.split(/\s+/)) {
    if (!woord) continue;
    if (letter.widthOfTextAtSize(woord, grootte) <= max) {
      stukken.push(woord);
      continue;
    }
    let deel = '';
    for (const teken of woord) {
      const kandidaat = deel + teken;
      if (deel && letter.widthOfTextAtSize(kandidaat, grootte) > max) {
        stukken.push(deel);
        deel = teken;
      } else {
        deel = kandidaat;
      }
    }
    if (deel) stukken.push(deel);
  }
  for (const stuk of stukken) {
    const kandidaat = regel ? `${regel} ${stuk}` : stuk;
    if (regel && letter.widthOfTextAtSize(kandidaat, grootte) > max) {
      regels.push(regel);
      regel = stuk;
    } else {
      regel = kandidaat;
    }
  }
  if (regel) regels.push(regel);
  return regels;
}

function tekenInVak(
  pagina: PDFPage,
  letter: PDFFont,
  tekst: string,
  vak: { x: number; y: number; width: number; height: number },
): void {
  const max = Math.max(12, vak.width - 4);
  let grootte = Math.min(11, Math.max(8, vak.height - 6));
  let regels = verpakVak(letter, tekst, grootte, max);
  while (regels.length * (grootte + 1) > vak.height - 2 && grootte > 6) {
    grootte = Math.round((grootte - 0.5) * 10) / 10;
    regels = verpakVak(letter, tekst, grootte, max);
  }
  let y = vak.y + vak.height - grootte - 1;
  for (const stuk of regels) {
    if (y < vak.y) break;
    pagina.drawText(stuk, { x: vak.x + 2, y, size: grootte, font: letter });
    y -= grootte + 1;
  }
}

function wisFormulier(doc: PDFDocument): void {
  doc.catalog.delete(PDFName.of('AcroForm'));
  for (const pagina of doc.getPages()) pagina.node.delete(PDFName.of('Annots'));
}

function pdfVeilig(tekst: string): string {
  let uit = '';
  for (const teken of tekst) {
    if (teken === '\n' || teken === '\r' || teken === '\t') {
      uit += ' ';
      continue;
    }
    uit += winAnsiCode(teken) == null ? '?' : teken;
  }
  return uit;
}

function bijlageTekst(bijlage: SjabloonBijlage, contractnummer: string): string {
  const blokken = [bijlage.voorwaardenTekst.trim(), bijlage.huisregelsTekst.trim()];
  if (bijlage.soort.trim().toLowerCase() === 'expositie' && bijlage.plattegrondTekst.trim()) {
    blokken.push(bijlage.plattegrondTekst.trim());
  }
  const lijf = blokken.filter(Boolean);
  if (lijf.length === 0) return `Contractnummer: ${contractnummer}`;
  lijf[0] = `Contractnummer: ${contractnummer}\n\n${lijf[0]}`;
  return lijf.join('\n\f\n');
}

async function openPdf(bytes: Uint8Array): Promise<PDFDocument | { fout: string }> {
  try {
    return await PDFDocument.load(bytes);
  } catch {
    return { fout: 'Dit PDF-bestand is beveiligd of onleesbaar.' };
  }
}

export async function leesSjabloonVelden(bytes: Uint8Array): Promise<{ bekende: string[]; onbekend: string[]; fout: string | null }> {
  const doc = await openPdf(bytes);
  if ('fout' in doc) return { bekende: [], onbekend: [], fout: doc.fout };
  const velden = doc.getForm().getFields();
  if (velden.length === 0) {
    return {
      bekende: [],
      onbekend: [],
      fout: 'Dit PDF-bestand heeft geen tekstvelden. Zet formuliervelden in het sjabloon met de veldnamen uit de lijst.',
    };
  }
  const bekende: string[] = [];
  const onbekend: string[] = [];
  for (const veld of velden) {
    const naam = normaliseerVeldnaam(veld.getName());
    if (!(veld instanceof PDFTextField)) {
      onbekend.push(veld.getName());
      continue;
    }
    if (BEKENDE_VELDEN.has(naam)) bekende.push(naam);
    else onbekend.push(veld.getName());
  }
  if (bekende.length === 0) {
    return { bekende, onbekend, fout: 'Geen tekstveld heeft een bekende mergeveldnaam. Er is niets opgeslagen.' };
  }
  return { bekende, onbekend, fout: null };
}

export async function vulPdfSjabloon(input: {
  sjabloon: Uint8Array;
  velden: Record<string, string>;
  bijlage: SjabloonBijlage;
}): Promise<{ ok: true; pdf: Uint8Array } | { ok: false; melding: string }> {
  const doc = await openPdf(input.sjabloon);
  if ('fout' in doc) return { ok: false, melding: doc.fout };
  const form = doc.getForm();
  const aanwezige = form.getFields();
  if (aanwezige.length === 0) {
    return { ok: false, melding: 'Het contractsjabloon heeft geen tekstvelden. Er is geen PDF gemaakt.' };
  }
  let gezet = 0;
  for (const veld of aanwezige) {
    const naam = normaliseerVeldnaam(veld.getName());
    if (!BEKENDE_VELDEN.has(naam)) continue;
    if (!(veld instanceof PDFTextField)) {
      return { ok: false, melding: `Het veld ${veld.getName()} is geen tekstveld. Er is geen PDF gemaakt.` };
    }
    try {
      const tekst = pdfVeilig(input.velden[naam] ?? '');
      const limiet = veld.getMaxLength();
      if (limiet !== undefined && tekst.length > limiet) veld.setMaxLength(undefined);
      veld.setText(tekst);
      gezet += 1;
    } catch (error) {
      const reden = error instanceof Error ? error.message : 'onbekende fout';
      return { ok: false, melding: `Het veld ${naam} kon niet worden ingevuld: ${reden}` };
    }
  }
  if (gezet === 0) {
    return { ok: false, melding: 'Het contractsjabloon heeft geen bekend mergeveld. Er is geen PDF gemaakt.' };
  }
  try {
    const letter = await doc.embedFont(StandardFonts.Helvetica);
    tekenVelden(doc, form, letter);
    wisFormulier(doc);
  } catch (error) {
    const reden = error instanceof Error ? error.message : 'onbekende fout';
    return { ok: false, melding: `De velden konden niet in de PDF worden gezet: ${reden}` };
  }
  if (!sjabloonBevatVoorwaarden(input.sjabloon)) {
    const extra = await PDFDocument.load(pdfBytes(bijlageTekst(input.bijlage, input.velden.contractnummer)));
    const paginas = await doc.copyPages(extra, extra.getPageIndices());
    for (const pagina of paginas) doc.addPage(pagina);
  }
  doc.setTitle(input.velden.contractnummer);
  doc.setAuthor('Stichting Het Kerkje van Persingen');
  const pdf = await doc.save({ useObjectStreams: false });
  return { ok: true, pdf: new Uint8Array(pdf) };
}

export async function voegTekstAanPdf(pdf: Uint8Array, tekst: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf);
  const extra = await PDFDocument.load(pdfBytes(tekst));
  const paginas = await doc.copyPages(extra, extra.getPageIndices());
  for (const pagina of paginas) doc.addPage(pagina);
  const uit = await doc.save({ useObjectStreams: false });
  return new Uint8Array(uit);
}

export async function voorbeeldContractSjabloon(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const letter = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  let pagina = doc.addPage([595, 842]);
  let y = 790;
  pagina.drawText('Huurovereenkomst', { x: 50, y, size: 18, font: letter });
  y -= 22;
  pagina.drawText('Voorbeeldsjabloon. De veldnaam achter elk vak is het mergeveld.', { x: 50, y, size: 10, font: letter });
  y -= 34;
  for (const [sleutel, label] of CONTRACT_MERGEVELDEN) {
    if (y < 64) {
      pagina = doc.addPage([595, 842]);
      y = 790;
    }
    pagina.drawText(label, { x: 50, y, size: 10, font: letter });
    const veld = form.createTextField(sleutel);
    veld.addToPage(pagina, { x: 230, y: y - 6, width: 310, height: 18, borderWidth: 0.4 });
    veld.setFontSize(10);
    y -= 26;
  }
  const uit = await doc.save({ useObjectStreams: false });
  return new Uint8Array(uit);
}
