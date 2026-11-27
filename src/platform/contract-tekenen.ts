/**
 * Online ondertekenen van één bevroren contractversie.
 * De token staat gehasht. Een tweede klik maakt geen tweede handtekening
 * en geen tweede bevestigingsmail.
 */

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { formatDatum } from '../lib/datum.ts';
import { contractPakketTekst, maakContractPdf, sha256Hex, type PakketBron } from './contract-pakket.ts';
import { voegTekstAanPdf } from './documenten/pdf-sjabloon.ts';
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
  return hash === tokenHash && Number.isFinite(Date.parse(tot)) && Date.parse(tot) > Date.parse(nu);
}

export interface TekenDossier {
  boekingId: string;
  aanvraagId?: number | null;
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
  /** De productieadapter leest deze velden samen met het bevroren contract. */
  boekingStatus?: string;
  actueleVersie?: number;
  ingetrokkenOp?: string | null;
  bestuurAkkoord?: boolean;
  pdfHash?: string | null;
  machineProces?: boolean;
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
  const tijdstip = Number.isNaN(Date.parse(bewijs.op)) ? bewijs.op : formatDatum(bewijs.op);
  return [
    'Bewijs van elektronische ondertekening',
    'Stichting Het Kerkje van Persingen',
    '',
    'De huurder heeft deze documentversie ondertekend in de online omgeving van het Kerkje van Persingen.',
    'De ondertekening geldt voor de volledige overeenkomst, de verhuurvoorwaarden en de huisregels.',
    'Dit is een elektronische bevestiging en geen gekwalificeerde elektronische handtekening.',
    'De reservering is door deze ondertekening niet automatisch definitief.',
    '',
    `Contractnummer: ${bewijs.contractnummer}`,
    `Documentversie: ${bewijs.versie}`,
    `Ondertekenaar: ${bewijs.naam}`,
    `Geverifieerd e-mailadres: ${bewijs.email}`,
    `Ondertekend op: ${tijdstip}`,
    `Hash van de concept-PDF: ${bewijs.documentHash}`,
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
  | { ok: true; melding: string; dossier: TekenDossier; pdf?: Uint8Array; code?: string; cookie?: string; mail?: 'code' | 'bevestiging'; metSjabloon?: boolean };

export interface TekenWinkel {
  lees(tokenHash: string): Promise<TekenDossier | null>;
  bewaarCode(tokenHash: string, codeHash: string, verloopt: string, pogingen: number): Promise<void>;
  registreerFouteCode?(tokenHash: string, verwachteCodeHash: string): Promise<void>;
  zetGeverifieerd(tokenHash: string, op: string, verwachteCodeHash?: string): Promise<void>;
  leesGetekendePdf?(dossier: TekenDossier): Promise<Uint8Array | null>;
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
  if (dossier.ingetrokkenOp || dossier.boekingStatus === 'geannuleerd') {
    return { ok: false, melding: 'Deze link is ingetrokken. Neem contact op met het kerkje.' };
  }
  if (!dossier.ondertekendOp && dossier.actueleVersie != null && dossier.actueleVersie !== dossier.versie) {
    return { ok: false, melding: 'Er is een nieuwere contractversie. Gebruik de meest recente link.' };
  }
  if (!dossier.ondertekendOp && (!Number.isFinite(Date.parse(dossier.verlooptOp)) || Date.parse(dossier.verlooptOp) <= Date.parse(nu))) {
    return { ok: false, melding: 'Deze link is verlopen.' };
  }
  return { ok: true, dossier };
}

async function pdfUitDossier(
  dossier: TekenDossier,
  sjabloon: Uint8Array | null,
): Promise<{ ok: true; pdf: Uint8Array } | { ok: false; melding: string }> {
  if (!sjabloon) return { ok: true, pdf: pdfBytes(contractPakketTekst(dossier.pakket)) };
  const gemaakt = await maakContractPdf(dossier.pakket, `${dossier.contractnummer}.pdf`, dossier.contractnummer, sjabloon);
  if (!gemaakt.ok) return gemaakt;
  return { ok: true, pdf: gemaakt.bijlage.inhoud };
}

export async function voerTekenstap(
  stap: TekenStap,
  winkel: TekenWinkel,
  opties?: { sjabloon?: Uint8Array | null },
): Promise<TekenUitkomst> {
  try {
    return await verwerkTekenstap(stap, winkel, opties);
  } catch {
    // Ook een time-out kan ná een commit optreden. Alleen opnieuw lezen mag
    // bevestigen dat er is getekend; een uitzondering is nooit "al ondertekend".
    return { ok: false, melding: 'De bewerking kon niet worden bevestigd. Er is geen nieuwe ondertekening bevestigd. Probeer opnieuw of neem contact op met het kerkje.' };
  }
}

async function verwerkTekenstap(
  stap: TekenStap,
  winkel: TekenWinkel,
  opties?: { sjabloon?: Uint8Array | null },
): Promise<TekenUitkomst> {
  if (!tokenVormGeldig(stap.token)) return { ok: false, melding: 'Deze link is ongeldig.' };
  const hash = hashTekenToken(stap.token);
  const gelezen = openDossier(await winkel.lees(hash), stap.nu);
  if (!gelezen.ok) return gelezen;
  const dossier = gelezen.dossier;
  if (dossier.tokenHash !== hash) return { ok: false, melding: 'Deze link hoort niet bij dit contract.' };

  if (stap.soort === 'bekijk' || stap.soort === 'download') {
    if (stap.soort === 'download' && dossier.ondertekendOp) {
      // Bewijs is de werkelijk opgeslagen PDF. Een gewijzigd sjabloon mag
      // een historische handtekening nooit een andere inhoud geven.
      const pdf = await winkel.leesGetekendePdf?.(dossier);
      if (!pdf || (dossier.pdfHash && sha256Hex(pdf) !== dossier.pdfHash)) {
        return { ok: false, melding: 'De opgeslagen ondertekende PDF kon niet worden gecontroleerd. Neem contact op met het kerkje.' };
      }
      return { ok: true, melding: 'Getekend contract.', dossier, pdf };
    }
    const los = await pdfUitDossier(dossier, opties?.sjabloon ?? null);
    if (!los.ok) return los;
    return { ok: true, melding: 'Contract.', dossier, pdf: stap.soort === 'download' ? los.pdf : undefined };
  }

  if (dossier.ondertekendOp) {
    return { ok: true, melding: 'Dit contract is al ondertekend. Er is geen nieuwe mail verstuurd.', dossier };
  }
  if (!dossier.vrijgegeven) {
    return { ok: false, melding: 'Deze versie is nog niet vrijgegeven om te ondertekenen.' };
  }
  if ((dossier.boekingStatus != null && !['optie', 'definitief'].includes(dossier.boekingStatus)) || dossier.bestuurAkkoord === false) {
    return { ok: false, melding: 'Deze boeking is niet vrijgegeven om te ondertekenen. Neem contact op met het kerkje.' };
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
      if (winkel.registreerFouteCode) await winkel.registreerFouteCode(hash, dossier.codeHash);
      else await winkel.bewaarCode(hash, dossier.codeHash, dossier.codeVerloopt, dossier.pogingen + 1);
      return { ok: false, melding: 'De code klopt niet.' };
    }
    await winkel.zetGeverifieerd(hash, stap.nu, dossier.codeHash);
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
  if (!stap.akkoord) return { ok: false, melding: 'Vink aan dat u akkoord gaat met de volledige overeenkomst, inclusief de bijlagen.' };
  const ongetekend = await pdfUitDossier(dossier, opties?.sjabloon ?? null);
  if (!ongetekend.ok) return ongetekend;
  const documentHash = sha256Hex(ongetekend.pdf);
  const bewijs: TekenBewijs = {
    naam,
    email: dossier.email,
    op: stap.nu,
    contractnummer: dossier.contractnummer,
    versie: dossier.versie,
    documentHash,
  };
  const pdf = opties?.sjabloon ? await voegTekstAanPdf(ongetekend.pdf, bewijsTekst(bewijs)) : ondertekendePdf(dossier, bewijs);
  const pdfHash = sha256Hex(pdf);
  // Iedere bewijsinhoud heeft een eigen onveranderlijk pad. De database kiest
  // onder een boekinglock één winnaar; een tweede request kan die niet overschrijven.
  const pdfPad = `contracten/${dossier.boekingId}/getekend-v${dossier.versie}-${pdfHash}.pdf`;
  const stand = await winkel.legOndertekening({
    tokenHash: hash,
    naam,
    op: stap.nu,
    documentHash,
    pdfPad,
    pdf,
    audit: {
      ipHash: stap.ipHash,
      userAgent: stap.userAgent.slice(0, 180),
      email: dossier.email,
      documentHash,
    },
  });
  const bevestigd = openDossier(await winkel.lees(hash), stap.nu);
  if (!bevestigd.ok) return bevestigd;
  const opgeslagen = bevestigd.dossier;
  if (!opgeslagen.ondertekendOp || !opgeslagen.naam || !opgeslagen.documentHash || !opgeslagen.pdfPad ||
      opgeslagen.tokenHash !== hash || opgeslagen.boekingId !== dossier.boekingId || opgeslagen.versie !== dossier.versie) {
    return { ok: false, melding: 'De ondertekening is niet aantoonbaar vastgelegd. Er is geen bevestigingsmail verstuurd.' };
  }
  if (stand === 'al') {
    return { ok: true, melding: 'Dit contract is al ondertekend. Er is geen nieuwe mail verstuurd.', dossier: opgeslagen };
  }
  if (opgeslagen.pdfPad !== pdfPad || opgeslagen.documentHash !== documentHash || opgeslagen.naam !== naam ||
      Date.parse(opgeslagen.ondertekendOp) !== Date.parse(stap.nu) || (opgeslagen.pdfHash && opgeslagen.pdfHash !== pdfHash)) {
    return { ok: false, melding: 'Het opgeslagen bewijs wijkt af. Er is geen bevestigingsmail verstuurd; neem contact op met het kerkje.' };
  }
  return {
    ok: true,
    melding: 'Het contract is ondertekend. Dit is geen gekwalificeerde elektronische handtekening.',
    dossier: opgeslagen,
    pdf,
    mail: 'bevestiging',
  };
}
