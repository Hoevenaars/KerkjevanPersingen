/**
 * Compact startscherm van /beheer.
 * Leest alleen bestaande dossiers. Er gaat geen mail uit en er wijzigt geen status.
 * De aanvraagfase is dezelfde als de aanvragenlijst. Betalingen worden niet getoond.
 */

import { beoordeelAanvraag, pastInFilter, type FaseWereld } from './aanvraag-fase.ts';
import { isYmd, voegDagenToe, weekdag } from './datum.ts';
import { SOORT_LABEL } from './demo-data.ts';
import { isInterneActiviteitTitel, INTERNE_TITEL_PREFIX } from './handmatige-boeking.ts';
import { leesbareTitel } from './verhuur-classificatie.ts';

export const VENSTER_DAGEN = 14;
export const MAX_AANVRAGEN = 5;

const BEVESTIGD = new Set(['definitief', 'afgerond', 'migratie_vastgelegd']);
const FILTER_NIEUW = { modus: 'fase' as const, fase: 'nieuw' as const, technisch: null, melding: '' };
const FILTER_BEHANDELING = { modus: 'fase' as const, fase: 'in_behandeling' as const, technisch: null, melding: '' };
const DAGEN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export interface StartAanvraag {
  id: string;
  naam: string;
  start: string;
  eind: string;
  status: string;
  soort?: string;
  binnengekomen?: string;
  boekingId?: string;
}

export interface StartBoeking {
  id: string;
  nummer?: string;
  titel: string;
  huurder: string;
  start: string;
  eind: string;
  status: string;
  soort: string;
  gastheerId?: string;
  optieEind?: string;
  aanvraagId?: string;
  aanbetalingBinnen?: boolean;
}

export interface StartActiviteit {
  id: string;
  boekingId?: string;
  titel: string;
  start: string;
  eind: string;
  soort?: string;
  contentstatus?: string | null;
  inhoudStatus?: string | null;
  levenscyclus?: string;
  trigger?: string | null;
  tabel?: string;
}

export interface StartIntern {
  id: string;
  titel: string;
  start: string;
  eind: string;
  blokkeert: boolean;
}

export interface StartToewijzing {
  boekingId: string;
  relatieId: string;
  relatieNaam: string;
}

export interface StartTeller {
  sleutel: 'nieuw' | 'behandeling' | 'binnenkort';
  label: string;
  aantal: number;
  href: string | null;
}

export interface StartAanvraagRij {
  id: string;
  href: string;
  naam: string;
  wanneer: string;
  soort: string;
  stap: string;
  toon: 'groen' | 'oranje' | 'rood';
}

export interface StartGroep {
  totaal: number;
  href: string | null;
  rijen: StartAanvraagRij[];
}

export interface StartBegeleider {
  naam: string;
  href: string | null;
}

export interface AgendaDatum {
  week: string;
  dagen: string;
  maand: string;
}

export interface StartAgendaItem {
  id: string;
  href: string;
  wanneer: string;
  datum: AgendaDatum;
  tijd: string;
  naam: string;
  soort: string;
  begeleiders: StartBegeleider[];
  zonderBegeleider: boolean;
}

export interface Startscherm {
  tellers: StartTeller[];
  nieuw: StartGroep;
  behandeling: StartGroep;
  agenda: StartAgendaItem[];
}

export interface StartInvoer {
  vandaag: string;
  aanvragen: readonly StartAanvraag[];
  boekingen: readonly StartBoeking[];
  activiteiten: readonly StartActiviteit[];
  intern: readonly StartIntern[];
  documenten: readonly { boekingId: string; soort: string; naam: string }[];
  mails: readonly { boekingId: string; template: string; status: string }[];
  /** Alleen om de aanvraagfase gelijk te houden aan de aanvragenlijst. Wordt niet getoond. */
  faseBetalingen?: readonly { boekingId: string; soort: string; status: string }[];
  toewijzingen: readonly StartToewijzing[];
  gastheren: readonly { id: string; naam: string }[];
  ziet: { aanvragen: boolean; boekingen: boolean; agenda: boolean; planning: boolean };
  href: {
    nieuw: string;
    behandeling: string;
    aanvraag: (id: string) => string;
    boeking: (id: string) => string;
    activiteit: (id: string) => string;
    planning: (naam: string, start: string) => string;
  };
}

function dag(waarde: string | undefined): string {
  const kort = (waarde ?? '').slice(0, 10);
  return isYmd(kort) ? kort : '';
}

function raakt(start: string, eind: string, van: string, tot: string): boolean {
  const begin = dag(start);
  if (!begin) return false;
  const einde = dag(eind) || begin;
  return einde >= van && begin <= tot;
}

function tijdstip(waarde: string): string {
  const treffer = /T(\d{2}):(\d{2})/.exec(waarde);
  if (!treffer || (treffer[1] === '00' && treffer[2] === '00')) return '';
  return `${treffer[1]}:${treffer[2]}`;
}

function tijdVan(start: string, eind: string): string {
  const van = tijdstip(start);
  const tot = tijdstip(eind);
  if (van && tot && van !== tot) return `${van}–${tot}`;
  return van || tot;
}

function stuk(ymd: string): { dag: string; nummer: number; maand: string; jaar: string } {
  const [jaar, maand, nummer] = ymd.split('-').map(Number);
  return {
    dag: DAGEN[weekdag(ymd)] ?? '',
    nummer,
    maand: MAANDEN[maand - 1] ?? '',
    jaar: String(jaar),
  };
}

export function periodeKort(start: string, eind: string, vandaag: string): string {
  const begin = dag(start);
  if (!begin) return '';
  const tot = dag(eind) && dag(eind) >= begin ? dag(eind) : begin;
  const jaarNu = vandaag.slice(0, 4);
  const metJaar = begin.slice(0, 4) !== jaarNu || tot.slice(0, 4) !== jaarNu;
  const links = stuk(begin);
  const jaar = metJaar ? links.jaar : '';
  if (tot === begin) return [links.dag, links.nummer, links.maand, jaar].filter(Boolean).join(' ');
  const rechts = stuk(tot);
  if (begin.slice(0, 7) === tot.slice(0, 7)) {
    const kern = `${links.dag} ${links.nummer} – ${rechts.dag} ${rechts.nummer} ${links.maand}`;
    return jaar ? `${kern} ${jaar}` : kern;
  }
  const tekst = (deel: ReturnType<typeof stuk>, jaarTonen: boolean) =>
    [deel.dag, deel.nummer, deel.maand, jaarTonen ? deel.jaar : ''].filter(Boolean).join(' ');
  return `${tekst(links, metJaar)} – ${tekst(rechts, metJaar)}`;
}

export function datumBlok(start: string, eind: string): AgendaDatum {
  const begin = dag(start);
  if (!begin) return { week: '', dagen: '', maand: '' };
  const tot = dag(eind) && dag(eind) >= begin ? dag(eind) : begin;
  const links = stuk(begin);
  if (tot === begin) return { week: links.dag, dagen: String(links.nummer), maand: links.maand };
  const rechts = stuk(tot);
  const week = `${links.dag} – ${rechts.dag}`;
  if (links.maand === rechts.maand && links.jaar === rechts.jaar) {
    return { week, dagen: `${links.nummer} – ${rechts.nummer}`, maand: links.maand };
  }
  return {
    week,
    dagen: `${links.nummer} ${links.maand} – ${rechts.nummer} ${rechts.maand}`,
    maand: links.jaar === rechts.jaar ? links.jaar : `${links.jaar} – ${rechts.jaar}`,
  };
}

export function datumKort(start: string, eind: string): string {
  const begin = dag(start);
  if (!begin) return '';
  const tot = dag(eind) && dag(eind) >= begin ? dag(eind) : begin;
  const links = stuk(begin);
  if (tot === begin) return `${links.nummer} ${links.maand} ${links.jaar}`;
  const rechts = stuk(tot);
  if (links.maand === rechts.maand && links.jaar === rechts.jaar) {
    return `${links.nummer} – ${rechts.nummer} ${links.maand} ${links.jaar}`;
  }
  if (links.jaar === rechts.jaar) {
    return `${links.nummer} ${links.maand} – ${rechts.nummer} ${rechts.maand} ${links.jaar}`;
  }
  return `${links.nummer} ${links.maand} ${links.jaar} – ${rechts.nummer} ${rechts.maand} ${rechts.jaar}`;
}

function soortLabel(soort: string, intern = false, blokkeert = false): string {
  if (intern) return blokkeert ? 'Blokkade' : 'Intern';
  const sleutel = soort.trim();
  if (!sleutel) return '';
  return SOORT_LABEL[sleutel] ?? sleutel;
}

function internWeergave(titel: string, blokkeert: boolean): { naam: string; soort: string } {
  const schoon = titel.trim();
  if (isInterneActiviteitTitel(schoon)) {
    const naam = schoon.slice(INTERNE_TITEL_PREFIX.length).trim();
    return { naam: naam || schoon, soort: 'Intern' };
  }
  return {
    naam: schoon || 'Interne activiteit',
    soort: soortLabel('', true, blokkeert),
  };
}

function wereldVan(input: StartInvoer): FaseWereld {
  return {
    aanvragen: input.aanvragen.map((item) => ({
      id: item.id,
      status: item.status,
      naam: item.naam,
      start: dag(item.start),
      eind: dag(item.eind) || dag(item.start),
      boekingId: item.boekingId,
    })),
    boekingen: input.boekingen.map((item) => ({
      id: item.id,
      nummer: item.nummer || item.id,
      status: item.status,
      start: dag(item.start),
      eind: dag(item.eind) || dag(item.start),
      titel: item.titel,
      huurder: item.huurder,
      aanbetalingBinnen: Boolean(item.aanbetalingBinnen),
      aanvraagId: item.aanvraagId,
    })),
    documenten: input.documenten,
    mails: input.mails,
    betalingen: input.faseBetalingen ?? [],
    blokkades: input.intern.map((item) => ({
      id: item.id,
      titel: item.titel,
      start: dag(item.start),
      eind: dag(item.eind) || dag(item.start),
      blokkeert: item.blokkeert,
    })),
    activiteiten: input.activiteiten
      .filter((item) => item.tabel === 'activiteit_bron')
      .map((item) => ({
        id: item.id,
        titel: item.titel,
        start: dag(item.start),
        eind: dag(item.eind) || dag(item.start),
        zichtbaarheid: '',
        levenscyclus: item.levenscyclus === 'geannuleerd' ? 'geannuleerd' : 'actief',
      })),
  };
}

function begeleidersVan(boeking: StartBoeking, input: StartInvoer): StartBegeleider[] {
  const namen = new Map<string, string>();
  const gastId = boeking.gastheerId?.trim() ?? '';
  if (gastId) {
    const gast = input.gastheren.find((item) => item.id === gastId);
    namen.set(gastId, gast?.naam.trim() || 'Gastbegeleider');
  }
  for (const toe of input.toewijzingen) {
    if (toe.boekingId !== boeking.id || !toe.relatieId) continue;
    const naam = toe.relatieNaam.trim();
    if (!namen.has(toe.relatieId)) namen.set(toe.relatieId, naam || 'Gastbegeleider');
  }
  return [...namen]
    .map(([, naam]) => ({
      naam,
      href: input.ziet.planning && naam !== 'Gastbegeleider'
        ? input.href.planning(naam, dag(boeking.start))
        : null,
    }))
    .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
}

function rijVan(item: StartAanvraag, beeld: ReturnType<typeof beoordeelAanvraag>, input: StartInvoer): StartAanvraagRij {
  const stap = beeld.volgendeActie && beeld.volgendeActie !== 'Geen actie' ? beeld.volgendeActie : '';
  return {
    id: item.id,
    href: input.href.aanvraag(item.id),
    naam: item.naam,
    wanneer: datumKort(item.start, item.eind),
    soort: soortLabel(item.soort ?? ''),
    stap,
    toon: beeld.toon,
  };
}

function legeGroep(): StartGroep {
  return { totaal: 0, href: null, rijen: [] };
}

export function startscherm(input: StartInvoer): Startscherm {
  const tot = voegDagenToe(input.vandaag, VENSTER_DAGEN);
  const wereld = wereldVan(input);
  const beoordeeld = input.ziet.aanvragen
    ? input.aanvragen.map((item) => ({ item, beeld: beoordeelAanvraag(item, wereld) }))
    : [];
  const nieuwAlles = beoordeeld
    .filter(({ item, beeld }) => pastInFilter(beeld.fase, FILTER_NIEUW, item.status))
    .sort((a, b) => {
      const binnenA = (a.item.binnengekomen ?? '').slice(0, 10) || dag(a.item.start);
      const binnenB = (b.item.binnengekomen ?? '').slice(0, 10) || dag(b.item.start);
      return binnenB.localeCompare(binnenA) || a.item.naam.localeCompare(b.item.naam, 'nl');
    });
  const behandelingAlles = beoordeeld
    .filter(({ item, beeld }) => pastInFilter(beeld.fase, FILTER_BEHANDELING, item.status))
    .sort((a, b) => {
      const voorbij = (item: StartAanvraag) => {
        const einde = dag(item.eind) || dag(item.start);
        return einde && einde < input.vandaag ? 1 : 0;
      };
      return voorbij(a.item) - voorbij(b.item)
        || dag(a.item.start).localeCompare(dag(b.item.start))
        || a.item.naam.localeCompare(b.item.naam, 'nl');
    });
  const agenda = agendaVan(input, tot);
  const nieuw: StartGroep = input.ziet.aanvragen
    ? {
        totaal: nieuwAlles.length,
        href: input.href.nieuw,
        rijen: nieuwAlles.slice(0, MAX_AANVRAGEN).map(({ item, beeld }) => rijVan(item, beeld, input)),
      }
    : legeGroep();
  const behandeling: StartGroep = input.ziet.aanvragen
    ? {
        totaal: behandelingAlles.length,
        href: input.href.behandeling,
        rijen: behandelingAlles.slice(0, MAX_AANVRAGEN).map(({ item, beeld }) => rijVan(item, beeld, input)),
      }
    : legeGroep();

  return {
    tellers: [
      { sleutel: 'nieuw', label: 'Nieuwe aanvragen', aantal: nieuw.totaal, href: nieuw.href },
      { sleutel: 'behandeling', label: 'In behandeling', aantal: behandeling.totaal, href: behandeling.href },
      { sleutel: 'binnenkort', label: 'Binnen 14 dagen', aantal: agenda.length, href: '#agenda' },
    ],
    nieuw,
    behandeling,
    agenda,
  };
}

function agendaVan(input: StartInvoer, tot: string): StartAgendaItem[] {
  const items: { start: string; item: StartAgendaItem }[] = [];
  if (input.ziet.boekingen) {
    for (const boeking of input.boekingen) {
      if (!BEVESTIGD.has(boeking.status)) continue;
      if (!raakt(boeking.start, boeking.eind, input.vandaag, tot)) continue;
      const begeleiders = begeleidersVan(boeking, input);
      items.push({
        start: dag(boeking.start),
        item: {
          id: `boeking:${boeking.id}`,
          href: input.href.boeking(boeking.id),
          wanneer: periodeKort(boeking.start, boeking.eind, input.vandaag),
          datum: datumBlok(boeking.start, boeking.eind),
          tijd: tijdVan(boeking.start, boeking.eind),
          naam: leesbareTitel(boeking.titel, boeking.huurder),
          soort: soortLabel(boeking.soort),
          begeleiders,
          zonderBegeleider: begeleiders.length === 0,
        },
      });
    }
  }
  if (input.ziet.agenda) {
    for (const intern of input.intern) {
      if (!raakt(intern.start, intern.eind, input.vandaag, tot)) continue;
      items.push({
        start: dag(intern.start),
        item: {
          id: `intern:${intern.id}`,
          href: input.href.activiteit(intern.id),
          wanneer: periodeKort(intern.start, intern.eind, input.vandaag),
          datum: datumBlok(intern.start, intern.eind),
          tijd: tijdVan(intern.start, intern.eind),
          ...internWeergave(intern.titel, intern.blokkeert),
          begeleiders: [],
          zonderBegeleider: false,
        },
      });
    }
  }
  return items
    .sort((a, b) => a.start.localeCompare(b.start) || a.item.naam.localeCompare(b.item.naam, 'nl'))
    .map((rij) => rij.item);
}
