/**
 * A4-PDF met de standaardletter Helvetica.
 * Regels worden op glyphbreedte afgebroken, niet op een vast aantal tekens.
 * Tekst die buiten het blad steekt, laat een telefoon de hele pagina
 * verkleinen tot alles erop past. Daarom blijft elke regel binnen de marge.
 */

import { inflateSync } from 'node:zlib';

const EXTRA: Record<string, number> = {
  '\u20ac': 0x80,
  '\u201a': 0x82,
  '\u201e': 0x84,
  '\u2026': 0x85,
  '\u2018': 0x91,
  '\u2019': 0x92,
  '\u201c': 0x93,
  '\u201d': 0x94,
  '\u2022': 0x95,
  '\u2013': 0x96,
  '\u2014': 0x97,
  '\u00a0': 0xa0,
};

export function winAnsiCode(teken: string): number | null {
  const code = teken.codePointAt(0);
  if (code == null) return null;
  if (code >= 32 && code <= 126) return code;
  if (code >= 160 && code <= 255) return code;
  return EXTRA[teken] ?? null;
}

export function ontbrekendePdfTekens(tekst: string): string[] {
  const gezien = new Set<string>();
  for (const teken of tekst) {
    if (teken === '\n' || teken === '\r' || teken === '\f' || teken === '\t') continue;
    if (winAnsiCode(teken) == null) gezien.add(teken);
  }
  return [...gezien];
}

function pdfString(regel: string): string {
  let uit = '';
  for (const teken of regel) {
    const code = winAnsiCode(teken) ?? 0x3f;
    if (code === 0x28 || code === 0x29 || code === 0x5c) uit += `\\${String.fromCharCode(code)}`;
    else uit += String.fromCharCode(code);
  }
  return uit;
}

const PAGINA_B = 595;
const PAGINA_H = 842;
const MARGE_X = 56;
const MARGE_BOVEN = 64;
const MARGE_ONDER = 52;
const TEKSTBREEDTE = PAGINA_B - MARGE_X * 2 - 4;

/** Helvetica-breedtes in duizendsten van de corpsgrootte. Onbekende tekens tellen ruim, zodat een regel niet buiten de marge valt. */
const GLYPH: Record<string, number> = {
  ' ': 278, 'i': 222, 'l': 222, 'I': 278, 'j': 222, 'f': 278, 't': 278, 'r': 333,
  '.': 278, ',': 278, ':': 278, ';': 278, "'": 222, '!': 278, '|': 260,
  '(': 333, ')': 333, '-': 333, '/': 278, '[': 278, ']': 278,
  'm': 833, 'w': 722, 'M': 833, 'W': 944,
  'O': 778, 'Q': 778, 'G': 778, 'C': 722, 'D': 722, 'H': 722, 'N': 722, 'U': 722,
  '@': 1015, '%': 889, '&': 667, '\u20ac': 556,
};

function glyphEenheid(teken: string): number {
  return GLYPH[teken] ?? 620;
}

export function pdfRegelBreedte(tekst: string, grootte: number, vet = false): number {
  let som = 0;
  for (const teken of tekst) som += glyphEenheid(teken);
  return (som * grootte / 1000) * (vet ? 1.08 : 1);
}

function pastOpRegel(tekst: string, grootte: number, vet: boolean): boolean {
  return pdfRegelBreedte(tekst, grootte, vet) <= TEKSTBREEDTE;
}

function breekWoord(woord: string, grootte: number, vet: boolean): string[] {
  if (pastOpRegel(woord, grootte, vet)) return [woord];
  const uit: string[] = [];
  let huidig = '';
  for (const teken of woord) {
    const kandidaat = huidig + teken;
    if (huidig && !pastOpRegel(kandidaat, grootte, vet)) {
      uit.push(huidig);
      huidig = teken;
    } else {
      huidig = kandidaat;
    }
  }
  if (huidig) uit.push(huidig);
  return uit.length ? uit : [woord.slice(0, 1)];
}

function breekRegel(tekst: string, grootte: number, vet: boolean): string[] {
  const woorden = tekst.split(/\s+/).filter(Boolean);
  const uit: string[] = [];
  let regel = '';
  for (const woord of woorden) {
    for (const stuk of breekWoord(woord, grootte, vet)) {
      const kandidaat = regel ? `${regel} ${stuk}` : stuk;
      if (regel && !pastOpRegel(kandidaat, grootte, vet)) {
        uit.push(regel);
        regel = stuk;
      } else {
        regel = kandidaat;
      }
    }
  }
  if (regel) uit.push(regel);
  return uit;
}

type RegelSoort = 'titel' | 'kop' | 'tekst';

function soortVan(regel: string, eersteVanDeel: boolean): RegelSoort {
  if (eersteVanDeel && regel.length <= 80 && !regel.includes(':')) return 'titel';
  if (/^\d+\.\s+\S/.test(regel) && regel.length <= 90) return 'kop';
  if (!regel.includes(':') && /^(Huurovereenkomst|Verhuurvoorwaarden|Huisregels|Plattegrond|Bewijs van elektronische ondertekening)/.test(regel) && regel.length <= 80) {
    return 'titel';
  }
  return 'tekst';
}

interface GetekendeRegel {
  tekst: string;
  grootte: number;
  vet: boolean;
  y: number;
}

function layoutPaginas(tekst: string): GetekendeRegel[][] {
  const paginas: GetekendeRegel[][] = [];
  let blad: GetekendeRegel[] = [];
  let y = PAGINA_H - MARGE_BOVEN;

  function nieuwBlad() {
    if (blad.length) paginas.push(blad);
    blad = [];
    y = PAGINA_H - MARGE_BOVEN;
  }

  function plaats(regel: string, grootte: number, vet: boolean, voor: number, leidend: number) {
    const nodig = voor + leidend;
    if (blad.length > 0 && y - nodig < MARGE_ONDER) nieuwBlad();
    y -= voor;
    blad.push({ tekst: regel, grootte, vet, y: y - grootte });
    y -= leidend;
  }

  tekst.split('\f').forEach((stuk, index) => {
    if (index > 0) nieuwBlad();
    let eerste = true;
    for (const bron of stuk.split('\n')) {
      const schoon = bron.trim();
      if (!schoon) {
        y -= 8;
        if (y < MARGE_ONDER) nieuwBlad();
        continue;
      }
      const soort = soortVan(schoon, eerste);
      eerste = false;
      const grootte = soort === 'titel' ? 16 : soort === 'kop' ? 13 : 12;
      const vet = soort !== 'tekst';
      const leidend = soort === 'titel' ? 22 : soort === 'kop' ? 18 : 16;
      const voor = soort === 'kop' ? 8 : 0;
      const delen = breekRegel(schoon, grootte, vet);
      if (soort !== 'tekst' && blad.length > 0 && y - (voor + leidend + 16) < MARGE_ONDER) nieuwBlad();
      delen.forEach((deel, deelIndex) => plaats(deel, grootte, vet, deelIndex === 0 ? voor : 0, leidend));
    }
  });
  if (blad.length || paginas.length === 0) paginas.push(blad);
  return paginas;
}

/** Elke getekende regel moet binnen de zetbreedte blijven. Een te brede regel laat een telefoon de pagina krimpen. */
export function pdfPastInA4(tekst: string): { paginas: number; teBreed: string[] } {
  const paginas = layoutPaginas(tekst);
  const teBreed: string[] = [];
  for (const blad of paginas) {
    for (const regel of blad) {
      if (!pastOpRegel(regel.tekst, regel.grootte, regel.vet)) teBreed.push(regel.tekst);
      if (regel.y < MARGE_ONDER - regel.grootte) teBreed.push(regel.tekst);
    }
  }
  return { paginas: paginas.length, teBreed };
}

function latin1(tekst: string): Uint8Array {
  const bytes = new Uint8Array(tekst.length);
  for (let i = 0; i < tekst.length; i += 1) bytes[i] = tekst.charCodeAt(i) & 0xff;
  return bytes;
}

function directBevatTekst(buf: Buffer, naald: string): boolean {
  if (buf.toString('latin1').includes(naald) || buf.toString('utf8').includes(naald)) return true;
  if (buf.includes(Buffer.from(naald, 'utf16le'))) return true;
  const be = Buffer.alloc(naald.length * 2);
  for (let i = 0; i < naald.length; i += 1) {
    const code = naald.charCodeAt(i);
    be[i * 2] = code >> 8;
    be[i * 2 + 1] = code & 0xff;
  }
  return buf.includes(be);
}

function bufferBevatTekst(buf: Buffer, naald: string): boolean {
  if (directBevatTekst(buf, naald)) return true;
  const latin = buf.toString('latin1');
  const ontkomen = latin.replace(/\\([0-7]{1,3})/g, (_heel, octaal: string) => String.fromCharCode(Number.parseInt(octaal, 8)));
  if (ontkomen.includes(naald)) return true;
  const hex = /<([0-9A-Fa-f\s]+)>/g;
  let treffer: RegExpExecArray | null;
  while ((treffer = hex.exec(latin))) {
    const cijfers = treffer[1].replace(/\s+/g, '');
    if (cijfers.length < 4 || cijfers.length % 2 === 1) continue;
    if (directBevatTekst(Buffer.from(cijfers, 'hex'), naald)) return true;
  }
  return false;
}

/** Zoekt tekst in de ruwe PDF en in uitgepakte FlateDecode-stromen. */
export function pdfBevatTekst(bytes: Uint8Array, naald: string): boolean {
  if (!naald) return false;
  const ruw = Buffer.from(bytes);
  if (bufferBevatTekst(ruw, naald)) return true;
  let zoek = 0;
  while (zoek < ruw.length) {
    const start = ruw.indexOf('stream', zoek);
    if (start < 0) break;
    const kop = ruw.subarray(Math.max(0, start - 400), start).toString('latin1');
    let dataStart = start + 6;
    if (ruw[dataStart] === 0x0d && ruw[dataStart + 1] === 0x0a) dataStart += 2;
    else if (ruw[dataStart] === 0x0a || ruw[dataStart] === 0x0d) dataStart += 1;
    const eind = ruw.indexOf('endstream', dataStart);
    if (eind < 0) break;
    zoek = eind + 9;
    if (!kop.includes('FlateDecode')) continue;
    const lading = ruw.subarray(dataStart, eind);
    for (const extra of [0, 1, 2]) {
      if (lading.length <= extra) continue;
      try {
        const open = inflateSync(lading.subarray(0, lading.length - extra));
        if (bufferBevatTekst(open, naald)) return true;
      } catch {
        continue;
      }
    }
  }
  return false;
}

/** Meerbladige A4-PDF. Een form-feed in de tekst begint een nieuwe bladzijde. De tekst blijft selecteerbaar. */
export function pdfBytes(tekst: string): Uint8Array {
  const bladen = layoutPaginas(tekst);
  const objecten = new Map<number, string>();
  objecten.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objecten.set(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids: number[] = [];
  let volg = 5;
  bladen.forEach((blad, index) => {
    const paginaId = volg;
    const inhoudId = volg + 1;
    volg += 2;
    kids.push(paginaId);
    const commando = ['BT'];
    for (const regel of blad) {
      commando.push(`${regel.vet ? '/F2' : '/F1'} ${regel.grootte} Tf`);
      commando.push(`1 0 0 1 ${MARGE_X} ${regel.y} Tm`);
      commando.push(`(${pdfString(regel.tekst)}) Tj`);
    }
    commando.push('/F1 9 Tf');
    commando.push(`1 0 0 1 ${MARGE_X} 32 Tm`);
    commando.push(`(${pdfString(String(index + 1))}) Tj`);
    commando.push('ET');
    const stream = commando.join('\n');
    objecten.set(inhoudId, `<< /Length ${latin1(stream).length} >>\nstream\n${stream}\nendstream`);
    objecten.set(
      paginaId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGINA_B} ${PAGINA_H}] /CropBox [0 0 ${PAGINA_B} ${PAGINA_H}] /Contents ${inhoudId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`,
    );
  });
  objecten.set(2, `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map((id) => `${id} 0 R`).join(' ')}] >>`);
  objecten.set(1, '<< /Type /Catalog /Pages 2 0 R >>');

  const maxId = Math.max(...objecten.keys());
  const kop = latin1('%PDF-1.4\n');
  const delen: Uint8Array[] = [kop];
  const offsets = new Array<number>(maxId + 1).fill(0);
  let cursor = kop.length;
  for (let id = 1; id <= maxId; id += 1) {
    offsets[id] = cursor;
    const stuk = latin1(`${id} 0 obj\n${objecten.get(id) ?? '<< >>'}\nendobj\n`);
    delen.push(stuk);
    cursor += stuk.length;
  }
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF`;
  delen.push(latin1(xref));
  const totaal = delen.reduce((som, deel) => som + deel.length, 0);
  const uit = new Uint8Array(totaal);
  let positie = 0;
  for (const deel of delen) {
    uit.set(deel, positie);
    positie += deel.length;
  }
  return uit;
}
