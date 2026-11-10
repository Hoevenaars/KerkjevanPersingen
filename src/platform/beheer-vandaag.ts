/**
 * Actiegericht startscherm.
 * Een melding verschijnt alleen bij een bekende waarde in de bestaande gegevens.
 * Lege content, onzekere verzendstatus en ontbrekende contracten blijven weg.
 */

import { contentstatusNaarBeheer } from '../lib/agenda-zichtbaarheid.ts';
import { voegDagenToe } from './datum.ts';
import { AANVRAAG_LABEL, BOEKING_LABEL } from './demo-data.ts';
import { financienBeeld, type BetaalBron, type BetaalBoeking } from './beheer-financien.ts';

export const BINNENKORT_DAGEN = 21;
export const STUKKEN_DAGEN = 90;
export const GASTHEER_DAGEN = 56;
export const MAX_REGELS = 8;

const LOOPT = new Set(['optie', 'optie_verlopen', 'definitief', 'afgerond', 'migratie_aanvraag', 'migratie_vastgelegd']);
const GESTOPT = new Set(['geannuleerd', 'afgewezen', 'gearchiveerd']);

export interface VandaagItem {
  titel: string;
  toelichting: string;
  href: string;
  wanneer: string;
}

export interface VandaagOverzicht {
  aanvragen: VandaagItem[];
  opties: VandaagItem[];
  binnenkort: VandaagItem[];
  beoordelen: VandaagItem[];
  ontbreekt: VandaagItem[];
  betalingen: VandaagItem[];
  gastheren: VandaagItem[];
  afwijkingen: VandaagItem[];
}

export interface VandaagInvoer {
  vandaag: string;
  aanvragen: readonly { id: string; naam: string; start: string; status: string }[];
  boekingen: readonly {
    id: string;
    titel: string;
    huurder: string;
    start: string;
    eind: string;
    status: string;
    soort: string;
    gastheerId?: string;
    aanbetalingBinnen: boolean;
  }[];
  activiteiten: readonly {
    id: string;
    titel: string;
    start: string;
    eind: string;
    contentstatus: string | null;
    levenscyclus?: string;
    trigger?: string | null;
  }[];
  betalingen: readonly BetaalBron[];
  ziet: { aanvragen: boolean; boekingen: boolean; agenda: boolean; finance: boolean };
  href: {
    aanvraag: (id: string) => string;
    boeking: (id: string) => string;
    activiteit: (id: string) => string;
    finance: string;
    boekingen: string;
    systeem: string | null;
  };
  /** Aantal verzendtaken op fout, alleen als de bron dat getal echt heeft. */
  verzendfouten?: number;
}

function raakt(start: string, eind: string, van: string, tot: string): boolean {
  if (!start) return false;
  return (eind || start) >= van && start <= tot;
}

function kort(items: VandaagItem[], meer: VandaagItem | null): VandaagItem[] {
  if (items.length <= MAX_REGELS) return items;
  const kop = items.slice(0, MAX_REGELS);
  if (meer) kop.push({ ...meer, titel: meer.titel.replace('{n}', String(items.length - MAX_REGELS)) });
  return kop;
}

function leeg(): VandaagOverzicht {
  return {
    aanvragen: [],
    opties: [],
    binnenkort: [],
    beoordelen: [],
    ontbreekt: [],
    betalingen: [],
    gastheren: [],
    afwijkingen: [],
  };
}

export function vandaagOverzicht(input: VandaagInvoer): VandaagOverzicht {
  const uit = leeg();
  const totBinnenkort = voegDagenToe(input.vandaag, BINNENKORT_DAGEN);
  const totStukken = voegDagenToe(input.vandaag, STUKKEN_DAGEN);
  const totGastheer = voegDagenToe(input.vandaag, GASTHEER_DAGEN);

  if (input.ziet.aanvragen) {
    const aanvragen = input.aanvragen
      .filter((item) => item.status === 'nieuw' || item.status === 'in_behandeling' || item.status === 'wacht_op_aanvrager')
      .sort((a, b) => a.start.localeCompare(b.start) || a.naam.localeCompare(b.naam, 'nl'))
      .map((item) => ({
        titel: item.naam,
        toelichting:
          item.status === 'wacht_op_aanvrager'
            ? 'Wacht op de aanvrager.'
            : AANVRAAG_LABEL[item.status as keyof typeof AANVRAAG_LABEL] ?? item.status,
        href: input.href.aanvraag(item.id),
        wanneer: item.start,
      }));
    uit.aanvragen = kort(aanvragen, {
      titel: 'Nog {n} aanvragen',
      toelichting: 'De volledige lijst staat bij Aanvragen.',
      href: '/beheer/aanvragen/',
      wanneer: '',
    });
  }

  if (input.ziet.boekingen) {
    const lopend = input.boekingen
      .filter((item) => !GESTOPT.has(item.status) && LOOPT.has(item.status))
      .sort((a, b) => a.start.localeCompare(b.start) || a.titel.localeCompare(b.titel, 'nl'));
    const naarItem = (item: (typeof lopend)[number]): VandaagItem => ({
      titel: item.huurder || item.titel,
      toelichting: BOEKING_LABEL[item.status as keyof typeof BOEKING_LABEL] ?? item.status,
      href: input.href.boeking(item.id),
      wanneer: item.start,
    });
    uit.opties = kort(
      lopend.filter((item) => item.status === 'optie' || item.status === 'optie_verlopen').map(naarItem),
      null,
    );
    const binnenkort = lopend
      .filter(
        (item) =>
          item.status !== 'optie' &&
          item.status !== 'optie_verlopen' &&
          raakt(item.start, item.eind, input.vandaag, totBinnenkort),
      )
      .map(naarItem);
    uit.binnenkort = kort(binnenkort, {
      titel: 'Nog {n} activiteiten',
      toelichting: 'De verhuuragenda toont ze allemaal.',
      href: input.href.boekingen,
      wanneer: '',
    });

    const gastheren = input.boekingen
      .filter(
        (item) =>
          item.status === 'definitief' &&
          item.soort === 'expositie' &&
          !item.gastheerId &&
          raakt(item.start, item.eind, input.vandaag, totGastheer),
      )
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((item) => ({
        titel: item.huurder || item.titel,
        toelichting: 'Er is nog geen expositiebegeleider gekozen.',
        href: input.href.boeking(item.id),
        wanneer: item.start,
      }));
    uit.gastheren = kort(gastheren, null);

    const zonderType = input.boekingen.filter((item) => !GESTOPT.has(item.status) && !item.soort.trim()).length;
    if (zonderType > 0) {
      uit.afwijkingen.push({
        titel: zonderType === 1 ? '1 boeking zonder verhuurtype' : `${zonderType} boekingen zonder verhuurtype`,
        toelichting: 'Het type is niet automatisch ingevuld. De boekingen blijven zoals ze zijn.',
        href: input.href.boekingen,
        wanneer: '',
      });
    }
  }

  if (input.ziet.agenda) {
    for (const item of input.activiteiten) {
      if (!item.id || item.levenscyclus === 'geannuleerd' || item.trigger === 'niet_publiceren') continue;
      if (!raakt(item.start, item.eind, input.vandaag, totStukken)) continue;
      const raw = item.contentstatus?.trim() ?? '';
      if (!raw) continue;
      const stand = contentstatusNaarBeheer(raw);
      const regel: VandaagItem = {
        titel: item.titel || 'Activiteit',
        toelichting: '',
        href: input.href.activiteit(item.id),
        wanneer: item.start,
      };
      if (stand === 'in_beoordeling' || stand === 'aangeleverd') {
        regel.toelichting = 'Aangeleverde informatie wacht op beoordeling.';
        uit.beoordelen.push(regel);
      } else if (stand === 'aanpassing_nodig') {
        regel.toelichting = 'Er is een aanpassing gevraagd.';
        uit.ontbreekt.push(regel);
      } else if (stand === 'niet_aangeleverd') {
        regel.toelichting =
          raw === 'gevraagd'
            ? 'De informatie is al opgevraagd. Er is nog niets aangeleverd.'
            : 'Exposanteninformatie is nog niet aangeleverd.';
        uit.ontbreekt.push(regel);
      }
    }
    uit.beoordelen.sort((a, b) => a.wanneer.localeCompare(b.wanneer));
    uit.ontbreekt.sort((a, b) => a.wanneer.localeCompare(b.wanneer));
    uit.beoordelen = kort(uit.beoordelen, null);
    uit.ontbreekt = kort(uit.ontbreekt, null);
  }

  if (input.ziet.finance || input.ziet.boekingen) {
    const beeld = financienBeeld({
      boekingen: input.boekingen.map(
        (item): BetaalBoeking => ({
          id: item.id,
          status: item.status,
          huurder: item.huurder,
          titel: item.titel,
          aanbetalingBinnen: item.aanbetalingBinnen,
        }),
      ),
      betalingen: input.betalingen,
      hrefVoorBoeking: input.href.boeking,
      financeHref: input.href.finance,
      naarBoeking: input.ziet.boekingen,
    });
    uit.betalingen = kort(
      beeld.open.map((item) => ({
        titel: item.titel,
        toelichting: item.bedrag ? `${item.toelichting} ${item.bedrag}.` : item.toelichting,
        href: item.href,
        wanneer: item.wanneer,
      })),
      {
        titel: 'Nog {n} openstaande betalingen',
        toelichting: 'Het volledige overzicht staat bij Financiën.',
        href: input.href.finance,
        wanneer: '',
      },
    );
    const extra = beeld.afwijkingen.map((item) => ({
      titel: item.titel,
      toelichting: item.bedrag ? `${item.toelichting} ${item.bedrag}.` : item.toelichting,
      href: item.href,
      wanneer: item.wanneer,
    }));
    uit.afwijkingen.push(...kort(extra, null));
  }

  if ((input.verzendfouten ?? 0) > 0 && input.href.systeem) {
    const aantal = input.verzendfouten ?? 0;
    uit.afwijkingen.push({
      titel: aantal === 1 ? '1 verzendtaak staat op fout' : `${aantal} verzendtaken staan op fout`,
      toelichting: 'Dit is geen bewijs dat een mail is aangekomen. Vanuit dit scherm wordt niets verstuurd.',
      href: input.href.systeem,
      wanneer: '',
    });
  }

  return uit;
}

export function vandaagLeeg(overzicht: VandaagOverzicht): boolean {
  return Object.values(overzicht).every((lijst) => lijst.length === 0);
}
