/**
 * Compact startscherm van /beheer.
 * Leest alleen bestaande dossiers. Er gaat geen mail uit en er wijzigt geen status.
 * Betalingen blijven buiten dit scherm.
 */

import { contentstatusNaarBeheer } from '../lib/agenda-zichtbaarheid.ts';
import { beoordeelAanvraag, checklistVan, pastInFilter, type FaseWereld } from './aanvraag-fase.ts';
import { isYmd, voegDagenToe, weekdag } from './datum.ts';
import { SOORT_LABEL } from './demo-data.ts';
import { leesbareTitel } from './verhuur-classificatie.ts';

export const VENSTER_DAGEN = 14;
export const NADEREND_DAGEN = 56;
export const MAX_ACTIES = 5;
export const MAX_AGENDA = 5;

const BEVESTIGD = new Set(['definitief', 'afgerond', 'migratie_vastgelegd']);
const OPEN_FILTER = { modus: 'fase' as const, fase: 'alle' as const, technisch: null, melding: '' };
const DAGEN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export interface StartAanvraag {
  id: string;
  naam: string;
  start: string;
  eind: string;
  status: string;
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
  sleutel: 'aanvragen' | 'opties' | 'binnenkort';
  label: string;
  aantal: number;
  href: string | null;
}

export interface StartActie {
  id: string;
  titel: string;
  toelichting: string;
  href: string;
  aantal: number;
}

export interface StartBegeleider {
  naam: string;
  href: string | null;
}

export interface StartAgendaItem {
  id: string;
  href: string;
  wanneer: string;
  tijd: string;
  naam: string;
  soort: string;
  begeleiders: StartBegeleider[];
  zonderBegeleider: boolean;
}

export interface Startscherm {
  tellers: StartTeller[];
  acties: StartActie[];
  agenda: StartAgendaItem[];
  agendaExtra: StartAgendaItem[];
  agendaTotaal: number;
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
    aanvragen: string;
    opties: string;
    aanvraag: (id: string) => string;
    boeking: (id: string) => string;
    activiteit: (id: string) => string;
    planning: (naam: string, start: string) => string;
    planningZonder: (start: string) => string;
  };
}

interface ContractPunt {
  sleutel: string;
  naam: string;
  start: string;
  href: string;
  soort: 'verzenden' | 'handtekening';
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

function stuk(ymd: string, metJaar: boolean): { dag: string; nummer: number; maand: string; jaar: string } {
  const [jaar, maand, nummer] = ymd.split('-').map(Number);
  return {
    dag: DAGEN[weekdag(ymd)] ?? '',
    nummer,
    maand: MAANDEN[maand - 1] ?? '',
    jaar: metJaar ? String(jaar) : '',
  };
}

export function periodeKort(start: string, eind: string, vandaag: string): string {
  const begin = dag(start);
  if (!begin) return '';
  const tot = dag(eind) && dag(eind) >= begin ? dag(eind) : begin;
  const jaarNu = vandaag.slice(0, 4);
  const metJaar = begin.slice(0, 4) !== jaarNu || tot.slice(0, 4) !== jaarNu;
  const links = stuk(begin, metJaar);
  if (tot === begin) {
    return [links.dag, links.nummer, links.maand, links.jaar].filter(Boolean).join(' ');
  }
  const rechts = stuk(tot, metJaar);
  if (begin.slice(0, 7) === tot.slice(0, 7)) {
    const kern = `${links.dag} ${links.nummer} – ${rechts.dag} ${rechts.nummer} ${links.maand}`;
    return links.jaar ? `${kern} ${links.jaar}` : kern;
  }
  const tekst = (deel: ReturnType<typeof stuk>) => [deel.dag, deel.nummer, deel.maand, deel.jaar].filter(Boolean).join(' ');
  return `${tekst(links)} – ${tekst(rechts)}`;
}

function soortLabel(soort: string, intern = false, blokkeert = false): string {
  if (intern) return blokkeert ? 'Blokkade' : 'Intern';
  const sleutel = soort.trim();
  if (!sleutel) return '';
  return SOORT_LABEL[sleutel] ?? sleutel;
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

function begeleidersVan(
  boeking: StartBoeking,
  input: StartInvoer,
): StartBegeleider[] {
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

function activiteitBij(boekingId: string, activiteiten: readonly StartActiviteit[]): StartActiviteit | null {
  return activiteiten.find((item) => item.boekingId === boekingId)
    ?? activiteiten.find((item) => item.id === boekingId)
    ?? null;
}

function contentOntbreekt(activiteit: StartActiviteit | null): boolean {
  if (!activiteit || activiteit.levenscyclus === 'geannuleerd' || activiteit.trigger === 'niet_publiceren') return false;
  const ruw = activiteit.contentstatus?.trim() || activiteit.inhoudStatus?.trim() || '';
  if (!ruw) return false;
  const stand = contentstatusNaarBeheer(ruw);
  return stand === 'niet_aangeleverd' || stand === 'aanpassing_nodig';
}

function aantalTekst(aantal: number, enkel: string, meer: string): string {
  return aantal === 1 ? `1 ${enkel}` : `${aantal} ${meer}`;
}

export function startscherm(input: StartInvoer): Startscherm {
  const tot = voegDagenToe(input.vandaag, VENSTER_DAGEN);
  const totNaderend = voegDagenToe(input.vandaag, NADEREND_DAGEN);
  const wereld = wereldVan(input);
  const openAanvragen = input.ziet.aanvragen
    ? input.aanvragen
      .map((item) => ({ item, beeld: beoordeelAanvraag(item, wereld) }))
      .filter(({ item, beeld }) => pastInFilter(beeld.fase, OPEN_FILTER, item.status))
      .sort((a, b) => dag(a.item.start).localeCompare(dag(b.item.start)) || a.item.naam.localeCompare(b.item.naam, 'nl'))
    : [];

  const opties = input.ziet.boekingen
    ? input.boekingen.filter((item) => item.status === 'optie')
    : [];

  const agendaAlles = agendaVan(input, tot);
  const acties = actiesVan(input, wereld, openAanvragen, opties, agendaAlles, tot, totNaderend);

  return {
    tellers: [
      {
        sleutel: 'aanvragen',
        label: 'Nieuwe aanvragen',
        aantal: openAanvragen.length,
        href: input.ziet.aanvragen ? input.href.aanvragen : null,
      },
      {
        sleutel: 'opties',
        label: 'Opties',
        aantal: opties.length,
        href: input.ziet.boekingen ? input.href.opties : null,
      },
      {
        sleutel: 'binnenkort',
        label: 'Binnen 14 dagen',
        aantal: agendaAlles.length,
        href: '#komende',
      },
    ],
    acties: acties.slice(0, MAX_ACTIES),
    agenda: agendaAlles.slice(0, MAX_AGENDA),
    agendaExtra: agendaAlles.slice(MAX_AGENDA),
    agendaTotaal: agendaAlles.length,
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
          tijd: tijdVan(intern.start, intern.eind),
          naam: intern.titel.trim() || 'Interne activiteit',
          soort: soortLabel('', true, intern.blokkeert),
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

function actiesVan(
  input: StartInvoer,
  wereld: FaseWereld,
  openAanvragen: { item: StartAanvraag; beeld: ReturnType<typeof beoordeelAanvraag> }[],
  opties: readonly StartBoeking[],
  agenda: readonly StartAgendaItem[],
  tot: string,
  totNaderend: string,
): StartActie[] {
  const acties: StartActie[] = [];

  if (openAanvragen.length > 0) {
    const eerst = openAanvragen[0].item;
    acties.push({
      id: 'aanvragen',
      titel: 'Nieuwe aanvragen beoordelen',
      toelichting: `${aantalTekst(openAanvragen.length, 'aanvraag wacht', 'aanvragen wachten')} op beoordeling.`,
      href: openAanvragen.length === 1 ? input.href.aanvraag(eerst.id) : input.href.aanvragen,
      aantal: openAanvragen.length,
    });
  }

  const contracten = contractPunten(input, wereld, openAanvragen, totNaderend);
  if (contracten.length > 0) {
    const verzenden = contracten.filter((item) => item.soort === 'verzenden').length;
    const handtekening = contracten.length - verzenden;
    const toelichting = verzenden > 0 && handtekening > 0
      ? `${aantalTekst(contracten.length, 'contract vraagt', 'contracten vragen')} een vervolgstap.`
      : verzenden > 0
        ? `${aantalTekst(verzenden, 'contract is', 'contracten zijn')} nog niet verstuurd.`
        : `${aantalTekst(handtekening, 'contract wacht', 'contracten wachten')} op een handtekening.`;
    const eerst = [...contracten].sort((a, b) => a.start.localeCompare(b.start) || a.naam.localeCompare(b.naam, 'nl'))[0];
    acties.push({
      id: 'contracten',
      titel: 'Contracten',
      toelichting,
      href: eerst.href,
      aantal: contracten.length,
    });
  }

  const verlopen = opties
    .map((item) => ({ item, eind: dag(item.optieEind) }))
    .filter(({ item, eind }) => {
      if (!eind || eind > tot) return false;
      return eind >= input.vandaag || dag(item.eind) >= input.vandaag || dag(item.start) >= input.vandaag;
    })
    .sort((a, b) => a.eind.localeCompare(b.eind) || a.item.huurder.localeCompare(b.item.huurder, 'nl'));
  if (verlopen.length > 0) {
    const eerst = verlopen[0];
    const naam = eerst.item.huurder || eerst.item.titel;
    acties.push({
      id: 'opties',
      titel: 'Opties verlopen binnenkort',
      toelichting: verlopen.length === 1
        ? `De optie van ${naam} loopt tot ${periodeKort(eerst.eind, eerst.eind, input.vandaag)}.`
        : `${verlopen.length} opties met een bekende einddatum lopen af binnen 14 dagen.`,
      href: verlopen.length === 1 ? input.href.boeking(eerst.item.id) : input.href.opties,
      aantal: verlopen.length,
    });
  }

  if (input.ziet.boekingen || input.ziet.agenda) {
    const exposities = input.boekingen
      .filter((item) => {
        if (!BEVESTIGD.has(item.status) || item.soort !== 'expositie') return false;
        if (!raakt(item.start, item.eind, input.vandaag, totNaderend)) return false;
        return contentOntbreekt(activiteitBij(item.id, input.activiteiten));
      })
      .sort((a, b) => dag(a.start).localeCompare(dag(b.start)) || a.huurder.localeCompare(b.huurder, 'nl'));
    if (exposities.length > 0) {
      const eerst = exposities[0];
      const activiteit = activiteitBij(eerst.id, input.activiteiten);
      const naam = eerst.huurder || eerst.titel;
      acties.push({
        id: 'exposanten',
        titel: 'Exposanteninformatie',
        toelichting: exposities.length === 1
          ? `Exposanteninformatie ontbreekt voor ${naam}.`
          : `${exposities.length} naderende exposities missen exposanteninformatie.`,
        href: exposities.length === 1 && activiteit
          ? input.href.activiteit(activiteit.id)
          : input.href.boeking(eerst.id),
        aantal: exposities.length,
      });
    }
  }

  const zonder = agenda.filter((item) => item.zonderBegeleider);
  if (zonder.length > 0 && input.ziet.planning) {
    const eerst = zonder[0];
    const start = input.boekingen.find((item) => `boeking:${item.id}` === eerst.id)?.start ?? input.vandaag;
    acties.push({
      id: 'gastbegeleiders',
      titel: 'Gastbegeleiders',
      toelichting: zonder.length === 1
        ? `${eerst.naam} heeft nog geen gastbegeleider.`
        : `${zonder.length} activiteiten in de komende twee weken hebben nog geen gastbegeleider.`,
      href: input.href.planningZonder(dag(start) || input.vandaag),
      aantal: zonder.length,
    });
  }

  return acties;
}

function contractPunten(
  input: StartInvoer,
  wereld: FaseWereld,
  openAanvragen: { item: StartAanvraag; beeld: ReturnType<typeof beoordeelAanvraag> }[],
  totNaderend: string,
): ContractPunt[] {
  const punten: ContractPunt[] = [];
  const gezien = new Set<string>();
  if (input.ziet.aanvragen) {
    for (const { item, beeld } of openAanvragen) {
      const soort = beeld.volgendeActie === 'Contract verzenden'
        ? 'verzenden'
        : beeld.volgendeActie === 'Wachten op ondertekening'
          ? 'handtekening'
          : null;
      if (!soort) continue;
      const sleutel = beeld.boeking?.id || item.boekingId || item.id;
      if (gezien.has(sleutel)) continue;
      gezien.add(sleutel);
      punten.push({
        sleutel,
        naam: item.naam,
        start: dag(item.start),
        href: input.href.aanvraag(item.id),
        soort,
      });
    }
  }
  if (input.ziet.boekingen) {
    for (const boeking of input.boekingen) {
      if (!BEVESTIGD.has(boeking.status) || gezien.has(boeking.id)) continue;
      if (!raakt(boeking.start, boeking.eind, input.vandaag, totNaderend)) continue;
      const faseBoeking = wereld.boekingen.find((item) => item.id === boeking.id) ?? null;
      const lijst = checklistVan(faseBoeking, wereld);
      if (!lijst.verzonden || lijst.ondertekend) continue;
      gezien.add(boeking.id);
      punten.push({
        sleutel: boeking.id,
        naam: boeking.huurder || boeking.titel,
        start: dag(boeking.start),
        href: input.href.boeking(boeking.id),
        soort: 'handtekening',
      });
    }
  }
  return punten;
}
