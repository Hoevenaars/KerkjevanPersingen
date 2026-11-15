/**
 * Kleine PDF met de standaardletter Helvetica.
 * De tekst wordt hierin gezet; er wordt geen leeg Word-bestand doorgestuurd.
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

function breekRegels(tekst: string, breedte = 90): string[] {
  const uit: string[] = [];
  const stukken = tekst.split('\f');
  stukken.forEach((stuk, index) => {
    if (index > 0) uit.push('\f');
    for (const blok of stuk.split('\n')) {
      const woorden = blok.split(/\s+/).filter((woord) => woord.length > 0);
      if (woorden.length === 0) {
        uit.push('');
        continue;
      }
      let regel = '';
      for (const woord of woorden) {
        const kandidaat = regel ? `${regel} ${woord}` : woord;
        if (kandidaat.length > breedte && regel) {
          uit.push(regel);
          regel = woord;
        } else {
          regel = kandidaat;
        }
      }
      if (regel) uit.push(regel);
    }
  });
  return uit;
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

/** Meerbladige PDF. Een form-feed in de tekst begint een nieuwe bladzijde. */
export function pdfBytes(tekst: string): Uint8Array {
  const regels = breekRegels(tekst);
  const bladen: string[][] = [[]];
  for (const regel of regels) {
    if (regel === '\f') {
      bladen.push([]);
      continue;
    }
    const blad = bladen[bladen.length - 1];
    if (blad.length >= 48) bladen.push([regel]);
    else blad.push(regel);
  }

  const objecten = new Map<number, string>();
  objecten.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const kids: number[] = [];
  let volg = 4;
  for (const blad of bladen) {
    const paginaId = volg;
    const inhoudId = volg + 1;
    volg += 2;
    kids.push(paginaId);
    const commando = ['BT', '/F1 11 Tf', '50 800 Td', '14 TL'];
    for (const regel of blad) commando.push(`(${pdfString(regel)}) Tj T*`);
    commando.push('ET');
    const stream = commando.join('\n');
    objecten.set(inhoudId, `<< /Length ${latin1(stream).length} >>\nstream\n${stream}\nendstream`);
    objecten.set(
      paginaId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${inhoudId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
    );
  }
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
