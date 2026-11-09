/**
 * Weergave van de verhuuragenda en het dossier.
 * Leest het bestaande overzicht. Schrijft niets.
 * Een ontbrekend bewijs blijft Onbekend en telt niet als open taak.
 * Goedkeuren van een los stuk heeft nog geen veilige opslag.
 */

import { contentstatusNaarBeheer } from '../lib/agenda-zichtbaarheid.ts';
import { periodesOverlappen } from './datum.ts';
import { SOORT_LABEL, type DemoBoeking } from './demo-data.ts';
import { gastherenVoorKoppeling } from './gastheer-lijst.ts';
import { gastbegeleiderOntbreekt } from './verhuur-classificatie.ts';
import {
  boekingBezetKalender,
  bolTekst,
  leesPeriodeKeuze,
  maakDossier,
  type Bol,
  type DossierRelatie,
  type DossierSporen,
  type OverzichtInvoer,
  type RijHerkomst,
  type VerhuurOverzicht,
  type VerhuurRij,
} from './verhuur-overzicht.ts';

export type StukkenStand = 'compleet' | 'te_beoordelen' | 'niet_aangeleverd' | 'onbekend' | 'niet_zichtbaar';

export type StaatKleur = 'ok' | 'pending' | 'unknown' | 'no';

export const STUK_BEOORDELING_BLOKKADE =
  'Goedkeuren of afkeuren wordt hier nog niet opgeslagen. Er is geen tabel die per stuk de versie, de reden en de beoordelaar vastlegt. De status hierboven verandert niet.';

export interface SchermActiviteit {
  boekingId?: string;
  contentstatus?: string | null;
  inhoudStatus?: string | null;
  titel?: string;
  omschrijving?: string;
  korteOmschrijving?: string;
  volledigeOmschrijving?: string;
  exposanten?: string;
  fotoPad?: string;
  activiteitId?: string;
  tabel?: string;
  inhoudVersie?: number | null;
  beoordelingToelichting?: string;
}

export interface SchermBoeking {
  id: string;
  soort: string;
  gastheerId?: string;
  notities?: string;
  toelichting?: string;
  email?: string;
  nummer?: string;
  status?: string;
}

export interface SchermGastheer {
  id: string;
  naam: string;
  actief: boolean;
}

export interface SchermToewijzing {
  boekingId: string;
  relatieId: string;
  relatieNaam: string;
}

export interface SchermDocument {
  boekingId: string;
  naam: string;
  soort: string;
  datum: string;
  url?: string | null;
}

export interface SchermBetaling {
  boekingId: string;
  soort: string;
  bedrag: number;
  status: string;
  ontvangenOp?: string;
}

export interface SchermRelatie {
  naam: string;
  organisatie: string;
  email: string;
  telefoon: string;
  adres: string;
}

export interface SchermFilter {
  jaar: number;
  maand: number | null;
  zoek: string;
  aandacht: boolean;
}

export interface SchermRij {
  sleutel: string;
  boekingId: string | null;
  start: string;
  datum: string;
  jaar: string;
  huurder: string;
  activiteit: string;
  herkomst: RijHerkomst;
  bezet: boolean;
  contract: Bol;
  contractTekst: string;
  stukken: StukkenStand;
  stukkenTekst: string;
  aanbetaling: Bol;
  aanbetalingTekst: string;
  rest: Bol;
  restTekst: string;
  gastheer: string;
  aandacht: boolean;
  taken: string[];
  bijzonderheden: string;
}

export function leesSchermFilter(
  params: { get(naam: string): string | null },
  vandaag: string,
): SchermFilter {
  const ruwMaand = params.get('maand');
  const basis = leesPeriodeKeuze(
    { get: (naam) => (naam === 'maand' && !ruwMaand ? 'alle' : params.get(naam)) },
    vandaag,
  );
  const maand = !ruwMaand ? Number(vandaag.slice(5, 7)) : basis.maand;
  const zoek = (params.get('q') ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return {
    jaar: basis.jaar,
    maand: maand != null && maand >= 1 && maand <= 12 ? maand : null,
    zoek,
    aandacht: params.get('aandacht') === '1',
  };
}

export function verhuurQuery(
  huidig: { get(naam: string): string | null },
  wijziging: Partial<Record<'jaar' | 'maand' | 'q' | 'aandacht' | 'bron' | 'dossier' | 'rij' | 'weg', string | null>> = {},
): string {
  const volgende = new URLSearchParams();
  const sleutels = ['jaar', 'maand', 'q', 'aandacht', 'bron', 'dossier', 'rij', 'weg'] as const;
  for (const sleutel of sleutels) {
    const waarde = Object.prototype.hasOwnProperty.call(wijziging, sleutel) ? wijziging[sleutel] : huidig.get(sleutel);
    if (waarde) volgende.set(sleutel, waarde);
  }
  const tekst = volgende.toString();
  return tekst ? `/beheer/verhuur/?${tekst}` : '/beheer/verhuur/';
}

export function stukkenStand(input: {
  contentstatus?: string | null;
  inhoudStatus?: string | null;
}): StukkenStand {
  const bekend = [input.contentstatus, input.inhoudStatus]
    .map((waarde) => contentstatusNaarBeheer(waarde))
    .filter((waarde): waarde is NonNullable<typeof waarde> => waarde != null);
  if (bekend.length === 0) return 'onbekend';
  const uniek = new Set(bekend);
  if (uniek.size > 1) return 'te_beoordelen';
  const enige = bekend[0];
  if (enige === 'goedgekeurd') return 'compleet';
  if (enige === 'niet_aangeleverd') return 'niet_aangeleverd';
  return 'te_beoordelen';
}

export function stukkenTekst(stand: StukkenStand): string {
  if (stand === 'compleet') return 'Compleet';
  if (stand === 'te_beoordelen') return 'Te beoordelen';
  if (stand === 'niet_aangeleverd') return 'Nog niet aangeleverd';
  if (stand === 'niet_zichtbaar') return 'Afgeschermd';
  return 'Onbekend';
}

export function staatKleur(waarde: Bol | StukkenStand): StaatKleur {
  if (waarde === 'afgerond' || waarde === 'compleet') return 'ok';
  if (waarde === 'openstaand' || waarde === 'te_beoordelen' || waarde === 'niet_aangeleverd' || waarde === 'tegenstrijdig') {
    return 'pending';
  }
  return 'unknown';
}

/** Losse stukgoedkeuring heeft nog geen versie, reden en audit in de database. */
export function stukKanBeoordelen(): false {
  return false;
}

export function aandachtVan(input: {
  herkomst: RijHerkomst;
  bezet: boolean;
  soort: string;
  heeftGastheer: boolean;
  aanbetaling: Bol;
  rest: Bol;
  stukken: StukkenStand;
}): { nodig: boolean; taken: string[] } {
  if (input.herkomst !== 'boeking') return { nodig: false, taken: [] };
  const taken: string[] = [];
  if (input.aanbetaling === 'openstaand') taken.push('Aanbetaling staat open.');
  if (input.aanbetaling === 'tegenstrijdig') taken.push('Aanbetaling is tegenstrijdig.');
  if (input.rest === 'openstaand') taken.push('Restbetaling staat open.');
  if (input.rest === 'tegenstrijdig') taken.push('Restbetaling is tegenstrijdig.');
  if (input.stukken === 'te_beoordelen') taken.push('Aangeleverde inhoud wacht op beoordeling.');
  if (input.stukken === 'niet_aangeleverd') taken.push('Inhoud is nog niet aangeleverd.');
  if (input.bezet && gastbegeleiderOntbreekt({ soort: input.soort, heeftKoppeling: input.heeftGastheer })) {
    taken.push('Er is nog geen gastheer.');
  }
  return { nodig: taken.length > 0, taken };
}

export function beoordeelGastheerActie(input: {
  actie: string;
  gekozenId: string;
  huidigeId: string;
  bevestig: string;
  overlapNamen?: readonly string[];
}): { ok: true; gastheerId: string } | { ok: false; melding: string } {
  if (input.actie !== 'gastheer') {
    return { ok: false, melding: 'Deze actie is niet beschikbaar. Er is niets gewijzigd.' };
  }
  const gekozen = input.gekozenId.trim();
  const huidig = input.huidigeId.trim();
  if (!gekozen) {
    if (input.bevestig !== 'ja') {
      return { ok: false, melding: 'Bevestig eerst dat de gastheer weg mag. Er is niets gewijzigd.' };
    }
    if (!huidig) return { ok: false, melding: 'Er is geen gastheer gekoppeld. Er is niets gewijzigd.' };
    return { ok: true, gastheerId: '' };
  }
  if (gekozen === huidig) {
    return { ok: false, melding: 'Deze gastheer is al gekoppeld. Er is niets gewijzigd.' };
  }
  const overlap = (input.overlapNamen ?? []).map((naam) => naam.trim()).filter(Boolean);
  if (overlap.length > 0) {
    return {
      ok: false,
      melding: `Deze gastheer staat in dezelfde periode al bij ${overlap.join(', ')}. Er is niets gewijzigd.`,
    };
  }
  if (huidig && input.bevestig !== 'ja') {
    return { ok: false, melding: 'Er staat al één gastheer. Bevestig de vervanging. Er is niets gewijzigd.' };
  }
  return { ok: true, gastheerId: gekozen };
}

/** Eén gastheer per bezette boeking. Een geannuleerde boeking telt niet als overlap. */
export function gastheerOverlapNamen(input: {
  boekingId: string;
  gastheerId: string;
  boekingen: readonly { id: string; status: string; start: string; eind: string; huurder: string; gastheerId?: string }[];
}): string[] {
  const gekozen = input.gastheerId.trim();
  if (!gekozen) return [];
  const huidige = input.boekingen.find((item) => item.id === input.boekingId);
  if (!huidige) return [];
  const namen: string[] = [];
  const gezien = new Set<string>();
  for (const ander of input.boekingen) {
    if (ander.id === huidige.id) continue;
    if ((ander.gastheerId ?? '').trim() !== gekozen) continue;
    if (!boekingBezetKalender(ander.status)) continue;
    const overlapt = periodesOverlappen(
      { start: huidige.start, eind: huidige.eind || huidige.start },
      { start: ander.start, eind: ander.eind || ander.start },
    );
    if (!overlapt) continue;
    const naam = ander.huurder.trim() || ander.id;
    const sleutel = naam.toLocaleLowerCase('nl');
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    namen.push(naam);
  }
  return namen;
}

/** Alleen terug naar de verhuuragenda zelf. Geen andere beheerroute en geen extern adres. */
export function veiligeVerhuurTerug(waarde: string, origin = 'http://localhost'): string {
  const terugval = '/beheer/verhuur/';
  const tekst = waarde.trim();
  if (!tekst.startsWith('/beheer/verhuur') || tekst.startsWith('//') || tekst.includes('\\')) return terugval;
  try {
    const url = new URL(tekst, origin);
    if (url.origin !== new URL(origin).origin) return terugval;
    if (url.pathname !== '/beheer/verhuur' && url.pathname !== '/beheer/verhuur/') return terugval;
    return `${url.pathname}${url.search}`;
  } catch {
    return terugval;
  }
}

export function dossierAdres(id: string, params: { get(naam: string): string | null }): string {
  return verhuurQuery(params, { dossier: id, rij: null, weg: null });
}

export interface DossierBronWeergave {
  gegevens: { label: string; waarde: string }[];
  betaling: { label: string; waarde: string }[];
  betalingToelichting: string;
  geschiedenis: { label: string; waarde: string }[];
  geschiedenisToelichting: string;
}

/** Zelfde dossierblokken als /beheer/verhuur/[id]/, zonder een tweede berekening van de status. */
export function dossierUitBron(input: {
  boeking: DemoBoeking;
  invoer: OverzichtInvoer;
  relatie: DossierRelatie | null;
  activiteit: { titel: string; zichtbaarheid: string; levenscyclus: string } | null;
  sporen: DossierSporen;
}): DossierBronWeergave {
  const blokken = maakDossier(input.boeking, input.invoer, input.relatie, input.activiteit, input.sporen);
  const blok = (begin: string) => blokken.find((item) => item.titel.startsWith(begin));
  return {
    gegevens: [...(blok('1.')?.regels ?? []), ...(blok('3.')?.regels ?? [])],
    betaling: blok('5.')?.regels ?? [],
    betalingToelichting: blok('5.')?.toelichting ?? '',
    geschiedenis: blok('7.')?.regels ?? [],
    geschiedenisToelichting: blok('7.')?.toelichting ?? '',
  };
}

export function veiligeBestandsUrl(waarde: string | null | undefined): string | null {
  const tekst = (waarde ?? '').trim();
  if (!tekst) return null;
  if (tekst.startsWith('/') && !tekst.startsWith('//')) return tekst;
  try {
    const url = new URL(tekst);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
  } catch {
    return null;
  }
  return null;
}

export function datumZonderJaar(label: string, start: string): { datum: string; jaar: string } {
  const jaar = start.slice(0, 4);
  const suffix = ` ${jaar}`;
  if (jaar && label.endsWith(suffix)) return { datum: label.slice(0, -suffix.length), jaar };
  return { datum: label, jaar };
}

function soortLabel(waarde: string): string {
  const schoon = waarde.trim();
  if (!schoon) return 'Soort niet ingevuld';
  return SOORT_LABEL[schoon] ?? schoon;
}

function uniekeNamen(namen: readonly string[]): string[] {
  const gezien = new Set<string>();
  const uit: string[] = [];
  for (const naam of namen) {
    const schoon = naam.trim();
    const sleutel = schoon.toLocaleLowerCase('nl');
    if (!schoon || gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uit.push(schoon);
  }
  return uit;
}

export function bouwSchermRijen(input: {
  overzicht: VerhuurOverzicht;
  boekingen: readonly SchermBoeking[];
  gastheren: readonly SchermGastheer[];
  toewijzingen: readonly SchermToewijzing[];
  activiteiten: readonly SchermActiviteit[];
  zoek: string;
  alleenAandacht: boolean;
}): { rijen: SchermRij[]; aandachtAantal: number } {
  const boekingVan = new Map(input.boekingen.map((boeking) => [boeking.id, boeking]));
  const activiteitVan = new Map<string, SchermActiviteit>();
  for (const activiteit of input.activiteiten) {
    if (!activiteit.boekingId || activiteit.tabel === 'activiteit_bron') continue;
    if (!activiteitVan.has(activiteit.boekingId)) activiteitVan.set(activiteit.boekingId, activiteit);
  }
  const alles = input.overzicht.rijen.map((rij) =>
    naarSchermRij(rij, boekingVan, activiteitVan, input.gastheren, input.toewijzingen),
  );
  const aandachtAantal = alles.filter((rij) => rij.aandacht).length;
  const naald = input.zoek.trim().toLocaleLowerCase('nl');
  const rijen = alles.filter((rij) => {
    if (input.alleenAandacht && !rij.aandacht) return false;
    if (!naald) return true;
    const hooi = [rij.datum, rij.jaar, rij.huurder, rij.activiteit, rij.gastheer, rij.bijzonderheden]
      .join(' ')
      .toLocaleLowerCase('nl');
    return hooi.includes(naald);
  });
  return { rijen, aandachtAantal };
}

function naarSchermRij(
  rij: VerhuurRij,
  boekingVan: ReadonlyMap<string, SchermBoeking>,
  activiteitVan: ReadonlyMap<string, SchermActiviteit>,
  gastheren: readonly SchermGastheer[],
  toewijzingen: readonly SchermToewijzing[],
): SchermRij {
  const datum = datumZonderJaar(rij.periodeLabel, rij.start);
  const boeking = rij.boekingId ? boekingVan.get(rij.boekingId) : undefined;
  const activiteit = rij.boekingId ? activiteitVan.get(rij.boekingId) : undefined;
  const namen = gastheerNamen(boeking, gastheren, toewijzingen.filter((item) => item.boekingId === rij.boekingId));
  const stukken = rij.herkomst === 'boeking'
    ? stukkenStand({ contentstatus: activiteit?.contentstatus, inhoudStatus: activiteit?.inhoudStatus })
    : 'niet_zichtbaar';
  const aandacht = aandachtVan({
    herkomst: rij.herkomst,
    bezet: rij.bezet,
    soort: boeking?.soort ?? '',
    heeftGastheer: namen.length > 0,
    aanbetaling: rij.aanbetaling,
    rest: rij.rest,
    stukken,
  });
  const zichtbaar = rij.herkomst === 'boeking';
  let huurder = rij.huurder;
  let activiteitLabel = soortLabel(rij.activiteit);
  if (rij.herkomst === 'vrij') {
    huurder = 'Vrij weekend';
    activiteitLabel = 'Geen reservering';
  } else if (rij.herkomst === 'winterstop') {
    huurder = rij.activiteit || 'Winterstop';
    activiteitLabel = 'Winterstop of blokkade';
  } else if (rij.herkomst === 'kalender') {
    huurder = rij.activiteit || 'Bezet op de kalender';
    activiteitLabel = 'Geen gekoppelde boeking';
  } else if (!rij.bezet) {
    activiteitLabel = `Geannuleerd · ${activiteitLabel}`;
  }
  if (rij.huurderExtra && rij.herkomst === 'boeking') {
    activiteitLabel = `${activiteitLabel} · mede-exposant ${rij.huurderExtra}`;
  }
  return {
    sleutel: rij.sleutel,
    boekingId: rij.boekingId,
    start: rij.start,
    datum: datum.datum,
    jaar: datum.jaar,
    huurder,
    activiteit: activiteitLabel,
    herkomst: rij.herkomst,
    bezet: rij.bezet,
    contract: zichtbaar ? rij.contract : 'niet_zichtbaar',
    contractTekst: zichtbaar ? bolTekst(rij.contract, 'contract') : '—',
    stukken,
    stukkenTekst: zichtbaar ? stukkenTekst(stukken) : '—',
    aanbetaling: rij.aanbetaling,
    aanbetalingTekst: zichtbaar ? bolTekst(rij.aanbetaling, 'betaling') : '—',
    rest: rij.rest,
    restTekst: zichtbaar ? bolTekst(rij.rest, 'betaling') : '—',
    gastheer: zichtbaar ? namen.join(', ') : '',
    aandacht: aandacht.nodig,
    taken: aandacht.taken,
    bijzonderheden: rij.bijzonderheden,
  };
}

function gastheerNamen(
  boeking: SchermBoeking | undefined,
  gastheren: readonly SchermGastheer[],
  toewijzingen: readonly SchermToewijzing[],
): string[] {
  const operationeel = gastheren.find((gastheer) => gastheer.id === boeking?.gastheerId)?.naam ?? '';
  return uniekeNamen([operationeel, ...toewijzingen.map((item) => item.relatieNaam)]);
}

export interface DossierWeergave {
  id: string;
  naam: string;
  activiteit: string;
  periode: string;
  taken: string[];
  velden: { label: string; waarde: string }[];
  stukTekst: string;
  fotoUrl: string | null;
  stukken: StukkenStand;
  stukkenLabel: string;
  versie: string;
  documenten: { naam: string; soort: string; datum: string; url: string | null }[];
  intake: { naam: string; url: string | null }[];
  contractTekst: string;
  gastheerId: string;
  gastheerNaam: string;
  historie: string[];
  gastheerKeuze: { id: string; naam: string; actief: boolean }[];
  betalingen: { label: string; detail: string; stand: Bol; tekst: string }[];
  betaalToelichting: string;
  notities: string;
}

export function maakDossierWeergave(input: {
  rij: SchermRij;
  boeking: SchermBoeking;
  relatie: SchermRelatie | null;
  activiteit: SchermActiviteit | null;
  gastheren: readonly SchermGastheer[];
  toewijzingen: readonly SchermToewijzing[];
  documenten: readonly SchermDocument[];
  betalingen: readonly SchermBetaling[];
  betaalregelsZichtbaar: boolean;
  intake: readonly { naam: string; url: string | null }[];
}): DossierWeergave {
  const relatie = input.relatie;
  const velden = [
    { label: 'Naam op de boeking', waarde: input.rij.huurder || '—' },
    { label: 'Activiteit', waarde: input.rij.activiteit || '—' },
    { label: 'Telefoon', waarde: relatie?.telefoon.trim() || 'Niet ingevuld' },
    { label: 'E-mail op de boeking', waarde: input.boeking.email?.trim() || 'Niet ingevuld' },
    { label: 'Relatiekaart', waarde: relatie?.naam.trim() || 'Geen relatie gekoppeld' },
    { label: 'E-mail op de relatiekaart', waarde: relatie?.email.trim() || 'Niet ingevuld' },
    { label: 'Organisatie', waarde: relatie?.organisatie.trim() || '—' },
    { label: 'Adres', waarde: relatie?.adres.trim() || 'Niet ingevuld' },
  ];
  const tekst = [input.activiteit?.volledigeOmschrijving, input.activiteit?.korteOmschrijving, input.activiteit?.omschrijving, input.activiteit?.exposanten]
    .map((deel) => (deel ?? '').trim())
    .filter(Boolean)
    .filter((deel, index, alle) => alle.indexOf(deel) === index)
    .join('\n\n');
  const operationeel = input.gastheren.find((gastheer) => gastheer.id === input.boeking.gastheerId);
  const historie = uniekeNamen(
    input.toewijzingen
      .filter((item) => item.relatieId !== input.boeking.gastheerId)
      .map((item) => item.relatieNaam),
  );
  const betalingen = input.betaalregelsZichtbaar
    ? betaalRegels(input.rij, input.betalingen)
    : [{ label: 'Betalingen', detail: '', stand: 'niet_zichtbaar' as Bol, tekst: 'Afgeschermd' }];
  return {
    id: input.boeking.id,
    naam: input.rij.huurder,
    activiteit: input.rij.activiteit,
    periode: `${input.rij.datum} ${input.rij.jaar}`.trim(),
    taken: input.rij.taken,
    velden,
    stukTekst: tekst,
    fotoUrl: veiligeBestandsUrl(input.activiteit?.fotoPad),
    stukken: input.rij.stukken,
    stukkenLabel: input.rij.stukkenTekst,
    versie: input.activiteit?.inhoudVersie ? `Versie ${input.activiteit.inhoudVersie}` : '',
    documenten: input.documenten.map((document) => ({
      naam: document.naam || 'Naamloos bestand',
      soort: document.soort || 'Document',
      datum: document.datum,
      url: veiligeBestandsUrl(document.url),
    })),
    intake: input.intake.map((bestand) => ({ naam: bestand.naam, url: veiligeBestandsUrl(bestand.url) })),
    contractTekst: 'Onbekend. Er is geen contractstatus. Een oude tekst uit de import wordt niet als status gelezen.',
    gastheerId: input.boeking.gastheerId ?? '',
    gastheerNaam: operationeel?.naam ?? '',
    historie,
    gastheerKeuze: gastherenVoorKoppeling(input.gastheren, input.boeking.gastheerId).map((gastheer) => ({
      id: gastheer.id,
      naam: gastheer.naam,
      actief: gastheer.actief,
    })),
    betalingen,
    betaalToelichting: input.betaalregelsZichtbaar
      ? 'De status komt uit de betaalregels. Het oudere veld aanbetaling_ontvangen beslist niet. Een status is geen knop om een betaling te registreren.'
      : 'Betaalregels zijn alleen zichtbaar met leesrecht op finance.',
    notities: [input.boeking.notities, input.boeking.toelichting, input.rij.bijzonderheden]
      .map((deel) => (deel ?? '').trim())
      .filter(Boolean)
      .filter((deel, index, alle) => alle.indexOf(deel) === index)
      .join('\n\n') || 'Geen bijzonderheden ingevuld.',
  };
}

function betaalRegels(
  rij: SchermRij,
  betalingen: readonly SchermBetaling[],
): { label: string; detail: string; stand: Bol; tekst: string }[] {
  const soorten = [
    { sleutel: 'aanbetaling', label: 'Aanbetaling', stand: rij.aanbetaling, tekst: rij.aanbetalingTekst },
    { sleutel: 'restant', label: 'Restbetaling', stand: rij.rest, tekst: rij.restTekst },
  ];
  const regels = soorten.map((soort) => {
    const vanSoort = betalingen.filter((regel) => regel.soort === soort.sleutel && regel.status !== 'geannuleerd');
    const bedrag = vanSoort.reduce((som, regel) => som + (Number.isFinite(regel.bedrag) ? regel.bedrag : 0), 0);
    const detail = vanSoort.length === 0 ? 'Geen betaalregel' : euro(bedrag);
    return { label: soort.label, detail, stand: soort.stand, tekst: soort.tekst };
  });
  for (const regel of betalingen) {
    if (regel.soort === 'aanbetaling' || regel.soort === 'restant') continue;
    regels.push({
      label: regel.soort || 'Betaling',
      detail: [euro(regel.bedrag), regel.status].filter(Boolean).join(' · '),
      stand: 'onbekend',
      tekst: regel.status || 'Onbekend',
    });
  }
  return regels;
}

function euro(bedrag: number): string {
  if (!Number.isFinite(bedrag)) return '';
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(bedrag);
}

export function mobielStatus(rij: SchermRij): string {
  if (rij.herkomst === 'vrij') return 'Vrij weekend';
  if (rij.herkomst === 'winterstop') return 'Winterstop';
  if (rij.herkomst === 'kalender') return 'Bezet';
  if (!rij.bezet) return 'Geannuleerd';
  if (rij.aandacht) return 'Aandacht nodig';
  return 'Geen open actie';
}
