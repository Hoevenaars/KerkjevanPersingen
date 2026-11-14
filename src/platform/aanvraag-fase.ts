/**
 * Zichtbare fases voor het aanvraagdossier.
 * De opgeslagen status blijft de bestaande enum. Gereed is afgeleid.
 */

import { periodesOverlappen } from './datum.ts';
import { periodeLabel } from './verhuur-overzicht.ts';
import type { AanvraagStatus } from './types.ts';

export const TECHNISCHE_STATUSSEN = [
  'nieuw',
  'in_behandeling',
  'wacht_op_aanvrager',
  'goedgekeurd',
  'afgewezen',
  'gesloten',
] as const;

export const FASE_FILTERS = ['alle', 'nieuw', 'in_behandeling', 'gereed', 'afgesloten'] as const;

export type AanvraagFase = 'nieuw' | 'in_behandeling' | 'gereed' | 'afgewezen' | 'gesloten';
export type FaseFilter = (typeof FASE_FILTERS)[number];
export type BeschikbaarUitkomst = 'beschikbaar' | 'aanvraag' | 'bezet' | 'onvolledig';

/** Zelfde bezetting als public.publieke_bezetting. */
const BEZETTENDE_BOEKING = ['optie', 'definitief', 'migratie_vastgelegd', 'optie_verlopen'] as const;

/** Bestaande boeking die al definitief is, ook zonder contract of aanbetaling. */
const DEFINITIEVE_BOEKING = ['definitief', 'afgerond', 'gearchiveerd', 'migratie_vastgelegd'] as const;

const ACTIEVE_AANVRAAG = ['nieuw', 'in_behandeling', 'wacht_op_aanvrager', 'goedgekeurd'] as const;

const STOPT_AANVRAAG = ['geannuleerd', 'afgewezen', 'afgerond', 'gearchiveerd'] as const;

export const FASE_LABEL: Record<AanvraagFase, string> = {
  nieuw: 'Nieuw',
  in_behandeling: 'In behandeling',
  gereed: 'Gereed',
  afgewezen: 'Afgewezen',
  gesloten: 'Gesloten',
};

export interface FaseAanvraag {
  id: string;
  status: string;
  naam: string;
  start: string;
  eind: string;
  boekingId?: string;
}

export interface FaseBoeking {
  id: string;
  nummer: string;
  status: string;
  start: string;
  eind: string;
  titel: string;
  huurder: string;
  aanbetalingBinnen: boolean;
  aanvraagId?: string;
}

export interface FaseDocument {
  boekingId: string;
  soort: string;
  naam: string;
}

export interface FaseMail {
  boekingId: string;
  template: string;
  status: string;
}

export interface FaseBetaling {
  boekingId: string;
  soort: string;
  status: string;
}

export interface FaseBlokkade {
  id: string;
  titel: string;
  start: string;
  eind: string;
  blokkeert: boolean;
}

export interface FaseActiviteit {
  id: string;
  titel: string;
  start: string;
  eind: string;
  zichtbaarheid: string;
  levenscyclus: string;
}

export interface FaseWereld {
  aanvragen: readonly FaseAanvraag[];
  boekingen: readonly FaseBoeking[];
  documenten: readonly FaseDocument[];
  mails: readonly FaseMail[];
  betalingen: readonly FaseBetaling[];
  blokkades: readonly FaseBlokkade[];
  activiteiten: readonly FaseActiviteit[];
}

export interface ConflictRegel {
  naam: string;
  periode: string;
  tekst: string;
  href: string;
}

export interface Beschikbaarheid {
  uitkomst: BeschikbaarUitkomst;
  kop: string;
  tekst: string;
  blokkades: ConflictRegel[];
  aanvragen: ConflictRegel[];
}

export interface Checklist {
  verzonden: boolean;
  ondertekend: boolean;
  aanbetaling: boolean;
  aanbetalingTekst: string;
  compleet: boolean;
}

export interface AanvraagBeeld {
  fase: AanvraagFase;
  faseLabel: string;
  volgendeActie: string;
  toon: 'groen' | 'oranje' | 'rood';
  beschikbaarheid: Beschikbaarheid;
  checklist: Checklist;
  boeking: FaseBoeking | null;
  geschikt: boolean;
}

export interface AanvraagFilter {
  modus: 'fase' | 'technisch' | 'onbekend';
  fase: FaseFilter;
  technisch: AanvraagStatus | null;
  melding: string;
}

function periodeVan(start: string, eind: string): { start: string; eind: string } | null {
  const van = (start || '').slice(0, 10);
  const tot = (eind || start || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(van) || !/^\d{4}-\d{2}-\d{2}$/.test(tot) || tot < van) return null;
  return { start: van, eind: tot };
}

function overlapt(a: { start: string; eind: string }, b: { start: string; eind: string }): boolean {
  return periodesOverlappen(a, b);
}

export function isDefinitieveBoeking(status: string | undefined): boolean {
  return Boolean(status && (DEFINITIEVE_BOEKING as readonly string[]).includes(status));
}

function boekingBezet(status: string): boolean {
  return (BEZETTENDE_BOEKING as readonly string[]).includes(status);
}

function normaliseer(waarde: string): string {
  return waarde.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function technischeStatus(waarde: string | null): AanvraagStatus | null {
  if (waarde && (TECHNISCHE_STATUSSEN as readonly string[]).includes(waarde)) return waarde as AanvraagStatus;
  return null;
}

export function leesAanvraagFilter(params: { get(naam: string): string | null }): AanvraagFilter {
  const status = params.get('status');
  const technisch = technischeStatus(status);
  if (technisch) {
    return { modus: 'technisch', fase: 'alle', technisch, melding: '' };
  }
  if (status) {
    if (status === 'gereed') return { modus: 'fase', fase: 'gereed', technisch: null, melding: '' };
    return {
      modus: 'onbekend',
      fase: 'alle',
      technisch: null,
      melding: 'Deze statusfilter bestaat niet meer. Hieronder staan alle aanvragen.',
    };
  }
  const fase = params.get('fase');
  if (!fase || fase === 'alle') return { modus: 'fase', fase: 'alle', technisch: null, melding: '' };
  if ((FASE_FILTERS as readonly string[]).includes(fase)) {
    return { modus: 'fase', fase: fase as FaseFilter, technisch: null, melding: '' };
  }
  return {
    modus: 'onbekend',
    fase: 'alle',
    technisch: null,
    melding: 'Deze filter bestaat niet. Hieronder staan alle aanvragen.',
  };
}

export function pastInFilter(fase: AanvraagFase, filter: AanvraagFilter, status: string): boolean {
  if (filter.modus === 'technisch' && filter.technisch) return status === filter.technisch;
  if (filter.fase === 'alle') return fase === 'nieuw' || fase === 'in_behandeling';
  if (filter.fase === 'afgesloten') return fase === 'afgewezen' || fase === 'gesloten';
  return fase === filter.fase;
}

function boekingBij(aanvraag: FaseAanvraag, wereld: FaseWereld): FaseBoeking | null {
  if (aanvraag.boekingId) {
    return wereld.boekingen.find((boeking) => boeking.id === aanvraag.boekingId) ?? null;
  }
  return wereld.boekingen.find((boeking) => boeking.aanvraagId && boeking.aanvraagId === aanvraag.id) ?? null;
}

function contractVorm(soort: string, naam: string): 'getekend' | 'contract' | 'geen' {
  const sleutel = `${normaliseer(soort)} ${normaliseer(naam)}`;
  if (/getekend/.test(sleutel)) return 'getekend';
  if (/contract|huurovereenkomst/.test(sleutel)) return 'contract';
  return 'geen';
}

export function checklistVan(boeking: FaseBoeking | null, wereld: FaseWereld): Checklist {
  if (!boeking) {
    return {
      verzonden: false,
      ondertekend: false,
      aanbetaling: false,
      aanbetalingTekst: 'Nog geen boeking',
      compleet: false,
    };
  }
  const documenten = wereld.documenten.filter((document) => document.boekingId === boeking.id);
  const vormen = documenten.map((document) => contractVorm(document.soort, document.naam));
  const mailVerzonden = wereld.mails.some((mail) => {
    if (mail.boekingId !== boeking.id || mail.status !== 'verzonden') return false;
    return /contract|huurovereenkomst/i.test(mail.template);
  });
  const ondertekend = vormen.includes('getekend');
  const verzonden = ondertekend || vormen.includes('contract') || mailVerzonden;
  const regels = wereld.betalingen.filter((regel) => {
    return regel.boekingId === boeking.id && normaliseer(regel.soort) === 'aanbetaling' && regel.status !== 'geannuleerd';
  });
  const ontvangenRegel = regels.some((regel) => regel.status === 'ontvangen');
  const openRegel = regels.some((regel) => regel.status === 'open');
  let aanbetaling = false;
  let aanbetalingTekst = 'Nog niet ontvangen';
  if (ontvangenRegel && openRegel) {
    aanbetalingTekst = 'De betaalregel en de aanbetalingsvlag spreken elkaar tegen. Controleer de bestaande administratie.';
  } else if (ontvangenRegel) {
    aanbetaling = true;
    aanbetalingTekst = 'Ontvangen';
  } else if (regels.length === 0 && boeking.aanbetalingBinnen) {
    aanbetaling = true;
    aanbetalingTekst = 'Ontvangen';
  } else if (openRegel) {
    aanbetalingTekst = 'Nog niet ontvangen';
  }
  return {
    verzonden,
    ondertekend,
    aanbetaling,
    aanbetalingTekst,
    compleet: verzonden && ondertekend && aanbetaling,
  };
}

export function beschikbaarheidVoor(aanvraag: FaseAanvraag, wereld: FaseWereld): Beschikbaarheid {
  const periode = periodeVan(aanvraag.start, aanvraag.eind);
  if (!periode) {
    return {
      uitkomst: 'onvolledig',
      kop: 'Periode ontbreekt',
      tekst: 'Zonder begin- en einddatum kan de beschikbaarheid niet worden gecontroleerd.',
      blokkades: [],
      aanvragen: [],
    };
  }
  const eigenBoekingId = aanvraag.boekingId || '';
  const blokkades: ConflictRegel[] = [];
  const bezettend = wereld.boekingen.filter((boeking) => boeking.id !== eigenBoekingId && boekingBezet(boeking.status));
  for (const boeking of bezettend) {
    const venster = periodeVan(boeking.start, boeking.eind);
    if (!venster || !overlapt(periode, venster)) continue;
    const optie = boeking.status === 'optie' || boeking.status === 'optie_verlopen';
    const gekoppelde = wereld.aanvragen.find((ander) => ander.boekingId === boeking.id || ander.id === boeking.aanvraagId);
    blokkades.push({
      naam: boeking.huurder || boeking.titel || boeking.nummer,
      periode: periodeLabel(venster.start, venster.eind),
      tekst: optie
        ? 'Lopende optie, nog geen definitieve boeking'
        : boeking.status === 'migratie_vastgelegd'
          ? 'Vastgelegde boeking'
          : 'Definitieve boeking',
      href: gekoppelde
        ? `/beheer/aanvragen/${encodeURIComponent(gekoppelde.id)}/`
        : `/beheer/boekingen/${encodeURIComponent(boeking.id)}/`,
    });
  }
  for (const blok of wereld.blokkades) {
    if (!blok.blokkeert) continue;
    const venster = periodeVan(blok.start, blok.eind);
    if (!venster || !overlapt(periode, venster)) continue;
    blokkades.push({
      naam: blok.titel || 'Blokkade',
      periode: periodeLabel(venster.start, venster.eind),
      tekst: /winter|kerst/i.test(blok.titel) ? 'Winterstop of sluiting' : 'Blokkade',
      href: '/beheer/verhuur/',
    });
  }
  for (const activiteit of wereld.activiteiten) {
    if (activiteit.levenscyclus === 'geannuleerd') continue;
    if (activiteit.zichtbaarheid !== 'publiek' && activiteit.zichtbaarheid !== 'bezet') continue;
    const venster = periodeVan(activiteit.start, activiteit.eind);
    if (!venster || !overlapt(periode, venster)) continue;
    const gedekt = wereld.boekingen.some((boeking) => {
      if (!boekingBezet(boeking.status)) return false;
      const boekVenster = periodeVan(boeking.start, boeking.eind);
      return Boolean(boekVenster && overlapt(venster, boekVenster));
    });
    if (gedekt) continue;
    blokkades.push({
      naam: activiteit.titel || 'Activiteit',
      periode: periodeLabel(venster.start, venster.eind),
      tekst: 'Blokkerende activiteit',
      href: '/beheer/agenda/',
    });
  }

  const aanvragen: ConflictRegel[] = [];
  for (const ander of wereld.aanvragen) {
    if (ander.id === aanvraag.id) continue;
    if (!(ACTIEVE_AANVRAAG as readonly string[]).includes(ander.status)) continue;
    const venster = periodeVan(ander.start, ander.eind);
    if (!venster || !overlapt(periode, venster)) continue;
    const boeking = boekingBij(ander, wereld);
    if (boeking && (STOPT_AANVRAAG as readonly string[]).includes(boeking.status)) continue;
    if (boeking && isDefinitieveBoeking(boeking.status)) continue;
    aanvragen.push({
      naam: ander.naam,
      periode: periodeLabel(venster.start, venster.eind),
      tekst: ander.status === 'nieuw' ? 'Nieuw' : 'In behandeling',
      href: `/beheer/aanvragen/${encodeURIComponent(ander.id)}/`,
    });
  }

  if (blokkades.length > 0) {
    return {
      uitkomst: 'bezet',
      kop: 'Bezet',
      tekst: 'Goedkeuren is niet mogelijk zolang deze blokkade bestaat. Een lopende aanvraag is iets anders dan een definitieve boeking.',
      blokkades,
      aanvragen,
    };
  }
  if (aanvragen.length > 0) {
    return {
      uitkomst: 'aanvraag',
      kop: 'Andere aanvraag loopt',
      tekst: 'Er is nog geen definitieve boeking. Goedkeuren kan pas nadat deze aanvraag is beoordeeld en het conflict is opgelost.',
      blokkades: [],
      aanvragen,
    };
  }
  return {
    uitkomst: 'beschikbaar',
    kop: 'Beschikbaar',
    tekst: 'Geen overlappende boeking, blokkade of lopende aanvraag. De aanvraag kan worden goedgekeurd.',
    blokkades: [],
    aanvragen: [],
  };
}

function toonVan(fase: AanvraagFase, actie: string): 'groen' | 'oranje' | 'rood' {
  if (fase === 'afgewezen' || actie === 'Conflict oplossen') return 'rood';
  if (fase === 'gereed' || actie === 'Geen actie') return 'groen';
  return 'oranje';
}

export function beoordeelAanvraag(aanvraag: FaseAanvraag, wereld: FaseWereld): AanvraagBeeld {
  const boeking = boekingBij(aanvraag, wereld);
  const checklist = checklistVan(boeking, wereld);
  const beschikbaarheid = beschikbaarheidVoor(aanvraag, wereld);
  const geschikt = aanvraag.status === 'in_behandeling' || aanvraag.status === 'goedgekeurd' || aanvraag.status === 'wacht_op_aanvrager';
  let fase: AanvraagFase;
  if (aanvraag.status === 'afgewezen') fase = 'afgewezen';
  else if (aanvraag.status === 'gesloten') fase = 'gesloten';
  else if (boeking && isDefinitieveBoeking(boeking.status)) fase = 'gereed';
  else if (
    (aanvraag.status === 'wacht_op_aanvrager' || aanvraag.status === 'goedgekeurd' || (aanvraag.status === 'in_behandeling' && boeking))
    && checklist.compleet
    && beschikbaarheid.uitkomst === 'beschikbaar'
  ) fase = 'gereed';
  else if (aanvraag.status === 'nieuw' || (aanvraag.status === 'in_behandeling' && !boeking)) fase = 'nieuw';
  else fase = 'in_behandeling';

  let volgendeActie = 'Geen actie';
  if (fase === 'nieuw') {
    if (aanvraag.status === 'nieuw') volgendeActie = 'Geschiktheid beoordelen';
    else if (beschikbaarheid.uitkomst === 'onvolledig') volgendeActie = 'Periode ontbreekt';
    else if (beschikbaarheid.uitkomst === 'bezet' || beschikbaarheid.uitkomst === 'aanvraag') volgendeActie = 'Conflict oplossen';
    else volgendeActie = 'Goedkeuren en in behandeling nemen';
  } else if (fase === 'in_behandeling') {
    if (aanvraag.status === 'wacht_op_aanvrager') volgendeActie = 'Wachten op de aanvrager';
    else if (!boeking) volgendeActie = 'Goedkeuren en in behandeling nemen';
    else if (beschikbaarheid.uitkomst === 'bezet' || beschikbaarheid.uitkomst === 'aanvraag') volgendeActie = 'Conflict oplossen';
    else if (!checklist.verzonden) volgendeActie = 'Contract verzenden';
    else if (!checklist.ondertekend) volgendeActie = 'Wachten op ondertekening';
    else if (!checklist.aanbetaling) volgendeActie = 'Aanbetaling controleren';
    else volgendeActie = 'Klaar voor definitieve boeking';
  }

  return {
    fase,
    faseLabel: FASE_LABEL[fase],
    volgendeActie,
    toon: toonVan(fase, volgendeActie),
    beschikbaarheid,
    checklist,
    boeking,
    geschikt,
  };
}

export function magGoedkeuren(beeld: AanvraagBeeld, status: string): { ok: boolean; melding?: string } {
  if (status !== 'in_behandeling') {
    return { ok: false, melding: 'Beoordeel eerst of de activiteit in het Kerkje van Persingen past.' };
  }
  if (beeld.beschikbaarheid.uitkomst === 'onvolledig') {
    return { ok: false, melding: 'De aanvraag heeft geen periode.' };
  }
  if (beeld.beschikbaarheid.uitkomst === 'bezet') {
    const namen = beeld.beschikbaarheid.blokkades.map((regel) => regel.naam).join(', ');
    return { ok: false, melding: `Niet goedgekeurd. De periode is bezet: ${namen}.` };
  }
  if (beeld.beschikbaarheid.uitkomst === 'aanvraag') {
    const namen = beeld.beschikbaarheid.aanvragen.map((regel) => regel.naam).join(', ');
    return { ok: false, melding: `Niet goedgekeurd. Er loopt nog een andere aanvraag: ${namen}.` };
  }
  return { ok: true };
}
