/**
 * Operationeel overzicht voor /beheer/planning.
 * Boeking, publieke activiteit, Sanity-bron en interne bezetting blijven aparte records.
 * Dezelfde periode wordt één keer getoond.
 */

import type { Publicatiestatus } from '../lib/agenda-zichtbaarheid.ts';

export const PLANNING_FILTERS = [
  'alles',
  'deze_maand',
  'opties',
  'definitief',
  'publiek',
  'website',
  'niet_openbaar',
  'geannuleerd',
] as const;

export type PlanningFilter = (typeof PLANNING_FILTERS)[number];

export const PLANNING_TYPEN = ['expositie', 'bruiloft', 'concert', 'diverse'] as const;

export interface PlanningInvoer {
  sleutel: string;
  href: string;
  start: string;
  eind: string;
  titel: string;
  type: string;
  status: string;
  publicatiestatus: Publicatiestatus | null;
  zichtbaarOpWebsite: boolean;
  huurder?: string;
  gastbegeleiders?: string;
  bron: 'boeking' | 'activiteit' | 'sanity' | 'intern';
  geannuleerd?: boolean;
  boekingId?: string;
  legacyId?: string;
  aandacht?: string;
  email?: string;
  exposant?: string;
  organisatie?: string;
  deelnemers?: string;
  omschrijving?: string;
  notitie?: string;
  nummer?: string;
}

export interface PlanningItem extends PlanningInvoer {
  gastbegeleiders: string;
  huurder: string;
  aandacht: string;
  geannuleerd: boolean;
}

const PRIORITEIT: Record<PlanningInvoer['bron'], number> = {
  boeking: 0,
  activiteit: 1,
  sanity: 2,
  intern: 3,
};

function overlapt(a: { start: string; eind: string }, b: { start: string; eind: string }): boolean {
  return a.start <= b.eind && b.start <= a.eind;
}

function zelfdePeriode(a: { start: string; eind: string }, b: { start: string; eind: string }): boolean {
  return a.start === b.start && a.eind === b.eind;
}

/** Excel-titels als "Oktober 3/4" beschrijven de periode, niet de activiteit. */
export function isPeriodeLabel(titel: string): boolean {
  const schoon = titel.trim();
  if (!schoon) return true;
  if (/expositie|concert|bruiloft|huwelijk|diverse|winterstop/i.test(schoon)) return false;
  return /januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|pasen|pinksteren/i.test(schoon);
}

function bezetOfPubliek(item: PlanningInvoer): boolean {
  return item.publicatiestatus === 'publiek' || item.publicatiestatus === 'bezet';
}

function zelfdeEvenement(a: PlanningInvoer, b: PlanningInvoer): boolean {
  if (a.boekingId && a.boekingId === b.boekingId) return true;
  if (a.legacyId && a.legacyId === b.legacyId) return true;
  if (a.bron === 'intern' || b.bron === 'intern') return false;
  if (a.bron === 'boeking' && b.bron === 'boeking') return false;
  return zelfdePeriode(a, b);
}

function verrijk(basis: PlanningInvoer, extra: PlanningInvoer): PlanningInvoer {
  const extraBenoemt = bezetOfPubliek(extra) && !isPeriodeLabel(extra.titel);
  const titel = isPeriodeLabel(basis.titel) && extraBenoemt ? extra.titel : basis.titel;
  const type = basis.type || (extraBenoemt ? extra.type : '');
  const publicatiestatus = extraBenoemt ? (basis.publicatiestatus ?? extra.publicatiestatus) : basis.publicatiestatus;
  const zichtbaarOpWebsite = extraBenoemt ? basis.zichtbaarOpWebsite || extra.zichtbaarOpWebsite : basis.zichtbaarOpWebsite;
  const letop = extra.titel && extra.titel !== titel
    ? (extra.publicatiestatus === 'verborgen' ? `Verborgen activiteit: ${extra.titel}` : `Ook: ${extra.titel}`)
    : '';
  const aandacht = [basis.aandacht, letop].filter(Boolean).join(' · ');
  return {
    ...basis,
    titel,
    type,
    publicatiestatus,
    zichtbaarOpWebsite,
    huurder: basis.huurder || extra.huurder,
    gastbegeleiders: basis.gastbegeleiders || extra.gastbegeleiders,
    email: basis.email || extra.email,
    exposant: basis.exposant || extra.exposant,
    organisatie: basis.organisatie || extra.organisatie,
    deelnemers: [basis.deelnemers, extra.deelnemers].filter(Boolean).join(', '),
    omschrijving: [basis.omschrijving, extra.omschrijving].filter(Boolean).join(' '),
    notitie: basis.notitie || extra.notitie,
    nummer: basis.nummer || extra.nummer,
    aandacht,
  };
}

export function dedupliceerPlanning(items: readonly PlanningInvoer[]): PlanningInvoer[] {
  const gesorteerd = [...items].sort(
    (a, b) => PRIORITEIT[a.bron] - PRIORITEIT[b.bron] || a.start.localeCompare(b.start) || a.titel.localeCompare(b.titel),
  );
  const gehouden: PlanningInvoer[] = [];
  for (const item of gesorteerd) {
    const index = gehouden.findIndex((ander) => zelfdeEvenement(ander, item));
    if (index === -1) {
      gehouden.push(item);
      continue;
    }
    gehouden[index] = verrijk(gehouden[index], item);
  }
  return gehouden;
}

function maandBereik(vandaag: string): { van: string; tot: string } {
  const [jaar, maand] = vandaag.split('-').map(Number);
  const van = `${vandaag.slice(0, 7)}-01`;
  const laatste = new Date(Date.UTC(jaar, maand, 0, 12)).getUTCDate();
  const tot = `${vandaag.slice(0, 7)}-${String(laatste).padStart(2, '0')}`;
  return { van, tot };
}

function pastFilter(item: PlanningInvoer, filter: PlanningFilter, vandaag: string): boolean {
  if (filter === 'deze_maand') {
    const maand = maandBereik(vandaag);
    return overlapt(item, { start: maand.van, eind: maand.tot });
  }
  if (filter === 'opties') return item.status === 'optie';
  if (filter === 'definitief') return item.status === 'definitief' || item.status === 'migratie_vastgelegd';
  if (filter === 'publiek') return item.publicatiestatus === 'publiek';
  if (filter === 'website') return item.zichtbaarOpWebsite;
  if (filter === 'niet_openbaar') return !item.zichtbaarOpWebsite;
  return true;
}

export const PLANNING_PERIODES = ['deze_maand', 'volgende_3', 'dit_jaar', 'volgend_jaar', 'verleden'] as const;

export type PlanningPeriode = (typeof PLANNING_PERIODES)[number];

export interface PlanningSelectie {
  jaar: number | 'alle';
  van: string;
  tot: string;
  periode: PlanningPeriode | '';
  filter: PlanningFilter;
  type: string;
  q: string;
}

export interface PlanningOpties {
  vandaag: string;
  filter?: PlanningFilter;
  type?: string;
  jaar?: number | 'alle';
  van?: string;
  tot?: string;
  periode?: PlanningPeriode | '';
  q?: string;
  /** Beheer mag op e-mail zoeken. Zonder dit recht blijft het adres buiten de zoektekst. */
  emailZoeken?: boolean;
}

const MAANDEN = [
  'januari',
  'februari',
  'maart',
  'april',
  'mei',
  'juni',
  'juli',
  'augustus',
  'september',
  'oktober',
  'november',
  'december',
] as const;

const TECHNISCHE_ZOEKTERM = /^(?:bron:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|legacy[_:].+)$/i;

export function huidigJaar(vandaag: string): number {
  return Number(vandaag.slice(0, 4));
}

function voegMaandenToe(ymd: string, maanden: number): string {
  const [jaar, maand, dag] = ymd.split('-').map(Number);
  const datum = new Date(Date.UTC(jaar, maand - 1 + maanden, dag, 12));
  return datum.toISOString().slice(0, 10);
}

function later(a: string, b: string): string {
  return a > b ? a : b;
}

function eerder(a: string, b: string): string {
  return a < b ? a : b;
}

export function leesPlanningSelectie(params: URLSearchParams, vandaag: string): PlanningSelectie {
  const jaarRaw = params.get('jaar');
  const jaar = jaarRaw === 'alle'
    ? 'alle'
    : jaarRaw && /^\d{4}$/.test(jaarRaw)
      ? Number(jaarRaw)
      : huidigJaar(vandaag);
  const vanRaw = params.get('van') ?? '';
  const totRaw = params.get('tot') ?? '';
  const periodeRaw = params.get('periode') ?? '';
  const filterRaw = params.get('filter');
  const typeRaw = params.get('type') ?? '';
  return {
    jaar,
    van: /^\d{4}-\d{2}-\d{2}$/.test(vanRaw) ? vanRaw : '',
    tot: /^\d{4}-\d{2}-\d{2}$/.test(totRaw) ? totRaw : '',
    periode: PLANNING_PERIODES.includes(periodeRaw as PlanningPeriode) ? periodeRaw as PlanningPeriode : '',
    filter: PLANNING_FILTERS.includes(filterRaw as PlanningFilter) ? filterRaw as PlanningFilter : 'alles',
    type: typeRaw === 'onbekend' || PLANNING_TYPEN.includes(typeRaw as (typeof PLANNING_TYPEN)[number]) ? typeRaw : '',
    q: (params.get('q') ?? '').trim(),
  };
}

export function metJaar(selectie: PlanningSelectie, jaar: number): PlanningSelectie {
  return { ...selectie, jaar, periode: '' };
}

export function metPeriode(selectie: PlanningSelectie, periode: PlanningPeriode | ''): PlanningSelectie {
  if (periode === 'dit_jaar' || periode === 'volgend_jaar' || periode === 'deze_maand') {
    return { ...selectie, periode, van: '', tot: '', jaar: 'alle' };
  }
  if (periode === 'volgende_3' || periode === 'verleden') {
    return { ...selectie, periode, van: '', tot: '', jaar: 'alle' };
  }
  return { ...selectie, periode: '', van: '', tot: '' };
}

export function metDatums(selectie: PlanningSelectie, van: string, tot: string): PlanningSelectie {
  return { ...selectie, van, tot, periode: '' };
}

export function planningParams(selectie: PlanningSelectie, vandaag: string, bron = ''): URLSearchParams {
  const params = new URLSearchParams();
  if (selectie.jaar === 'alle') params.set('jaar', 'alle');
  else if (selectie.jaar !== huidigJaar(vandaag)) params.set('jaar', String(selectie.jaar));
  if (selectie.van) params.set('van', selectie.van);
  if (selectie.tot) params.set('tot', selectie.tot);
  if (selectie.periode) params.set('periode', selectie.periode);
  if (selectie.filter !== 'alles') params.set('filter', selectie.filter);
  if (selectie.type) params.set('type', selectie.type);
  if (selectie.q) params.set('q', selectie.q);
  if (bron) params.set('bron', bron);
  return params;
}

export function planningHref(
  basis: string,
  selectie: PlanningSelectie,
  vandaag: string,
  wijziging: Partial<PlanningSelectie> = {},
  bron = '',
): string {
  const volgende = { ...selectie, ...wijziging };
  const query = planningParams(volgende, vandaag, bron).toString();
  return query ? `${basis}?${query}` : basis;
}

export function beschikbareJaren(items: readonly { start: string; eind: string }[], vandaag: string): number[] {
  const jaren = new Set<number>([huidigJaar(vandaag) - 1, huidigJaar(vandaag), huidigJaar(vandaag) + 1]);
  for (const item of items) {
    const van = Number(item.start.slice(0, 4));
    const tot = Number(item.eind.slice(0, 4));
    if (van > 1900 && van < 2200) jaren.add(van);
    if (tot > 1900 && tot < 2200) jaren.add(tot);
  }
  return [...jaren].sort((a, b) => a - b);
}

export function selectieToontVerleden(selectie: PlanningSelectie, vandaag: string): boolean {
  if (selectie.periode === 'verleden' || selectie.jaar === 'alle') return true;
  if (selectie.van && selectie.van < vandaag) return true;
  return typeof selectie.jaar === 'number' && selectie.jaar <= huidigJaar(vandaag);
}

export function gastbegeleidersPerBoeking(
  toewijzingen: readonly { boekingId: string; relatieNaam?: string }[],
  extra: readonly { boekingId: string; naam: string }[] = [],
): Map<string, string> {
  const namen = new Map<string, Set<string>>();
  const voeg = (boekingId: string, naam: string) => {
    const schoon = naam.trim();
    if (!boekingId || !schoon) return;
    const set = namen.get(boekingId) ?? new Set<string>();
    set.add(schoon);
    namen.set(boekingId, set);
  };
  for (const item of extra) voeg(item.boekingId, item.naam);
  for (const item of toewijzingen) voeg(item.boekingId, item.relatieNaam ?? '');
  return new Map([...namen].map(([id, set]) => [id, [...set].join(', ')]));
}

export function terugLink(waarde: string | null): { href: string; label: string } | null {
  if (!waarde) return null;
  let url: URL;
  try {
    url = new URL(waarde, 'https://beheer.lokaal');
  } catch {
    return null;
  }
  if (url.origin !== 'https://beheer.lokaal') return null;
  const pad = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  const label = pad === '/beheer/planning/' ? 'Planning' : pad === '/beheer/agenda/' ? 'Agenda' : '';
  if (!label) return null;
  const schoon = new URLSearchParams();
  for (const sleutel of ['jaar', 'van', 'tot', 'periode', 'filter', 'type', 'q', 'bron']) {
    const deel = url.searchParams.get(sleutel);
    if (deel) schoon.set(sleutel, deel);
  }
  const query = schoon.toString();
  return { href: query ? `${pad}?${query}` : pad, label };
}

export function metTerug(href: string, terug: string): string {
  const url = new URL(href, 'https://beheer.lokaal');
  url.searchParams.set('terug', terug);
  return `${url.pathname}${url.search}`;
}

export function behoudTerug(href: string, terug: string | null): string {
  if (!terug) return href;
  const url = new URL(href, 'https://beheer.lokaal');
  url.searchParams.set('terug', terug);
  return `${url.pathname}${url.search}`;
}

interface PeriodeVenster {
  van: string;
  tot: string;
  alleenVerleden: boolean;
}

function jaarVenster(jaar: number): { van: string; tot: string } {
  return { van: `${jaar}-01-01`, tot: `${jaar}-12-31` };
}

export function periodeVenster(opties: PlanningOpties): PeriodeVenster | null {
  const vandaag = opties.vandaag;
  const jaar = opties.jaar;
  const periode = opties.periode ?? '';
  let van = '0001-01-01';
  let tot = '9999-12-31';
  let alleenVerleden = false;
  if (periode === 'deze_maand') {
    const maand = maandBereik(vandaag);
    van = maand.van;
    tot = maand.tot;
  } else if (periode === 'volgende_3') {
    van = vandaag;
    tot = voegMaandenToe(vandaag, 3);
  } else if (periode === 'dit_jaar') {
    ({ van, tot } = jaarVenster(huidigJaar(vandaag)));
  } else if (periode === 'volgend_jaar') {
    ({ van, tot } = jaarVenster(huidigJaar(vandaag) + 1));
  } else if (periode === 'verleden') {
    alleenVerleden = true;
    if (typeof jaar === 'number') ({ van, tot } = jaarVenster(jaar));
  } else if (typeof jaar === 'number') {
    ({ van, tot } = jaarVenster(jaar));
  }
  if (opties.van) van = later(van, opties.van);
  if (opties.tot) tot = eerder(tot, opties.tot);
  if (van > tot) return null;
  return { van, tot, alleenVerleden };
}

function periodeGekozen(opties: PlanningOpties): boolean {
  return opties.jaar != null || Boolean(opties.van) || Boolean(opties.tot) || Boolean(opties.periode);
}

function raaktMaand(item: { start: string; eind: string }, maand: number): boolean {
  const nummer = String(maand).padStart(2, '0');
  let jaar = Number(item.start.slice(0, 4));
  const laatste = Number(item.eind.slice(0, 4));
  let stappen = 0;
  while (jaar <= laatste && stappen < 40) {
    const van = `${jaar}-${nummer}-01`;
    const totDag = new Date(Date.UTC(jaar, maand, 0, 12)).getUTCDate();
    const tot = `${jaar}-${nummer}-${String(totDag).padStart(2, '0')}`;
    if (overlapt(item, { start: van, eind: tot })) return true;
    jaar += 1;
    stappen += 1;
  }
  return false;
}

export function menselijkeZoektekst(item: PlanningInvoer, emailZoeken = true): string {
  return [
    item.titel,
    item.type,
    item.huurder,
    item.gastbegeleiders,
    item.exposant,
    item.organisatie,
    item.deelnemers,
    item.omschrijving,
    item.notitie,
    item.nummer,
    emailZoeken ? item.email : '',
  ].filter(Boolean).join(' ').toLowerCase();
}

function pastZoek(item: PlanningInvoer, q: string, emailZoeken: boolean): boolean {
  const naald = q.trim().toLowerCase();
  if (!naald) return true;
  if (TECHNISCHE_ZOEKTERM.test(naald)) return false;
  const maand = MAANDEN.indexOf(naald as (typeof MAANDEN)[number]);
  if (maand >= 0) return raaktMaand(item, maand + 1);
  return menselijkeZoektekst(item, emailZoeken).includes(naald);
}

export function sorteerEerstvolgende<T extends { start: string; eind: string; titel: string }>(items: readonly T[], vandaag: string): T[] {
  const heeftKomend = items.some((item) => item.eind >= vandaag);
  return [...items].sort((a, b) => {
    if (heeftKomend) {
      const aKomt = a.eind >= vandaag;
      const bKomt = b.eind >= vandaag;
      if (aKomt !== bKomt) return aKomt ? -1 : 1;
      if (aKomt) return a.start.localeCompare(b.start) || a.titel.localeCompare(b.titel);
      return b.start.localeCompare(a.start) || a.titel.localeCompare(b.titel);
    }
    return a.start.localeCompare(b.start) || a.titel.localeCompare(b.titel);
  });
}

export function hoortBijSelectie(item: PlanningInvoer, opties: PlanningOpties): boolean {
  const filter = opties.filter ?? 'alles';
  const type = opties.type && opties.type !== 'alles' ? opties.type : '';
  if (filter === 'geannuleerd' ? !item.geannuleerd : item.geannuleerd) return false;
  if (!periodeGekozen(opties)) {
    if (item.eind < opties.vandaag) return false;
  } else {
    const venster = periodeVenster(opties);
    if (!venster) return false;
    if (!overlapt(item, { start: venster.van, eind: venster.tot })) return false;
    if (venster.alleenVerleden && item.eind >= opties.vandaag) return false;
  }
  if (!pastFilter(item, filter, opties.vandaag)) return false;
  if (type && (type === 'onbekend' ? Boolean(item.type) : item.type !== type)) return false;
  return pastZoek(item, opties.q ?? '', opties.emailZoeken !== false);
}

export function stelPlanning(items: readonly PlanningInvoer[], opties: PlanningOpties): PlanningItem[] {
  const filter = opties.filter ?? 'alles';
  const type = opties.type && opties.type !== 'alles' ? opties.type : '';
  const venster = periodeGekozen(opties) ? periodeVenster(opties) : undefined;
  const emailZoeken = opties.emailZoeken !== false;
  const gefilterd = dedupliceerPlanning(items)
    .filter((item) => (filter === 'geannuleerd' ? Boolean(item.geannuleerd) : !item.geannuleerd))
    .filter((item) => {
      if (!periodeGekozen(opties)) return item.eind >= opties.vandaag;
      if (!venster) return false;
      if (!overlapt(item, { start: venster.van, eind: venster.tot })) return false;
      if (venster.alleenVerleden && item.eind >= opties.vandaag) return false;
      return true;
    })
    .filter((item) => pastFilter(item, filter, opties.vandaag))
    .filter((item) => !type || (type === 'onbekend' ? !item.type : item.type === type))
    .filter((item) => pastZoek(item, opties.q ?? '', emailZoeken));
  return sorteerEerstvolgende(gefilterd, opties.vandaag).map((item) => ({
    ...item,
    huurder: item.huurder ?? '',
    gastbegeleiders: item.gastbegeleiders ?? '',
    aandacht: item.aandacht ?? '',
    geannuleerd: Boolean(item.geannuleerd),
  }));
}
