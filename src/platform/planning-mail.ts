/**
 * Planningmail voor gastbegeleiders.
 * Samenstellen, voorbeeld en het besluit om te versturen doen geen provider-call.
 * Eén gastbegeleider vult een dienst, ook bij een weekend. Zonder naam blijft de dienst open.
 */

import { createHash } from 'node:crypto';
import { KERKJE_LOGO_URL } from '../lib/kerkje-mail.ts';
import { dagenVerschil, isYmd, kalenderdatumNl, periodesOverlappen, voegDagenToe, weekdag } from './datum.ts';
import { hoortOpGastbegeleiderbord, leesbareTitel } from './verhuur-classificatie.ts';

export const PLANNING_MAIL_SLEUTEL = 'planning_mail';
export const GASTBEGELEIDERS_PER_DIENST = 1;
export const PLANNING_MAIL_MAX_DAGEN = 366;

const WEEKDAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'] as const;
const WEEKDAG_KORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'] as const;
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PINE = '#4A5235';
const BRICK = '#9C4A2F';
const CREAM = '#FAF8F3';
const CREAM_DEEP = '#F1EBDD';
const SAND = '#F6F1E6';
const SAND_LINE = '#E4D9C6';
const MINT = '#F3F6EC';
const MINT_LINE = '#D5DEC4';
const INK = '#1A1A1A';
const SITE = 'https://kerkjepersingen.nl';

export interface PlanningMailBoeking {
  id: string;
  status: string;
  interneTitel: string;
  huurder: string;
  start: string;
  eind: string;
  gastheerId?: string;
}

export interface PlanningMailToewijzing {
  boekingId: string;
  relatieId: string;
  relatieNaam: string;
}

export interface PlanningMailPersoon {
  id: string;
  naam: string;
  email: string;
  actief: boolean;
}

export interface PlanningDienst {
  id: string;
  start: string;
  eind: string;
  datumTekst: string;
  tijd: string;
  activiteit: string;
  namen: string[];
  relatieIds: string[];
  openTekst: string | null;
  ingevuld: number;
  verwacht: number;
}

export interface PlanningOntvanger {
  relatieIds: string[];
  naam: string;
  email: string;
}

export interface PlanningMailBundel {
  van: string;
  tot: string;
  tijd: string;
  onderwerp: string;
  periodeTekst: string;
  diensten: PlanningDienst[];
  ontvangers: PlanningOntvanger[];
  zonderEmail: { id: string; naam: string }[];
  hash: string;
  gepland: number;
  openstaand: number;
}

export interface PlanningMailBrief {
  onderwerp: string;
  html: string;
  tekst: string;
  persoonlijkeIds: string[];
}

export type PlanningMailStatus = 'bezig' | 'verzonden' | 'deels' | 'mislukt';
export type PlanningMailOntvangerStatus = 'wacht' | 'verzonden' | 'fout';

export interface PlanningMailSnapshot {
  versie: 1;
  van: string;
  tot: string;
  tijd: string;
  onderwerp: string;
  periodeTekst: string;
  diensten: PlanningDienst[];
  ontvangers: PlanningOntvanger[];
}

export interface PlanningMailOntvangerRegel {
  naam: string;
  email: string;
  status: PlanningMailOntvangerStatus;
  foutmelding: string;
  providerBerichtId: string;
}

export interface PlanningMailHistorie {
  id: string;
  token: string;
  van: string;
  tot: string;
  aangemaaktOp: string;
  verzondenOp: string | null;
  gestartDoorNaam: string;
  status: PlanningMailStatus;
  hash: string;
  snapshot: PlanningMailSnapshot;
  gelukt: number;
  aantal: number;
  toelichting: string;
  ontvangers: PlanningMailOntvangerRegel[];
}

export interface PlanningMailClaim {
  token: string;
  van: string;
  tot: string;
  gestartDoorId: string | null;
  gestartDoorNaam: string;
  hash: string;
  snapshot: PlanningMailSnapshot;
  ontvangers: PlanningOntvanger[];
}

export type PlanningMailClaimUitkomst =
  | { soort: 'nieuw'; id: string }
  | { soort: 'al-gestart'; id: string }
  | { soort: 'loopt-al' }
  | { soort: 'niet-beschikbaar'; melding: string };

export interface PlanningMailOpslag {
  laatsteAfgerond(hash: string): Promise<Pick<PlanningMailHistorie, 'id' | 'status' | 'verzondenOp'> | null>;
  sluitVerlopenBezig(ouderDanIso: string): Promise<void>;
  claim(invoer: PlanningMailClaim): Promise<PlanningMailClaimUitkomst>;
  zetOntvanger(
    verzendingId: string,
    email: string,
    patch: { status: PlanningMailOntvangerStatus; foutmelding: string; providerBerichtId: string },
  ): Promise<void>;
  rondAf(
    verzendingId: string,
    patch: { status: PlanningMailStatus; gelukt: number; toelichting: string; verzondenOp: string },
  ): Promise<void>;
  lees(id: string): Promise<PlanningMailHistorie | null>;
  recent(limiet: number): Promise<PlanningMailHistorie[]>;
}

export function voorgesteldePeriode(vandaag: string): { van: string; tot: string } {
  const van = `${vandaag.slice(0, 7)}-01`;
  const drieMaanden = new Date(Date.UTC(Number(van.slice(0, 4)), Number(van.slice(5, 7)) - 1 + 3, 1, 12));
  const tot = voegDagenToe(drieMaanden.toISOString().slice(0, 10), -1);
  return { van, tot };
}

export function periodeFout(van: string, tot: string): string | null {
  if (!isYmd(van) || !isYmd(tot)) return 'Kies een begindatum en een einddatum.';
  if (van > tot) return 'De einddatum ligt voor de begindatum.';
  if (dagenVerschil(van, tot) > PLANNING_MAIL_MAX_DAGEN) return 'Kies een periode van hooguit een jaar.';
  return null;
}

export function tijdTekst(van: string, tot: string): string {
  const begin = van.trim();
  const einde = tot.trim();
  if (begin && einde) return `${begin}–${einde}`;
  return begin || einde;
}

export function openstaandeTekst(ingevuld: number, verwacht: number): string | null {
  if (ingevuld >= verwacht) return null;
  if (ingevuld <= 0) return 'Nog niet ingevuld';
  const tekort = verwacht - ingevuld;
  if (tekort === 1) return 'Nog 1 gastbegeleider nodig';
  return `Nog ${tekort} gastbegeleiders nodig`;
}

export function verwachtAantal(_start: string, _eind: string): number {
  return GASTBEGELEIDERS_PER_DIENST;
}

export function datumMetWeekdag(ymd: string): string {
  if (!isYmd(ymd)) return ymd;
  return `${WEEKDAGEN[weekdag(ymd)]} ${kalenderdatumNl(ymd)}`;
}

export function periodeTekstVan(start: string, eind: string): string {
  if (start === eind) return datumMetWeekdag(start);
  return `${datumMetWeekdag(start)} t/m ${datumMetWeekdag(eind)}`;
}

/** Za 24 en zo 25 oktober 2026. De tweede weekdag blijft klein, zoals in de brief. */
export function compacteDatum(start: string, eind: string): string {
  if (!isYmd(start)) return start;
  const eerste = dagDelen(start);
  if (!eerste) return start;
  if (!isYmd(eind) || start === eind) return `${dagKop(start, true)} ${eerste.maandNaam} ${eerste.jaar}`;
  const tweede = dagDelen(eind);
  if (!tweede) return `${dagKop(start, true)} ${eerste.maandNaam} ${eerste.jaar}`;
  if (eerste.maand === tweede.maand && eerste.jaar === tweede.jaar) {
    return `${dagKop(start, true)} en ${dagKop(eind, false)} ${eerste.maandNaam} ${eerste.jaar}`;
  }
  if (eerste.jaar === tweede.jaar) {
    return `${dagKop(start, true)} ${eerste.maandNaam} en ${dagKop(eind, false)} ${tweede.maandNaam} ${eerste.jaar}`;
  }
  return `${dagKop(start, true)} ${eerste.maandNaam} ${eerste.jaar} en ${dagKop(eind, false)} ${tweede.maandNaam} ${tweede.jaar}`;
}

export function tijdWeergave(tijd: string): string {
  const schoon = tijd.trim();
  if (!schoon) return '';
  const zonderUur = schoon.replace(/\s*uur\s*$/i, '');
  const delen = zonderUur.split(/\s*[–—-]\s*/).filter(Boolean);
  const stuk = (waarde: string) => waarde.trim().replace(':', '.');
  if (delen.length >= 2) return `${stuk(delen[0])} – ${stuk(delen[1])} uur`;
  return `${stuk(delen[0] ?? zonderUur)} uur`;
}

export function voornaamVan(naam: string): string {
  const eerste = naam.trim().split(/\s+/)[0];
  return eerste || naam.trim();
}

export function verzendmoment(iso: string | null): string {
  if (!iso) return '';
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return iso;
  return datum.toLocaleString('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function geldigToken(waarde: string): boolean {
  return UUID.test(waarde);
}

export function stelPlanningMailSamen(input: {
  van: string;
  tot: string;
  tijd: string;
  boekingen: readonly PlanningMailBoeking[];
  toewijzingen: readonly PlanningMailToewijzing[];
  gastheren: readonly PlanningMailPersoon[];
}): PlanningMailBundel {
  const tijd = input.tijd.trim();
  const periodeTekst = `${kalenderdatumNl(input.van)} t/m ${kalenderdatumNl(input.tot)}`;
  const diensten = input.boekingen
    .filter((boeking) => hoortOpGastbegeleiderbord(boeking.status))
    .filter((boeking) => isYmd(boeking.start) && isYmd(boeking.eind) && boeking.start <= boeking.eind)
    .filter((boeking) => periodesOverlappen(
      { start: boeking.start, eind: boeking.eind },
      { start: input.van, eind: input.tot },
    ))
    .map((boeking) => dienstVan(boeking, input.toewijzingen, input.gastheren, tijd))
    .sort((a, b) => a.start.localeCompare(b.start) || a.activiteit.localeCompare(b.activiteit, 'nl') || a.id.localeCompare(b.id));
  const ontvangers = ontvangersVan(input.gastheren);
  const zonderEmail = input.gastheren
    .filter((persoon) => persoon.actief && !geldigEmail(persoon.email))
    .map((persoon) => ({ id: persoon.id, naam: persoon.naam.trim() || 'Naam ontbreekt' }))
    .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
  const onderwerp = `Planning gastbegeleiders, ${periodeTekst}`;
  const zonderHash = {
    van: input.van,
    tot: input.tot,
    tijd,
    onderwerp,
    periodeTekst,
    diensten,
    ontvangers,
    zonderEmail,
    gepland: diensten.length,
    openstaand: diensten.filter((dienst) => dienst.openTekst).length,
  };
  return { ...zonderHash, hash: planningHash(zonderHash) };
}

export function snapshotVan(bundel: PlanningMailBundel): PlanningMailSnapshot {
  return {
    versie: 1,
    van: bundel.van,
    tot: bundel.tot,
    tijd: bundel.tijd,
    onderwerp: bundel.onderwerp,
    periodeTekst: bundel.periodeTekst,
    diensten: bundel.diensten,
    ontvangers: bundel.ontvangers,
  };
}

export function renderPlanningMail(bundel: Pick<PlanningMailBundel, 'onderwerp' | 'periodeTekst' | 'diensten' | 'tijd'>, ontvanger: PlanningOntvanger): PlanningMailBrief {
  const eigen = bundel.diensten.filter((dienst) => overlaptPersoon(dienst.relatieIds, ontvanger.relatieIds));
  const open = bundel.diensten.filter((dienst) => dienst.openTekst);
  const html = htmlVan(bundel, ontvanger, eigen, open);
  const tekst = tekstVan(bundel, ontvanger, eigen, open);
  return {
    onderwerp: bundel.onderwerp,
    html,
    tekst,
    persoonlijkeIds: eigen.map((dienst) => dienst.id),
  };
}

export function kiesVoorbeeld(ontvangers: readonly PlanningOntvanger[], diensten: readonly PlanningDienst[], gevraagd: string): PlanningOntvanger | null {
  if (ontvangers.length === 0) return null;
  const gezocht = gevraagd.trim().toLowerCase();
  const gekozen = ontvangers.find((ontvanger) => ontvanger.email.toLowerCase() === gezocht);
  if (gekozen) return gekozen;
  const metDienst = ontvangers.find((ontvanger) => diensten.some((dienst) => overlaptPersoon(dienst.relatieIds, ontvanger.relatieIds)));
  return metDienst ?? ontvangers[0];
}

export interface VerzendOordeelInput {
  bevestig: boolean;
  token: string;
  opnieuw: boolean;
  voorbeelddata: boolean;
  alleenLezen: boolean;
  magSchrijven: boolean;
  periodeFout: string | null;
  ontvangers: number;
  laatsteAfgerond: { status: PlanningMailStatus } | null;
  besluitProvider: boolean;
  besluitModus: 'uit' | 'dry-run' | 'test' | 'aan';
  besluitReden: string;
}

export type VerzendOordeel =
  | { stuur: false; melding: string }
  | { stuur: true; modus: 'aan' | 'test' };

/** Geen enkele tak hier verstuurt mail. De caller mag pas daarna de provider aanroepen. */
export function beoordeelVerzending(input: VerzendOordeelInput): VerzendOordeel {
  if (!input.magSchrijven) return { stuur: false, melding: 'U mag de planning niet verzenden. Er is geen e-mail verstuurd.' };
  if (input.voorbeelddata || input.alleenLezen) return { stuur: false, melding: 'Deze omgeving verstuurt geen e-mail. Er is niets verstuurd.' };
  if (!input.bevestig) return { stuur: false, melding: 'De verzending is niet bevestigd. Er is geen e-mail verstuurd.' };
  if (!geldigToken(input.token)) return { stuur: false, melding: 'De bevestiging is verlopen. Open het voorbeeld opnieuw. Er is geen e-mail verstuurd.' };
  if (input.periodeFout) return { stuur: false, melding: `${input.periodeFout} Er is geen e-mail verstuurd.` };
  if (input.ontvangers === 0) return { stuur: false, melding: 'Er is geen actieve gastbegeleider met een e-mailadres. Er is geen e-mail verstuurd.' };
  if (!input.besluitProvider || (input.besluitModus !== 'aan' && input.besluitModus !== 'test')) {
    const reden = input.besluitReden === 'onbekende automatisering'
      ? 'De verzending Planning mailen is nog niet beschikbaar.'
      : 'De schakelaar Planning mailen staat uit.';
    return { stuur: false, melding: `${reden} Er is geen e-mail verstuurd.` };
  }
  if (input.laatsteAfgerond && (input.laatsteAfgerond.status === 'verzonden' || input.laatsteAfgerond.status === 'deels') && !input.opnieuw) {
    return {
      stuur: false,
      melding: 'Deze planning is al verstuurd. Vink aan dat u bewust opnieuw wilt verzenden. Er is geen e-mail verstuurd.',
    };
  }
  return { stuur: true, modus: input.besluitModus };
}

export function basisParams(params: URLSearchParams): URLSearchParams {
  const uit = new URLSearchParams();
  for (const sleutel of ['jaar', 'maand', 'q', 'bron']) {
    const waarde = params.get(sleutel);
    if (waarde) uit.set(sleutel, waarde);
  }
  for (const waarde of params.getAll('begeleider')) {
    if (waarde === 'ja' || waarde === 'nee') uit.append('begeleider', waarde);
  }
  return uit;
}

export function mailUrl(basis: URLSearchParams, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(basis);
  for (const [sleutel, waarde] of Object.entries(extra)) {
    if (waarde) params.set(sleutel, waarde);
  }
  const query = params.toString();
  return query ? `/beheer/planning/?${query}` : '/beheer/planning/';
}

export function behoudenVelden(basis: URLSearchParams): { naam: string; waarde: string }[] {
  const velden: { naam: string; waarde: string }[] = [];
  for (const [naam, waarde] of basis.entries()) velden.push({ naam, waarde });
  return velden;
}

function dienstVan(
  boeking: PlanningMailBoeking,
  toewijzingen: readonly PlanningMailToewijzing[],
  gastheren: readonly PlanningMailPersoon[],
  tijd: string,
): PlanningDienst {
  const ids = new Set<string>();
  if (boeking.gastheerId) ids.add(boeking.gastheerId);
  for (const toe of toewijzingen) {
    if (toe.boekingId === boeking.id && toe.relatieId) ids.add(toe.relatieId);
  }
  const relatieIds = [...ids].sort();
  const namen = relatieIds
    .map((id) => naamVan(id, gastheren, toewijzingen))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'nl'));
  const verwacht = verwachtAantal(boeking.start, boeking.eind);
  return {
    id: boeking.id,
    start: boeking.start,
    eind: boeking.eind,
    datumTekst: periodeTekstVan(boeking.start, boeking.eind),
    tijd,
    activiteit: leesbareTitel(boeking.interneTitel, boeking.huurder),
    namen,
    relatieIds,
    openTekst: openstaandeTekst(namen.length, verwacht),
    ingevuld: namen.length,
    verwacht,
  };
}

function naamVan(id: string, gastheren: readonly PlanningMailPersoon[], toewijzingen: readonly PlanningMailToewijzing[]): string {
  const gastheer = gastheren.find((persoon) => persoon.id === id);
  if (gastheer?.naam.trim()) return gastheer.naam.trim();
  const toe = toewijzingen.find((kandidaat) => kandidaat.relatieId === id && kandidaat.relatieNaam.trim());
  return toe?.relatieNaam.trim() ?? '';
}

function geldigEmail(waarde: string): boolean {
  return EMAIL.test(waarde.trim());
}

function ontvangersVan(gastheren: readonly PlanningMailPersoon[]): PlanningOntvanger[] {
  const perEmail = new Map<string, PlanningOntvanger>();
  const gesorteerd = [...gastheren].sort((a, b) => a.naam.localeCompare(b.naam, 'nl') || a.id.localeCompare(b.id));
  for (const persoon of gesorteerd) {
    if (!persoon.actief || !geldigEmail(persoon.email)) continue;
    const email = persoon.email.trim().toLowerCase();
    const bestaand = perEmail.get(email);
    if (bestaand) {
      if (!bestaand.relatieIds.includes(persoon.id)) bestaand.relatieIds.push(persoon.id);
      continue;
    }
    perEmail.set(email, {
      relatieIds: [persoon.id],
      naam: persoon.naam.trim() || email,
      email,
    });
  }
  return [...perEmail.values()].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
}

function overlaptPersoon(dienstIds: readonly string[], persoonIds: readonly string[]): boolean {
  return dienstIds.some((id) => persoonIds.includes(id));
}

function planningHash(bundel: Omit<PlanningMailBundel, 'hash'>): string {
  const canon = {
    van: bundel.van,
    tot: bundel.tot,
    tijd: bundel.tijd,
    diensten: bundel.diensten.map((dienst) => ({
      id: dienst.id,
      start: dienst.start,
      eind: dienst.eind,
      activiteit: dienst.activiteit,
      namen: [...dienst.namen],
      relatieIds: [...dienst.relatieIds].sort(),
      openTekst: dienst.openTekst,
    })),
    ontvangers: bundel.ontvangers.map((ontvanger) => ontvanger.email).sort(),
  };
  return createHash('sha256').update(JSON.stringify(canon)).digest('hex');
}

function escapeHtml(waarde: string): string {
  return waarde
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dagDelen(ymd: string): { dag: number; maand: number; jaar: number; maandNaam: string } | null {
  if (!isYmd(ymd)) return null;
  const maand = Number(ymd.slice(5, 7));
  const maandNaam = MAANDEN[maand - 1];
  if (!maandNaam) return null;
  return { dag: Number(ymd.slice(8, 10)), maand, jaar: Number(ymd.slice(0, 4)), maandNaam };
}

function dagKop(ymd: string, hoofdletter: boolean): string {
  const delen = dagDelen(ymd);
  if (!delen) return ymd;
  const kort = WEEKDAG_KORT[weekdag(ymd)] ?? '';
  const label = hoofdletter ? `${kort.charAt(0).toUpperCase()}${kort.slice(1)}` : kort;
  return `${label} ${delen.dag}`;
}

function regelTijdActiviteit(dienst: PlanningDienst): string {
  const tijd = tijdWeergave(dienst.tijd);
  if (tijd && dienst.activiteit) return `${tijd} | ${dienst.activiteit}`;
  return tijd || dienst.activiteit;
}

function eigenBlok(dienst: PlanningDienst): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 10px;border-collapse:separate;">
    <tr>
      <td bgcolor="${MINT}" style="background:${MINT};border:1px solid ${MINT_LINE};border-radius:8px;padding:10px 12px;">
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.4;font-weight:700;color:${INK};">${escapeHtml(compacteDatum(dienst.start, dienst.eind))}</p>
        <p style="margin:2px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.4;color:${INK};word-wrap:break-word;overflow-wrap:break-word;">${escapeHtml(regelTijdActiviteit(dienst))}</p>
      </td>
    </tr>
  </table>`;
}

function openBlok(dienst: PlanningDienst, laatste: boolean): string {
  const ingedeeld = dienst.namen.length
    ? `<p style="margin:2px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.4;color:${INK};word-wrap:break-word;overflow-wrap:break-word;">Ingedeeld: ${escapeHtml(dienst.namen.join(', '))}</p>`
    : '';
  const status = dienst.openTekst
    ? `<p style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.4;font-weight:700;color:${BRICK};">${escapeHtml(dienst.openTekst)}</p>`
    : '';
  const lijn = laatste ? 'none' : `1px solid ${SAND_LINE}`;
  return `<tr>
      <td style="padding:10px 12px;border-bottom:${lijn};">
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.4;font-weight:700;color:${INK};">${escapeHtml(compacteDatum(dienst.start, dienst.eind))}</p>
        <p style="margin:2px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.4;color:${INK};word-wrap:break-word;overflow-wrap:break-word;">${escapeHtml(regelTijdActiviteit(dienst))}</p>
        ${ingedeeld}
        ${status}
      </td>
    </tr>`;
}

function htmlVan(
  bundel: Pick<PlanningMailBundel, 'periodeTekst'>,
  ontvanger: PlanningOntvanger,
  eigen: readonly PlanningDienst[],
  open: readonly PlanningDienst[],
): string {
  const eigenHtml = eigen.length
    ? eigen.map((dienst) => eigenBlok(dienst)).join('')
    : `<p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.4;color:${INK};">U bent in deze periode niet ingedeeld.</p>`;
  const openHtml = open.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${SAND}" style="width:100%;background:${SAND};border-radius:8px;border-collapse:separate;">
        ${open.map((dienst, index) => openBlok(dienst, index === open.length - 1)).join('')}
      </table>`
    : `<p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.4;color:${INK};">Er zijn geen openstaande diensten in deze periode.</p>`;
  const voornaam = voornaamVan(ontvanger.naam);
  return `<!DOCTYPE html>
<html lang="nl" dir="ltr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Planning gastbegeleiders</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
  <div lang="nl" dir="ltr">
  <div style="display:none;max-height:0;overflow:hidden;">Uw diensten en de openstaande diensten van ${escapeHtml(bundel.periodeTekst)}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CREAM}" style="width:100%;background:${CREAM};border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:8px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;">
          <tr>
            <td style="padding:4px 4px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                <tr>
                  <td width="40" valign="middle" style="width:40px;padding:0 8px 0 0;">
                    <img src="${KERKJE_LOGO_URL}" width="36" height="37" alt="Zegel van het Kerkje van Persingen" style="display:block;border:0;width:36px;height:auto;" />
                  </td>
                  <td valign="middle" style="font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.3;color:${PINE};">Kerkje van Persingen</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td bgcolor="#ffffff" style="background:#ffffff;padding:16px 16px 12px;font-family:Arial,Helvetica,sans-serif;color:${INK};">
              <h1 style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;font-weight:700;color:${PINE};">Planning gastbegeleiders</h1>
              <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.4;color:${PINE};">${escapeHtml(bundel.periodeTekst)}</p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.4;font-weight:700;">Beste ${escapeHtml(voornaam)},</p>
              <p style="margin:2px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.4;">Hieronder vindt u uw ingeplande diensten en de diensten waarvoor nog hulp nodig is.</p>
              <h2 style="margin:20px 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:20px;line-height:1.3;font-weight:700;color:${PINE};">Uw diensten (${eigen.length})</h2>
              ${eigenHtml}
              <h2 style="margin:20px 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:20px;line-height:1.3;font-weight:700;color:${PINE};">Openstaande diensten (${open.length})</h2>
              ${openHtml}
              <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.4;">Kunt u bij een openstaande dienst helpen? Laat het ons gerust weten door op deze e-mail te antwoorden.</p>
              <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.4;">Met vriendelijke groet,<br /><strong>Het bestuur van het Kerkje van Persingen</strong></p>
            </td>
          </tr>
          <tr>
            <td bgcolor="${CREAM_DEEP}" style="background:${CREAM_DEEP};padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.4;color:${INK};">
              Stichting Het Kerkje van Persingen<br />
              Persingensestraat 7, 6575 JA Persingen<br />
              06 52 66 84 49<br />
              <a href="${SITE}/" style="color:${PINE};font-size:15px;text-decoration:underline;">kerkjepersingen.nl</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  </div>
</body>
</html>`;
}

function tekstDienst(dienst: PlanningDienst, eigen: boolean): string {
  const regels = [compacteDatum(dienst.start, dienst.eind), regelTijdActiviteit(dienst)];
  if (!eigen && dienst.namen.length) regels.push(`Ingedeeld: ${dienst.namen.join(', ')}`);
  if (dienst.openTekst) regels.push(dienst.openTekst);
  return regels.filter(Boolean).join('\n');
}

function tekstVan(
  bundel: Pick<PlanningMailBundel, 'periodeTekst'>,
  ontvanger: PlanningOntvanger,
  eigen: readonly PlanningDienst[],
  open: readonly PlanningDienst[],
): string {
  const eigenTekst = eigen.length
    ? eigen.map((dienst) => tekstDienst(dienst, true)).join('\n\n')
    : 'U bent in deze periode niet ingedeeld.';
  const openTekst = open.length
    ? open.map((dienst) => tekstDienst(dienst, false)).join('\n\n')
    : 'Er zijn geen openstaande diensten in deze periode.';
  return [
    'Planning gastbegeleiders',
    bundel.periodeTekst,
    '',
    `Beste ${voornaamVan(ontvanger.naam)},`,
    '',
    'Hieronder vindt u uw ingeplande diensten en de diensten waarvoor nog hulp nodig is.',
    '',
    `Uw diensten (${eigen.length})`,
    eigenTekst,
    '',
    `Openstaande diensten (${open.length})`,
    openTekst,
    '',
    'Kunt u bij een openstaande dienst helpen? Laat het ons gerust weten door op deze e-mail te antwoorden.',
    '',
    'Met vriendelijke groet,',
    'Het bestuur van het Kerkje van Persingen',
    '',
    'Stichting Het Kerkje van Persingen',
    'Persingensestraat 7, 6575 JA Persingen',
    '06 52 66 84 49',
    SITE,
  ].join('\n');
}
