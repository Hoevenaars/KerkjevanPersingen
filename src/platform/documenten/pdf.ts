/**
 * A4-contract-PDF in de huisstijl.
 * Tekst blijft selecteerbaar. Regels worden op breedte afgebroken,
 * zodat een telefoon de pagina niet hoeft te verkleinen.
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
const KOP_ONDER = 782;
const VOET_BOVEN = 58;
const TEKSTBREEDTE = PAGINA_B - MARGE_X * 2;
const LABEL_BREEDTE = 196;
const WAARDE_X = MARGE_X + LABEL_BREEDTE;
const WAARDE_BREEDTE = PAGINA_B - MARGE_X - WAARDE_X;

const PINE = '0.290 0.322 0.208';
const INK = '0.102 0.102 0.102';
const SOFT = '0.290 0.290 0.267';
const BRICK = '0.612 0.290 0.184';
const SAND = '0.914 0.890 0.816';

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

function breekWoord(woord: string, grootte: number, vet: boolean, max = TEKSTBREEDTE): string[] {
  const past = (waarde: string) => pdfRegelBreedte(waarde, grootte, vet) <= max;
  if (past(woord)) return [woord];
  const uit: string[] = [];
  let huidig = '';
  for (const teken of woord) {
    const kandidaat = huidig + teken;
    if (huidig && !past(kandidaat)) {
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

type RegelSoort = 'titel' | 'kop' | 'meta' | 'feit' | 'handtekening' | 'tekst';

function soortVan(regel: string, eersteVanDeel: boolean): RegelSoort {
  if (/_{4,}/.test(regel)) return 'handtekening';
  if (eersteVanDeel && regel.length <= 80 && !regel.includes(':')) return 'titel';
  if (/^\d+\.\s+\S/.test(regel) && regel.length <= 90) return 'kop';
  if (/^VERSIE\b/.test(regel)) return 'meta';
  if (!regel.includes(':') && /^(Huurovereenkomst|Verhuurvoorwaarden|Huisregels|Plattegrond|Bewijs van elektronische ondertekening)/.test(regel) && regel.length <= 80) {
    return 'titel';
  }
  const idx = regel.indexOf(': ');
  if (idx >= 2 && idx <= 42) return 'feit';
  return 'tekst';
}

interface GetekendeRegel {
  tekst: string;
  grootte: number;
  vet: boolean;
  y: number;
  x: number;
  max: number;
  kleur: string;
}

function layoutPaginas(tekst: string): { regels: GetekendeRegel[]; titel: string }[] {
  const paginas: { regels: GetekendeRegel[]; titel: string }[] = [];
  let blad: GetekendeRegel[] = [];
  let titel = 'Huurovereenkomst';
  let y = KOP_ONDER;

  function nieuwBlad() {
    if (blad.length) paginas.push({ regels: blad, titel });
    blad = [];
    y = KOP_ONDER;
  }

  function plaats(regel: string, grootte: number, vet: boolean, x: number, max: number, kleur: string, voor: number, leidend: number) {
    if (blad.length > 0 && y - (voor + leidend) < VOET_BOVEN) nieuwBlad();
    y -= voor;
    blad.push({ tekst: regel, grootte, vet, y: y - grootte, x, max, kleur });
    y -= leidend;
  }

  tekst.split('\f').forEach((stuk, index) => {
    if (index > 0) nieuwBlad();
    let eerste = true;
    for (const bron of stuk.split('\n')) {
      const schoon = bron.trim();
      if (!schoon) {
        y -= 7;
        if (y < VOET_BOVEN) nieuwBlad();
        continue;
      }
      const soort = soortVan(schoon, eerste);
      eerste = false;
      if (soort === 'titel') {
        titel = schoon;
        const delen = breekRegel(schoon, 18, true);
        delen.forEach((deel, deelIndex) => plaats(deel, 18, true, MARGE_X, TEKSTBREEDTE, PINE, deelIndex === 0 ? 4 : 0, 24));
        continue;
      }
      if (soort === 'kop') {
        if (blad.length > 0 && y - 40 < VOET_BOVEN) nieuwBlad();
        plaats(schoon, 13, true, MARGE_X, TEKSTBREEDTE, PINE, 12, 18);
        continue;
      }
      if (soort === 'meta') {
        plaats(schoon, 9, false, MARGE_X, TEKSTBREEDTE, SOFT, 0, 14);
        continue;
      }
      if (soort === 'feit') {
        const idx = schoon.indexOf(': ');
        const label = schoon.slice(0, idx);
        const waarde = schoon.slice(idx + 2);
        const delen = breekOpBreedte(waarde, 11, false, WAARDE_BREEDTE);
        delen.forEach((deel, deelIndex) => {
          if (blad.length > 0 && y - 16 < VOET_BOVEN) nieuwBlad();
          const basis = y - 12;
          if (deelIndex === 0) blad.push({ tekst: label, grootte: 9, vet: true, y: basis, x: MARGE_X, max: LABEL_BREEDTE - 8, kleur: SOFT });
          blad.push({ tekst: deel, grootte: 11, vet: false, y: basis, x: WAARDE_X, max: WAARDE_BREEDTE, kleur: INK });
          y = basis - 6;
        });
        continue;
      }
      if (soort === 'handtekening') {
        const delen = schoon.split(/\s{2,}/).map((deel) => deel.replace(/_{4,}/g, '______________'));
        for (const deel of delen) {
          const stukken = breekOpBreedte(deel, 11, false, TEKSTBREEDTE);
          for (const stukRegel of stukken) plaats(stukRegel, 11, false, MARGE_X, TEKSTBREEDTE, INK, 1, 16);
        }
        continue;
      }
      for (const deel of breekOpBreedte(schoon, 11, false, TEKSTBREEDTE)) {
        plaats(deel, 11, false, MARGE_X, TEKSTBREEDTE, INK, 1, 15);
      }
    }
  });
  if (blad.length || paginas.length === 0) paginas.push({ regels: blad, titel });
  return paginas;
}

function breekOpBreedte(tekst: string, grootte: number, vet: boolean, max: number): string[] {
  const woorden = tekst.split(/\s+/).filter(Boolean);
  const uit: string[] = [];
  let regel = '';
  const past = (waarde: string) => pdfRegelBreedte(waarde, grootte, vet) <= max;
  for (const woord of woorden) {
    const stukken = past(woord) ? [woord] : breekWoord(woord, grootte, vet, max);
    for (const stuk of stukken) {
      const kandidaat = regel ? `${regel} ${stuk}` : stuk;
      if (regel && !past(kandidaat)) {
        uit.push(regel);
        regel = stuk;
      } else {
        regel = kandidaat;
      }
    }
  }
  if (regel) uit.push(regel);
  return uit.length ? uit : [''];
}

/** Elke getekende regel moet binnen zijn zetbreedte blijven. */
export function pdfPastInA4(tekst: string): { paginas: number; teBreed: string[] } {
  const paginas = layoutPaginas(tekst);
  const teBreed: string[] = [];
  for (const blad of paginas) {
    for (const regel of blad.regels) {
      if (pdfRegelBreedte(regel.tekst, regel.grootte, regel.vet) > regel.max + 1) teBreed.push(regel.tekst);
      if (regel.y < 28) teBreed.push(regel.tekst);
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

function paginaStroom(blad: { regels: GetekendeRegel[]; titel: string }, nummer: number, totaal: number): string {
  const kop = blad.titel.length > 42 ? `${blad.titel.slice(0, 39)}...` : blad.titel;
  const regels = [
    'q',
    `${PINE} rg`,
    `0 800 ${PAGINA_B} 42 re f`,
    `${BRICK} rg`,
    `0 796 ${PAGINA_B} 4 re f`,
    'Q',
    'BT',
    '1 1 1 rg',
    '/F2 14 Tf',
    '1 0 0 1 56 818 Tm',
    '(Kerkje van Persingen) Tj',
    '/F1 9 Tf',
    '1 0 0 1 360 818 Tm',
    `(${pdfString(kop)}) Tj`,
    'ET',
  ];
  let vorigeKleur = '';
  let tekstOpen = false;
  function openTekst() {
    if (!tekstOpen) {
      regels.push('BT');
      tekstOpen = true;
    }
  }
  function sluitTekst() {
    if (tekstOpen) {
      regels.push('ET');
      tekstOpen = false;
    }
  }
  for (const regel of blad.regels) {
    openTekst();
    if (regel.kleur !== vorigeKleur) {
      regels.push(`${regel.kleur} rg`);
      vorigeKleur = regel.kleur;
    }
    regels.push(`${regel.vet ? '/F2' : '/F1'} ${regel.grootte} Tf`);
    regels.push(`1 0 0 1 ${regel.x} ${Math.round(regel.y)} Tm`);
    regels.push(`(${pdfString(regel.tekst)}) Tj`);
  }
  sluitTekst();
  regels.push(
    'q',
    `${SAND} RG`,
    '0.6 w',
    `56 48 m ${PAGINA_B - 56} 48 l S`,
    'Q',
    'BT',
    `${SOFT} rg`,
    '/F1 8 Tf',
    '1 0 0 1 56 32 Tm',
    '(Stichting Het Kerkje van Persingen) Tj',
    `1 0 0 1 ${PAGINA_B - 110} 32 Tm`,
    `(${nummer} / ${totaal}) Tj`,
    'ET',
  );
  return regels.join('\n');
}

/** Meerbladige A4-PDF. Een form-feed in de tekst begint een nieuwe bladzijde. De tekst blijft selecteerbaar. */
export function pdfBytes(tekst: string): Uint8Array {
  const bladen = layoutPaginas(tekst);
  const objecten = new Map<number, string>();
  objecten.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>');
  objecten.set(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>');
  const kids: number[] = [];
  let volg = 5;
  bladen.forEach((blad, index) => {
    const paginaId = volg;
    const inhoudId = volg + 1;
    volg += 2;
    kids.push(paginaId);
    const stream = paginaStroom(blad, index + 1, bladen.length);
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
