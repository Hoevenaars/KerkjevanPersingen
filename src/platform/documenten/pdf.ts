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

/** Times-breedtes in duizendsten. Onbekende tekens tellen ruim, zodat een regel niet buiten de marge valt. */
const GLYPH: Record<string, number> = {
  ' ': 250, 'i': 278, 'l': 278, 'I': 333, 'j': 278, 'f': 333, 't': 278, 'r': 333,
  '.': 250, ',': 250, ':': 278, ';': 278, "'": 180, '!': 333, '|': 200,
  '(': 333, ')': 333, '-': 333, '/': 278, '[': 333, ']': 333,
  'm': 778, 'w': 722, 'M': 889, 'W': 944,
  'O': 722, 'Q': 722, 'G': 722, 'C': 667, 'D': 722, 'H': 722, 'N': 722, 'U': 722,
  '@': 921, '%': 833, '&': 778, '\u20ac': 500,
};

function glyphEenheid(teken: string): number {
  if (GLYPH[teken] != null) return GLYPH[teken];
  if (/\d/.test(teken)) return 500;
  if (/[A-Z]/.test(teken)) return 680;
  return 460;
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
  if (/^VERSIE\b/.test(regel) || /\| Documentversie:/.test(regel)) return 'meta';
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
  streep?: boolean;
}

interface ZetRegel {
  tekst: string;
  grootte: number;
  vet: boolean;
  x: number;
  max: number;
  kleur: string;
  voor: number;
  na: number;
  streep?: boolean;
  plakt: boolean;
  titel: string;
}

function layoutPaginas(tekst: string): { regels: GetekendeRegel[]; titel: string }[] {
  const alles: ZetRegel[] = [];
  let titel = 'Huurovereenkomst';
  let openGroep = 0;

  function duw(regels: Omit<ZetRegel, 'plakt' | 'titel'>[], plakVolgende = 0) {
    regels.forEach((regel) => {
      const plakt = openGroep > 0;
      if (openGroep > 0) openGroep -= 1;
      alles.push({ ...regel, plakt, titel });
    });
    if (plakVolgende > 0) openGroep += plakVolgende;
    if (regels.length >= 2) alles[alles.length - 1].plakt = true;
  }

  tekst.split('\f').forEach((stuk, index) => {
    if (index > 0 && alles.length > 0) {
      duw([{ tekst: '', grootte: 0, vet: false, x: MARGE_X, max: TEKSTBREEDTE, kleur: SAND, voor: 8, na: 8, streep: true }]);
    }
    let eerste = true;
    for (const bron of stuk.split('\n')) {
      const schoon = bron.trim();
      if (!schoon || /_{4,}/.test(schoon)) continue;
      const soort = soortVan(schoon, eerste);
      eerste = false;
      if (soort === 'titel') {
        titel = schoon;
        const delen = breekRegel(schoon, 16, true).map((deel, deelIndex) => ({
          tekst: deel, grootte: 16, vet: true, x: MARGE_X, max: TEKSTBREEDTE, kleur: PINE, voor: deelIndex === 0 ? 2 : 0, na: 20,
        }));
        duw(delen, 2);
        continue;
      }
      if (soort === 'kop') {
        duw([{ tekst: schoon, grootte: 12, vet: true, x: MARGE_X, max: TEKSTBREEDTE, kleur: PINE, voor: 11, na: 16 }], 2);
        continue;
      }
      if (soort === 'meta') {
        duw(breekOpBreedte(schoon, 9, false, TEKSTBREEDTE).map((deel) => ({
          tekst: deel, grootte: 9, vet: false, x: MARGE_X, max: TEKSTBREEDTE, kleur: SOFT, voor: 0, na: 13,
        })));
        continue;
      }
      if (soort === 'feit') {
        const idx = schoon.indexOf(': ');
        const label = schoon.slice(0, idx);
        const waarde = schoon.slice(idx + 2);
        const delen = breekOpBreedte(waarde, 11, false, WAARDE_BREEDTE);
        duw(delen.map((deel, deelIndex) => ({
          tekst: deelIndex === 0 ? `${label}\u0001${deel}` : deel,
          grootte: 11,
          vet: false,
          x: WAARDE_X,
          max: WAARDE_BREEDTE,
          kleur: INK,
          voor: 1,
          na: 15,
        })));
        continue;
      }
      const regels = breekOpBreedte(schoon, 11, false, TEKSTBREEDTE);
      duw(regels.map((deel, deelIndex) => ({
        tekst: deel, grootte: 11, vet: false, x: MARGE_X, max: TEKSTBREEDTE, kleur: INK, voor: deelIndex === 0 ? 1 : 0, na: 14,
      })));
    }
  });

  const paginas: { regels: GetekendeRegel[]; titel: string }[] = [];
  let cursor = 0;
  while (cursor < alles.length) {
    while (cursor < alles.length && alles[cursor].streep) cursor += 1;
    if (cursor >= alles.length) break;
    let y = KOP_ONDER;
    let passen = 0;
    while (cursor + passen < alles.length) {
      const regel = alles[cursor + passen];
      if (passen > 0 && regel.streep && y - (regel.voor + regel.na) - 40 < VOET_BOVEN) break;
      const stap = regel.voor + regel.na;
      if (y - stap < VOET_BOVEN) break;
      y -= stap;
      passen += 1;
    }
    if (passen === 0) passen = 1;
    const over = alles.length - cursor - passen;
    if (over > 0 && over < 6 && passen > 8) passen -= 6 - over;
    while (passen > 1 && alles[cursor + passen]?.plakt) passen -= 1;
    if (passen < 1) passen = 1;
    const stuk = alles.slice(cursor, cursor + passen).filter((regel, index, lijst) => {
      if (!regel.streep) return true;
      return index > 0 && index < lijst.length - 1;
    });
    y = KOP_ONDER;
    const getekend: GetekendeRegel[] = [];
    for (const regel of stuk) {
      y -= regel.voor;
      getekend.push({ ...regel, y: regel.streep ? y : y - regel.grootte });
      y -= regel.na;
    }
    const kopOpBlad = stuk.find((regel) => regel.grootte >= 16 && regel.tekst);
    if (getekend.length) paginas.push({ regels: getekend, titel: kopOpBlad?.titel || stuk[0]?.titel || titel });
    cursor += passen;
  }
  if (paginas.length === 0) paginas.push({ regels: [], titel });
  return paginas.map((pagina) => ({
    titel: pagina.titel,
    regels: pagina.regels.flatMap((regel) => {
      const scheiding = regel.tekst.indexOf('\u0001');
      if (scheiding < 0) return [regel];
      const label = regel.tekst.slice(0, scheiding);
      const waarde = regel.tekst.slice(scheiding + 1);
      return [
        { ...regel, tekst: label, grootte: 9, vet: true, x: MARGE_X, max: LABEL_BREEDTE - 8, kleur: SOFT },
        { ...regel, tekst: waarde },
      ];
    }),
  }));
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
export function pdfPastInA4(tekst: string): { paginas: number; teBreed: string[]; regels: number[] } {
  const paginas = layoutPaginas(tekst);
  const teBreed: string[] = [];
  const regels: number[] = [];
  for (const blad of paginas) {
    let teller = 0;
    for (const regel of blad.regels) {
      if (regel.streep || !regel.tekst) continue;
      teller += 1;
      if (pdfRegelBreedte(regel.tekst, regel.grootte, regel.vet) > regel.max + 1) teBreed.push(regel.tekst);
      if (regel.y < 28) teBreed.push(regel.tekst);
    }
    regels.push(teller);
  }
  return { paginas: paginas.length, teBreed, regels };
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

function paginaLabel(nummer: number, totaal: number): string {
  return `${nummer} van ${totaal}`;
}

function kortTotBreedte(tekst: string, grootte: number, max: number): string {
  if (pdfRegelBreedte(tekst, grootte, false) <= max) return tekst;
  let kort = tekst;
  while (kort.length > 4 && pdfRegelBreedte(`${kort}...`, grootte, false) > max) kort = kort.slice(0, -1);
  return `${kort}...`;
}

function paginaStroom(blad: { regels: GetekendeRegel[]; titel: string }, nummer: number, totaal: number, referentie: string): string {
  const kop = blad.titel.length > 42 ? `${blad.titel.slice(0, 39)}...` : blad.titel;
  const label = paginaLabel(nummer, totaal);
  const labelX = Math.round(PAGINA_B - MARGE_X - pdfRegelBreedte(label, 8, false));
  const voet = kortTotBreedte(referentie || 'Stichting Het Kerkje van Persingen', 8, labelX - MARGE_X - 16);
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
    if (regel.streep) {
      sluitTekst();
      regels.push('q', `${SAND} RG`, '0.4 w', `${MARGE_X} ${Math.round(regel.y)} m ${PAGINA_B - MARGE_X} ${Math.round(regel.y)} l S`, 'Q');
      vorigeKleur = '';
      continue;
    }
    if (!regel.tekst) continue;
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
    `(${pdfString(voet)}) Tj`,
    `1 0 0 1 ${labelX} 32 Tm`,
    `(${pdfString(label)}) Tj`,
    'ET',
  );
  return regels.join('\n');
}

interface PdfVerwijzing {
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
  uri: string;
}

function verwijzingen(regel: GetekendeRegel): PdfVerwijzing[] {
  if (regel.streep || !regel.tekst) return [];
  const uit: PdfVerwijzing[] = [];
  const patroon = /https:\/\/[^\s)]+/g;
  let treffer: RegExpExecArray | null;
  while ((treffer = patroon.exec(regel.tekst))) {
    const uri = treffer[0].replace(/[.,;]+$/, '');
    const voor = regel.tekst.slice(0, treffer.index);
    uit.push({
      x: regel.x + pdfRegelBreedte(voor, regel.grootte, regel.vet),
      y: regel.y - 2,
      breedte: Math.max(8, pdfRegelBreedte(uri, regel.grootte, regel.vet)),
      hoogte: regel.grootte + 4,
      uri,
    });
  }
  return uit;
}

function verwijzingObject(link: PdfVerwijzing): string {
  const x2 = Math.round(link.x + link.breedte);
  const y1 = Math.round(link.y);
  const y2 = Math.round(link.y + link.hoogte);
  return `<< /Type /Annot /Subtype /Link /Rect [${Math.round(link.x)} ${y1} ${x2} ${y2}] /Border [0 0 0] /A << /S /URI /URI (${pdfString(link.uri)}) >> >>`;
}

function documentReferentie(tekst: string): string {
  const kop = tekst.match(/Contractnummer:\s*([^|\n]+)/);
  const versie = tekst.match(/Documentversie:\s*(\S+)/);
  if (!kop) return 'Stichting Het Kerkje van Persingen';
  return versie ? `${kop[1].trim()} · versie ${versie[1]}` : kop[1].trim();
}

/** Meerbladige A4-PDF. Een form-feed in de tekst begint een nieuwe bladzijde. De tekst blijft selecteerbaar. */
export function pdfBytes(tekst: string): Uint8Array {
  const bladen = layoutPaginas(tekst);
  const referentie = documentReferentie(tekst);
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
    const stream = paginaStroom(blad, index + 1, bladen.length, referentie);
    const annotIds: number[] = [];
    for (const regel of blad.regels) {
      for (const link of verwijzingen(regel)) {
        const annotId = volg;
        volg += 1;
        annotIds.push(annotId);
        objecten.set(annotId, verwijzingObject(link));
      }
    }
    const annots = annotIds.length ? ` /Annots [${annotIds.map((id) => `${id} 0 R`).join(' ')}]` : '';
    objecten.set(inhoudId, `<< /Length ${latin1(stream).length} >>\nstream\n${stream}\nendstream`);
    objecten.set(
      paginaId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGINA_B} ${PAGINA_H}] /CropBox [0 0 ${PAGINA_B} ${PAGINA_H}] /Contents ${inhoudId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >>${annots} >>`,
    );
  });
  objecten.set(2, `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map((id) => `${id} 0 R`).join(' ')}] >>`);
  objecten.set(1, '<< /Type /Catalog /Pages 2 0 R >>');

  const maxId = Math.max(...objecten.keys());
  // Vier bytes boven 127 direct na de kop. Zonder die regel behandelt
  // de iPhone het bestand als tekst en weigert Mail het te openen.
  const kop = latin1('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
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
  xref += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF\n`;
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
