/**
 * Excel-achtige verhuuragenda en het bijbehorende dossier.
 * Alleen afleiden uit bestaande gegevens. Geen mail, geen betaling, geen publicatie.
 * De boolean aanbetaling_ontvangen wordt hier niet gelezen.
 */

import type { BeheerSnapshot } from './beheer-bron.ts';
import { dagenInPeriode, formatWeekendLabel, isZaterdag, isZondag, periodesOverlappen, voegDagenToe, weekdag } from './datum.ts';
import { BOEKING_LABEL, SOORT_LABEL, formatNl } from './demo-data.ts';
import { gastherenVoorKoppeling } from './gastheer-lijst.ts';
import type { BeheerBetaling, BeheerToewijzing } from './beheer-supabase-lees.ts';

export const STUK_BRONNEN = [
  'aanvraag_foto',
  'content_intake',
  'document',
  'aanvraag_tekst',
  'activiteit_tekst',
  'activiteit_foto',
] as const;

export type StukBron = (typeof STUK_BRONNEN)[number];

/**
 * Wat het scherm mag verwachten. Ontbrekende verplichtingen horen hier,
 * niet verspreid door de pagina. Een lege lijst betekent: niet eisen.
 * Historische import zonder digitaal bestand blijft "onbekend", geen vinkje.
 */
export const VERHUUR_REGELS = {
  gastheerVerwachtBij: ['expositie'],
  gastheerVerwachtBijStatus: ['definitief', 'optie', 'migratie_vastgelegd'],
  fotoVerwachtBij: ['expositie'],
  tekstVerwachtBij: ['expositie'],
  stukkenVerplichtVanaf: '2026-11-08',
  stukkenVerplichtBijStatus: ['definitief', 'optie', 'migratie_vastgelegd'],
  contractOntbreektBijStatus: ['optie', 'definitief'],
  contractOnbekendIsAandachtBijStatus: ['optie', 'definitief'],
  publicatieControlerenBij: ['expositie'],
  publicatieControlerenBijStatus: ['definitief', 'optie'],
  bezetStatus: ['optie', 'definitief', 'migratie_vastgelegd', 'optie_verlopen', 'afgerond'],
  dubbelTeltStatus: ['optie', 'definitief', 'migratie_vastgelegd', 'optie_verlopen'],
};

export type VerhuurRegels = typeof VERHUUR_REGELS;

export type StatusToon = 'klaar' | 'open' | 'actie' | 'onbekend' | 'leeg';

export interface StatusWeergave {
  toon: StatusToon;
  tekst: string;
}

export interface VerhuurBoeking {
  id: string;
  nummer: string;
  status: string;
  soort: string;
  titel: string;
  start: string;
  eind: string;
  huurder: string;
  email: string;
  telefoon: string;
  adres: string;
  relatieId: string;
  gastheerId: string;
  notities: string;
  toelichting: string;
  medeExposanten: string;
  tarief: string;
  aanvraagId: string;
}

export interface VerhuurBetaling {
  boekingId: string;
  soort: string;
  bedrag: number;
  status: string;
  vervaldatum: string;
  ontvangenOp: string;
}

export interface VerhuurDocument {
  id: string;
  boekingId: string;
  naam: string;
  soort: string;
  url: string;
}

export interface VerhuurActiviteit {
  boekingId: string;
  titel: string;
  omschrijving: string;
  korte: string;
  volledige: string;
  fotoPad: string;
  inhoudStatus: string;
  versie: string;
  gepubliceerd: boolean;
  trigger: string;
  levenscyclus: string;
  exposanten: string;
  praktisch: string;
}

export interface VerhuurIntern {
  id: string;
  titel: string;
  start: string;
  eind: string;
  blokkeert: boolean;
}

export interface VerhuurRelatie {
  id: string;
  naam: string;
  organisatie: string;
  email: string;
  telefoon: string;
  adres: string;
  notities: string;
}

export interface VerhuurAanvraag {
  id: string;
  boekingId: string;
  naam: string;
  email: string;
  telefoon: string;
  adres: string;
  medeExposanten: string;
  toelichting: string;
  website: string;
  organisatie: string;
}

export interface VerhuurStuk {
  bron: StukBron;
  bronId: string;
  versie: string;
  boekingId: string;
  titel: string;
  soort: 'foto' | 'document' | 'tekst';
  url: string;
  tekst: string;
}

export interface VerhuurBeoordeling {
  boekingId: string;
  bron: string;
  bronId: string;
  versie: string;
  status: string;
  reden: string;
  door: string;
  op: string;
}

export interface VerhuurVerzending {
  boekingId: string;
  status: string;
  verzondenOp: string;
  test: boolean;
  contract: boolean;
}

export interface VerhuurJob {
  boekingId: string;
  template: string;
  status: string;
  wanneer: string;
}

export interface VerhuurAudit {
  boekingId: string;
  actie: string;
  wanneer: string;
  actor: string;
  reden: string;
}

export interface VerhuurToewijzing {
  id: string;
  boekingId: string;
  relatieId: string;
  naam: string;
  type: string;
  datum: string;
}

export interface VerhuurGastheer {
  id: string;
  naam: string;
  actief: boolean;
}

export interface VerhuurBron {
  vandaag: string;
  jaar: number;
  maand: number | 'alle';
  boekingen: VerhuurBoeking[];
  betalingen: VerhuurBetaling[];
  documenten: VerhuurDocument[];
  activiteiten: VerhuurActiviteit[];
  intern: VerhuurIntern[];
  relaties: VerhuurRelatie[];
  gastheren: VerhuurGastheer[];
  toewijzingen: VerhuurToewijzing[];
  aanvragen: VerhuurAanvraag[];
  stukken: VerhuurStuk[];
  beoordelingen: VerhuurBeoordeling[];
  verzendingen: VerhuurVerzending[];
  jobs: VerhuurJob[];
  audit: VerhuurAudit[];
  magAudit: boolean;
  stukkenGeladen: boolean;
  beoordelingOpslag: boolean;
  regels?: Partial<VerhuurRegels>;
}

export interface AandachtPunt {
  id: string;
  tekst: string;
  anker: string;
}

export interface AgendaRij {
  sleutel: string;
  start: string;
  eind: string;
  datum: string;
  huurder: string;
  activiteit: string;
  contract: StatusWeergave;
  stukken: StatusWeergave;
  aanbetaling: StatusWeergave;
  restant: StatusWeergave;
  gastheer: string;
  bijzonderheid: string;
  boekingId: string;
  openDossier: boolean;
}

export interface DossierStuk {
  titel: string;
  status: StatusWeergave;
  soort: 'foto' | 'document' | 'tekst' | 'ontbreekt';
  url: string;
  tekst: string;
  bron: string;
  bronId: string;
  versie: string;
  door: string;
  op: string;
  reden: string;
  kanBeoordelen: boolean;
}

export interface DossierModel {
  boekingId: string;
  titel: string;
  samenvatting: string;
  aandacht: AandachtPunt[];
  huurder: { label: string; waarde: string }[];
  relatieHistorie: string[];
  boeking: { label: string; waarde: string }[];
  stukken: DossierStuk[];
  stukkenToelichting: string;
  contract: { status: StatusWeergave; toelichting: string; documenten: { naam: string; url: string }[] };
  gastheren: {
    toegewezen: { id: string; naam: string; toelichting: string; primair: boolean }[];
    keuzes: { id: string; naam: string }[];
    leeg: string;
  };
  betaling: {
    regels: { label: string; waarde: string }[];
    aanbetaling: StatusWeergave;
    restant: StatusWeergave;
    toelichting: string;
  };
  historie: { wanneer: string; tekst: string }[];
  historieToelichting: string;
  opslagMelding: string;
}

export interface GastheerBesluit {
  doen: 'niets' | 'opslaan' | 'vragen';
  gastheerId: string;
  melding: string;
  vraag: '' | 'vervangen' | 'overlap' | 'vervangen-overlap' | 'verwijderen';
}

const LEEG: StatusWeergave = { toon: 'leeg', tekst: '—' };
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

export function inhoudHash(tekst: string): string {
  let hash = 2166136261;
  for (let i = 0; i < tekst.length; i += 1) {
    hash ^= tekst.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function euro(bedrag: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(bedrag);
}

export function huurbedrag(tarief: string): string {
  const bedrag = Number(tarief);
  if (!tarief.trim() || !Number.isFinite(bedrag)) return 'Onbekend';
  return euro(bedrag);
}

export function leesVerhuurSelectie(
  params: URLSearchParams,
  vandaag: string,
): { jaar: number; maand: number | 'alle' } {
  const vandaagJaar = Number(vandaag.slice(0, 4));
  const vandaagMaand = Number(vandaag.slice(5, 7));
  const jaarRuw = Number(params.get('jaar'));
  const jaar = Number.isInteger(jaarRuw) && jaarRuw >= 2000 && jaarRuw <= 2100 ? jaarRuw : vandaagJaar;
  const maandRuw = params.get('maand');
  if (maandRuw === 'alle') return { jaar, maand: 'alle' };
  const maand = Number(maandRuw);
  if (Number.isInteger(maand) && maand >= 1 && maand <= 12) return { jaar, maand };
  return { jaar, maand: vandaagMaand || 1 };
}

function regelsVan(bron: VerhuurBron): VerhuurRegels {
  return { ...VERHUUR_REGELS, ...bron.regels };
}

function inLijst(lijst: readonly string[], waarde: string): boolean {
  return lijst.includes(waarde);
}

function periodeVan(jaar: number, maand: number | 'alle'): { start: string; eind: string } {
  if (maand === 'alle') return { start: `${jaar}-01-01`, eind: `${jaar}-12-31` };
  const mm = String(maand).padStart(2, '0');
  const laatste = new Date(Date.UTC(jaar, maand, 0)).getUTCDate();
  return { start: `${jaar}-${mm}-01`, eind: `${jaar}-${mm}-${String(laatste).padStart(2, '0')}` };
}

function weekendenIn(start: string, eind: string): { zaterdag: string; zondag: string }[] {
  const uit: { zaterdag: string; zondag: string }[] = [];
  let zaterdag = isZaterdag(start) ? start : voegDagenToe(start, isZondag(start) ? -1 : 6 - weekdag(start));
  if (zaterdag > start && voegDagenToe(zaterdag, 1) < start) zaterdag = voegDagenToe(zaterdag, -7);
  let veilig = 0;
  while (zaterdag <= eind && veilig < 60) {
    const zondag = voegDagenToe(zaterdag, 1);
    if (zondag >= start && zaterdag <= eind) uit.push({ zaterdag, zondag });
    zaterdag = voegDagenToe(zaterdag, 7);
    veilig += 1;
  }
  return uit;
}

function datumLabel(start: string, eind: string): string {
  if (isZaterdag(start) && isZondag(eind) && eind === voegDagenToe(start, 1)) {
    return `za–zo · ${formatWeekendLabel(start, eind)}`;
  }
  if (start === eind) return formatNl(start);
  return `${formatNl(start)} – ${formatNl(eind)}`;
}

function soortLabel(soort: string, status: string): string {
  const naam = soort ? (SOORT_LABEL[soort] ?? soort) : 'Onbekend';
  if (status === 'geannuleerd') return `Geannuleerd · ${naam}`;
  if (status === 'optie' || status === 'optie_verlopen') return `${BOEKING_LABEL[status as 'optie']} · ${naam}`;
  return naam;
}

export function termijnStatus(regels: readonly VerhuurBetaling[], vandaag: string): StatusWeergave {
  if (regels.length === 0) return { toon: 'onbekend', tekst: 'Geen betaalregel' };
  const actief = regels.filter((regel) => regel.status !== 'geannuleerd');
  if (actief.length === 0) return { toon: 'open', tekst: 'Geannuleerd' };
  if (actief.every((regel) => regel.status === 'ontvangen')) return { toon: 'klaar', tekst: 'Ontvangen' };
  const open = actief.filter((regel) => regel.status === 'open');
  if (open.some((regel) => regel.vervaldatum && regel.vervaldatum < vandaag)) return { toon: 'actie', tekst: 'Te laat' };
  if (open.length > 0) return { toon: 'open', tekst: 'Nog open' };
  return { toon: 'onbekend', tekst: 'Status onbekend' };
}

function betalingenVan(bron: VerhuurBron, boekingId: string, soort?: string): VerhuurBetaling[] {
  return bron.betalingen.filter((regel) => regel.boekingId === boekingId && (soort == null || regel.soort === soort));
}

export function contractStatus(bron: VerhuurBron, boeking: VerhuurBoeking): StatusWeergave {
  const docs = bron.documenten.filter((doc) => doc.boekingId === boeking.id);
  if (docs.some((doc) => doc.soort === 'getekend_contract')) return { toon: 'klaar', tekst: 'Ondertekend' };
  const verzonden = bron.verzendingen.some((item) => (
    item.boekingId === boeking.id && item.contract && item.status === 'verzonden' && !item.test && Boolean(item.verzondenOp)
  ));
  if (verzonden) return { toon: 'open', tekst: 'Verstuurd' };
  if (docs.some((doc) => doc.soort === 'contract')) return { toon: 'open', tekst: 'Voorbereid' };
  const regels = regelsVan(bron);
  if (inLijst(regels.contractOntbreektBijStatus, boeking.status)) return { toon: 'actie', tekst: 'Ontbreekt' };
  return { toon: 'onbekend', tekst: 'Status onbekend' };
}

export function laatsteBeoordeling(lijst: readonly VerhuurBeoordeling[], stuk: Pick<VerhuurStuk, 'boekingId' | 'bron' | 'bronId' | 'versie'>): VerhuurBeoordeling | null {
  const passend = lijst.filter((item) => (
    item.boekingId === stuk.boekingId && item.bron === stuk.bron && item.bronId === stuk.bronId && item.versie === stuk.versie
  ));
  passend.sort((a, b) => b.op.localeCompare(a.op));
  const laatste = passend[0];
  if (!laatste) return null;
  if (laatste.status !== 'goedgekeurd' && laatste.status !== 'afgekeurd') return null;
  return laatste;
}

export function stukStatus(stuk: VerhuurStuk, beoordelingen: readonly VerhuurBeoordeling[]): StatusWeergave {
  const laatste = laatsteBeoordeling(beoordelingen, stuk);
  if (!laatste) return { toon: 'open', tekst: 'Te beoordelen' };
  if (laatste.status === 'goedgekeurd') return { toon: 'klaar', tekst: 'Goedgekeurd' };
  return { toon: 'actie', tekst: 'Afgekeurd' };
}

function activiteitVan(bron: VerhuurBron, boekingId: string): VerhuurActiviteit | undefined {
  return bron.activiteiten.find((item) => item.boekingId === boekingId && item.levenscyclus !== 'geannuleerd')
    ?? bron.activiteiten.find((item) => item.boekingId === boekingId);
}

function aanvraagVan(bron: VerhuurBron, boeking: VerhuurBoeking): VerhuurAanvraag | undefined {
  return bron.aanvragen.find((item) => item.id === boeking.aanvraagId || item.boekingId === boeking.id);
}

function verwachteOntbrekende(bron: VerhuurBron, boeking: VerhuurBoeking, stukken: readonly VerhuurStuk[]): string[] {
  const regels = regelsVan(bron);
  if (!bron.stukkenGeladen) return [];
  if (boeking.start < regels.stukkenVerplichtVanaf) return [];
  if (!inLijst(regels.stukkenVerplichtBijStatus, boeking.status)) return [];
  const ontbreekt: string[] = [];
  if (inLijst(regels.fotoVerwachtBij, boeking.soort) && !stukken.some((stuk) => stuk.soort === 'foto')) ontbreekt.push('Foto nog niet aangeleverd');
  if (inLijst(regels.tekstVerwachtBij, boeking.soort) && !stukken.some((stuk) => stuk.soort === 'tekst')) ontbreekt.push('Tekst nog niet aangeleverd');
  return ontbreekt;
}

export function stukkenVanBoeking(bron: VerhuurBron, boeking: VerhuurBoeking): VerhuurStuk[] {
  const eigen = bron.stukken.filter((stuk) => stuk.boekingId === boeking.id);
  const activiteit = activiteitVan(bron, boeking);
  const aanvraag = aanvraagVan(bron, boeking);
  const extra: VerhuurStuk[] = [];
  const tekst = [activiteit?.korte, activiteit?.volledige, activiteit?.omschrijving].filter(Boolean).join('\n\n');
  if (tekst.trim()) {
    extra.push({
      bron: 'activiteit_tekst',
      bronId: boeking.id,
      versie: `${activiteit?.versie || '0'}:${inhoudHash(tekst)}`,
      boekingId: boeking.id,
      titel: 'Beschrijving van de activiteit',
      soort: 'tekst',
      url: '',
      tekst: tekst.trim(),
    });
  }
  if (activiteit?.fotoPad) {
    const pad = activiteit.fotoPad;
    extra.push({
      bron: 'activiteit_foto',
      bronId: boeking.id,
      versie: pad,
      boekingId: boeking.id,
      titel: 'Foto bij de activiteit',
      soort: 'foto',
      url: pad.startsWith('http') || pad.startsWith('/') ? pad : '',
      tekst: '',
    });
  }
  if (aanvraag?.toelichting.trim()) {
    extra.push({
      bron: 'aanvraag_tekst',
      bronId: aanvraag.id,
      versie: inhoudHash(aanvraag.toelichting),
      boekingId: boeking.id,
      titel: 'Toelichting van de huurder',
      soort: 'tekst',
      url: '',
      tekst: aanvraag.toelichting.trim(),
    });
  }
  for (const doc of bron.documenten.filter((item) => item.boekingId === boeking.id)) {
    if (eigen.some((stuk) => stuk.bron === 'document' && stuk.bronId === doc.id)) continue;
    extra.push({
      bron: 'document',
      bronId: doc.id,
      versie: doc.id,
      boekingId: boeking.id,
      titel: doc.naam || 'Document',
      soort: 'document',
      url: doc.url,
      tekst: '',
    });
  }
  return [...eigen, ...extra];
}

export function stukkenKolom(bron: VerhuurBron, boeking: VerhuurBoeking): StatusWeergave {
  if (!bron.stukkenGeladen) return { toon: 'onbekend', tekst: 'Niet geladen' };
  const stukken = stukkenVanBoeking(bron, boeking);
  const ontbreekt = verwachteOntbrekende(bron, boeking, stukken);
  if (stukken.length === 0 && ontbreekt.length === 0) {
    const regels = regelsVan(bron);
    if (inLijst(regels.fotoVerwachtBij, boeking.soort) || inLijst(regels.tekstVerwachtBij, boeking.soort)) {
      return { toon: 'onbekend', tekst: 'Geen digitale stukken' };
    }
    return { toon: 'leeg', tekst: 'Geen stukken' };
  }
  const statussen = stukken.map((stuk) => stukStatus(stuk, bron.beoordelingen));
  if (statussen.some((status) => status.tekst === 'Afgekeurd')) return { toon: 'actie', tekst: 'Afgekeurd' };
  if (ontbreekt.length > 0) return { toon: 'actie', tekst: 'Niet aangeleverd' };
  if (statussen.some((status) => status.toon === 'open')) return { toon: 'open', tekst: 'Te beoordelen' };
  if (statussen.length > 0 && statussen.every((status) => status.toon === 'klaar')) return { toon: 'klaar', tekst: 'Goedgekeurd' };
  return { toon: 'onbekend', tekst: 'Status onbekend' };
}

function gastheerTekst(bron: VerhuurBron, boeking: VerhuurBoeking): string {
  const namen: string[] = [];
  if (boeking.gastheerId) {
    const naam = bron.gastheren.find((item) => item.id === boeking.gastheerId)?.naam
      || bron.relaties.find((item) => item.id === boeking.gastheerId)?.naam;
    if (naam) namen.push(naam);
  }
  for (const toe of bron.toewijzingen.filter((item) => item.boekingId === boeking.id)) {
    if (toe.naam && !namen.includes(toe.naam)) namen.push(toe.naam);
  }
  if (namen.length > 0) return namen.join(', ');
  const regels = regelsVan(bron);
  if (inLijst(regels.gastheerVerwachtBij, boeking.soort) && inLijst(regels.gastheerVerwachtBijStatus, boeking.status)) {
    return 'Nog toevoegen';
  }
  return '—';
}

function publicatieAandacht(bron: VerhuurBron, boeking: VerhuurBoeking): string[] {
  const regels = regelsVan(bron);
  if (!inLijst(regels.publicatieControlerenBij, boeking.soort)) return [];
  if (!inLijst(regels.publicatieControlerenBijStatus, boeking.status)) return [];
  const activiteit = activiteitVan(bron, boeking);
  if (!activiteit || activiteit.levenscyclus === 'geannuleerd' || activiteit.trigger === 'niet_publiceren') return [];
  const tekst = [activiteit.titel, activiteit.omschrijving, activiteit.korte, activiteit.volledige].some((deel) => deel.trim());
  if (!activiteit.titel.trim() || !tekst || !activiteit.fotoPad) return ['Websitegegevens nog niet compleet'];
  if (!activiteit.gepubliceerd) return ['Staat nog niet op de website'];
  return [];
}

export function aandachtVoorBoeking(bron: VerhuurBron, boeking: VerhuurBoeking): AandachtPunt[] {
  const punten: AandachtPunt[] = [];
  const regels = regelsVan(bron);
  if (bron.boekingen.some((ander) => (
    ander.id !== boeking.id
    && inLijst(regels.dubbelTeltStatus, boeking.status)
    && inLijst(regels.dubbelTeltStatus, ander.status)
    && periodesOverlappen(boeking, ander)
  ))) {
    punten.push({ id: 'dubbel', tekst: 'Mogelijke dubbele boeking', anker: 'vh-boeking' });
  }
  if (boeking.status === 'geannuleerd' || boeking.status === 'afgewezen' || boeking.status === 'gearchiveerd') {
    const open = betalingenVan(bron, boeking.id).filter((regel) => regel.status === 'open');
    if (open.length > 0) punten.push({ id: 'betaling', tekst: 'Betaling controleren', anker: 'vh-betaling' });
    return punten;
  }
  if (boeking.status === 'optie_verlopen') punten.push({ id: 'optie', tekst: 'Optie is verlopen', anker: 'vh-boeking' });
  const stukken = stukkenVanBoeking(bron, boeking);
  for (const tekst of verwachteOntbrekende(bron, boeking, stukken)) {
    punten.push({ id: `ontbreekt-${tekst}`, tekst, anker: 'vh-stukken' });
  }
  if (bron.stukkenGeladen) {
    for (const stuk of stukken) {
      const status = stukStatus(stuk, bron.beoordelingen);
      if (status.tekst === 'Te beoordelen') punten.push({ id: `stuk-${stuk.bron}-${stuk.bronId}`, tekst: `${stuk.titel} nog beoordelen`, anker: 'vh-stukken' });
      if (status.tekst === 'Afgekeurd') punten.push({ id: `stuk-${stuk.bron}-${stuk.bronId}`, tekst: `${stuk.titel} is afgekeurd`, anker: 'vh-stukken' });
    }
  }
  if (gastheerTekst(bron, boeking) === 'Nog toevoegen') {
    punten.push({ id: 'gastheer', tekst: 'Gastheer nog toevoegen', anker: 'vh-gastheren' });
  }
  const contract = contractStatus(bron, boeking);
  if (contract.tekst === 'Ontbreekt') punten.push({ id: 'contract', tekst: 'Contract ontbreekt', anker: 'vh-contract' });
  if (contract.tekst === 'Status onbekend' && inLijst(regels.contractOnbekendIsAandachtBijStatus, boeking.status)) {
    punten.push({ id: 'contract', tekst: 'Contractstatus onbekend', anker: 'vh-contract' });
  }
  const aanbetaling = termijnStatus(betalingenVan(bron, boeking.id, 'aanbetaling'), bron.vandaag);
  const restant = termijnStatus(betalingenVan(bron, boeking.id, 'restant'), bron.vandaag);
  if (aanbetaling.toon === 'actie' || restant.toon === 'actie') punten.push({ id: 'betaling', tekst: 'Betaling te laat', anker: 'vh-betaling' });
  else if (aanbetaling.tekst === 'Nog open' || restant.tekst === 'Nog open' || betalingenVan(bron, boeking.id).some((regel) => regel.status === 'open')) {
    punten.push({ id: 'betaling', tekst: 'Betaling controleren', anker: 'vh-betaling' });
  }
  for (const tekst of publicatieAandacht(bron, boeking)) punten.push({ id: 'publicatie', tekst, anker: 'vh-boeking' });
  if (!boeking.soort && inLijst(regels.bezetStatus, boeking.status)) {
    punten.push({ id: 'soort', tekst: 'Activiteitsoort onbekend', anker: 'vh-boeking' });
  }
  return punten;
}

function bijzonderheid(bron: VerhuurBron, boeking: VerhuurBoeking | null, vrijNaAnnulering: boolean): string {
  if (!boeking) return '—';
  const punten = aandachtVoorBoeking(bron, boeking);
  const delen: string[] = [];
  if (vrijNaAnnulering) delen.push('Weekend is weer vrij');
  if (punten.length === 1) delen.push(punten[0].tekst);
  if (punten.length > 1) delen.push(`${punten.length} zaken, waaronder: ${punten[0].tekst}`);
  if (delen.length === 0 && boeking.notities.trim()) return boeking.notities.trim().split('\n')[0].slice(0, 120);
  return delen.join('. ') || '—';
}

function rijVanBoeking(bron: VerhuurBron, boeking: VerhuurBoeking, sleutel: string, vrijNaAnnulering: boolean): AgendaRij {
  return {
    sleutel,
    start: boeking.start,
    eind: boeking.eind,
    datum: datumLabel(boeking.start, boeking.eind),
    huurder: boeking.huurder || 'Naam onbekend',
    activiteit: soortLabel(boeking.soort, boeking.status),
    contract: contractStatus(bron, boeking),
    stukken: stukkenKolom(bron, boeking),
    aanbetaling: termijnStatus(betalingenVan(bron, boeking.id, 'aanbetaling'), bron.vandaag),
    restant: termijnStatus(betalingenVan(bron, boeking.id, 'restant'), bron.vandaag),
    gastheer: gastheerTekst(bron, boeking),
    bijzonderheid: bijzonderheid(bron, boeking, vrijNaAnnulering),
    boekingId: boeking.id,
    openDossier: true,
  };
}

export function bouwAgenda(bron: VerhuurBron): AgendaRij[] {
  const periode = periodeVan(bron.jaar, bron.maand);
  const regels = regelsVan(bron);
  const rijen: AgendaRij[] = [];
  const gezien = new Set<string>();
  for (const weekend of weekendenIn(periode.start, periode.eind)) {
    const raakt = bron.boekingen.filter((boeking) => periodesOverlappen(boeking, { start: weekend.zaterdag, eind: weekend.zondag }));
    const bezet = raakt.filter((boeking) => inLijst(regels.bezetStatus, boeking.status));
    const blok = bron.intern.find((item) => item.blokkeert && periodesOverlappen(item, { start: weekend.zaterdag, eind: weekend.zondag }));
    if (raakt.length === 0 && blok) {
      rijen.push({
        sleutel: `blok-${weekend.zaterdag}-${blok.id}`,
        start: weekend.zaterdag,
        eind: weekend.zondag,
        datum: datumLabel(weekend.zaterdag, weekend.zondag),
        huurder: 'Geen verhuur',
        activiteit: blok.titel || 'Blokkade',
        contract: LEEG,
        stukken: LEEG,
        aanbetaling: LEEG,
        restant: LEEG,
        gastheer: '—',
        bijzonderheid: blok.blokkeert ? 'Verhuur geblokkeerd' : '—',
        boekingId: '',
        openDossier: false,
      });
      continue;
    }
    if (raakt.length === 0) {
      rijen.push({
        sleutel: `vrij-${weekend.zaterdag}`,
        start: weekend.zaterdag,
        eind: weekend.zondag,
        datum: datumLabel(weekend.zaterdag, weekend.zondag),
        huurder: 'Vrij',
        activiteit: '—',
        contract: LEEG,
        stukken: LEEG,
        aanbetaling: LEEG,
        restant: LEEG,
        gastheer: '—',
        bijzonderheid: '—',
        boekingId: '',
        openDossier: false,
      });
      continue;
    }
    const weerVrij = bezet.length === 0;
    for (const boeking of raakt) {
      const sleutel = `w-${weekend.zaterdag}-${boeking.id}`;
      gezien.add(`${boeking.id}:${weekend.zaterdag}`);
      rijen.push(rijVanBoeking(bron, boeking, sleutel, weerVrij && !inLijst(regels.bezetStatus, boeking.status)));
    }
  }
  for (const boeking of bron.boekingen) {
    if (!periodesOverlappen(boeking, periode)) continue;
    const dagen = dagenInPeriode(boeking.start, boeking.eind);
    const doordeweeks = dagen.some((dag) => dag >= periode.start && dag <= periode.eind && weekdag(dag) !== 0 && weekdag(dag) !== 6);
    const alOpWeekend = [...gezien].some((sleutel) => sleutel.startsWith(`${boeking.id}:`));
    if (!doordeweeks || alOpWeekend) continue;
    rijen.push(rijVanBoeking(bron, boeking, `dag-${boeking.id}`, false));
  }
  rijen.sort((a, b) => a.start.localeCompare(b.start) || a.datum.localeCompare(b.datum) || a.huurder.localeCompare(b.huurder, 'nl'));
  return rijen;
}

export function beschikbareJaren(bron: Pick<VerhuurBron, 'boekingen' | 'intern' | 'jaar'>): number[] {
  const jaren = new Set<number>([bron.jaar]);
  for (const item of [...bron.boekingen, ...bron.intern]) {
    const start = Number(item.start.slice(0, 4));
    const eind = Number(item.eind.slice(0, 4));
    if (start >= 2000 && start <= 2100) jaren.add(start);
    if (eind >= 2000 && eind <= 2100) jaren.add(eind);
  }
  return [...jaren].sort((a, b) => a - b);
}

function regel(label: string, waarde: string): { label: string; waarde: string } {
  return { label, waarde: waarde.trim() || '—' };
}

function betaalRegels(bron: VerhuurBron, boeking: VerhuurBoeking): DossierModel['betaling'] {
  const van = betalingenVan(bron, boeking.id);
  const ontvangen = van.filter((regel) => regel.status === 'ontvangen').reduce((som, regel) => som + regel.bedrag, 0);
  const open = van.filter((regel) => regel.status === 'open').reduce((som, regel) => som + regel.bedrag, 0);
  const verval = van.filter((regel) => regel.status === 'open' && regel.vervaldatum).map((regel) => regel.vervaldatum).sort()[0] ?? '';
  const totaal = huurbedrag(boeking.tarief);
  const afwijkend = van.filter((regel) => regel.soort === 'correctie' || regel.soort === 'restitutie' || regel.soort === 'historisch');
  return {
    aanbetaling: termijnStatus(van.filter((regel) => regel.soort === 'aanbetaling'), bron.vandaag),
    restant: termijnStatus(van.filter((regel) => regel.soort === 'restant'), bron.vandaag),
    toelichting: 'De bedragen komen uit de betaalregels. Een oud vinkje op de boeking telt niet mee. Vanuit dit scherm wordt geen betaling vastgelegd.',
    regels: [
      regel('Totaalbedrag', totaal),
      regel('Ontvangen', van.some((regel) => regel.status === 'ontvangen') ? euro(ontvangen) : 'Geen ontvangst in de betaalregels'),
      regel('Nog open', van.some((regel) => regel.status === 'open') ? euro(open) : 'Geen open bedrag in de betaalregels'),
      regel('Vervaldatum', verval ? formatNl(verval) : 'Geen vervaldatum'),
      regel('Afwijkende afspraak', afwijkend.length ? afwijkend.map((regel) => `${regel.soort}: ${euro(regel.bedrag)} (${regel.status})`).join('; ') : 'Geen'),
    ],
  };
}

export function bouwDossier(bron: VerhuurBron, boekingId: string): DossierModel | null {
  const boeking = bron.boekingen.find((item) => item.id === boekingId);
  if (!boeking) return null;
  const relatie = bron.relaties.find((item) => item.id === boeking.relatieId);
  const aanvraag = aanvraagVan(bron, boeking);
  const activiteit = activiteitVan(bron, boeking);
  const aandacht = aandachtVoorBoeking(bron, boeking);
  const stukken = stukkenVanBoeking(bron, boeking);
  const dossierStukken: DossierStuk[] = stukken.map((stuk) => {
    const laatste = laatsteBeoordeling(bron.beoordelingen, stuk);
    return {
      titel: stuk.titel,
      status: stukStatus(stuk, bron.beoordelingen),
      soort: stuk.soort,
      url: stuk.url,
      tekst: stuk.tekst,
      bron: stuk.bron,
      bronId: stuk.bronId,
      versie: stuk.versie,
      door: laatste?.door ?? '',
      op: laatste?.op ? formatNl(laatste.op.slice(0, 10)) : '',
      reden: laatste?.status === 'afgekeurd' ? laatste.reden : '',
      kanBeoordelen: true,
    };
  });
  for (const tekst of verwachteOntbrekende(bron, boeking, stukken)) {
    dossierStukken.push({
      titel: tekst,
      status: { toon: 'actie', tekst: 'Niet aangeleverd' },
      soort: 'ontbreekt',
      url: '',
      tekst: '',
      bron: '',
      bronId: '',
      versie: '',
      door: '',
      op: '',
      reden: '',
      kanBeoordelen: false,
    });
  }
  const contract = contractStatus(bron, boeking);
  const toegewezen: DossierModel['gastheren']['toegewezen'] = [];
  if (boeking.gastheerId) {
    const naam = bron.gastheren.find((item) => item.id === boeking.gastheerId)?.naam
      || bron.relaties.find((item) => item.id === boeking.gastheerId)?.naam
      || 'Onbekende gastheer';
    toegewezen.push({ id: boeking.gastheerId, naam, toelichting: 'Gastheer bij deze boeking', primair: true });
  }
  for (const toe of bron.toewijzingen.filter((item) => item.boekingId === boeking.id)) {
    if (toegewezen.some((item) => item.id === toe.relatieId && item.primair)) continue;
    const wanneer = toe.datum ? formatNl(toe.datum) : 'datum niet vastgelegd';
    toegewezen.push({
      id: toe.relatieId,
      naam: toe.naam || 'Onbekende gastheer',
      toelichting: `Eerder ingedeeld (${toe.type || 'dienst'}, ${wanneer}). Dit staat los van de gastheer hierboven.`,
      primair: false,
    });
  }
  const historie: { wanneer: string; tekst: string }[] = [];
  for (const item of bron.verzendingen.filter((regel) => regel.boekingId === boeking.id)) {
    if (item.status === 'verzonden' && !item.test && item.verzondenOp) {
      historie.push({ wanneer: item.verzondenOp.slice(0, 10), tekst: item.contract ? 'Contractmail verzonden' : 'E-mail verzonden' });
    }
  }
  for (const job of bron.jobs.filter((item) => item.boekingId === boeking.id)) {
    historie.push({ wanneer: job.wanneer, tekst: `${job.template || 'Bericht'} staat klaar. Er is geen verzendbewijs.` });
  }
  for (const item of bron.beoordelingen.filter((regel) => regel.boekingId === boeking.id)) {
    historie.push({
      wanneer: item.op.slice(0, 10),
      tekst: item.status === 'goedgekeurd'
        ? `Stuk goedgekeurd door ${item.door || 'een beheerder'}`
        : `Stuk afgekeurd door ${item.door || 'een beheerder'}${item.reden ? `: ${item.reden}` : ''}`,
    });
  }
  if (bron.magAudit) {
    for (const item of bron.audit.filter((regel) => regel.boekingId === boeking.id)) {
      historie.push({ wanneer: item.wanneer.slice(0, 10), tekst: `${item.actie}${item.actor ? ` · ${item.actor}` : ''}${item.reden ? ` · ${item.reden}` : ''}` });
    }
  }
  historie.sort((a, b) => b.wanneer.localeCompare(a.wanneer));
  const andere = bron.boekingen
    .filter((item) => item.id !== boeking.id && item.relatieId && item.relatieId === boeking.relatieId)
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, 8)
    .map((item) => `${formatNl(item.start)} · ${item.huurder} · ${soortLabel(item.soort, item.status)}`);
  const n = aandacht.length;
  return {
    boekingId: boeking.id,
    titel: boeking.huurder || 'Huurder',
    samenvatting: n === 0 ? 'Er zijn geen openstaande zaken.' : n === 1 ? 'Er is nog 1 zaak die uw aandacht nodig heeft.' : `Er zijn nog ${n} zaken die uw aandacht nodig hebben.`,
    aandacht,
    huurder: [
      regel('Naam bij deze boeking', boeking.huurder),
      regel('Naam bij de relatie', relatie?.naam ?? ''),
      regel('Telefoon bij deze boeking', boeking.telefoon),
      regel('Telefoon bij de relatie', relatie?.telefoon || aanvraag?.telefoon || ''),
      regel('E-mail bij deze boeking', boeking.email),
      regel('E-mail bij de relatie', relatie?.email || aanvraag?.email || ''),
      regel('Adres bij deze boeking', boeking.adres),
      regel('Adres bij de relatie', relatie?.adres || aanvraag?.adres || ''),
      regel('Organisatie', relatie?.organisatie || aanvraag?.organisatie || ''),
      regel('Mede-exposanten', boeking.medeExposanten || aanvraag?.medeExposanten || ''),
      regel('Notities bij de relatie', relatie?.notities ?? ''),
    ],
    relatieHistorie: andere,
    boeking: [
      regel('Datum', datumLabel(boeking.start, boeking.eind)),
      regel('Nummer', boeking.nummer),
      regel('Activiteit', soortLabel(boeking.soort, boeking.status)),
      regel('Boekingsstatus', BOEKING_LABEL[boeking.status as 'optie'] ?? boeking.status),
      regel('Huurbedrag', huurbedrag(boeking.tarief)),
      regel('Afspraken', boeking.toelichting),
      regel('Interne opmerkingen', boeking.notities),
      regel('Bijzonderheden', [activiteit?.praktisch, activiteit?.exposanten].filter(Boolean).join(' · ')),
    ],
    stukken: dossierStukken,
    stukkenToelichting: bron.stukkenGeladen
      ? 'Alleen stukken die echt zijn aangeleverd staan hier. Goedkeuren publiceert niets en verstuurt geen e-mail.'
      : 'De stukken konden niet worden geladen. Er is niets als afgerond gemarkeerd.',
    contract: {
      status: contract,
      toelichting: contract.tekst === 'Status onbekend'
        ? 'Er is geen betrouwbaar contractdocument of verzendbewijs. Een oude importtekst telt niet als ondertekening.'
        : contract.tekst === 'Ontbreekt'
          ? 'Er is nog geen contractdocument bij deze boeking.'
          : 'Deze status komt uit een contractdocument of een vastgelegd verzendbewijs.',
      documenten: bron.documenten.filter((doc) => doc.boekingId === boeking.id).map((doc) => ({ naam: doc.naam, url: doc.url })),
    },
    gastheren: {
      toegewezen,
      keuzes: gastherenVoorKoppeling(bron.gastheren, boeking.gastheerId).map((item) => ({ id: item.id, naam: item.naam })),
      leeg: toegewezen.length === 0 ? 'Er is nog geen gastheer gekozen.' : '',
    },
    betaling: betaalRegels(bron, boeking),
    historie,
    historieToelichting: bron.magAudit
      ? 'Hieronder staan vastgelegde berichten, beoordelingen en wijzigingen.'
      : 'Verzendbewijzen en beoordelingen staan hier. Het uitgebreide wijzigingenlog is alleen zichtbaar voor een beheerder met auditrecht.',
    opslagMelding: bron.beoordelingOpslag
      ? ''
      : 'Goedkeuren kan nu niet worden opgeslagen. Er wordt niets gepubliceerd en er is geen e-mail verstuurd.',
  };
}

export function gastheerOverlappen(bron: VerhuurBron, boeking: VerhuurBoeking, gastheerId: string): string[] {
  if (!gastheerId) return [];
  const regels = regelsVan(bron);
  const namen = new Map(bron.boekingen.map((item) => [item.id, item.huurder || item.nummer]));
  const ids = new Set<string>();
  for (const ander of bron.boekingen) {
    if (ander.id === boeking.id || ander.gastheerId !== gastheerId) continue;
    if (!inLijst(regels.dubbelTeltStatus, ander.status)) continue;
    if (periodesOverlappen(boeking, ander)) ids.add(ander.id);
  }
  for (const toe of bron.toewijzingen) {
    if (toe.relatieId !== gastheerId || toe.boekingId === boeking.id) continue;
    const ander = bron.boekingen.find((item) => item.id === toe.boekingId);
    if (!ander || !inLijst(regels.dubbelTeltStatus, ander.status)) continue;
    if (periodesOverlappen(boeking, ander)) ids.add(ander.id);
  }
  return [...ids].map((id) => namen.get(id) || id);
}

export function gastheerBesluit(input: {
  actie: 'toevoegen' | 'verwijderen' | 'bevestigen';
  gekozenId: string;
  huidigeId: string;
  overlap: boolean;
  bevestigd: boolean;
}): GastheerBesluit {
  if (input.actie === 'verwijderen' || (input.actie === 'bevestigen' && input.gekozenId === '' && input.bevestigd)) {
    if (!input.huidigeId) return { doen: 'niets', gastheerId: '', melding: 'Er is geen gastheer om te verwijderen. Er is niets gewijzigd.', vraag: '' };
    if (!input.bevestigd) return { doen: 'vragen', gastheerId: '', melding: '', vraag: 'verwijderen' };
    return { doen: 'opslaan', gastheerId: '', melding: '', vraag: '' };
  }
  const gekozen = input.gekozenId.trim();
  if (!gekozen) return { doen: 'niets', gastheerId: '', melding: 'Kies eerst een gastheer. Er is niets gewijzigd.', vraag: '' };
  if (gekozen === input.huidigeId) return { doen: 'niets', gastheerId: gekozen, melding: 'Deze gastheer staat al bij deze boeking. Er is niets gewijzigd.', vraag: '' };
  const vervangt = Boolean(input.huidigeId);
  if (!input.bevestigd && (vervangt || input.overlap)) {
    const vraag = vervangt && input.overlap ? 'vervangen-overlap' : vervangt ? 'vervangen' : 'overlap';
    return { doen: 'vragen', gastheerId: gekozen, melding: '', vraag };
  }
  return { doen: 'opslaan', gastheerId: gekozen, melding: '', vraag: '' };
}

export function gastheerVraagTekst(vraag: GastheerBesluit['vraag'], overlapNamen: readonly string[]): string {
  const wie = overlapNamen.length ? overlapNamen.join(', ') : 'een andere boeking';
  if (vraag === 'verwijderen') return 'Weet u zeker dat u de gastheer wilt verwijderen?';
  if (vraag === 'vervangen') return 'Er staat al een gastheer bij deze boeking. Die wordt vervangen. Weet u het zeker?';
  if (vraag === 'overlap') return `Deze gastheer staat in dezelfde periode ook bij ${wie}. Wilt u toch toewijzen?`;
  if (vraag === 'vervangen-overlap') return `Er staat al een gastheer, en deze persoon staat in dezelfde periode ook bij ${wie}. Wilt u toch vervangen?`;
  return '';
}

export function periodeLabel(jaar: number, maand: number | 'alle'): string {
  if (maand === 'alle') return String(jaar);
  return `${MAANDEN[maand - 1]} ${jaar}`;
}

export function bronUitSnapshot(
  snapshot: BeheerSnapshot,
  extra: {
    vandaag: string;
    jaar: number;
    maand: number | 'alle';
    stukken: VerhuurStuk[];
    beoordelingen: VerhuurBeoordeling[];
    verzendingen: VerhuurVerzending[];
    audit: VerhuurAudit[];
    documentUrls?: Record<string, string>;
    magAudit: boolean;
    stukkenGeladen: boolean;
    beoordelingOpslag: boolean;
  },
): VerhuurBron {
  const urls = extra.documentUrls ?? {};
  return {
    vandaag: extra.vandaag,
    jaar: extra.jaar,
    maand: extra.maand,
    boekingen: snapshot.boekingen.map((boeking) => ({
      id: boeking.id,
      nummer: boeking.nummer,
      status: boeking.status,
      soort: boeking.soort,
      titel: boeking.interneTitel,
      start: boeking.start,
      eind: boeking.eind,
      huurder: boeking.huurder,
      email: boeking.email,
      telefoon: boeking.telefoon ?? '',
      adres: boeking.adres ?? '',
      relatieId: boeking.relatieId,
      gastheerId: boeking.gastheerId ?? '',
      notities: boeking.notities,
      toelichting: boeking.toelichting ?? '',
      medeExposanten: boeking.medeExposanten ?? '',
      tarief: boeking.tarief,
      aanvraagId: boeking.aanvraagId ?? '',
    })),
    betalingen: (snapshot.betalingen ?? []).map((regel: BeheerBetaling) => ({
      boekingId: regel.boekingId,
      soort: regel.soort,
      bedrag: regel.bedrag,
      status: regel.status,
      vervaldatum: regel.vervaldatum,
      ontvangenOp: regel.ontvangenOp,
    })),
    documenten: snapshot.documenten.map((doc) => ({
      id: doc.id,
      boekingId: doc.boekingId,
      naam: doc.naam,
      soort: doc.soort,
      url: urls[doc.id] ?? '',
    })),
    activiteiten: snapshot.agenda.filter((item) => item.boekingId).map((item) => ({
      boekingId: item.boekingId || '',
      titel: item.titel,
      omschrijving: item.omschrijving,
      korte: item.korteOmschrijving ?? '',
      volledige: item.volledigeOmschrijving ?? '',
      fotoPad: item.fotoPad ?? '',
      inhoudStatus: item.inhoudStatus || item.contentstatus || '',
      versie: item.inhoudVersie || '0',
      gepubliceerd: item.status === 'online',
      trigger: item.trigger ?? '',
      levenscyclus: item.levenscyclus ?? 'actief',
      exposanten: item.exposanten ?? '',
      praktisch: item.praktisch ?? '',
    })),
    intern: snapshot.intern.map((item) => ({
      id: item.id,
      titel: item.titel,
      start: item.start,
      eind: item.eind,
      blokkeert: item.blokkeert,
    })),
    relaties: snapshot.relaties.map((relatie) => ({
      id: relatie.id,
      naam: relatie.naam,
      organisatie: relatie.organisatie ?? '',
      email: relatie.email,
      telefoon: relatie.telefoon,
      adres: relatie.adres ?? '',
      notities: relatie.notities ?? '',
    })),
    gastheren: snapshot.gastheren.map((gastheer) => ({
      id: gastheer.id,
      naam: gastheer.naam,
      actief: gastheer.actief,
    })),
    toewijzingen: (snapshot.toewijzingen ?? []).map((toe: BeheerToewijzing) => ({
      id: toe.id,
      boekingId: toe.boekingId,
      relatieId: toe.relatieId,
      naam: toe.relatieNaam,
      type: toe.type,
      datum: toe.datum ?? '',
    })),
    aanvragen: snapshot.aanvragen.map((aanvraag) => ({
      id: aanvraag.id,
      boekingId: aanvraag.boekingId ?? '',
      naam: aanvraag.naam,
      email: aanvraag.email,
      telefoon: aanvraag.telefoon,
      adres: aanvraag.adres,
      medeExposanten: aanvraag.medeExposanten ?? '',
      toelichting: aanvraag.toelichting,
      website: aanvraag.website ?? '',
      organisatie: '',
    })),
    stukken: extra.stukken,
    beoordelingen: extra.beoordelingen,
    verzendingen: extra.verzendingen,
    jobs: snapshot.communicatie.map((job) => ({
      boekingId: job.boekingId,
      template: job.template,
      status: job.status,
      wanneer: job.wanneer,
    })),
    audit: extra.magAudit ? extra.audit : [],
    magAudit: extra.magAudit,
    stukkenGeladen: extra.stukkenGeladen,
    beoordelingOpslag: extra.beoordelingOpslag,
  };
}
