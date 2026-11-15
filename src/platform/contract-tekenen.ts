/**
 * Online ondertekenen van één bevroren contractversie.
 * De token staat gehasht. Een tweede klik maakt geen tweede handtekening
 * en geen tweede bevestigingsmail.
 */

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { contractPakketTekst, sha256Hex, type PakketBron } from './contract-pakket.ts';
import { pdfBytes } from './documenten/pdf.ts';

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const CODE_RE = /^\d{6}$/;

export function maakTekenToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashTekenToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenVormGeldig(token: string): boolean {
  return TOKEN_RE.test(token);
}

export function maakVerificatiecode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashVerificatiecode(code: string, tokenHash: string, geheim: string): string {
  return createHmac('sha256', geheim).update(`${tokenHash}:${code}`).digest('hex');
}

export function codeKlopt(code: string, tokenHash: string, geheim: string, verwacht: string): boolean {
  if (!CODE_RE.test(code) || !verwacht) return false;
  const gekregen = hashVerificatiecode(code, tokenHash, geheim);
  const a = Buffer.from(gekregen);
  const b = Buffer.from(verwacht);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function tekenCookieWaarde(tokenHash: string, tot: string, geheim: string): string {
  const lading = Buffer.from(`${tokenHash}|${tot}`).toString('base64url');
  const mac = createHmac('sha256', geheim).update(lading).digest('base64url');
  return `${lading}.${mac}`;
}

export function tekenCookieGeldig(waarde: string, tokenHash: string, nu: string, geheim: string): boolean {
  const punt = waarde.lastIndexOf('.');
  if (punt < 1) return false;
  const lading = waarde.slice(0, punt);
  const mac = waarde.slice(punt + 1);
  const verwacht = createHmac('sha256', geheim).update(lading).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(verwacht);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const tekst = Buffer.from(lading, 'base64url').toString('utf8');
  const scheiding = tekst.indexOf('|');
  if (scheiding < 1) return false;
  const hash = tekst.slice(0, scheiding);
  const tot = tekst.slice(scheiding + 1);
  return hash === tokenHash && tot >= nu;
}

export interface TekenDossier {
  boekingId: string;
  versie: number;
  contractnummer: string;
  tokenHash: string;
  verlooptOp: string;
  codeHash: string | null;
  codeVerloopt: string | null;
  pogingen: number;
  geverifieerdOp: string | null;
  ondertekendOp: string | null;
  naam: string | null;
  email: string;
  vrijgegeven: boolean;
  documentHash: string | null;
  pdfPad: string | null;
  bevestigingId: string | null;
  pakket: PakketBron;
  huurderNaam: string;
}

export interface TekenBewijs {
  naam: string;
  email: string;
  op: string;
  contractnummer: string;
  versie: number;
  documentHash: string;
}

export function bewijsTekst(bewijs: TekenBewijs): string {
  return [
    'Bewijs van elektronische ondertekening',
    'Stichting Het Kerkje van Persingen',
    '',
    'Dit is een elektronische bevestiging in de online omgeving van het Kerkje van Persingen.',
    'Dit is geen gekwalificeerde elektronische handtekening.',
    '',
    `Contract: ${bewijs.contractnummer}`,
    `Documentversie: ${bewijs.versie}`,
    `Hash van het contractpakket vóór dit bewijs: ${bewijs.documentHash}`,
    `Ondertekenaar: ${bewijs.naam}`,
    `Geverifieerd e-mailadres: ${bewijs.email}`,
    `Tijdstip: ${bewijs.op}`,
    'De ondertekenaar heeft de volledige naam bevestigd en expliciet akkoord gegeven met de contractuele bepalingen.',
  ].join('\n');
}

export function ondertekendePdf(dossier: TekenDossier, bewijs: TekenBewijs): Uint8Array {
  const pakket = contractPakketTekst(dossier.pakket);
  return pdfBytes(`${pakket}\n\f\n${bewijsTekst(bewijs)}`);
}

export type TekenStap =
  | { soort: 'bekijk'; token: string; nu: string }
  | { soort: 'code'; token: string; nu: string; geheim: string }
  | { soort: 'controle'; token: string; nu: string; geheim: string; code: string }
  | { soort: 'onderteken'; token: string; nu: string; naam: string; akkoord: boolean; cookie: string; geheim: string; ipHash: string | null; userAgent: string }
  | { soort: 'download'; token: string; nu: string };

export type TekenUitkomst =
  | { ok: false; melding: string }
  | { ok: true; melding: string; dossier: TekenDossier; pdf?: Uint8Array; code?: string; cookie?: string; mail?: 'code' | 'bevestiging' };

export interface TekenWinkel {
  lees(tokenHash: string): Promise<TekenDossier | null>;
  bewaarCode(tokenHash: string, codeHash: string, verloopt: string, pogingen: number): Promise<void>;
  zetGeverifieerd(tokenHash: string, op: string): Promise<void>;
  legOndertekening(input: {
    tokenHash: string;
    naam: string;
    op: string;
    documentHash: string;
    pdfPad: string;
    pdf: Uint8Array;
    audit: Record<string, string | null>;
  }): Promise<'nieuw' | 'al'>;
}

function plusMinuten(iso: string, minuten: number): string {
  return new Date(Date.parse(iso) + minuten * 60_000).toISOString();
}

function openDossier(dossier: TekenDossier | null, nu: string): { ok: true; dossier: TekenDossier } | { ok: false; melding: string } {
  if (!dossier) return { ok: false, melding: 'Deze link is ongeldig.' };
  if (dossier.verlooptOp < nu && !dossier.ondertekendOp) return { ok: false, melding: 'Deze link is verlopen.' };
  return { ok: true, dossier };
}

export async function voerTekenstap(stap: TekenStap, winkel: TekenWinkel): Promise<TekenUitkomst> {
  if (!tokenVormGeldig(stap.token)) return { ok: false, melding: 'Deze link is ongeldig.' };
  const hash = hashTekenToken(stap.token);
  const gelezen = openDossier(await winkel.lees(hash), stap.nu);
  if (!gelezen.ok) return gelezen;
  const dossier = gelezen.dossier;
  if (dossier.tokenHash !== hash) return { ok: false, melding: 'Deze link hoort niet bij dit contract.' };

  if (stap.soort === 'bekijk' || stap.soort === 'download') {
    if (stap.soort === 'download' && dossier.ondertekendOp) {
      const bewijs: TekenBewijs = {
        naam: dossier.naam || dossier.huurderNaam,
        email: dossier.email,
        op: dossier.ondertekendOp,
        contractnummer: dossier.contractnummer,
        versie: dossier.versie,
        documentHash: dossier.documentHash || '',
      };
      return { ok: true, melding: 'Getekend contract.', dossier, pdf: ondertekendePdf(dossier, bewijs) };
    }
    const pdf = pdfBytes(contractPakketTekst(dossier.pakket));
    return { ok: true, melding: 'Contract.', dossier, pdf: stap.soort === 'download' ? pdf : undefined };
  }

  if (dossier.ondertekendOp) {
    return { ok: true, melding: 'Dit contract is al ondertekend. Er is geen nieuwe mail verstuurd.', dossier };
  }
  if (!dossier.vrijgegeven) {
    return { ok: false, melding: 'Deze versie is nog niet vrijgegeven om te ondertekenen.' };
  }

  if (stap.soort === 'code') {
    if (dossier.pogingen >= 5) return { ok: false, melding: 'Te veel pogingen. Vraag het kerkje om een nieuwe link.' };
    const code = maakVerificatiecode();
    await winkel.bewaarCode(hash, hashVerificatiecode(code, hash, stap.geheim), plusMinuten(stap.nu, 15), dossier.pogingen);
    return { ok: true, melding: 'De code is verstuurd naar het bekende e-mailadres.', dossier, code, mail: 'code' };
  }

  if (stap.soort === 'controle') {
    if (!dossier.codeHash || !dossier.codeVerloopt || dossier.codeVerloopt < stap.nu) {
      return { ok: false, melding: 'De code is verlopen. Vraag een nieuwe code.' };
    }
    if (dossier.pogingen >= 5) return { ok: false, melding: 'Te veel pogingen. Vraag het kerkje om een nieuwe link.' };
    if (!codeKlopt(stap.code.trim(), hash, stap.geheim, dossier.codeHash)) {
      await winkel.bewaarCode(hash, dossier.codeHash, dossier.codeVerloopt, dossier.pogingen + 1);
      return { ok: false, melding: 'De code klopt niet.' };
    }
    await winkel.zetGeverifieerd(hash, stap.nu);
    const tot = plusMinuten(stap.nu, 30);
    return {
      ok: true,
      melding: 'Het e-mailadres is bevestigd.',
      dossier: { ...dossier, geverifieerdOp: stap.nu },
      cookie: tekenCookieWaarde(hash, tot, stap.geheim),
    };
  }

  if (!dossier.geverifieerdOp || !tekenCookieGeldig(stap.cookie, hash, stap.nu, stap.geheim)) {
    return { ok: false, melding: 'Bevestig eerst de code uit de e-mail.' };
  }
  const naam = stap.naam.replace(/\s+/g, ' ').trim();
  if (naam.length < 3) return { ok: false, melding: 'Vul uw volledige naam in.' };
  if (!stap.akkoord) return { ok: false, melding: 'Vink aan dat u akkoord gaat met de contractuele bepalingen.' };
  const ongetekend = pdfBytes(contractPakketTekst(dossier.pakket));
  const documentHash = sha256Hex(ongetekend);
  const bewijs: TekenBewijs = {
    naam,
    email: dossier.email,
    op: stap.nu,
    contractnummer: dossier.contractnummer,
    versie: dossier.versie,
    documentHash,
  };
  const pdf = ondertekendePdf(dossier, bewijs);
  const stand = await winkel.legOndertekening({
    tokenHash: hash,
    naam,
    op: stap.nu,
    documentHash,
    pdfPad: `contracten/${dossier.boekingId}/getekend-v${dossier.versie}.pdf`,
    pdf,
    audit: {
      ipHash: stap.ipHash,
      userAgent: stap.userAgent.slice(0, 180),
      email: dossier.email,
      documentHash,
    },
  });
  if (stand === 'al') {
    return { ok: true, melding: 'Dit contract is al ondertekend. Er is geen nieuwe mail verstuurd.', dossier: { ...dossier, ondertekendOp: stap.nu, naam } };
  }
  return {
    ok: true,
    melding: 'Het contract is ondertekend. Dit is geen gekwalificeerde elektronische handtekening.',
    dossier: { ...dossier, ondertekendOp: stap.nu, naam, documentHash },
    pdf,
    mail: 'bevestiging',
  };
}
