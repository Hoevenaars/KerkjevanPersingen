/**
 * Leesweergave van de tabel betalingen.
 * Geen nieuwe mutatie, geen refund en geen tweede administratie.
 * De oude vlag aanbetaling_ontvangen blijft een vergelijking, geen bron.
 */

import { bolVoorSoort } from './verhuur-overzicht.ts';

export interface BetaalBron {
  id: string;
  boekingId: string;
  soort: string;
  bedrag: number;
  status: string;
  vervaldatum: string;
  ontvangenOp: string;
}

export interface BetaalBoeking {
  id: string;
  status: string;
  huurder: string;
  titel: string;
  aanbetalingBinnen: boolean;
}

export type BetaalGroep = 'open' | 'ontvangen' | 'geannuleerd' | 'afwijking';

export interface BetaalWeergave {
  id: string;
  groep: BetaalGroep;
  titel: string;
  toelichting: string;
  bedrag: string;
  bedragGetal: number | null;
  href: string;
  wanneer: string;
}

export interface FinancienBeeld {
  open: BetaalWeergave[];
  ontvangen: BetaalWeergave[];
  geannuleerd: BetaalWeergave[];
  afwijkingen: BetaalWeergave[];
  totaalOpen: string | null;
  totaalOntvangen: string | null;
}

const LOOPT = new Set(['optie', 'optie_verlopen', 'definitief', 'afgerond', 'migratie_aanvraag', 'migratie_vastgelegd']);
const GESTOPT = new Set(['geannuleerd', 'afgewezen', 'gearchiveerd']);
const STATUS = new Set(['open', 'ontvangen', 'geannuleerd']);

const SOORT_LABEL: Record<string, string> = {
  aanbetaling: 'Aanbetaling',
  restant: 'Restbetaling',
  correctie: 'Correctie',
  restitutie: 'Restitutie',
  historisch: 'Historisch',
};

export function euro(bedrag: number): string {
  if (!Number.isFinite(bedrag)) return 'Bedrag onbekend';
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(bedrag);
}

export function betaalSoortLabel(soort: string): string {
  if (SOORT_LABEL[soort]) return SOORT_LABEL[soort];
  return soort ? `Onbekend (${soort})` : 'Soort onbekend';
}

export function betaalStatusLabel(status: string): string {
  if (status === 'open') return 'Open';
  if (status === 'ontvangen') return 'Ontvangen';
  if (status === 'geannuleerd') return 'Geannuleerd';
  return status ? `Onbekend (${status})` : 'Status onbekend';
}

function totaalVan(regels: readonly BetaalWeergave[]): string | null {
  if (regels.length === 0) return euro(0);
  let som = 0;
  for (const regel of regels) {
    if (regel.bedragGetal == null) return null;
    som += regel.bedragGetal;
  }
  return euro(som);
}

function wanneerVan(regel: BetaalBron, groep: BetaalGroep): string {
  if (groep === 'ontvangen') return regel.ontvangenOp;
  if (groep === 'open') return regel.vervaldatum;
  return regel.ontvangenOp || regel.vervaldatum;
}

export function financienBeeld(input: {
  boekingen: readonly BetaalBoeking[];
  betalingen: readonly BetaalBron[];
  hrefVoorBoeking: (id: string) => string;
  financeHref: string;
  naarBoeking: boolean;
}): FinancienBeeld {
  const boekingen = new Map(input.boekingen.map((boeking) => [boeking.id, boeking]));
  const open: BetaalWeergave[] = [];
  const ontvangen: BetaalWeergave[] = [];
  const geannuleerd: BetaalWeergave[] = [];
  const afwijkingen: BetaalWeergave[] = [];

  const hrefVoor = (boekingId: string): string => {
    if (input.naarBoeking && boekingId) return input.hrefVoorBoeking(boekingId);
    return `${input.financeHref}#${encodeURIComponent(boekingId || 'regel')}`;
  };

  for (const regel of input.betalingen) {
    const boeking = boekingen.get(regel.boekingId);
    const bedragGetal = Number.isFinite(regel.bedrag) ? regel.bedrag : null;
    const titel = boeking?.huurder || boeking?.titel || 'Betaalregel zonder boeking';
    const soort = betaalSoortLabel(regel.soort);
    const basis = {
      id: regel.id,
      titel,
      bedrag: euro(regel.bedrag),
      bedragGetal,
      href: hrefVoor(regel.boekingId),
    };

    if (!STATUS.has(regel.status) || bedragGetal == null) {
      afwijkingen.push({
        ...basis,
        groep: 'afwijking',
        toelichting: !STATUS.has(regel.status)
          ? `${soort}. De betaalstatus ${betaalStatusLabel(regel.status)} komt niet uit de bekende waarden.`
          : `${soort}. Het bedrag is niet te lezen.`,
        wanneer: wanneerVan(regel, 'afwijking'),
      });
      continue;
    }

    if (regel.status === 'geannuleerd') {
      geannuleerd.push({
        ...basis,
        groep: 'geannuleerd',
        toelichting: `${soort}. De betaalregel zelf is geannuleerd.`,
        wanneer: wanneerVan(regel, 'geannuleerd'),
      });
      continue;
    }

    if (regel.status === 'ontvangen') {
      const gestopt = boeking ? GESTOPT.has(boeking.status) : false;
      ontvangen.push({
        ...basis,
        groep: 'ontvangen',
        toelichting: gestopt
          ? `${soort}. Ontvangen. De boeking is daarna stopgezet.`
          : `${soort}. Ontvangen.`,
        wanneer: wanneerVan(regel, 'ontvangen'),
      });
      continue;
    }

    if (!boeking) {
      afwijkingen.push({
        ...basis,
        groep: 'afwijking',
        toelichting: `${soort}. Open, maar er is geen bijbehorende boeking.`,
        wanneer: regel.vervaldatum,
      });
      continue;
    }

    if (GESTOPT.has(boeking.status)) {
      const reden =
        boeking.status === 'geannuleerd'
          ? 'Geannuleerde boeking met openstaande betaalregel.'
          : boeking.status === 'afgewezen'
            ? 'Afgewezen boeking met openstaande betaalregel.'
            : 'Gearchiveerde boeking met openstaande betaalregel.';
      afwijkingen.push({
        ...basis,
        groep: 'afwijking',
        toelichting: `${soort}. ${reden}`,
        wanneer: regel.vervaldatum,
      });
      continue;
    }

    if (!LOOPT.has(boeking.status)) {
      afwijkingen.push({
        ...basis,
        groep: 'afwijking',
        toelichting: `${soort}. Open bij een boeking waarvan de status niet als lopend bekend is.`,
        wanneer: regel.vervaldatum,
      });
      continue;
    }

    open.push({
      ...basis,
      groep: 'open',
      toelichting: `${soort}. Open.`,
      wanneer: regel.vervaldatum,
    });
  }

  const perBoeking = new Map<string, BetaalBron[]>();
  for (const regel of input.betalingen) {
    const lijst = perBoeking.get(regel.boekingId) ?? [];
    lijst.push(regel);
    perBoeking.set(regel.boekingId, lijst);
  }
  for (const boeking of input.boekingen) {
    const regels = perBoeking.get(boeking.id) ?? [];
    const bol = bolVoorSoort(regels, 'aanbetaling');
    if (bol === 'tegenstrijdig') {
      afwijkingen.push({
        id: `vlag-${boeking.id}`,
        groep: 'afwijking',
        titel: boeking.huurder || boeking.titel,
        toelichting: 'De aanbetalingsregels spreken elkaar tegen. Er is geen nieuwe status van gemaakt.',
        bedrag: '',
        bedragGetal: null,
        href: hrefVoor(boeking.id),
        wanneer: '',
      });
      continue;
    }
    if (bol === 'onbekend' || bol === 'niet_zichtbaar') continue;
    const ontvangen = bol === 'afgerond';
    if (boeking.aanbetalingBinnen !== ontvangen) {
      afwijkingen.push({
        id: `vlag-${boeking.id}`,
        groep: 'afwijking',
        titel: boeking.huurder || boeking.titel,
        toelichting: 'De oude aanbetalingsvlag wijkt af van de betaalregels. De betaalregels blijven leidend.',
        bedrag: '',
        bedragGetal: null,
        href: hrefVoor(boeking.id),
        wanneer: '',
      });
    }
  }

  const sorteerOpen = (a: BetaalWeergave, b: BetaalWeergave) =>
    (a.wanneer || '9999').localeCompare(b.wanneer || '9999') || a.titel.localeCompare(b.titel, 'nl');
  open.sort(sorteerOpen);
  afwijkingen.sort((a, b) => a.titel.localeCompare(b.titel, 'nl') || a.toelichting.localeCompare(b.toelichting, 'nl'));
  ontvangen.sort((a, b) => (b.wanneer || '').localeCompare(a.wanneer || '') || a.titel.localeCompare(b.titel, 'nl'));
  geannuleerd.sort(sorteerOpen);

  return {
    open,
    ontvangen,
    geannuleerd,
    afwijkingen,
    totaalOpen: totaalVan(open),
    totaalOntvangen: totaalVan(ontvangen),
  };
}
