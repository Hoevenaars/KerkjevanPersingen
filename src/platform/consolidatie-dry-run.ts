/**
 * Dry-run voor het consolidatiepakket.
 * Geen databaseclient en geen schrijfactie. Een tweede aanroep met het
 * teruggegeven beeld levert geen nieuwe rijen op.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA_WIJZIGINGEN } from './consolidatie-mapping.ts';

export type Actie = 'insert' | 'update' | 'skip' | 'conflict' | 'review_blocked' | 'schema_wacht' | 'orphan';

export interface Planrij {
  tabel: string;
  externalId: string;
  actie: Actie;
  reden: string;
  schema: string[];
  bestaandId?: string;
  toegevoegd?: string[];
  behouden?: string[];
  conflictVelden?: string[];
  afgeleideDatum?: string;
}

export interface DatumAfleidingRij {
  toewijzingId: string;
  boekingId: string;
  type: string;
  kolom: string;
  label: string;
  start: string;
  eind: string;
  reden: string;
  datum?: string;
}

export interface ReviewRegel {
  severity: string;
  entityType: string;
  entityId: string;
  sourceFile: string;
  sourceRow: string;
  field: string;
  issue: string;
  heeftSuggestie: boolean;
  dispositie: string;
}

export interface Telling {
  insert: number;
  update: number;
  skip: number;
  conflict: number;
  review_blocked: number;
  schema_wacht: number;
  orphan: number;
}

export interface Vergelijking {
  bronrecords: number;
  bestaandExact: number;
  nieuw: number;
  zouVerrijken: number;
  unchanged: number;
  conflict: number;
  reviewBlocked: number;
  orphan: number;
  schemaWacht: number;
  bewustOvergeslagen: number;
  verrijkingen: { externalId: string; bestaandId?: string; toegevoegd: string[]; behouden: string[] }[];
  conflicten: { externalId: string; bestaandId?: string; velden: string[]; reden: string }[];
  orphans: { externalId: string; reden: string }[];
}

export interface DryRunRapport {
  mode: 'dry-run';
  geschrevenNaarDatabase: false;
  bestaandBeeld: 'leeg' | 'meegegeven';
  bronrecords: { bestand: string; records: number }[];
  relaties: Telling & { nieuw: number; match: number };
  rollen: Telling;
  boekingen: Telling & { nieuw: number; match: number; geannuleerd: number };
  betalingen: Telling & { importeerbaar: number; review: number };
  gastbegeleider: {
    bronDienst: number;
    bronAssist: number;
    bronX: number;
    dienst: number;
    assist: number;
    genegeerdeX: number;
    review_blocked: number;
    schema_wacht: number;
  };
  gastbegeleiderDatums: {
    bruikbaar: number;
    exact: number;
    ambigu: number;
    onmogelijk: number;
    exactRijen: DatumAfleidingRij[];
    ambiguRijen: DatumAfleidingRij[];
    onmogelijkRijen: DatumAfleidingRij[];
  };
  blokkades: Telling;
  gastheerEenOpEen: number;
  gastheerOpenGelaten: string[];
  highReview: ReviewRegel[];
  review: ReviewRegel[];
  conflicten: Planrij[];
  geblokkeerd: Planrij[];
  schemaWacht: Planrij[];
  integriteit: { ok: boolean; fouten: string[] };
  duplicaten: string[];
  tweedeRunNieuw: number | null;
  schemaWijzigingen: typeof SCHEMA_WIJZIGINGEN;
  ongemapt: string[];
  vergelijking: {
    relaties: Vergelijking;
    rollen: Vergelijking;
    boekingen: Vergelijking;
    betalingen: Vergelijking;
    blokkades: Vergelijking;
    gastbegeleider: Vergelijking;
  };
}

export interface BestaandeRij {
  tabel: string;
  externalId: string;
  legacyId?: string;
  email?: string;
  telefoon?: string;
  naam?: string;
  velden: Record<string, string>;
}

interface RelatieBron {
  relatie_id: string;
  naam: string;
  email: string;
  telefoon: string;
  adres_raw: string;
  geboortedatum: string;
  geboortedatum_raw: string;
  naam_bronwaarden: string;
  email_bronwaarden: string;
  telefoon_bronwaarden: string;
  bronreferenties: string;
  review_status: string;
}

interface RolBron {
  rol_id: string;
  relatie_id: string;
  rol_raw: string;
  rol: string;
  bronbestand: string;
}

interface BoekingBron {
  boeking_id: string;
  jaar: string;
  datum_label_raw: string;
  datum_start: string;
  datum_eind: string;
  datum_suggestie: string;
  date_parse_status: string;
  status: string;
  type: string;
  huurder_naam_raw: string;
  huurder_primair_naam: string;
  relatie_id: string;
  telefoon_raw: string;
  email_raw: string;
  cont_raw: string;
  totaal_raw: string;
  totaal_eur: string;
  termijn_1_raw: string;
  termijn_2_raw: string;
  bijzonderheden_raw: string;
  contract_datum: string;
  bronbestand: string;
  bronregel: string;
  review_status: string;
}

interface BetalingBron {
  betaling_id: string;
  boeking_id: string;
  soort: string;
  bedrag_eur_eerste_waarde: string;
  status: string;
  betaaldatum: string;
  vervaldatum: string;
  raw: string;
  parse_status: string;
  bronbestand: string;
  bronregel: string;
  bronkolom: string;
}

interface ToewijzingBron {
  toewijzing_id: string;
  boeking_id: string;
  gastbegeleider_relatie_id: string;
  gastbegeleider_kolom: string;
  bronwaarde: string;
  type: string;
  import_advies: string;
  match_methode: string;
  match_confidence: string;
  exposant_raw: string;
  datum_label_raw: string;
  bronbestand: string;
  bronregel: string;
}

interface BlokkadeBron {
  blokkade_id: string;
  jaar: string;
  datum_label_raw: string;
  datum_start: string;
  datum_eind: string;
  reden: string;
  bronbestand: string;
  bronregel: string;
  date_parse_status: string;
  review_status: string;
}

interface ReviewBron {
  severity: string;
  entity_type: string;
  entity_id: string;
  source_file: string;
  source_row: string;
  field: string;
  issue: string;
  raw_value: string;
  suggested_value: string;
}

export interface ConsolidatiePakket {
  relaties: RelatieBron[];
  rollen: RolBron[];
  boekingen: BoekingBron[];
  betalingen: BetalingBron[];
  toewijzingen: ToewijzingBron[];
  blokkades: BlokkadeBron[];
  review: ReviewBron[];
  bronregels: number;
  bronregelsPerBestand: { bestand: string; records: number }[];
  bronregister: number;
}

const RELATIE_KOLOMMEN = [
  'relatie_id', 'naam', 'email', 'telefoon', 'adres_raw', 'geboortedatum', 'geboortedatum_raw',
  'naam_bronwaarden', 'email_bronwaarden', 'telefoon_bronwaarden', 'bronreferenties', 'review_status',
] as const;

const BOEKING_KOLOMMEN = [
  'boeking_id', 'jaar', 'datum_label_raw', 'datum_start', 'datum_eind', 'datum_suggestie',
  'date_parse_status', 'status', 'type', 'huurder_naam_raw', 'huurder_primair_naam', 'relatie_id',
  'telefoon_raw', 'email_raw', 'cont_raw', 'totaal_raw', 'totaal_eur', 'termijn_1_raw', 'termijn_2_raw',
  'bijzonderheden_raw', 'contract_datum', 'bronbestand', 'bronregel', 'review_status',
] as const;

const BETALING_KOLOMMEN = [
  'betaling_id', 'boeking_id', 'soort', 'bedrag_eur_eerste_waarde', 'status', 'betaaldatum',
  'vervaldatum', 'raw', 'parse_status', 'bronbestand', 'bronregel', 'bronkolom',
] as const;

const TOEWIJZING_KOLOMMEN = [
  'toewijzing_id', 'boeking_id', 'gastbegeleider_relatie_id', 'gastbegeleider_kolom', 'bronwaarde',
  'type', 'import_advies', 'match_methode', 'match_confidence', 'exposant_raw', 'datum_label_raw',
  'bronbestand', 'bronregel',
] as const;

const BLOKKADE_KOLOMMEN = [
  'blokkade_id', 'jaar', 'datum_label_raw', 'datum_start', 'datum_eind', 'reden',
  'bronbestand', 'bronregel', 'date_parse_status', 'review_status',
] as const;

const REVIEW_KOLOMMEN = [
  'severity', 'entity_type', 'entity_id', 'source_file', 'source_row', 'field', 'issue', 'raw_value', 'suggested_value',
] as const;

const BEDRAG = /\d+(?:[.,]\d{2}|,--|,-)/g;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function parseCsv(tekst: string): Record<string, string>[] {
  const src = tekst.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const teken = src[i];
    if (quoted) {
      if (teken === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += teken;
      }
      continue;
    }
    if (teken === '"') {
      quoted = true;
    } else if (teken === ',') {
      row.push(cell);
      cell = '';
    } else if (teken === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (teken !== '\r') {
      cell += teken;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const header = rows[0] ?? [];
  return rows
    .slice(1)
    .filter((rij) => rij.some((waarde) => waarde.trim() !== ''))
    .map((rij) => Object.fromEntries(header.map((kolom, index) => [kolom, rij[index] ?? ''])));
}

function eisKolommen(rijen: Record<string, string>[], kolommen: readonly string[], bestand: string): void {
  const header = new Set(Object.keys(rijen[0] ?? {}));
  const mist = kolommen.filter((kolom) => !header.has(kolom));
  if (rijen.length > 0 && mist.length > 0) {
    throw new Error(`${bestand} mist kolommen: ${mist.join(', ')}`);
  }
}

function lees(map: string, prefix: string): Record<string, string>[] {
  const namen = readdirSync(map).filter((naam) => naam.startsWith(prefix) && naam.endsWith('.csv')).sort();
  if (namen.length !== 1) {
    throw new Error(`Verwacht één ${prefix}*.csv in ${map}, gevonden: ${namen.join(', ') || 'geen'}`);
  }
  return parseCsv(readFileSync(join(map, namen[0]), 'utf8'));
}

export function leesConsolidatiePakket(map: string): ConsolidatiePakket {
  const relaties = lees(map, 'relaties') as unknown as RelatieBron[];
  const rollen = lees(map, 'rollen') as unknown as RolBron[];
  const boekingen = lees(map, 'boekingen') as unknown as BoekingBron[];
  const betalingen = lees(map, 'betalingen') as unknown as BetalingBron[];
  const toewijzingen = lees(map, 'gastbegeleider_toewijzingen') as unknown as ToewijzingBron[];
  const blokkades = lees(map, 'kalender_blokkades') as unknown as BlokkadeBron[];
  const review = lees(map, 'review') as unknown as ReviewBron[];
  const bronregels = lees(map, 'bronregels');
  const bronregister = lees(map, 'bronregister');
  eisKolommen(relaties as unknown as Record<string, string>[], RELATIE_KOLOMMEN, 'relaties');
  eisKolommen(boekingen as unknown as Record<string, string>[], BOEKING_KOLOMMEN, 'boekingen');
  eisKolommen(betalingen as unknown as Record<string, string>[], BETALING_KOLOMMEN, 'betalingen');
  eisKolommen(toewijzingen as unknown as Record<string, string>[], TOEWIJZING_KOLOMMEN, 'gastbegeleider_toewijzingen');
  eisKolommen(blokkades as unknown as Record<string, string>[], BLOKKADE_KOLOMMEN, 'kalender_blokkades');
  eisKolommen(review as unknown as Record<string, string>[], REVIEW_KOLOMMEN, 'review');
  const perBestand = new Map<string, number>();
  for (const regel of bronregels) {
    const naam = regel.source_file || '(onbekend)';
    perBestand.set(naam, (perBestand.get(naam) ?? 0) + 1);
  }
  return {
    relaties,
    rollen,
    boekingen,
    betalingen,
    toewijzingen,
    blokkades,
    review,
    bronregels: bronregels.length,
    bronregelsPerBestand: [...perBestand.entries()].map(([bestand, records]) => ({ bestand, records })),
    bronregister: bronregister.length,
  };
}

export function normEmail(waarde: string | undefined): string {
  return (waarde ?? '').trim().toLowerCase();
}

export function normNaam(waarde: string | undefined): string {
  return (waarde ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function telefoonSleutel(waarde: string | undefined): string {
  let cijfers = (waarde ?? '').replace(/\D/g, '');
  if (cijfers.startsWith('0031')) cijfers = `31${cijfers.slice(4)}`;
  else if (cijfers.startsWith('31') && cijfers.length >= 11) cijfers = cijfers;
  else if (cijfers.startsWith('0')) cijfers = `31${cijfers.slice(1)}`;
  return cijfers;
}

function labelNoemtTweeDagen(label: string): boolean {
  return /\d\s*\/\s*(?:\d|[a-z])/i.test(label);
}

function iso(waarde: string | undefined): boolean {
  if (!waarde || !ISO.test(waarde)) return false;
  const datum = new Date(`${waarde}T00:00:00Z`);
  return !Number.isNaN(datum.getTime()) && datum.toISOString().slice(0, 10) === waarde;
}

function legeTelling(): Telling {
  return { insert: 0, update: 0, skip: 0, conflict: 0, review_blocked: 0, schema_wacht: 0, orphan: 0 };
}

function vergelijkingVan(rijen: Planrij[], bronrecords: number): Vergelijking {
  const verrijkingen = rijen.filter((rij) => rij.actie === 'update');
  const ongewijzigd = rijen.filter((rij) => rij.actie === 'skip' && !rij.reden.includes('bronwaarde x'));
  return {
    bronrecords,
    bestaandExact: verrijkingen.length + ongewijzigd.length,
    nieuw: rijen.filter((rij) => rij.actie === 'insert').length,
    zouVerrijken: verrijkingen.length,
    unchanged: ongewijzigd.length,
    conflict: rijen.filter((rij) => rij.actie === 'conflict').length,
    reviewBlocked: rijen.filter((rij) => rij.actie === 'review_blocked').length,
    orphan: rijen.filter((rij) => rij.actie === 'orphan').length,
    schemaWacht: rijen.filter((rij) => rij.actie === 'schema_wacht').length,
    bewustOvergeslagen: rijen.filter((rij) => rij.actie === 'skip' && rij.reden.includes('bronwaarde x')).length,
    verrijkingen: verrijkingen.map((rij) => ({
      externalId: rij.externalId,
      bestaandId: rij.bestaandId,
      toegevoegd: rij.toegevoegd ?? [],
      behouden: rij.behouden ?? [],
    })),
    conflicten: rijen.filter((rij) => rij.actie === 'conflict').map((rij) => ({
      externalId: rij.externalId,
      bestaandId: rij.bestaandId,
      velden: rij.conflictVelden ?? [],
      reden: rij.reden,
    })),
    orphans: rijen.filter((rij) => rij.actie === 'orphan').map((rij) => ({
      externalId: rij.externalId,
      reden: rij.reden,
    })),
  };
}

function tel(rijen: Planrij[]): Telling {
  const telling = legeTelling();
  for (const rij of rijen) telling[rij.actie] += 1;
  return telling;
}

function toepasbaar(actie: Actie | undefined): boolean {
  return actie === 'insert' || actie === 'update' || actie === 'skip';
}

function bronSleutel(bestand: string, regel: string): string {
  return `${bestand}#${regel}`;
}

function uniek(ids: string[], label: string): string[] {
  const gezien = new Map<string, number>();
  for (const id of ids) gezien.set(id, (gezien.get(id) ?? 0) + 1);
  return [...gezien.entries()].filter(([, aantal]) => aantal > 1).map(([id, aantal]) => `${label} ${id} komt ${aantal} keer voor`);
}

interface RelatiePlan extends Planrij {
  velden: Record<string, string>;
  email: string;
  telefoon: string;
  naam: string;
  doelId: string;
}

function matchRelatie(bron: RelatieBron, bestaand: BestaandeRij[], gebruikEmail: boolean, gebruikTelefoon: boolean): { rij?: BestaandeRij; conflict?: string } {
  const opSleutel = bestaand.filter((rij) => rij.tabel === 'relaties' && (rij.externalId === bron.relatie_id || rij.legacyId === bron.relatie_id || rij.velden.migratie_id === bron.relatie_id));
  if (opSleutel.length > 1) return { conflict: 'meerdere bestaande rijen met dezelfde migratiesleutel' };
  if (opSleutel.length === 1) return { rij: opSleutel[0] };

  const email = gebruikEmail ? normEmail(bron.email) : '';
  const tel = gebruikTelefoon ? telefoonSleutel(bron.telefoon) : '';
  const naam = normNaam(bron.naam);
  const opEmail = email ? bestaand.filter((rij) => rij.tabel === 'relaties' && normEmail(rij.email) === email) : [];
  const opTelefoon = tel && naam
    ? bestaand.filter((rij) => rij.tabel === 'relaties' && telefoonSleutel(rij.telefoon) === tel && normNaam(rij.naam) === naam)
    : [];
  if (opEmail.length > 1) return { conflict: 'meerdere bestaande relaties met hetzelfde e-mailadres' };
  if (opTelefoon.length > 1) return { conflict: 'meerdere bestaande relaties met dezelfde telefoon en naam' };
  if (opEmail.length === 1 && opTelefoon.length === 1 && opEmail[0] !== opTelefoon[0]) {
    return { conflict: 'e-mail en telefoon+naam wijzen naar verschillende relaties' };
  }
  if (opEmail.length === 1) return { rij: opEmail[0] };
  if (opTelefoon.length === 1) return { rij: opTelefoon[0] };
  return {};
}

function veldactie(
  huidig: string | undefined,
  bron: string,
  soort: 'tekst' | 'telefoon' | 'naam' = 'tekst',
): 'gelijk' | 'vul' | 'behoud' | 'conflict' {
  const bestaand = (huidig ?? '').trim();
  const nieuw = bron.trim();
  if (!nieuw && !bestaand) return 'gelijk';
  if (!nieuw && bestaand) return 'behoud';
  if (nieuw && !bestaand) return 'vul';
  if (soort === 'telefoon' && telefoonSleutel(nieuw) === telefoonSleutel(bestaand)) return 'gelijk';
  if (soort === 'naam' && normNaam(nieuw) === normNaam(bestaand)) return 'gelijk';
  if (nieuw.toLowerCase() === bestaand.toLowerCase()) return 'gelijk';
  return 'conflict';
}

function combineer(
  id: string,
  tabel: string,
  schema: string[],
  beslissingen: { veld: string; uitkomst: 'gelijk' | 'vul' | 'behoud' | 'conflict' }[],
  conflictreden: string,
  bestaandId?: string,
): Planrij {
  const conflictVelden = beslissingen.filter((besluit) => besluit.uitkomst === 'conflict').map((besluit) => besluit.veld);
  const toegevoegd = beslissingen.filter((besluit) => besluit.uitkomst === 'vul').map((besluit) => besluit.veld);
  const behouden = beslissingen.filter((besluit) => besluit.uitkomst === 'behoud').map((besluit) => besluit.veld);
  if (conflictVelden.length > 0) {
    return { tabel, externalId: id, actie: 'conflict', reden: `${conflictreden}: ${conflictVelden.join(', ')}`, schema, bestaandId, toegevoegd: [], behouden, conflictVelden };
  }
  if (toegevoegd.length > 0) {
    return { tabel, externalId: id, actie: 'update', reden: 'lege bestaande velden aanvullen', schema, bestaandId, toegevoegd, behouden, conflictVelden: [] };
  }
  return { tabel, externalId: id, actie: 'skip', reden: 'bestaande rij is gelijk of rijker', schema, bestaandId, toegevoegd: [], behouden, conflictVelden: [] };
}

function ouderInBeeld(bestaand: BestaandeRij[], tabel: string, id: string): boolean {
  return bestaand.some((rij) => rij.tabel === tabel && (rij.externalId === id || rij.legacyId === id || rij.velden.migratie_id === id));
}

export function consolidatieDryRun(pakket: ConsolidatiePakket, bestaand: BestaandeRij[] = []): { rapport: DryRunRapport; beeld: BestaandeRij[] } {
  const hoog = pakket.review.filter((regel) => regel.severity === 'high');
  const hoogOpId = new Map<string, ReviewBron[]>();
  const hoogOpBron = new Map<string, ReviewBron[]>();
  for (const regel of hoog) {
    const lijst = hoogOpId.get(regel.entity_id) ?? [];
    lijst.push(regel);
    hoogOpId.set(regel.entity_id, lijst);
    const sleutel = bronSleutel(regel.source_file, regel.source_row);
    const opBron = hoogOpBron.get(sleutel) ?? [];
    opBron.push(regel);
    hoogOpBron.set(sleutel, opBron);
  }
  const mediumVelden = new Map<string, Set<string>>();
  for (const regel of pakket.review) {
    if (regel.severity !== 'medium') continue;
    const set = mediumVelden.get(regel.entity_id) ?? new Set<string>();
    set.add(regel.field);
    mediumVelden.set(regel.entity_id, set);
  }

  const relatieplannen: RelatiePlan[] = [];
  for (const bron of pakket.relaties) {
    const refs = new Set(bron.bronreferenties.split(';').map((deel) => deel.trim()).filter(Boolean));
    const hoogViaBron = [...refs].flatMap((sleutel) => (hoogOpBron.get(sleutel) ?? []).filter((regel) => regel.entity_type === 'relatie'));
    const hoogDirect = hoogOpId.get(bron.relatie_id) ?? [];
    const medium = mediumVelden.get(bron.relatie_id) ?? new Set<string>();
    const schema: string[] = [];
    let actie: Actie | null = null;
    let reden = '';
    if (bron.review_status !== 'OK') {
      actie = 'review_blocked';
      reden = 'review_status is niet OK';
    } else if (hoogDirect.length > 0 || hoogViaBron.length > 0) {
      actie = 'review_blocked';
      reden = 'onopgeloste high-review';
    } else if (medium.has('identiteit')) {
      actie = 'review_blocked';
      reden = 'meerdere contactwaarden, geen eenduidige identiteit';
    }
    const gebruikEmail = !medium.has('email');
    const gebruikTelefoon = !medium.has('telefoon');
    const velden: Record<string, string> = {
      naam: bron.naam.trim(),
      adres: bron.adres_raw.trim(),
    };
    if (gebruikEmail && normEmail(bron.email)) velden.email = normEmail(bron.email);
    if (gebruikTelefoon && bron.telefoon.trim()) velden.telefoon = bron.telefoon.trim();
    if (actie) {
      relatieplannen.push({ tabel: 'relaties', externalId: bron.relatie_id, actie, reden, schema, velden, email: velden.email ?? '', telefoon: velden.telefoon ?? '', naam: bron.naam, doelId: bron.relatie_id });
      continue;
    }
    const match = matchRelatie(bron, bestaand, gebruikEmail, gebruikTelefoon);
    if (match.conflict) {
      relatieplannen.push({ tabel: 'relaties', externalId: bron.relatie_id, actie: 'conflict', reden: match.conflict, schema, velden, email: velden.email ?? '', telefoon: velden.telefoon ?? '', naam: bron.naam, doelId: bron.relatie_id });
      continue;
    }
    if (!match.rij) {
      relatieplannen.push({ tabel: 'relaties', externalId: bron.relatie_id, actie: 'insert', reden: 'geen bestaande relatie op sleutel, e-mail of telefoon+naam', schema, velden, email: velden.email ?? '', telefoon: velden.telefoon ?? '', naam: bron.naam, doelId: bron.relatie_id });
      continue;
    }
    const beslissingen = [
      { veld: 'naam', uitkomst: veldactie(match.rij.velden.naam, bron.naam, 'naam') },
      { veld: 'adres', uitkomst: veldactie(match.rij.velden.adres, bron.adres_raw) },
      { veld: 'email', uitkomst: gebruikEmail ? veldactie(match.rij.velden.email, normEmail(bron.email)) : 'behoud' as const },
      { veld: 'telefoon', uitkomst: gebruikTelefoon ? veldactie(match.rij.velden.telefoon, bron.telefoon.trim(), 'telefoon') : 'behoud' as const },
    ];
    const samen = combineer(bron.relatie_id, 'relaties', schema, beslissingen, 'bron wijkt af van gevulde bestaande waarden', match.rij.externalId);
    relatieplannen.push({ ...samen, velden, email: velden.email ?? '', telefoon: velden.telefoon ?? '', naam: bron.naam, doelId: match.rij.externalId });
  }
  const relatieActie = new Map(relatieplannen.map((rij) => [rij.externalId, rij.actie]));

  const rolplannen: Planrij[] = pakket.rollen.map((bron) => {
    const ouder = relatieActie.get(bron.relatie_id);
    if (!ouder && !ouderInBeeld(bestaand, 'relaties', bron.relatie_id)) {
      return { tabel: 'relatie_rollen', externalId: bron.rol_id, actie: 'orphan', reden: 'relatie_id ontbreekt in bron en database', schema: [] };
    }
    if (ouder && !toepasbaar(ouder)) return { tabel: 'relatie_rollen', externalId: bron.rol_id, actie: 'review_blocked', reden: `relatie ${bron.relatie_id} is niet importeerbaar`, schema: [] };
    if (!bron.rol.trim()) return { tabel: 'relatie_rollen', externalId: bron.rol_id, actie: 'review_blocked', reden: 'lege rol', schema: [] };
    const sleutel = bestaand.find((rij) => rij.tabel === 'relatie_rollen' && (rij.externalId === bron.rol_id || (rij.velden.relatie_id === bron.relatie_id && rij.velden.rol === bron.rol.trim())));
    if (sleutel) return { tabel: 'relatie_rollen', externalId: bron.rol_id, actie: 'skip', reden: 'rol staat al op de relatie', schema: [] };
    return { tabel: 'relatie_rollen', externalId: bron.rol_id, actie: 'insert', reden: 'rol toevoegen', schema: [] };
  });

  const boekingplannen: (Planrij & { status: string; start: string; eind: string; gastheer?: string })[] = [];
  for (const bron of pakket.boekingen) {
    const medium = mediumVelden.get(bron.boeking_id) ?? new Set<string>();
    const hoogDirect = hoogOpId.get(bron.boeking_id) ?? [];
    const datumsOk = bron.date_parse_status === 'high' && iso(bron.datum_start) && iso(bron.datum_eind) && bron.datum_eind >= bron.datum_start;
    let status = '';
    if (bron.status === 'actief') status = 'migratie_vastgelegd';
    else if (bron.status === 'geannuleerd') status = 'geannuleerd';
    else if (bron.status === 'optie') status = 'optie';
    let actie: Actie | null = null;
    let reden = '';
    if (bron.review_status !== 'OK') {
      actie = 'review_blocked';
      reden = 'review_status is niet OK';
    } else if (hoogDirect.length > 0) {
      actie = 'review_blocked';
      reden = 'onopgeloste high-review';
    } else if (!datumsOk) {
      actie = 'review_blocked';
      reden = bron.datum_suggestie ? 'datum onbetrouwbaar; suggestie niet automatisch toegepast' : 'datum onbetrouwbaar';
    } else if (!status) {
      actie = 'review_blocked';
      reden = 'onbekende boekingstatus';
    } else if (!toepasbaar(relatieActie.get(bron.relatie_id)) && !ouderInBeeld(bestaand, 'relaties', bron.relatie_id)) {
      actie = relatieActie.has(bron.relatie_id) ? 'review_blocked' : 'orphan';
      reden = relatieActie.has(bron.relatie_id) ? `huurder ${bron.relatie_id} is niet importeerbaar` : 'relatie_id ontbreekt in bron en database';
    }
    const veldenOk = actie === null;
    const opSleutel = bestaand.filter((rij) => rij.tabel === 'boekingen' && (rij.externalId === bron.boeking_id || rij.legacyId === bron.boeking_id || rij.velden.nummer === bron.boeking_id || rij.velden.migratie_id === bron.boeking_id));
    const opBusiness = bestaand.filter((rij) => {
      if (rij.tabel !== 'boekingen') return false;
      if (rij.velden.start_datum !== bron.datum_start || rij.velden.eind_datum !== bron.datum_eind) return false;
      if (rij.velden.huurder_relatie_id && rij.velden.huurder_relatie_id === bron.relatie_id) return true;
      const email = normEmail(bron.email_raw);
      return Boolean(email) && normEmail(rij.velden.huurder_email_snapshot) === email;
    });
    const match = opSleutel.length === 1 ? opSleutel[0] : opSleutel.length === 0 && opBusiness.length === 1 ? opBusiness[0] : undefined;
    if (veldenOk && (opSleutel.length > 1 || (opSleutel.length === 0 && opBusiness.length > 1))) {
      boekingplannen.push({ tabel: 'boekingen', externalId: bron.boeking_id, actie: 'conflict', reden: 'meerdere bestaande boekingen op dezelfde sleutel of periode+huurder', schema: [], status, start: bron.datum_start, eind: bron.datum_eind, conflictVelden: ['periode'] });
      continue;
    }
    if (veldenOk && match) {
      const beslissingen = [
        { veld: 'status', uitkomst: veldactie(match.velden.status, status) },
        { veld: 'start_datum', uitkomst: veldactie(match.velden.start_datum, bron.datum_start) },
        { veld: 'eind_datum', uitkomst: veldactie(match.velden.eind_datum, bron.datum_eind) },
        { veld: 'interne_notities', uitkomst: veldactie(match.velden.interne_notities, bron.bijzonderheden_raw) },
      ];
      const samen = combineer(bron.boeking_id, 'boekingen', [], beslissingen, 'boeking wijkt af van bestaande periode of status', match.externalId);
      boekingplannen.push({ ...samen, status, start: bron.datum_start, eind: bron.datum_eind });
      continue;
    }
    if (veldenOk) {
      const overlap = bestaand.find((rij) => {
        if (rij.tabel !== 'boekingen') return false;
        if (rij.velden.status !== 'optie' && rij.velden.status !== 'definitief') return false;
        const start = rij.velden.start_datum;
        const eind = rij.velden.eind_datum;
        if (!start || !eind) return false;
        return bron.datum_start <= eind && start <= bron.datum_eind && (status === 'optie' || status === 'definitief');
      });
      if (overlap) {
        boekingplannen.push({ tabel: 'boekingen', externalId: bron.boeking_id, actie: 'conflict', reden: `overlapt bestaande ${overlap.velden.status} ${overlap.externalId}`, schema: [], status, start: bron.datum_start, eind: bron.datum_eind });
        continue;
      }
    }
    boekingplannen.push({
      tabel: 'boekingen',
      externalId: bron.boeking_id,
      actie: actie ?? 'insert',
      reden: reden || 'nieuwe boeking',
      schema: [],
      status,
      start: datumsOk ? bron.datum_start : '',
      eind: datumsOk ? bron.datum_eind : '',
    });
    if (medium.has('totaal') || medium.has('termijnen/totaal') || medium.has('email') || medium.has('telefoon')) {
      boekingplannen[boekingplannen.length - 1].reden += '; gereviewde velden blijven achterwege';
    }
  }
  const boekingActie = new Map(boekingplannen.map((rij) => [rij.externalId, rij.actie]));

  const betalingplannen: Planrij[] = pakket.betalingen.map((bron) => {
    const bedragen = bron.raw.match(BEDRAG) ?? [];
    const boeking = boekingActie.get(bron.boeking_id);
    let soort = '';
    let schemaNodig = false;
    if (bron.soort === 'termijn_1') soort = 'aanbetaling';
    else if (bron.soort === 'termijn_2') soort = 'restant';
    else if (bron.soort.startsWith('historisch_')) {
      soort = 'historisch';
      schemaNodig = true;
    }
    let status = '';
    if (bron.status === 'betaald') status = 'ontvangen';
    else if (bron.status === 'openstaand') status = 'open';
    const medium = mediumVelden.get(bron.betaling_id) ?? new Set<string>();
    if (bron.parse_status !== 'OK' || hoogOpId.has(bron.betaling_id)) {
      return { tabel: 'betalingen', externalId: bron.betaling_id, actie: 'review_blocked', reden: 'parse of high-review blokkeert de betaalregel', schema: [] };
    }
    if (!status) {
      return { tabel: 'betalingen', externalId: bron.betaling_id, actie: 'review_blocked', reden: `betaalstatus ${bron.status || 'leeg'} is geen financiële waarheid`, schema: [] };
    }
    if (!bron.bedrag_eur_eerste_waarde.trim()) {
      return { tabel: 'betalingen', externalId: bron.betaling_id, actie: 'review_blocked', reden: 'geen bedrag', schema: [] };
    }
    if (bedragen.length > 1) {
      return { tabel: 'betalingen', externalId: bron.betaling_id, actie: 'review_blocked', reden: 'broncel bevat meerdere bedragen', schema: [] };
    }
    if (!soort) {
      return { tabel: 'betalingen', externalId: bron.betaling_id, actie: 'review_blocked', reden: 'onbekende betaalsoort', schema: [] };
    }
    if (!boeking && !ouderInBeeld(bestaand, 'boekingen', bron.boeking_id)) {
      return { tabel: 'betalingen', externalId: bron.betaling_id, actie: 'orphan', reden: 'boeking_id ontbreekt in bron en database', schema: [] };
    }
    if (boeking && !toepasbaar(boeking)) {
      return { tabel: 'betalingen', externalId: bron.betaling_id, actie: 'review_blocked', reden: `boeking ${bron.boeking_id} is niet importeerbaar`, schema: [] };
    }
    const schema = schemaNodig ? ['betalingen_historisch'] : [];
    const al = bestaand.find((rij) => rij.tabel === 'betalingen' && (
      rij.externalId === bron.betaling_id
      || rij.legacyId === bron.betaling_id
      || (rij.velden.boeking_id === bron.boeking_id && rij.velden.soort === soort)
    ));
    if (al) {
      return combineer(bron.betaling_id, 'betalingen', schema, [
        { veld: 'bedrag', uitkomst: veldactie(al.velden.bedrag, bron.bedrag_eur_eerste_waarde) },
        { veld: 'status', uitkomst: veldactie(al.velden.status, status) },
      ], 'betaalregel wijkt af van bestaande waarden', al.externalId);
    }
    if (schemaNodig) {
      return { tabel: 'betalingen', externalId: bron.betaling_id, actie: 'schema_wacht', reden: `${bron.soort} past niet in betalingen.soort`, schema };
    }
    if ((medium.has('termijn_1') || medium.has('termijn_2') || medium.has(bron.soort)) && !iso(bron.betaaldatum) && !iso(bron.vervaldatum)) {
      return { tabel: 'betalingen', externalId: bron.betaling_id, actie: 'insert', reden: 'bedrag importeerbaar; onbetrouwbare datum blijft achterwege', schema };
    }
    return { tabel: 'betalingen', externalId: bron.betaling_id, actie: 'insert', reden: status, schema };
  });

  const toewijzingplannen: Planrij[] = pakket.toewijzingen.map((bron) => {
    if (bron.type === 'x_onbekende_betekenis' || bron.bronwaarde === 'x' || bron.import_advies === 'NIET_IMPORTEREN_ZONDER_BEVESTIGING') {
      return { tabel: 'gastbegeleider_toewijzingen', externalId: bron.toewijzing_id, actie: 'skip', reden: 'bronwaarde x niet importeren', schema: [] };
    }
    const hoogRij = (hoogOpBron.get(bronSleutel(bron.bronbestand, bron.bronregel)) ?? []).length > 0 || hoogOpId.has(bron.toewijzing_id);
    if (bron.match_confidence !== 'high' || hoogRij) {
      return { tabel: 'gastbegeleider_toewijzingen', externalId: bron.toewijzing_id, actie: 'review_blocked', reden: hoogRij ? 'onopgeloste high-review op indeling' : 'match_confidence is low', schema: ['gastbegeleider_toewijzingen'] };
    }
    if (bron.type !== 'dienst' && bron.type !== 'assist') {
      return { tabel: 'gastbegeleider_toewijzingen', externalId: bron.toewijzing_id, actie: 'review_blocked', reden: 'onbekend toewijzingstype', schema: [] };
    }
    const boekingActieNu = boekingActie.get(bron.boeking_id);
    const relatieActieNu = relatieActie.get(bron.gastbegeleider_relatie_id);
    const boekingAfwezig = !boekingActieNu && !ouderInBeeld(bestaand, 'boekingen', bron.boeking_id);
    const relatieAfwezig = !relatieActieNu && !ouderInBeeld(bestaand, 'relaties', bron.gastbegeleider_relatie_id);
    if (boekingAfwezig || relatieAfwezig) {
      return { tabel: 'gastbegeleider_toewijzingen', externalId: bron.toewijzing_id, actie: 'orphan', reden: 'boeking of gastbegeleider ontbreekt in bron en database', schema: ['gastbegeleider_toewijzingen'] };
    }
    if ((boekingActieNu && !toepasbaar(boekingActieNu)) || (relatieActieNu && !toepasbaar(relatieActieNu))) {
      return { tabel: 'gastbegeleider_toewijzingen', externalId: bron.toewijzing_id, actie: 'review_blocked', reden: 'boeking of gastbegeleider is niet importeerbaar', schema: ['gastbegeleider_toewijzingen'] };
    }
    const al = bestaand.find((rij) => rij.tabel === 'gastbegeleider_toewijzingen' && rij.externalId === bron.toewijzing_id);
    if (al) return { tabel: 'gastbegeleider_toewijzingen', externalId: bron.toewijzing_id, actie: 'skip', reden: 'toewijzing bestaat al', schema: ['gastbegeleider_toewijzingen'] };
    return { tabel: 'gastbegeleider_toewijzingen', externalId: bron.toewijzing_id, actie: 'schema_wacht', reden: bron.type, schema: ['gastbegeleider_toewijzingen'] };
  });

  const dienstPerBoeking = new Map<string, string[]>();
  for (const bron of pakket.toewijzingen) {
    const plan = toewijzingplannen.find((rij) => rij.externalId === bron.toewijzing_id);
    if (bron.type === 'dienst' && plan && (plan.actie === 'insert' || plan.actie === 'schema_wacht')) {
      const lijst = dienstPerBoeking.get(bron.boeking_id) ?? [];
      lijst.push(bron.gastbegeleider_relatie_id);
      dienstPerBoeking.set(bron.boeking_id, lijst);
    }
  }
  const gastheerOpenGelaten = [...dienstPerBoeking.entries()].filter(([, relaties]) => new Set(relaties).size !== 1).map(([id]) => id);
  const gastheerEenOpEen = [...dienstPerBoeking.values()].filter((relaties) => new Set(relaties).size === 1).length;
  const boekingOpId = new Map(pakket.boekingen.map((rij) => [rij.boeking_id, rij]));
  const exactRijen: DatumAfleidingRij[] = [];
  const ambiguRijen: DatumAfleidingRij[] = [];
  const onmogelijkRijen: DatumAfleidingRij[] = [];
  for (const plan of toewijzingplannen) {
    if (plan.actie !== 'schema_wacht') continue;
    const bron = pakket.toewijzingen.find((rij) => rij.toewijzing_id === plan.externalId);
    if (!bron || (bron.type !== 'dienst' && bron.type !== 'assist')) continue;
    const boeking = boekingOpId.get(bron.boeking_id);
    const label = bron.datum_label_raw.trim();
    const start = boeking?.datum_start ?? '';
    const eind = boeking?.datum_eind ?? '';
    const basis: DatumAfleidingRij = {
      toewijzingId: bron.toewijzing_id,
      boekingId: bron.boeking_id,
      type: bron.type,
      kolom: bron.gastbegeleider_kolom,
      label,
      start,
      eind,
      reden: '',
    };
    const betrouwbaar = Boolean(boeking) && boeking?.date_parse_status === 'high' && iso(start) && iso(eind) && eind >= start;
    if (!betrouwbaar) {
      onmogelijkRijen.push({ ...basis, reden: boeking ? 'boekingsdatum is niet high-confidence' : 'geen gekoppelde boeking' });
      continue;
    }
    if (labelNoemtTweeDagen(label) || start !== eind) {
      ambiguRijen.push({
        ...basis,
        reden: start !== eind
          ? `boeking loopt van ${start} tot ${eind}; de broncel wijst geen dag aan`
          : 'label noemt twee dagen',
      });
      continue;
    }
    plan.afgeleideDatum = start;
    exactRijen.push({ ...basis, datum: start, reden: 'gekoppelde boeking is precies één high-confidence dag' });
  }

  const blokkadeplannen: Planrij[] = pakket.blokkades.map((bron) => {
    if (bron.review_status !== 'OK' || hoogOpId.has(bron.blokkade_id)) {
      return { tabel: 'interne_activiteiten', externalId: bron.blokkade_id, actie: 'review_blocked', reden: 'blokkade staat in review', schema: [] };
    }
    if (bron.date_parse_status !== 'high' || !iso(bron.datum_start) || !iso(bron.datum_eind)) {
      return { tabel: 'interne_activiteiten', externalId: bron.blokkade_id, actie: 'review_blocked', reden: 'blokkadedatum onbetrouwbaar', schema: [] };
    }
    const opSleutel = bestaand.filter((rij) => rij.tabel === 'interne_activiteiten' && (rij.externalId === bron.blokkade_id || rij.legacyId === bron.blokkade_id || rij.velden.migratie_id === bron.blokkade_id));
    const opPeriode = bestaand.filter((rij) => rij.tabel === 'interne_activiteiten' && rij.velden.start_datum === bron.datum_start && rij.velden.eind_datum === bron.datum_eind);
    if (opSleutel.length > 1 || (opSleutel.length === 0 && opPeriode.length > 1)) {
      return { tabel: 'interne_activiteiten', externalId: bron.blokkade_id, actie: 'conflict', reden: 'meerdere bestaande blokkades op dezelfde sleutel of periode', schema: [], conflictVelden: ['periode'] };
    }
    const al = opSleutel[0] ?? (opPeriode.length === 1 ? opPeriode[0] : undefined);
    if (al) {
      return combineer(bron.blokkade_id, 'interne_activiteiten', [], [
        { veld: 'titel', uitkomst: veldactie(al.velden.titel, 'Winterstop') },
        { veld: 'notities', uitkomst: veldactie(al.velden.notities, '') },
      ], 'blokkade wijkt af van bestaande waarden', al.externalId);
    }
    return { tabel: 'interne_activiteiten', externalId: bron.blokkade_id, actie: 'insert', reden: 'winterstop als interne activiteit', schema: [] };
  });

  const alle: Planrij[] = [...relatieplannen, ...rolplannen, ...boekingplannen, ...betalingplannen, ...toewijzingplannen, ...blokkadeplannen];
  const duplicaten = [
    ...uniek(pakket.relaties.map((rij) => rij.relatie_id), 'relatie'),
    ...uniek(pakket.boekingen.map((rij) => rij.boeking_id), 'boeking'),
    ...uniek(pakket.betalingen.map((rij) => rij.betaling_id), 'betaling'),
    ...uniek(pakket.toewijzingen.map((rij) => rij.toewijzing_id), 'toewijzing'),
    ...uniek(pakket.blokkades.map((rij) => rij.blokkade_id), 'blokkade'),
    ...uniek(pakket.rollen.map((rij) => rij.rol_id), 'rol'),
  ];
  const emailen = new Map<string, string[]>();
  const telefoons = new Map<string, string[]>();
  for (const relatie of pakket.relaties) {
    const email = normEmail(relatie.email);
    if (email) {
      const lijst = emailen.get(email) ?? [];
      lijst.push(relatie.relatie_id);
      emailen.set(email, lijst);
    }
    const tel = telefoonSleutel(relatie.telefoon);
    const naam = normNaam(relatie.naam);
    if (tel && naam) {
      const sleutel = `${tel}|${naam}`;
      const lijst = telefoons.get(sleutel) ?? [];
      lijst.push(relatie.relatie_id);
      telefoons.set(sleutel, lijst);
    }
  }
  for (const [email, ids] of emailen) {
    if (ids.length > 1) duplicaten.push(`e-mail ${ids.join(' + ')} komt vaker voor`);
    void email;
  }
  for (const [sleutel, ids] of telefoons) {
    if (ids.length > 1) duplicaten.push(`telefoon+naam ${sleutel.split('|')[0]} bij ${ids.join(' + ')}`);
  }

  const integriteit: string[] = [];
  for (const boeking of pakket.boekingen) {
    if (!pakket.relaties.some((relatie) => relatie.relatie_id === boeking.relatie_id)) {
      integriteit.push(`${boeking.boeking_id} verwijst naar ontbrekende ${boeking.relatie_id}`);
    }
  }
  for (const betaling of pakket.betalingen) {
    if (!pakket.boekingen.some((boeking) => boeking.boeking_id === betaling.boeking_id)) {
      integriteit.push(`${betaling.betaling_id} verwijst naar ontbrekende ${betaling.boeking_id}`);
    }
  }
  for (const rol of pakket.rollen) {
    if (!pakket.relaties.some((relatie) => relatie.relatie_id === rol.relatie_id)) {
      integriteit.push(`${rol.rol_id} verwijst naar ontbrekende ${rol.relatie_id}`);
    }
  }
  for (const toe of pakket.toewijzingen) {
    if (!pakket.boekingen.some((boeking) => boeking.boeking_id === toe.boeking_id)) integriteit.push(`${toe.toewijzing_id} mist boeking`);
    if (!pakket.relaties.some((relatie) => relatie.relatie_id === toe.gastbegeleider_relatie_id)) integriteit.push(`${toe.toewijzing_id} mist relatie`);
  }
  const importbareAanbetaling = new Map<string, number>();
  for (const bron of pakket.betalingen) {
    const plan = betalingplannen.find((rij) => rij.externalId === bron.betaling_id);
    if (bron.soort === 'termijn_1' && plan && toepasbaar(plan.actie)) {
      importbareAanbetaling.set(bron.boeking_id, (importbareAanbetaling.get(bron.boeking_id) ?? 0) + 1);
    }
  }
  for (const [boeking, aantal] of importbareAanbetaling) {
    if (aantal > 1) integriteit.push(`${boeking} heeft ${aantal} importeerbare aanbetalingen`);
  }
  for (const regel of hoog) {
    const geraakt = alle.some((rij) => rij.externalId === regel.entity_id && (rij.actie === 'insert' || rij.actie === 'update' || rij.actie === 'schema_wacht'));
    const viaBron = alle.some((rij) => {
      if (rij.actie !== 'insert' && rij.actie !== 'update' && rij.actie !== 'schema_wacht') return false;
      if (regel.entity_type === 'relatie') {
        const relatie = pakket.relaties.find((kandidaat) => kandidaat.relatie_id === rij.externalId);
        return relatie?.bronreferenties.includes(bronSleutel(regel.source_file, regel.source_row)) ?? false;
      }
      if (regel.entity_type === 'indeling') {
        const toe = pakket.toewijzingen.find((kandidaat) => kandidaat.toewijzing_id === rij.externalId);
        return toe?.bronbestand === regel.source_file && toe.bronregel === regel.source_row;
      }
      return false;
    });
    if (geraakt || viaBron) integriteit.push(`high-review ${regel.entity_id} zou toch geschreven worden`);
  }

  const review: ReviewRegel[] = pakket.review.map((regel) => {
    const direct = alle.find((rij) => rij.externalId === regel.entity_id);
    let dispositie = 'geen importdoel in de CSV';
    if (direct?.actie === 'skip' && direct.reden.includes('x')) dispositie = 'bewust overgeslagen: x';
    else if (direct) dispositie = direct.actie;
    else if (regel.entity_type === 'relatie') {
      const relatie = pakket.relaties.find((kandidaat) => kandidaat.bronreferenties.split(';').some((deel) => deel.trim() === bronSleutel(regel.source_file, regel.source_row)));
      const plan = relatie ? relatieplannen.find((rij) => rij.externalId === relatie.relatie_id) : undefined;
      dispositie = plan ? `${plan.actie} via ${plan.externalId}` : 'geen relatie bij bronregel';
    } else if (regel.entity_type === 'indeling') {
      const toe = pakket.toewijzingen.find((kandidaat) => kandidaat.bronbestand === regel.source_file && kandidaat.bronregel === regel.source_row);
      const plan = toe ? toewijzingplannen.find((rij) => rij.externalId === toe.toewijzing_id) : undefined;
      dispositie = plan ? `${plan.actie} via ${plan.externalId}` : 'geen toewijzing bij bronregel';
    } else if (regel.entity_type === 'bronregel') {
      dispositie = 'bewust geen boeking';
    }
    return {
      severity: regel.severity,
      entityType: regel.entity_type,
      entityId: regel.entity_id,
      sourceFile: regel.source_file,
      sourceRow: regel.source_row,
      field: regel.field,
      issue: regel.issue,
      heeftSuggestie: regel.suggested_value.trim().length > 0,
      dispositie,
    };
  });

  const relTelling = tel(relatieplannen);
  const boekTelling = tel(boekingplannen);
  const betTelling = tel(betalingplannen);
  const blokTelling = tel(blokkadeplannen);
  const dienst = toewijzingplannen.filter((rij) => rij.actie === 'schema_wacht' && rij.reden === 'dienst').length;
  const assist = toewijzingplannen.filter((rij) => rij.actie === 'schema_wacht' && rij.reden === 'assist').length;

  const beeld: BestaandeRij[] = bestaand.map((rij) => ({ ...rij, velden: { ...rij.velden } }));
  const zet = (rij: BestaandeRij) => {
    const index = beeld.findIndex((kandidaat) => kandidaat.tabel === rij.tabel && kandidaat.externalId === rij.externalId);
    if (index === -1) beeld.push(rij);
    else beeld[index] = { ...beeld[index], velden: { ...beeld[index].velden, ...rij.velden }, email: rij.email ?? beeld[index].email, telefoon: rij.telefoon ?? beeld[index].telefoon, naam: rij.naam ?? beeld[index].naam };
  };
  for (const relatie of relatieplannen) {
    if (relatie.actie === 'insert') {
      zet({ tabel: 'relaties', externalId: relatie.externalId, legacyId: relatie.externalId, email: relatie.email, telefoon: relatie.telefoon, naam: relatie.naam, velden: { ...relatie.velden, migratie_id: relatie.externalId } });
      continue;
    }
    if (relatie.actie !== 'update' && relatie.actie !== 'skip') continue;
    const doel = beeld.find((rij) => rij.tabel === 'relaties' && rij.externalId === relatie.doelId);
    if (!doel) continue;
    doel.legacyId = doel.legacyId || relatie.externalId;
    doel.velden.migratie_id = relatie.externalId;
    if (relatie.actie !== 'update') continue;
    for (const [sleutel, waarde] of Object.entries(relatie.velden)) {
      if (waarde && !doel.velden[sleutel]) doel.velden[sleutel] = waarde;
    }
    if (relatie.email && !doel.email) doel.email = relatie.email;
    if (relatie.telefoon && !doel.telefoon) doel.telefoon = relatie.telefoon;
    if (relatie.naam && !doel.naam) doel.naam = relatie.naam;
  }
  for (const rol of pakket.rollen) {
    const plan = rolplannen.find((rij) => rij.externalId === rol.rol_id);
    if (plan?.actie !== 'insert') continue;
    zet({ tabel: 'relatie_rollen', externalId: rol.rol_id, velden: { relatie_id: rol.relatie_id, rol: rol.rol.trim() } });
  }
  for (const boeking of pakket.boekingen) {
    const plan = boekingplannen.find((rij) => rij.externalId === boeking.boeking_id);
    if (!plan || (plan.actie !== 'insert' && plan.actie !== 'update')) continue;
    zet({ tabel: 'boekingen', externalId: boeking.boeking_id, legacyId: boeking.boeking_id, velden: { nummer: boeking.boeking_id, status: plan.status, start_datum: plan.start, eind_datum: plan.eind } });
  }
  for (const betaling of betalingplannen) {
    if (betaling.actie !== 'insert' && betaling.actie !== 'update' && betaling.actie !== 'schema_wacht') continue;
    zet({ tabel: 'betalingen', externalId: betaling.externalId, velden: {} });
  }
  for (const toe of toewijzingplannen) {
    if (toe.actie !== 'insert' && toe.actie !== 'schema_wacht') continue;
    zet({ tabel: 'gastbegeleider_toewijzingen', externalId: toe.externalId, velden: toe.afgeleideDatum ? { datum: toe.afgeleideDatum } : {} });
  }
  for (const blok of blokkadeplannen) {
    if (blok.actie !== 'insert') continue;
    zet({ tabel: 'interne_activiteiten', externalId: blok.externalId, legacyId: blok.externalId, velden: {} });
  }

  const rapport: DryRunRapport = {
    mode: 'dry-run',
    geschrevenNaarDatabase: false,
    bestaandBeeld: bestaand.length === 0 ? 'leeg' : 'meegegeven',
    bronrecords: [
      { bestand: 'relaties.csv', records: pakket.relaties.length },
      { bestand: 'rollen.csv', records: pakket.rollen.length },
      { bestand: 'boekingen.csv', records: pakket.boekingen.length },
      { bestand: 'betalingen.csv', records: pakket.betalingen.length },
      { bestand: 'gastbegeleider_toewijzingen.csv', records: pakket.toewijzingen.length },
      { bestand: 'kalender_blokkades.csv', records: pakket.blokkades.length },
      { bestand: 'review.csv', records: pakket.review.length },
      { bestand: 'bronregels.csv', records: pakket.bronregels },
      { bestand: 'bronregister.csv', records: pakket.bronregister },
      ...pakket.bronregelsPerBestand.map((rij) => ({ bestand: `bronregels:${rij.bestand}`, records: rij.records })),
    ],
    relaties: { ...relTelling, nieuw: relTelling.insert, match: relTelling.update + relTelling.skip },
    rollen: tel(rolplannen),
    boekingen: {
      ...boekTelling,
      nieuw: boekTelling.insert,
      match: boekTelling.update + boekTelling.skip,
      geannuleerd: boekingplannen.filter((rij) => rij.status === 'geannuleerd').length,
    },
    betalingen: {
      ...betTelling,
      importeerbaar: betTelling.insert + betTelling.update + betTelling.skip,
      review: betTelling.review_blocked,
    },
    gastbegeleider: {
      bronDienst: pakket.toewijzingen.filter((rij) => rij.type === 'dienst').length,
      bronAssist: pakket.toewijzingen.filter((rij) => rij.type === 'assist').length,
      bronX: pakket.toewijzingen.filter((rij) => rij.type === 'x_onbekende_betekenis' || rij.bronwaarde === 'x').length,
      dienst,
      assist,
      genegeerdeX: toewijzingplannen.filter((rij) => rij.actie === 'skip' && rij.reden.includes('bronwaarde x')).length,
      review_blocked: toewijzingplannen.filter((rij) => rij.actie === 'review_blocked').length,
      schema_wacht: toewijzingplannen.filter((rij) => rij.actie === 'schema_wacht').length,
    },
    gastbegeleiderDatums: {
      bruikbaar: exactRijen.length + ambiguRijen.length + onmogelijkRijen.length,
      exact: exactRijen.length,
      ambigu: ambiguRijen.length,
      onmogelijk: onmogelijkRijen.length,
      exactRijen,
      ambiguRijen,
      onmogelijkRijen,
    },
    blokkades: blokTelling,
    gastheerEenOpEen,
    gastheerOpenGelaten,
    highReview: review.filter((regel) => regel.severity === 'high'),
    review,
    conflicten: alle.filter((rij) => rij.actie === 'conflict'),
    geblokkeerd: alle.filter((rij) => rij.actie === 'review_blocked'),
    schemaWacht: alle.filter((rij) => rij.actie === 'schema_wacht'),
    integriteit: { ok: integriteit.length === 0 && duplicaten.length === 0, fouten: integriteit },
    duplicaten,
    tweedeRunNieuw: null,
    vergelijking: {
      relaties: vergelijkingVan(relatieplannen, pakket.relaties.length),
      rollen: vergelijkingVan(rolplannen, pakket.rollen.length),
      boekingen: vergelijkingVan(boekingplannen, pakket.boekingen.length),
      betalingen: vergelijkingVan(betalingplannen, pakket.betalingen.length),
      blokkades: vergelijkingVan(blokkadeplannen, pakket.blokkades.length),
      gastbegeleider: vergelijkingVan(toewijzingplannen, pakket.toewijzingen.length),
    },
    schemaWijzigingen: SCHEMA_WIJZIGINGEN,
    ongemapt: [
      'cont_raw (ja/nee) blijft buiten aanbetaling_ontvangen',
      'datum_suggestie wordt niet als datum geschreven',
      'pasen en pinksteren worden geen verhuurtype',
      'contract_datum heeft geen kolom op boekingen',
      'x in de indeling wordt geen dienst',
      'geboortedatum wordt niet opgeslagen; 23 juli 195. wordt niet gecorrigeerd',
    ],
  };

  return { rapport, beeld };
}
