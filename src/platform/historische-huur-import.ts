/**
 * Historische huuroverzichten 2026–2029 → bestaand datamodel.
 *
 * Domein blijft boekingen, relaties, betalingen en interne_activiteiten.
 * Elke Excel-regel krijgt daarnaast één rij in import_bronregels.
 * Lege velden mogen worden aangevuld. Gevulde afwijkende velden blijven staan.
 * Een lege broncel wist niets. Winterstop wordt geen relatie.
 */

import { weekdag } from './datum.ts';
import { classificeerVerhuurtype } from './verhuur-classificatie.ts';
import { normNaam, telefoonSleutel } from './consolidatie-dry-run.ts';

export const HISTORISCHE_HUUR_BRON = 'huuroverzicht_historisch';
export const HISTORISCHE_HUUR_BATCH = 'huuroverzicht-2026-2029';

export const VERWACHTE_IMPORTRECORDS = 244;
export const VERWACHTE_HUURDERS = 154;
export const VERWACHTE_WINTERSTOP = 29;
export const VERWACHTE_NOTITIES = 2;

export type Uitkomst =
  | 'CREATED'
  | 'MATCHED_UNCHANGED'
  | 'MATCHED_ENRICHED'
  | 'CONFLICT_REVIEW_REQUIRED'
  | 'WINTERSTOP_CREATED'
  | 'WINTERSTOP_MATCHED'
  | 'BESCHIKBAAR'
  | 'NOTITIE_BEWAARD'
  | 'NIET_VERWERKT'
  | 'BRONKOP';

export type Klasse = 'huur' | 'winterstop' | 'beschikbaar' | 'notitie' | 'kop';

export interface Waarschuwing {
  code: string;
  veld?: string;
  bericht: string;
  bronwaarde?: string;
}

export interface Conflict {
  veld: string;
  bronwaarde: string;
  databasewaarde: string;
  database_id: number | null;
  database_label: string;
}

export interface Aanvulling {
  tabel: 'boekingen' | 'relaties' | 'betalingen' | 'interne_activiteiten';
  id: number;
  veld: string;
  van: string;
  naar: string;
  modus: 'leeg' | 'cas';
}

export interface ImportRecord {
  source_year: number;
  source_file: string;
  source_sheet?: string;
  source_row: number;
  row_type?: string;
  period_raw?: string | null;
  tenant_name_raw?: string | null;
  phone_raw?: string | number | null;
  email_raw?: string | number | null;
  contract_raw?: string | null;
  amount_due_raw?: string | number | null;
  installment_1_raw?: string | number | null;
  installment_2_raw?: string | number | null;
  notes_raw?: string | null;
  historical_columns?: Record<string, string | number | null>;
  source_fingerprint: string;
}

export interface BronBestand {
  import_records: ImportRecord[];
  all_source_rows?: ImportRecord[];
}

export interface DbBoeking {
  id: number;
  status: string;
  start_datum: string;
  eind_datum: string;
  interne_titel: string;
  huurder_naam_snapshot: string | null;
  huurder_email_snapshot: string | null;
  huurder_telefoon_snapshot: string | null;
  huurder_relatie_id: number | null;
  interne_notities: string | null;
  mede_exposanten: string | null;
  tarief_bedrag: string | number | null;
  tarief_prijstype: string | null;
  aanbetaling_bedrag: string | number | null;
  verhuurtype_sleutel: string | null;
  migration_source: string | null;
  migration_external_id: string | null;
  nummer: string | null;
}

export interface DbRelatie {
  id: number;
  naam: string;
  email: string | null;
  telefoon: string | null;
  organisatie: string | null;
  notities: string | null;
  migration_source: string | null;
  migration_external_id: string | null;
}

export interface DbBetaling {
  id: number;
  boeking_id: number;
  soort: string;
  bedrag: string | number;
  status: string;
  vervaldatum: string | null;
  ontvangen_op: string | null;
  referentie: string | null;
  migration_source: string | null;
  migration_external_id: string | null;
}

export interface DbBlokkade {
  id: number;
  titel: string;
  start_datum: string;
  eind_datum: string;
  blokkeert_verhuurkalender: boolean;
  notities: string | null;
  migration_source: string | null;
  migration_external_id: string | null;
}

export interface DbBronregel {
  source_fingerprint: string;
  doel_tabel: string | null;
  doel_id: number | null;
  uitkomst: string;
}

export interface HistorischeDb {
  boekingen: DbBoeking[];
  relaties: DbRelatie[];
  betalingen: DbBetaling[];
  blokkades: DbBlokkade[];
  bronregels: DbBronregel[];
}

export interface Contact {
  naam: string | null;
  email: string | null;
  telefoon: string | null;
  extraEmails: string[];
  mede: string | null;
  organisatie: string | null;
  emailSleutel: string | null;
  telefoonSleutels: string[];
  waarschuwingen: Waarschuwing[];
}

export interface Termijn {
  bedrag: number | null;
  status: 'open' | 'ontvangen' | null;
  vervaldatum: string | null;
  ontvangenOp: string | null;
  waarschuwingen: Waarschuwing[];
}

export interface NieuwRelatie {
  externalId: string;
  naam: string;
  email: string | null;
  telefoon: string | null;
  organisatie: string | null;
}

export interface NieuwBoeking {
  fingerprint: string;
  nummer: string;
  status: string;
  verhuurtype: string | null;
  titel: string;
  start: string;
  eind: string;
  relatieId: number | null;
  relatieExternalId: string | null;
  naam: string;
  email: string | null;
  telefoon: string | null;
  mede: string | null;
  tarief: number | null;
  aanbetaling: number | null;
  notities: string | null;
  sourceFile: string;
  sourceRow: number;
}

export interface NieuwBetaling {
  boekingId: number | null;
  boekingFingerprint: string;
  soort: 'aanbetaling' | 'restant';
  bedrag: number;
  status: 'open' | 'ontvangen';
  vervaldatum: string | null;
  ontvangenOp: string | null;
  referentie: string;
  externalId: string;
  sourceFile: string;
  sourceRow: number;
}

export interface NieuwBlokkade {
  fingerprint: string;
  titel: string;
  start: string;
  eind: string;
  blokkeert: boolean;
  notities: string;
  sourceFile: string;
  sourceRow: number;
}

export interface NieuwDomein {
  relatie?: NieuwRelatie;
  boeking?: NieuwBoeking;
  betalingen?: NieuwBetaling[];
  blokkade?: NieuwBlokkade;
}

export interface PlanRegel {
  uitkomst: Uitkomst;
  klasse: Klasse;
  source_year: number;
  source_file: string;
  source_sheet: string | null;
  source_row: number;
  source_fingerprint: string;
  huurder: string | null;
  periode: string | null;
  start: string | null;
  eind: string | null;
  database_id: number | null;
  database_tabel: string | null;
  database_label: string | null;
  gekoppeld_fingerprint: string | null;
  reden: string;
  warnings: Waarschuwing[];
  conflicten: Conflict[];
  aanvullingen: Aanvulling[];
  nieuw?: NieuwDomein;
  record: ImportRecord;
}

export interface JaarTelling {
  bronregels: number;
  nieuw: number;
  bestaand: number;
  aangevuld: number;
  conflict: number;
  warning: number;
  beschikbaar: number;
  winterstop: number;
  nietVerwerkt: number;
}

export interface HistorischPlan {
  bron: typeof HISTORISCHE_HUUR_BRON;
  batchId: string;
  regels: PlanRegel[];
  sql: string[];
  perJaar: Record<string, JaarTelling>;
  veiligheid: {
    bestaandeRecordsGewijzigd: number;
    veldenAangevuld: Record<string, number>;
    conflictenNietOverschreven: number;
    gevuldeVeldenGewist: 0;
  };
}

const MAANDEN: Record<string, number> = {
  januari: 1, jan: 1,
  februari: 2, febr: 2, feb: 2,
  maart: 3, mrt: 3,
  april: 4, apr: 4,
  mei: 5,
  juni: 6, jun: 6,
  juli: 7, jul: 7,
  augustus: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  oktober: 10, okt: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

const DATUM_RE = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g;
const BEDRAG_RE = /(\d{1,6})(?:[.,]\d{1,2})?\s*(?:,?-{0,2})?/g;

export function tekst(waarde: unknown): string {
  if (waarde == null) return '';
  return String(waarde).trim();
}

export function leeg(waarde: unknown): boolean {
  return tekst(waarde) === '';
}

function ymd(jaar: number, maand: number, dag: number): string | null {
  if (maand < 1 || maand > 12 || dag < 1 || dag > 31) return null;
  const datum = new Date(Date.UTC(jaar, maand - 1, dag));
  if (datum.getUTCFullYear() !== jaar || datum.getUTCMonth() !== maand - 1 || datum.getUTCDate() !== dag) return null;
  return datum.toISOString().slice(0, 10);
}

function maandVan(token: string): number | null {
  return MAANDEN[token.toLowerCase()] ?? null;
}

function sleutelNaam(waarde: string): string {
  return normNaam(waarde).replace(/[.'’]/g, '').replace(/\s+/g, ' ').trim();
}

function primaireNaam(naam: string): string {
  return naam.split(/\s+(?:icm|ivm|t\.?\s*a\.?\s*v\.?)\s+/i)[0]?.trim() || naam.trim();
}

export function namenKomenOvereen(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = sleutelNaam(a ?? '');
  const y = sleutelNaam(b ?? '');
  if (!x || !y) return false;
  if (x === y) return true;
  const px = sleutelNaam(primaireNaam(a ?? ''));
  const py = sleutelNaam(primaireNaam(b ?? ''));
  if (px && py && px === py) return true;
  const korter = x.length <= y.length ? x : y;
  const langer = x.length <= y.length ? y : x;
  if (!langer.includes(korter)) return false;
  const woorden = korter.split(' ').filter(Boolean);
  return woorden.length >= 2 || korter.length >= 10;
}

function organisatieSleutel(naam: string): string | null {
  const paren = naam.match(/\(([^)]+)\)/);
  if (paren) {
    const sleutel = sleutelNaam(paren[1]);
    if (sleutel.length >= 8) return sleutel;
  }
  const delen = naam.split(/\s+t\.?\s*a\.?\s*v\.?\s+/i);
  if (delen.length > 1) {
    const sleutel = sleutelNaam(delen[0] ?? '');
    if (sleutel.length >= 8) return sleutel;
  }
  return null;
}

function metExcelVoorloopnul(cijfers: string): { nummer: string; aangevuld: boolean } {
  if (cijfers.length === 9 && /^[2-7]/.test(cijfers)) return { nummer: `0${cijfers}`, aangevuld: true };
  return { nummer: cijfers, aangevuld: false };
}

export function telefoonSleutelsVan(waarde: string): string[] {
  const delen = waarde.split(/[/;,]+/).map((deel) => deel.trim()).filter(Boolean);
  const bron = delen.length ? delen : [waarde];
  const uit = new Set<string>();
  for (const deel of bron) {
    const cijfers = metExcelVoorloopnul(deel.replace(/\D/g, '')).nummer;
    const sleutel = telefoonSleutel(cijfers);
    if (sleutel.length >= 8) uit.add(sleutel);
  }
  return [...uit];
}

function waarschuwing(code: string, bericht: string, veld?: string, bronwaarde?: string): Waarschuwing {
  return { code, bericht, veld, bronwaarde };
}

export function parseZuiverBedrag(waarde: unknown): { bedrag: number | null; waarschuwingen: Waarschuwing[] } {
  if (typeof waarde === 'number' && Number.isFinite(waarde)) {
    return { bedrag: Math.round(waarde * 100) / 100, waarschuwingen: [] };
  }
  const ruw = tekst(waarde);
  if (!ruw) return { bedrag: null, waarschuwingen: [] };
  const schoon = ruw.replace(/€/g, '').trim();
  const match = schoon.match(/^(\d{1,6})(?:([.,])(\d{1,2}))?\s*(?:,?-{0,2})?$/);
  if (!match) return { bedrag: null, waarschuwingen: [] };
  const heel = Number(match[1]);
  const fractie = match[3];
  const bedrag = fractie ? Math.round(Number(`${heel}.${fractie}`) * 100) / 100 : heel;
  const waarschuwingen: Waarschuwing[] = [];
  if (!fractie && /,\s*$/.test(schoon)) {
    waarschuwingen.push(waarschuwing('bedrag_notatie', 'Bedrag eindigt op een komma zonder decimalen.', undefined, ruw));
  }
  return { bedrag, waarschuwingen };
}

function parseNlDatum(dag: string, maand: string, jaar: string): { iso: string | null; code?: string } {
  let y = Number(jaar);
  let twee = false;
  if (jaar.length <= 2) {
    if (y < 20 || y > 39) return { iso: null, code: 'jaartal_buiten_bereik' };
    y = 2000 + y;
    twee = true;
  }
  const iso = ymd(y, Number(maand), Number(dag));
  if (!iso) return { iso: null, code: 'ongeldige_datum' };
  return { iso, code: twee ? 'jaartal_twee_cijfers' : undefined };
}

export function parseTermijn(waarde: unknown, veld: string): Termijn {
  const leegResultaat: Termijn = { bedrag: null, status: null, vervaldatum: null, ontvangenOp: null, waarschuwingen: [] };
  if (leeg(waarde)) return leegResultaat;
  if (typeof waarde === 'number') {
    return {
      ...leegResultaat,
      bedrag: Math.round(waarde * 100) / 100,
      waarschuwingen: [waarschuwing('termijn_zonder_status', 'Termijn is alleen een getal, zonder betaalstatus.', veld, String(waarde))],
    };
  }
  const ruw = tekst(waarde);
  const waarschuwingen: Waarschuwing[] = [];
  if (/[*]/.test(ruw)) {
    waarschuwingen.push(waarschuwing('achterstallig_markering', 'De bron markeert deze termijn met een asterisk.', veld, ruw));
  }
  const datums = [...ruw.matchAll(new RegExp(DATUM_RE.source, 'g'))];
  const zonderDatum = ruw.replace(new RegExp(DATUM_RE.source, 'g'), ' ');
  const bedragMatches = [...zonderDatum.matchAll(new RegExp(BEDRAG_RE.source, 'g'))].filter((match) => match[1]);
  let bedrag: number | null = null;
  if (bedragMatches.length === 1) {
    const geparsed = parseZuiverBedrag(bedragMatches[0][0]);
    bedrag = geparsed.bedrag;
    waarschuwingen.push(...geparsed.waarschuwingen.map((item) => ({ ...item, veld })));
  } else if (bedragMatches.length > 1) {
    waarschuwingen.push(waarschuwing('termijn_samengesteld', 'De termijn bevat meerdere bedragen en is niet automatisch gesplitst.', veld, ruw));
  }
  const betaald = /\b(betaald|voldaan)\b/i.test(ruw) || (/\bbet\b/i.test(ruw) && !/\bte\s+bet/i.test(ruw));
  const teBetalen = /\bte\s+bet/i.test(ruw) || (/\bvoor\b/i.test(ruw) && !betaald);
  let status: Termijn['status'] = null;
  if (betaald && teBetalen) {
    waarschuwingen.push(waarschuwing('termijn_status_tegenstrijdig', 'De termijn noemt zowel betaald als nog te betalen.', veld, ruw));
  } else if (betaald) status = 'ontvangen';
  else if (teBetalen) status = 'open';
  else if (bedrag != null) {
    waarschuwingen.push(waarschuwing('termijn_zonder_status', 'Er is een bedrag, maar geen eenduidige betaalstatus.', veld, ruw));
  }
  const geparsedDatums: string[] = [];
  for (const datum of datums) {
    const parsed = parseNlDatum(datum[1], datum[2], datum[3]);
    if (!parsed.iso) {
      waarschuwingen.push(waarschuwing(parsed.code ?? 'ongeldige_datum', 'Datum in de termijn is niet geldig en is niet opgeslagen.', veld, datum[0]));
      continue;
    }
    if (parsed.code === 'jaartal_twee_cijfers') {
      waarschuwingen.push(waarschuwing('jaartal_twee_cijfers', `Jaartal ${datum[3]} gelezen als ${parsed.iso.slice(0, 4)}.`, veld, datum[0]));
    }
    geparsedDatums.push(parsed.iso);
  }
  let vervaldatum: string | null = null;
  let ontvangenOp: string | null = null;
  if (geparsedDatums.length > 1) {
    waarschuwingen.push(waarschuwing('termijn_meerdere_datums', 'Meerdere datums in één termijn; geen datum gekozen.', veld, ruw));
  } else if (geparsedDatums.length === 1 && status === 'ontvangen') ontvangenOp = geparsedDatums[0];
  else if (geparsedDatums.length === 1 && status === 'open') vervaldatum = geparsedDatums[0];
  if (status != null && bedrag == null) {
    waarschuwingen.push(waarschuwing('termijn_zonder_bedrag', 'Betaalstatus zonder eenduidig bedrag. Er is geen betaalregel gemaakt.', veld, ruw));
  }
  if (status == null || bedrag == null) {
    return { bedrag: null, status: null, vervaldatum: null, ontvangenOp: null, waarschuwingen };
  }
  return { bedrag, status, vervaldatum, ontvangenOp, waarschuwingen };
}

function isVolledigEmail(waarde: string): boolean {
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(waarde);
}

function vindEmails(ruw: string): { emails: string[]; rest: string; genormaliseerd: boolean; onduidelijk: boolean } {
  const trimmed = ruw.trim();
  if (!trimmed) return { emails: [], rest: '', genormaliseerd: false, onduidelijk: false };
  const collapsed = trimmed.replace(/\s*@\s*/g, '@').replace(/\s*\.\s*/g, '.');
  const genormaliseerd = collapsed !== trimmed;
  const gelijmd = collapsed.match(/^(\+?\d{8,15})([A-Za-z][A-Za-z0-9._%+-]*@[A-Za-z0-9.-]+\.[A-Za-z]{2,})$/);
  if (gelijmd && isVolledigEmail(gelijmd[2])) {
    return { emails: [gelijmd[2].toLowerCase()], rest: gelijmd[1], genormaliseerd, onduidelijk: false };
  }
  const metBedrag = collapsed.match(/^([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})(\s+.+)$/);
  if (metBedrag && isVolledigEmail(metBedrag[1]) && /^[\d\s.,€-]+$/.test(metBedrag[2])) {
    return { emails: [metBedrag[1].toLowerCase()], rest: metBedrag[2].trim(), genormaliseerd, onduidelijk: false };
  }
  if (/[;,]/.test(collapsed)) {
    const delen = collapsed.split(/[;,]/).map((deel) => deel.trim()).filter(Boolean);
    if (delen.length > 1 && delen.every(isVolledigEmail)) {
      return { emails: delen.map((email) => email.toLowerCase()), rest: '', genormaliseerd, onduidelijk: false };
    }
    return { emails: [], rest: trimmed, genormaliseerd: false, onduidelijk: true };
  }
  if (isVolledigEmail(collapsed)) {
    return { emails: [collapsed.toLowerCase()], rest: '', genormaliseerd, onduidelijk: false };
  }
  if (collapsed.includes('@')) return { emails: [], rest: trimmed, genormaliseerd: false, onduidelijk: true };
  return { emails: [], rest: trimmed, genormaliseerd: false, onduidelijk: false };
}

function telefoonUitRest(rest: string, waarschuwingen: Waarschuwing[], veld: string): string | null {
  const cijfers = rest.replace(/\D/g, '');
  if (!cijfers) return null;
  if (!/^[\d\s+()./-]+$/.test(rest)) {
    waarschuwingen.push(waarschuwing('telefoon_niet_eenduidig', 'Na het e-mailadres blijft een telefoonfragment over dat niet eenduidig is.', veld, rest));
    return null;
  }
  const voorloop = metExcelVoorloopnul(cijfers);
  if (voorloop.aangevuld) {
    waarschuwingen.push(waarschuwing('excel_voorloopnul', 'Excel-getal van 9 cijfers aangevuld met een voorloopnul.', veld, rest));
    return voorloop.nummer;
  }
  if (cijfers.length < 10 || cijfers.length > 15) {
    waarschuwingen.push(waarschuwing('telefoon_niet_eenduidig', 'Het telefoonfragment heeft geen bruikbare lengte en is niet als nummer opgeslagen.', veld, rest));
    return null;
  }
  return rest.trim();
}

export function interpreteerContact(record: ImportRecord): Contact {
  const waarschuwingen: Waarschuwing[] = [];
  const naamRuw = tekst(record.tenant_name_raw);
  const emailRuw = tekst(record.email_raw);
  const phoneRuw = record.phone_raw;
  const emails: string[] = [];
  let telefoon: string | null = null;

  const naamEmails = naamRuw ? vindEmails(naamRuw) : { emails: [], rest: naamRuw, genormaliseerd: false, onduidelijk: false };
  if (naamEmails.emails.length) {
    emails.push(...naamEmails.emails);
    waarschuwingen.push(waarschuwing('email_in_naamveld', 'E-mailadres stond in het naamveld.', 'tenant_name_raw', naamRuw));
  }
  let naam = naamEmails.rest.replace(/^[,;/\s]+|[,;/\s]+$/g, '').trim();
  if (naam && /^[\W_]+$/.test(naam)) naam = '';

  if (emailRuw) {
    const gevonden = vindEmails(emailRuw);
    if (!gevonden.emails.length) {
      waarschuwingen.push(waarschuwing(
        gevonden.onduidelijk ? 'email_niet_eenduidig' : 'email_onbruikbaar',
        gevonden.onduidelijk
          ? 'E-mailveld is niet als volledig adres te lezen. Er is geen deeladres opgeslagen.'
          : 'E-mailveld bevat geen eenduidig adres en is niet opgeslagen.',
        'email_raw',
        emailRuw,
      ));
    } else {
      if (gevonden.genormaliseerd) {
        waarschuwingen.push(waarschuwing('email_spaties', 'Spaties rond @ of punt zijn uit het e-mailadres gehaald.', 'email_raw', emailRuw));
      }
      if (gevonden.rest && !/^[\d\s.,€-]+$/.test(gevonden.rest)) {
        waarschuwingen.push(waarschuwing('email_extra_tekst', 'Na het e-mailadres stond nog tekst. Alleen het adres is overgenomen.', 'email_raw', emailRuw));
      } else if (gevonden.rest) {
        waarschuwingen.push(waarschuwing('email_bevatte_bedrag', 'In het e-mailveld stond ook een bedrag. Het adres is eruit gehaald.', 'email_raw', emailRuw));
      }
      emails.push(...gevonden.emails);
    }
  }

  if (typeof phoneRuw === 'number' || (typeof phoneRuw === 'string' && /^\d+$/.test(tekst(phoneRuw)))) {
    const cijfers = tekst(phoneRuw).replace(/\D/g, '');
    const voorloop = metExcelVoorloopnul(cijfers);
    if (voorloop.aangevuld) {
      telefoon = voorloop.nummer;
      waarschuwingen.push(waarschuwing('excel_voorloopnul', 'Excel-getal van 9 cijfers aangevuld met een voorloopnul.', 'phone_raw', cijfers));
    } else {
      telefoon = cijfers;
      if (cijfers.length < 10 || cijfers.length > 15) {
        waarschuwingen.push(waarschuwing('telefoon_niet_eenduidig', 'Telefoongetal heeft een ongebruikelijke lengte en blijft ongewijzigd bewaard.', 'phone_raw', cijfers));
      }
    }
  } else if (tekst(phoneRuw)) {
    const ruw = tekst(phoneRuw);
    const gevonden = vindEmails(ruw);
    if (gevonden.onduidelijk) {
      waarschuwingen.push(waarschuwing('email_niet_eenduidig', 'Telefoonveld bevat een niet-eenduidig e-mailfragment. Er is geen adres en geen nummer uit gehaald.', 'phone_raw', ruw));
    } else if (gevonden.emails.length) {
      emails.push(...gevonden.emails);
      const uitRest = telefoonUitRest(gevonden.rest, waarschuwingen, 'phone_raw');
      if (uitRest) {
        telefoon = uitRest;
        waarschuwingen.push(waarschuwing('telefoon_en_email_samengevoegd', 'Telefoonnummer en e-mailadres stonden aan elkaar. Alleen het deel ná de cijfers, met een lokale naam die op een letter begint, is als adres gelezen.', 'phone_raw', ruw));
      } else {
        waarschuwingen.push(waarschuwing('email_in_telefoonveld', 'Waarde uit het telefoonveld is een e-mailadres en is niet als telefoon opgeslagen.', 'phone_raw', ruw));
      }
    } else if (/[A-Za-z]/.test(ruw)) {
      waarschuwingen.push(waarschuwing('telefoon_niet_eenduidig', 'Het telefoonveld bevat letters en is niet als nummer opgeslagen.', 'phone_raw', ruw));
    } else if (ruw.includes('/') || ruw.includes(';')) {
      telefoon = ruw;
      waarschuwingen.push(waarschuwing('meerdere_telefoons', 'Meerdere telefoonnummers blijven samen in het telefoonveld staan.', 'phone_raw', ruw));
    } else {
      telefoon = ruw;
    }
  }

  const uniek = [...new Set(emails)];
  if (uniek.length > 1) {
    waarschuwingen.push(waarschuwing('meerdere_emails', 'Meerdere e-mailadressen. Het eerste wordt het contactadres, de rest blijft in de bronpayload.', 'email_raw', uniek.join(', ')));
  }
  const email = uniek[0] ?? null;
  let mede: string | null = null;
  let organisatie: string | null = null;
  if (naam) {
    const icm = naam.split(/\s+(?:icm|ivm)\s+/i);
    if (icm.length > 1) mede = icm.slice(1).join(', ').trim() || null;
    const tav = naam.split(/\s+t\.?\s*a\.?\s*v\.?\s+/i);
    if (tav.length > 1 && tav[0]) organisatie = tav[0].trim();
    const paren = naam.match(/\(([^)]+)\)/);
    if (!organisatie && paren && /fotoclub|collectief|stichting|vereniging/i.test(paren[1])) organisatie = paren[1].trim();
  }

  return {
    naam: naam || null,
    email,
    telefoon,
    extraEmails: uniek.slice(1),
    mede,
    organisatie,
    emailSleutel: email ? email.toLowerCase() : null,
    telefoonSleutels: telefoon ? telefoonSleutelsVan(telefoon) : [],
    waarschuwingen,
  };
}

export interface PeriodeParse {
  start: string | null;
  eind: string | null;
  status: 'geannuleerd' | 'optie' | null;
  waarschuwingen: Waarschuwing[];
}

function statusUitTekst(blob: string): 'geannuleerd' | 'optie' | null {
  if (/geannuleerd|vervallen|niet doorgegaan|ingetrokken|afgezegd/i.test(blob)) return 'geannuleerd';
  if (/\boptie\b/i.test(blob)) return 'optie';
  return null;
}

function restIsInhoud(rest: string): string {
  return rest
    .replace(/\b(geannuleerd|vervallen|wanbetaling|exposant|optie|huwelijk|concert|uitvaart|geen betaling ontvangen|dd)\b/gi, ' ')
    .replace(/\b\d{1,2}\s*-\s*\d{1,2}\s*uur\b/gi, ' ')
    .replace(/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, ' ')
    .replace(/[.,;:*-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parsePeriode(ruw: string | null | undefined, jaar: number): PeriodeParse {
  const origineel = tekst(ruw);
  const waarschuwingen: Waarschuwing[] = [];
  const status = statusUitTekst(origineel);
  if (/wanbetaling/i.test(origineel)) {
    waarschuwingen.push(waarschuwing('wanbetaling', 'De bron noemt wanbetaling. De tekst blijft bewaard; er is geen aparte status van gemaakt.', 'period_raw', origineel));
  }
  if (!origineel) return { start: null, eind: null, status, waarschuwingen };

  const iso = origineel.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (iso) {
    const datum = ymd(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (!datum || Number(iso[1]) !== jaar) {
      waarschuwingen.push(waarschuwing('datum_niet_eenduidig', 'Excel-datum valt buiten het bronjaar en is niet opgeslagen.', 'period_raw', origineel));
      return { start: null, eind: null, status, waarschuwingen };
    }
    waarschuwingen.push(waarschuwing('excel_datetime', 'De periode was een Excel-datum. Alleen die ene dag is gebruikt.', 'period_raw', origineel));
    waarschuwingen.push(waarschuwing('periode_enkele_dag', 'De bron noemt één dag. Er is geen tweede dag bij verondersteld.', 'period_raw', origineel));
    return { start: datum, eind: datum, status, waarschuwingen };
  }

  const numeriek = origineel.match(/^(\d{1,2})-(\d{1,2})-(\d{4})\.?$/);
  if (numeriek) {
    const y = Number(numeriek[3]);
    if (y !== jaar) {
      waarschuwingen.push(waarschuwing('datum_jaar_wijkt_af', `De datum noemt ${y} terwijl het bestand ${jaar} is. Er is geen jaar gecorrigeerd.`, 'period_raw', origineel));
      return { start: null, eind: null, status, waarschuwingen };
    }
    const datum = ymd(y, Number(numeriek[2]), Number(numeriek[1]));
    if (!datum) {
      waarschuwingen.push(waarschuwing('ongeldige_datum', 'De numerieke datum bestaat niet en is niet opgeslagen.', 'period_raw', origineel));
      return { start: null, eind: null, status, waarschuwingen };
    }
    waarschuwingen.push(waarschuwing('periode_enkele_dag', 'De bron noemt één dag. Er is geen tweede dag bij verondersteld.', 'period_raw', origineel));
    return { start: datum, eind: datum, status, waarschuwingen };
  }

  const head = origineel.replace(/\s+/g, ' ');
  let start: string | null = null;
  let eind: string | null = null;
  let rest = '';
  let vorm: 'paar' | 'enkele' | 'samengevoegd' | null = null;

  const drie = head.match(/^([A-Za-z]+)\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})\b(.*)$/i);
  const crossNa = head.match(/^([A-Za-z]+)\s*(\d{1,2})\s*\/\s*(\d{1,2})\s+([A-Za-z]+)\b(.*)$/);
  const crossVoor = head.match(/^([A-Za-z]+)\s*(\d{1,2})\s*\/\s*([A-Za-z]+)\s*(\d{1,2})\b(.*)$/);
  const tweeMaand = head.match(/^([A-Za-z]+)\s*(\d{1,2})\s+([A-Za-z]+)\s*(\d{1,2})\b(.*)$/);
  const zelfde = head.match(/^([A-Za-z]+)\s*(\d{1,2})\s*(?:\/|\btm\b)\s*(\d{1,2})\b(.*)$/i);
  const geplakt = head.match(/^([A-Za-z]+)(\d{1,2})\b(.*)$/);
  const een = head.match(/^([A-Za-z]+)\s+(\d{1,2})\b(.*)$/);

  const zet = (maand1: number, dag1: number, maand2: number, dag2: number, jaar2 = jaar) => {
    start = ymd(jaar, maand1, dag1);
    eind = ymd(jaar2, maand2, dag2);
  };

  if (drie && maandVan(drie[1])) {
    const maand = maandVan(drie[1])!;
    zet(maand, Number(drie[2]), maand, Number(drie[4]));
    rest = drie[5] ?? '';
    vorm = 'paar';
  } else if (crossNa && maandVan(crossNa[1]) && maandVan(crossNa[4]) && !maandVan(crossNa[4]) === false) {
    const m1 = maandVan(crossNa[1])!;
    const m2 = maandVan(crossNa[4])!;
    zet(m1, Number(crossNa[2]), m2, Number(crossNa[3]), m2 < m1 ? jaar + 1 : jaar);
    rest = crossNa[5] ?? '';
    vorm = 'paar';
  } else if (crossVoor && maandVan(crossVoor[1]) && maandVan(crossVoor[3])) {
    const m1 = maandVan(crossVoor[1])!;
    const m2 = maandVan(crossVoor[3])!;
    zet(m1, Number(crossVoor[2]), m2, Number(crossVoor[4]), m2 < m1 ? jaar + 1 : jaar);
    rest = crossVoor[5] ?? '';
    vorm = 'paar';
  } else if (tweeMaand && maandVan(tweeMaand[1]) && maandVan(tweeMaand[3]) && tweeMaand[1].toLowerCase() !== tweeMaand[3].toLowerCase()) {
    const m1 = maandVan(tweeMaand[1])!;
    const m2 = maandVan(tweeMaand[3])!;
    zet(m1, Number(tweeMaand[2]), m2, Number(tweeMaand[4]), m2 < m1 ? jaar + 1 : jaar);
    rest = tweeMaand[5] ?? '';
    vorm = 'samengevoegd';
    waarschuwingen.push(waarschuwing('periode_zonder_scheiding', 'Twee maand-dagen stonden zonder schuine streep. Beide dagen zijn letterlijk gebruikt.', 'period_raw', origineel));
  } else if (zelfde && maandVan(zelfde[1])) {
    const maand = maandVan(zelfde[1])!;
    zet(maand, Number(zelfde[2]), maand, Number(zelfde[3]));
    rest = zelfde[4] ?? '';
    vorm = 'paar';
  } else if (geplakt && maandVan(geplakt[1]) && geplakt[1].length > 2) {
    const maand = maandVan(geplakt[1])!;
    const dag = Number(geplakt[2]);
    start = ymd(jaar, maand, dag);
    eind = start;
    rest = geplakt[3] ?? '';
    vorm = 'samengevoegd';
    waarschuwingen.push(waarschuwing('periode_zonder_scheiding', 'Maand en dag stonden aan elkaar. Alleen die ene dag is gebruikt.', 'period_raw', origineel));
    waarschuwingen.push(waarschuwing('periode_enkele_dag', 'De bron noemt één dag. Er is geen tweede dag bij verondersteld.', 'period_raw', origineel));
  } else if (een && maandVan(een[1])) {
    const maand = maandVan(een[1])!;
    const dag = Number(een[2]);
    start = ymd(jaar, maand, dag);
    eind = start;
    rest = een[3] ?? '';
    vorm = 'enkele';
    waarschuwingen.push(waarschuwing('periode_enkele_dag', 'De bron noemt één dag. Er is geen tweede dag bij verondersteld.', 'period_raw', origineel));
  }

  if (!start || !eind || eind < start) {
    waarschuwingen.push(waarschuwing('datum_niet_eenduidig', 'De periode is niet eenduidig als datum te lezen. Er is geen datum opgeslagen.', 'period_raw', origineel));
    return { start: null, eind: null, status, waarschuwingen };
  }
  const extra = restIsInhoud(rest);
  if (extra) {
    waarschuwingen.push(waarschuwing('periode_extra_tekst', `Na de datum staat nog tekst: ${extra}`, 'period_raw', origineel));
  }
  if (vorm === 'paar' && start !== eind) {
    const dagen = Math.round((Date.parse(`${eind}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
    if (!(weekdag(start) === 6 && weekdag(eind) === 0 && dagen === 1)) {
      waarschuwingen.push(waarschuwing('geen_zaterdag_zondag', 'De periode is niet een zaterdag plus de daaropvolgende zondag. De brondata zijn niet verschoven.', 'period_raw', origineel));
    }
  }
  return { start, eind, status, waarschuwingen };
}

function isWinterstopRecord(record: ImportRecord): boolean {
  const tenant = tekst(record.tenant_name_raw).toLowerCase();
  const periode = tekst(record.period_raw).toLowerCase();
  return record.row_type === 'winterstop' || tenant === 'winterstop' || periode === 'winterstop';
}

function isHuurder(record: ImportRecord): boolean {
  const tenant = tekst(record.tenant_name_raw);
  return tenant !== '' && tenant.toLowerCase() !== 'winterstop';
}

export function klasseer(record: ImportRecord): Klasse {
  if (isWinterstopRecord(record)) return 'winterstop';
  const periode = tekst(record.period_raw);
  const tenant = tekst(record.tenant_name_raw);
  if (record.row_type === 'note' || /^nb\b/i.test(periode)) return 'notitie';
  if (/^voor\b/i.test(periode) && !tenant) return 'notitie';
  if (tenant && !periode && vindEmails(tenant).emails.length && !vindEmails(tenant).rest.replace(/[;,]/g, '').trim()) return 'notitie';
  const inhoudelijk = tenant
    || tekst(record.email_raw)
    || tekst(record.phone_raw)
    || tekst(record.amount_due_raw)
    || tekst(record.contract_raw)
    || tekst(record.notes_raw)
    || tekst(record.installment_1_raw)
    || tekst(record.installment_2_raw)
    || Object.keys(record.historical_columns ?? {}).length > 0;
  return inhoudelijk ? 'huur' : 'beschikbaar';
}

export function controleerBron(bestand: BronBestand): string[] {
  const fouten: string[] = [];
  const records = bestand.import_records;
  if (records.length !== VERWACHTE_IMPORTRECORDS) {
    fouten.push(`import_records is ${records.length}, verwacht ${VERWACHTE_IMPORTRECORDS}.`);
  }
  const winter = records.filter(isWinterstopRecord).length;
  const notities = records.filter((record) => record.row_type === 'note').length;
  const huurders = records.filter(isHuurder).length;
  if (winter !== VERWACHTE_WINTERSTOP) fouten.push(`winterstop is ${winter}, verwacht ${VERWACHTE_WINTERSTOP}.`);
  if (notities !== VERWACHTE_NOTITIES) fouten.push(`notitieregels is ${notities}, verwacht ${VERWACHTE_NOTITIES}.`);
  if (huurders !== VERWACHTE_HUURDERS) fouten.push(`regels met huurder is ${huurders}, verwacht ${VERWACHTE_HUURDERS}.`);
  const jaren = new Set(records.map((record) => record.source_year));
  for (const jaar of [2026, 2027, 2028, 2029]) {
    if (!jaren.has(jaar)) fouten.push(`jaar ${jaar} ontbreekt.`);
  }
  const fingerprints = new Set(records.map((record) => record.source_fingerprint));
  if (fingerprints.size !== records.length) fouten.push('source_fingerprint is niet uniek binnen import_records.');
  return fouten;
}

function centenVan(waarde: unknown): number | null {
  if (leeg(waarde)) return null;
  if (typeof waarde === 'number') return Number.isFinite(waarde) ? Math.round(waarde * 100) : null;
  const schoon = tekst(waarde).replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(schoon)) return null;
  return Math.round(Number(schoon) * 100);
}

function euro(centen: number): string {
  return (centen / 100).toFixed(2);
}

function bevatTekst(hay: string | null | undefined, needle: string): boolean {
  const h = normNaam(hay ?? '');
  const n = normNaam(needle);
  return n.length > 0 && h.includes(n);
}

function labelVan(boeking: DbBoeking): string {
  return `#${boeking.id} ${boeking.huurder_naam_snapshot ?? boeking.interne_titel} ${boeking.start_datum}–${boeking.eind_datum} ${boeking.status}`;
}

function relatieExternalId(contact: Contact): string {
  const basis = contact.emailSleutel || contact.telefoonSleutels[0] || sleutelNaam(contact.naam ?? 'onbekend');
  return `relatie:${basis}`.slice(0, 180);
}

function nummerVoor(record: ImportRecord, bestaande: Set<string>): string {
  const basis = `HUV-${record.source_year}-${String(record.source_row).padStart(4, '0')}`;
  if (!bestaande.has(basis)) return basis;
  return `${basis}-${record.source_fingerprint.slice(0, 6)}`;
}

function notitieRegels(record: ImportRecord, contact: Contact, opgeslagenFinancieel: boolean): string[] {
  const regels: string[] = [];
  if (tekst(record.contract_raw)) regels.push(`Contract: ${tekst(record.contract_raw)}`);
  if (tekst(record.notes_raw)) regels.push(tekst(record.notes_raw));
  if (!opgeslagenFinancieel && tekst(record.amount_due_raw)) regels.push(`Te betalen (bron): ${tekst(record.amount_due_raw)}`);
  if (!opgeslagenFinancieel && tekst(record.installment_1_raw)) regels.push(`Termijn 1 (bron): ${tekst(record.installment_1_raw)}`);
  if (!opgeslagenFinancieel && tekst(record.installment_2_raw)) regels.push(`Termijn 2 (bron): ${tekst(record.installment_2_raw)}`);
  if (contact.extraEmails.length) regels.push(`Extra e-mail: ${contact.extraEmails.join(', ')}`);
  for (const [sleutel, waarde] of Object.entries(record.historical_columns ?? {})) {
    if (!leeg(waarde)) regels.push(`${sleutel}: ${tekst(waarde)}`);
  }
  return regels;
}

function samenvoegenNotities(huidig: string | null, titel: string, regels: string[]): { tekst: string; toegevoegd: string[] } | null {
  const toegevoegd = regels.filter((regel) => !bevatTekst(huidig, regel) && !bevatTekst(titel, regel));
  if (!toegevoegd.length) return null;
  const basis = tekst(huidig);
  return { tekst: basis ? `${basis}\n${toegevoegd.join('\n')}` : toegevoegd.join('\n'), toegevoegd };
}

function dollar(waarde: string): string {
  let tag = 'hist';
  while (waarde.includes(`$${tag}$`)) tag += 'x';
  return `$${tag}$${waarde}$${tag}$`;
}

function sqlDatum(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`Ongeldige datum in SQL: ${iso}`);
  return `date '${iso}'`;
}

function sqlGetal(waarde: number): string {
  if (!Number.isFinite(waarde)) throw new Error('Ongeldig bedrag in SQL');
  return (Math.round(waarde * 100) / 100).toFixed(2);
}

function sqlTekst(waarde: string | null): string {
  if (waarde == null) return 'null';
  return dollar(waarde);
}

function legeJaar(): JaarTelling {
  return { bronregels: 0, nieuw: 0, bestaand: 0, aangevuld: 0, conflict: 0, warning: 0, beschikbaar: 0, winterstop: 0, nietVerwerkt: 0 };
}

function basisRegel(record: ImportRecord, klasse: Klasse): PlanRegel {
  return {
    uitkomst: 'NIET_VERWERKT',
    klasse,
    source_year: record.source_year,
    source_file: record.source_file,
    source_sheet: record.source_sheet ?? null,
    source_row: record.source_row,
    source_fingerprint: record.source_fingerprint,
    huurder: tekst(record.tenant_name_raw) || null,
    periode: tekst(record.period_raw) || null,
    start: null,
    eind: null,
    database_id: null,
    database_tabel: null,
    database_label: null,
    gekoppeld_fingerprint: null,
    reden: '',
    warnings: [],
    conflicten: [],
    aanvullingen: [],
    record,
  };
}

function beslissendeUitkomst(regel: PlanRegel, gekoppeld: boolean, nieuw: boolean, soort: Uitkomst): Uitkomst {
  if (nieuw) return soort;
  if (regel.conflicten.length) return 'CONFLICT_REVIEW_REQUIRED';
  if (!gekoppeld) return regel.uitkomst;
  if (regel.aanvullingen.length) return 'MATCHED_ENRICHED';
  return 'MATCHED_UNCHANGED';
}

interface Werk {
  db: HistorischeDb;
  nummers: Set<string>;
  volgendeId: number;
  gepland: Map<number, PlanRegel>;
}

function maakWerk(db: HistorischeDb): Werk {
  const kloon = structuredClone(db);
  const ids = [
    ...kloon.boekingen.map((rij) => rij.id),
    ...kloon.relaties.map((rij) => rij.id),
    ...kloon.betalingen.map((rij) => rij.id),
    ...kloon.blokkades.map((rij) => rij.id),
  ];
  return {
    db: kloon,
    nummers: new Set(kloon.boekingen.map((rij) => rij.nummer).filter((nummer): nummer is string => Boolean(nummer))),
    volgendeId: Math.min(-1, ...(ids.length ? [Math.min(...ids) - 1] : [-1])),
    gepland: new Map(),
  };
}

function boekingOpFingerprint(werk: Werk, fingerprint: string): DbBoeking | undefined {
  return werk.db.boekingen.find((boeking) => boeking.migration_source === HISTORISCHE_HUUR_BRON && boeking.migration_external_id === fingerprint);
}

function blokkadeOpFingerprint(werk: Werk, fingerprint: string): DbBlokkade | undefined {
  return werk.db.blokkades.find((blok) => blok.migration_source === HISTORISCHE_HUUR_BRON && blok.migration_external_id === fingerprint);
}

function vergelijkStatus(regel: PlanRegel, boeking: DbBoeking, gewenst: 'geannuleerd' | 'optie' | 'migratie_vastgelegd', expliciet: boolean) {
  if (!expliciet) {
    if (boeking.status === 'geannuleerd' && gewenst !== 'geannuleerd') {
      regel.conflicten.push({
        veld: 'status',
        bronwaarde: 'actieve huur (geen annulering in de bron)',
        databasewaarde: boeking.status,
        database_id: boeking.id,
        database_label: labelVan(boeking),
      });
    }
    return;
  }
  const compatibel = gewenst === 'geannuleerd'
    ? boeking.status === 'geannuleerd'
    : boeking.status === 'optie' || boeking.status === 'optie_verlopen';
  if (!compatibel) {
    regel.conflicten.push({
      veld: 'status',
      bronwaarde: gewenst,
      databasewaarde: boeking.status,
      database_id: boeking.id,
      database_label: labelVan(boeking),
    });
  }
}

function vulTekst(
  regel: PlanRegel,
  tabel: Aanvulling['tabel'],
  id: number,
  veld: string,
  huidig: string | null | undefined,
  bron: string | null | undefined,
  gelijk: (a: string, b: string) => boolean = (a, b) => sleutelNaam(a) === sleutelNaam(b),
) {
  if (leeg(bron)) return;
  if (leeg(huidig)) {
    regel.aanvullingen.push({ tabel, id, veld, van: '', naar: tekst(bron), modus: 'leeg' });
    return;
  }
  if (!gelijk(tekst(huidig), tekst(bron))) {
    regel.conflicten.push({
      veld,
      bronwaarde: tekst(bron),
      databasewaarde: tekst(huidig),
      database_id: id > 0 ? id : null,
      database_label: `${tabel} #${id}`,
    });
  }
}

function vulBedrag(regel: PlanRegel, tabel: Aanvulling['tabel'], id: number, veld: string, huidig: unknown, bron: number | null) {
  if (bron == null) return;
  const bestaand = centenVan(huidig);
  if (bestaand == null) {
    regel.aanvullingen.push({ tabel, id, veld, van: '', naar: bron.toFixed(2), modus: 'leeg' });
    return;
  }
  if (bestaand !== Math.round(bron * 100)) {
    regel.conflicten.push({
      veld,
      bronwaarde: bron.toFixed(2),
      databasewaarde: euro(bestaand),
      database_id: id > 0 ? id : null,
      database_label: `${tabel} #${id}`,
    });
  }
}

function planBetaling(
  regel: PlanRegel,
  werk: Werk,
  boeking: DbBoeking,
  soort: 'aanbetaling' | 'restant',
  termijn: Termijn,
  ruw: string,
  fingerprint: string,
  record: ImportRecord,
  doel: NieuwBetaling[],
) {
  if (!ruw || termijn.bedrag == null || termijn.status == null) return;
  const bestaande = werk.db.betalingen.filter((betaling) => betaling.boeking_id === boeking.id && betaling.soort === soort);
  if (bestaande.length > 1) {
    regel.conflicten.push({
      veld: soort,
      bronwaarde: ruw,
      databasewaarde: `${bestaande.length} bestaande ${soort}-regels`,
      database_id: boeking.id,
      database_label: labelVan(boeking),
    });
    return;
  }
  if (bestaande.length === 1) {
    const betaling = bestaande[0];
    vulBedrag(regel, 'betalingen', betaling.id, `${soort}.bedrag`, betaling.bedrag, termijn.bedrag);
    if (betaling.status !== termijn.status) {
      regel.conflicten.push({
        veld: `${soort}.status`,
        bronwaarde: termijn.status,
        databasewaarde: betaling.status,
        database_id: betaling.id,
        database_label: labelVan(boeking),
      });
    }
    vulTekst(regel, 'betalingen', betaling.id, 'referentie', betaling.referentie, ruw, (a, b) => normNaam(a) === normNaam(b) || normNaam(a).includes(normNaam(b)) || normNaam(b).includes(normNaam(a)));
    return;
  }
  if (boeking.id < 0) {
    doel.push({
      boekingId: null,
      boekingFingerprint: boeking.migration_external_id || fingerprint,
      soort,
      bedrag: termijn.bedrag,
      status: termijn.status,
      vervaldatum: termijn.vervaldatum,
      ontvangenOp: termijn.ontvangenOp,
      referentie: ruw,
      externalId: `${fingerprint}:${soort}`,
      sourceFile: record.source_file,
      sourceRow: record.source_row,
    });
    return;
  }
  doel.push({
    boekingId: boeking.id,
    boekingFingerprint: fingerprint,
    soort,
    bedrag: termijn.bedrag,
    status: termijn.status,
    vervaldatum: termijn.vervaldatum,
    ontvangenOp: termijn.ontvangenOp,
    referentie: ruw,
    externalId: `${fingerprint}:${soort}`,
    sourceFile: record.source_file,
    sourceRow: record.source_row,
  });
}

function verrijkBoeking(
  regel: PlanRegel,
  werk: Werk,
  boeking: DbBoeking,
  record: ImportRecord,
  contact: Contact,
  periode: PeriodeParse,
  tarief: number | null,
  termijn1: Termijn,
  termijn2: Termijn,
) {
  regel.database_id = boeking.id > 0 ? boeking.id : null;
  regel.database_tabel = 'boekingen';
  regel.database_label = labelVan(boeking);
  regel.gekoppeld_fingerprint = boeking.id < 0 ? boeking.migration_external_id : null;
  regel.start = boeking.start_datum;
  regel.eind = boeking.eind_datum;
  if (periode.start && periode.eind) {
    const exact = boeking.start_datum === periode.start && boeking.eind_datum === periode.eind;
    const dbBevatBron = boeking.start_datum <= periode.start && boeking.eind_datum >= periode.eind;
    if (!exact && dbBevatBron) {
      regel.warnings.push(waarschuwing('bronperiode_minder_specifiek', 'De brondatum valt binnen de bestaande periode. De datums zijn niet ingekort.', 'period_raw', tekst(record.period_raw)));
    } else if (!exact) {
      regel.conflicten.push({
        veld: 'periode',
        bronwaarde: `${periode.start}–${periode.eind}`,
        databasewaarde: `${boeking.start_datum}–${boeking.eind_datum}`,
        database_id: boeking.id > 0 ? boeking.id : null,
        database_label: labelVan(boeking),
      });
    }
  }
  const expliciet = periode.status != null || statusUitTekst(`${tekst(record.notes_raw)} ${tekst(record.tenant_name_raw)}`) != null;
  const gewenst = (periode.status ?? statusUitTekst(tekst(record.notes_raw)) ?? 'migratie_vastgelegd') as 'geannuleerd' | 'optie' | 'migratie_vastgelegd';
  vergelijkStatus(regel, boeking, gewenst, expliciet || gewenst === 'geannuleerd');
  vulTekst(regel, 'boekingen', boeking.id, 'huurder_naam_snapshot', boeking.huurder_naam_snapshot, contact.naam, namenKomenOvereen);
  vulTekst(regel, 'boekingen', boeking.id, 'huurder_email_snapshot', boeking.huurder_email_snapshot, contact.email, (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase());
  if (contact.telefoon) {
    const dbSleutels = telefoonSleutelsVan(boeking.huurder_telefoon_snapshot ?? '');
    if (!dbSleutels.length) {
      regel.aanvullingen.push({ tabel: 'boekingen', id: boeking.id, veld: 'huurder_telefoon_snapshot', van: '', naar: contact.telefoon, modus: 'leeg' });
    } else if (contact.telefoonSleutels.length && !contact.telefoonSleutels.some((sleutel) => dbSleutels.includes(sleutel))) {
      regel.conflicten.push({
        veld: 'huurder_telefoon_snapshot',
        bronwaarde: contact.telefoon,
        databasewaarde: tekst(boeking.huurder_telefoon_snapshot),
        database_id: boeking.id > 0 ? boeking.id : null,
        database_label: labelVan(boeking),
      });
    }
  }
  vulTekst(regel, 'boekingen', boeking.id, 'mede_exposanten', boeking.mede_exposanten, contact.mede);
  if (boeking.tarief_prijstype === 'op_aanvraag' && tarief != null) {
    regel.conflicten.push({
      veld: 'tarief_bedrag',
      bronwaarde: tarief.toFixed(2),
      databasewaarde: 'op_aanvraag',
      database_id: boeking.id > 0 ? boeking.id : null,
      database_label: labelVan(boeking),
    });
  } else {
    vulBedrag(regel, 'boekingen', boeking.id, 'tarief_bedrag', boeking.tarief_bedrag, tarief);
    if (tarief != null && leeg(boeking.tarief_bedrag) && leeg(boeking.tarief_prijstype)) {
      regel.aanvullingen.push({ tabel: 'boekingen', id: boeking.id, veld: 'tarief_prijstype', van: '', naar: 'vast', modus: 'leeg' });
    }
  }
  vulBedrag(regel, 'boekingen', boeking.id, 'aanbetaling_bedrag', boeking.aanbetaling_bedrag, termijn1.bedrag);
  const type = classificeerVerhuurtype(`${tekst(record.period_raw)} ${tekst(record.tenant_name_raw)} ${tekst(record.notes_raw)}`);
  if (type.uitkomst === 'zeker') {
    vulTekst(regel, 'boekingen', boeking.id, 'verhuurtype_sleutel', boeking.verhuurtype_sleutel, type.type, (a, b) => a === b);
  } else if (/pasen|pinksteren/i.test(type.reden)) {
    regel.warnings.push(waarschuwing('verhuurtype_review', type.reden, 'verhuurtype_sleutel'));
  }
  const opgeslagen = tarief != null || termijn1.bedrag != null || termijn2.bedrag != null;
  const samen = samenvoegenNotities(boeking.interne_notities, boeking.interne_titel, notitieRegels(record, contact, opgeslagen));
  if (samen && boeking.id > 0) {
    regel.aanvullingen.push({ tabel: 'boekingen', id: boeking.id, veld: 'interne_notities', van: tekst(boeking.interne_notities), naar: samen.tekst, modus: 'cas' });
  } else if (samen && boeking.id < 0) {
    const gepland = werk.gepland.get(boeking.id);
    if (gepland?.nieuw?.boeking && leeg(gepland.nieuw.boeking.notities)) gepland.nieuw.boeking.notities = samen.tekst;
  }
  const betalingen: NieuwBetaling[] = [];
  planBetaling(regel, werk, boeking, 'aanbetaling', termijn1, tekst(record.installment_1_raw), record.source_fingerprint, record, betalingen);
  planBetaling(regel, werk, boeking, 'restant', termijn2, tekst(record.installment_2_raw), record.source_fingerprint, record, betalingen);
  if (betalingen.length) {
    regel.nieuw = { ...(regel.nieuw ?? {}), betalingen };
  }
  if (boeking.huurder_relatie_id) {
    const relatie = werk.db.relaties.find((rij) => rij.id === boeking.huurder_relatie_id);
    if (relatie) verrijkRelatie(regel, relatie, contact);
  }
}

function verrijkRelatie(regel: PlanRegel, relatie: DbRelatie, contact: Contact) {
  vulTekst(regel, 'relaties', relatie.id, 'email', relatie.email, contact.email, (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase());
  if (contact.telefoon) {
    const dbSleutels = telefoonSleutelsVan(relatie.telefoon ?? '');
    if (!dbSleutels.length) {
      regel.aanvullingen.push({ tabel: 'relaties', id: relatie.id, veld: 'telefoon', van: '', naar: contact.telefoon, modus: 'leeg' });
    } else if (contact.telefoonSleutels.length && !contact.telefoonSleutels.some((sleutel) => dbSleutels.includes(sleutel))) {
      regel.conflicten.push({
        veld: 'relaties.telefoon',
        bronwaarde: contact.telefoon,
        databasewaarde: tekst(relatie.telefoon),
        database_id: relatie.id > 0 ? relatie.id : null,
        database_label: `relatie #${relatie.id} ${relatie.naam}`,
      });
    }
  }
  vulTekst(regel, 'relaties', relatie.id, 'organisatie', relatie.organisatie, contact.organisatie);
}

function kiesRelatie(werk: Werk, contact: Contact): { relatie?: DbRelatie; conflict?: string } {
  const opEmail = contact.emailSleutel
    ? werk.db.relaties.filter((relatie) => tekst(relatie.email).toLowerCase() === contact.emailSleutel)
    : [];
  const opTel = contact.telefoonSleutels.length
    ? werk.db.relaties.filter((relatie) => telefoonSleutelsVan(relatie.telefoon ?? '').some((sleutel) => contact.telefoonSleutels.includes(sleutel)) && namenKomenOvereen(relatie.naam, contact.naam))
    : [];
  const opNaam = werk.db.relaties.filter((relatie) => namenKomenOvereen(relatie.naam, contact.naam));
  const ids = new Set([...opEmail, ...opTel, ...opNaam].map((relatie) => relatie.id));
  if (ids.size > 1) return { conflict: `meerdere relaties (${[...ids].join(', ')})` };
  return { relatie: opEmail[0] ?? opTel[0] ?? opNaam[0] };
}

function overlapt(aStart: string, aEind: string, bStart: string, bEind: string): boolean {
  return aStart <= bEind && bStart <= aEind;
}

function planHuur(werk: Werk, record: ImportRecord): PlanRegel {
  const regel = basisRegel(record, 'huur');
  const contact = interpreteerContact(record);
  const periode = parsePeriode(record.period_raw, record.source_year);
  const tarief = parseZuiverBedrag(record.amount_due_raw);
  const termijn1 = parseTermijn(record.installment_1_raw, 'installment_1_raw');
  const termijn2 = parseTermijn(record.installment_2_raw, 'installment_2_raw');
  regel.warnings.push(...contact.waarschuwingen, ...periode.waarschuwingen, ...tarief.waarschuwingen, ...termijn1.waarschuwingen, ...termijn2.waarschuwingen);
  if (!leeg(record.amount_due_raw) && tarief.bedrag == null) {
    regel.warnings.push(waarschuwing('bedrag_niet_eenduidig', 'Totaalbedrag is niet als zuiver bedrag gelezen en blijft alleen in de bronpayload.', 'amount_due_raw', tekst(record.amount_due_raw)));
  }
  regel.huurder = contact.naam;
  regel.start = periode.start;
  regel.eind = periode.eind;

  const viaFingerprint = boekingOpFingerprint(werk, record.source_fingerprint);
  const viaBron = werk.db.bronregels.find((rij) => rij.source_fingerprint === record.source_fingerprint && rij.doel_tabel === 'boekingen' && rij.doel_id);
  const viaBronBoeking = viaBron ? werk.db.boekingen.find((boeking) => boeking.id === viaBron.doel_id) : undefined;
  if (!periode.start || !periode.eind) {
    if (viaFingerprint || viaBronBoeking) {
      verrijkBoeking(regel, werk, (viaFingerprint ?? viaBronBoeking)!, record, contact, periode, tarief.bedrag, termijn1, termijn2);
      regel.uitkomst = beslissendeUitkomst(regel, true, false, 'MATCHED_UNCHANGED');
      regel.reden = 'Eerder gekoppelde bronregel, nog steeds zonder eenduidige datum.';
      return regel;
    }
    regel.uitkomst = 'NIET_VERWERKT';
    regel.reden = 'Geen eenduidige datum. Er is geen reservering aangemaakt en er is niets geraden.';
    return regel;
  }

  const start = periode.start;
  const eind = periode.eind;
  const bronHoortBijHuurder = viaBronBoeking
    ? namenKomenOvereen(viaBronBoeking.huurder_naam_snapshot ?? viaBronBoeking.interne_titel, contact.naam)
    : false;
  let boeking = viaFingerprint ?? (bronHoortBijHuurder ? viaBronBoeking : undefined);
  if (!boeking) {
    const exact = werk.db.boekingen.filter((rij) => rij.start_datum === start && rij.eind_datum === eind);
    const opNaam = exact.filter((rij) => namenKomenOvereen(rij.huurder_naam_snapshot ?? rij.interne_titel, contact.naam));
    const opEmail = contact.emailSleutel ? exact.filter((rij) => tekst(rij.huurder_email_snapshot).toLowerCase() === contact.emailSleutel) : [];
    const opTel = contact.telefoonSleutels.length
      ? exact.filter((rij) => telefoonSleutelsVan(rij.huurder_telefoon_snapshot ?? '').some((sleutel) => contact.telefoonSleutels.includes(sleutel)))
      : [];
    const gekozen = uniek([...opNaam, ...opEmail, ...opTel]);
    if (gekozen.length > 1) {
      regel.uitkomst = 'CONFLICT_REVIEW_REQUIRED';
      regel.reden = 'Meerdere bestaande reserveringen op dezelfde periode en kenmerken.';
      regel.conflicten.push({
        veld: 'match',
        bronwaarde: contact.naam ?? '',
        databasewaarde: gekozen.map((rij) => labelVan(rij)).join(' | '),
        database_id: null,
        database_label: gekozen.map((rij) => `#${rij.id}`).join(', '),
      });
      return regel;
    }
    if (gekozen.length === 1) boeking = gekozen[0];
    if (!boeking) {
      const org = contact.naam ? organisatieSleutel(contact.naam) : null;
      const opOrg = org ? exact.filter((rij) => organisatieSleutel(`${rij.huurder_naam_snapshot ?? ''} ${rij.interne_titel}`) === org) : [];
      if (opOrg.length === 1) {
        regel.database_id = opOrg[0].id > 0 ? opOrg[0].id : null;
        regel.database_tabel = 'boekingen';
        regel.database_label = labelVan(opOrg[0]);
        regel.uitkomst = 'CONFLICT_REVIEW_REQUIRED';
        regel.reden = 'Zelfde periode en organisatie, andere contactpersoon. Niets overschreven en geen tweede reservering gemaakt.';
        regel.conflicten.push({
          veld: 'huurder',
          bronwaarde: contact.naam ?? '',
          databasewaarde: tekst(opOrg[0].huurder_naam_snapshot),
          database_id: opOrg[0].id > 0 ? opOrg[0].id : null,
          database_label: labelVan(opOrg[0]),
        });
        return regel;
      }
      const overlap = werk.db.boekingen.filter((rij) => overlapt(rij.start_datum, rij.eind_datum, start, eind) && namenKomenOvereen(rij.huurder_naam_snapshot ?? rij.interne_titel, contact.naam));
      if (overlap.length > 1) {
        regel.uitkomst = 'CONFLICT_REVIEW_REQUIRED';
        regel.reden = 'Meerdere overlappende reserveringen met dezelfde huurder.';
        regel.conflicten.push({
          veld: 'match',
          bronwaarde: `${start}–${eind}`,
          databasewaarde: overlap.map((rij) => labelVan(rij)).join(' | '),
          database_id: null,
          database_label: overlap.map((rij) => `#${rij.id}`).join(', '),
        });
        return regel;
      }
      if (overlap.length === 1) boeking = overlap[0];
    }
  }

  if (boeking) {
    verrijkBoeking(regel, werk, boeking, record, contact, periode, tarief.bedrag, termijn1, termijn2);
    regel.uitkomst = beslissendeUitkomst(regel, true, false, 'MATCHED_UNCHANGED');
    regel.reden = regel.uitkomst === 'CONFLICT_REVIEW_REQUIRED'
      ? 'Bestaande reservering gekoppeld. Afwijkende waarden zijn niet overschreven.'
      : regel.uitkomst === 'MATCHED_ENRICHED'
        ? 'Bestaande reservering aangevuld op lege velden.'
        : 'Bestaande reservering komt al overeen.';
    return regel;
  }

  if (!contact.naam) {
    regel.uitkomst = 'NIET_VERWERKT';
    regel.reden = 'Wel een datum, maar geen huurder. Er is geen fictieve huurder aangemaakt.';
    return regel;
  }
  const gewenst = periode.status ?? statusUitTekst(`${tekst(record.notes_raw)} ${contact.naam}`) ?? 'migratie_vastgelegd';
  if (gewenst === 'optie') {
    const blok = werk.db.boekingen.some((rij) => (rij.status === 'optie' || rij.status === 'definitief') && overlapt(rij.start_datum, rij.eind_datum, start, eind));
    if (blok) {
      regel.uitkomst = 'CONFLICT_REVIEW_REQUIRED';
      regel.reden = 'Bron noemt een optie op een periode die al een actieve optie of definitieve boeking heeft. Niets toegevoegd.';
      regel.conflicten.push({
        veld: 'status',
        bronwaarde: 'optie',
        databasewaarde: 'overlappende optie of definitief',
        database_id: null,
        database_label: `${start}–${eind}`,
      });
      return regel;
    }
  }
  const relatieKeuze = kiesRelatie(werk, contact);
  if (relatieKeuze.conflict) {
    regel.warnings.push(waarschuwing('relatie_niet_uniek', relatieKeuze.conflict, 'relatie'));
  }
  const type = classificeerVerhuurtype(`${tekst(record.period_raw)} ${contact.naam} ${tekst(record.notes_raw)}`);
  const notities = notitieRegels(record, contact, true).join('\n') || null;
  const id = werk.volgendeId--;
  const externalRelatie = relatieExternalId(contact);
  const nieuw: NieuwDomein = {
    boeking: {
      fingerprint: record.source_fingerprint,
      nummer: nummerVoor(record, werk.nummers),
      status: gewenst,
      verhuurtype: type.uitkomst === 'zeker' ? type.type : null,
      titel: contact.naam,
      start,
      eind,
      relatieId: relatieKeuze.relatie?.id ?? null,
      relatieExternalId: relatieKeuze.relatie ? null : externalRelatie,
      naam: contact.naam,
      email: contact.email,
      telefoon: contact.telefoon,
      mede: contact.mede,
      tarief: tarief.bedrag,
      aanbetaling: termijn1.bedrag,
      notities,
      sourceFile: record.source_file,
      sourceRow: record.source_row,
    },
  };
  if (!relatieKeuze.relatie) {
    nieuw.relatie = {
      externalId: externalRelatie,
      naam: contact.naam,
      email: contact.email,
      telefoon: contact.telefoon,
      organisatie: contact.organisatie,
    };
  } else if (relatieKeuze.relatie.id > 0) {
    verrijkRelatie(regel, relatieKeuze.relatie, contact);
  }
  werk.nummers.add(nieuw.boeking!.nummer);
  const schaduw: DbBoeking = {
    id,
    status: gewenst,
    start_datum: start,
    eind_datum: eind,
    interne_titel: contact.naam,
    huurder_naam_snapshot: contact.naam,
    huurder_email_snapshot: contact.email,
    huurder_telefoon_snapshot: contact.telefoon,
    huurder_relatie_id: relatieKeuze.relatie?.id ?? null,
    interne_notities: notities,
    mede_exposanten: contact.mede,
    tarief_bedrag: tarief.bedrag,
    tarief_prijstype: tarief.bedrag != null ? 'vast' : null,
    aanbetaling_bedrag: termijn1.bedrag,
    verhuurtype_sleutel: nieuw.boeking!.verhuurtype,
    migration_source: HISTORISCHE_HUUR_BRON,
    migration_external_id: record.source_fingerprint,
    nummer: nieuw.boeking!.nummer,
  };
  werk.db.boekingen.push(schaduw);
  if (nieuw.relatie) {
    werk.db.relaties.push({
      id: werk.volgendeId--,
      naam: nieuw.relatie.naam,
      email: nieuw.relatie.email,
      telefoon: nieuw.relatie.telefoon,
      organisatie: nieuw.relatie.organisatie,
      notities: null,
      migration_source: HISTORISCHE_HUUR_BRON,
      migration_external_id: nieuw.relatie.externalId,
    });
  }
  regel.nieuw = nieuw;
  werk.gepland.set(id, regel);
  const betalingen: NieuwBetaling[] = [];
  planBetaling(regel, werk, schaduw, 'aanbetaling', termijn1, tekst(record.installment_1_raw), record.source_fingerprint, record, betalingen);
  planBetaling(regel, werk, schaduw, 'restant', termijn2, tekst(record.installment_2_raw), record.source_fingerprint, record, betalingen);
  if (betalingen.length) regel.nieuw.betalingen = betalingen;
  regel.uitkomst = 'CREATED';
  regel.reden = gewenst === 'geannuleerd'
    ? 'Nieuwe historische reservering met status geannuleerd.'
    : 'Nieuwe historische reservering.';
  regel.database_tabel = 'boekingen';
  return regel;
}

function uniek(boekingen: DbBoeking[]): DbBoeking[] {
  const gezien = new Set<number>();
  return boekingen.filter((boeking) => (gezien.has(boeking.id) ? false : (gezien.add(boeking.id), true)));
}

function planWinterstop(werk: Werk, record: ImportRecord): PlanRegel {
  const regel = basisRegel(record, 'winterstop');
  const periode = parsePeriode(record.period_raw, record.source_year);
  regel.warnings.push(...periode.waarschuwingen.filter((item) => item.code !== 'geen_zaterdag_zondag'));
  const bestaandFingerprint = blokkadeOpFingerprint(werk, record.source_fingerprint);
  if (!periode.start || !periode.eind) {
    if (bestaandFingerprint) {
      regel.uitkomst = 'WINTERSTOP_MATCHED';
      regel.database_id = bestaandFingerprint.id;
      regel.database_tabel = 'interne_activiteiten';
      regel.database_label = `blokkade #${bestaandFingerprint.id}`;
      regel.reden = 'Winterstop zonder leesbare datum was al gekoppeld.';
      return regel;
    }
    regel.uitkomst = 'NIET_VERWERKT';
    regel.reden = 'Winterstop zonder eenduidige datum. Er is geen blokkade en geen huurder Winterstop aangemaakt.';
    regel.warnings.push(waarschuwing('winterstop_zonder_datum', 'De winterstopregel heeft geen leesbare periode.', 'period_raw', tekst(record.period_raw)));
    return regel;
  }
  const dekkend = werk.db.blokkades.filter((blok) => blok.blokkeert_verhuurkalender && blok.start_datum <= periode.start! && blok.eind_datum >= periode.eind!);
  const exact = dekkend.find((blok) => blok.start_datum === periode.start && blok.eind_datum === periode.eind) ?? bestaandFingerprint ?? dekkend[0];
  if (exact) {
    regel.uitkomst = 'WINTERSTOP_MATCHED';
    regel.database_id = exact.id > 0 ? exact.id : null;
    regel.database_tabel = 'interne_activiteiten';
    regel.database_label = `#${exact.id} ${exact.titel} ${exact.start_datum}–${exact.eind_datum}`;
    regel.start = exact.start_datum;
    regel.eind = exact.eind_datum;
    regel.reden = 'Bestaande blokkade dekt deze winterstop. Geen tweede blokkade en geen huurder.';
    if (exact.start_datum !== periode.start || exact.eind_datum !== periode.eind) {
      regel.warnings.push(waarschuwing('winterstop_bredere_blokkade', 'Een bestaande blokkade is breder dan dit weekend. Die is niet vervangen.', 'period_raw', tekst(record.period_raw)));
    }
    return regel;
  }
  const id = werk.volgendeId--;
  regel.nieuw = {
    blokkade: {
      fingerprint: record.source_fingerprint,
      titel: 'Winterstop',
      start: periode.start,
      eind: periode.eind,
      blokkeert: true,
      notities: `Winterstop uit ${record.source_file}, rij ${record.source_row}.`,
      sourceFile: record.source_file,
      sourceRow: record.source_row,
    },
  };
  werk.db.blokkades.push({
    id,
    titel: 'Winterstop',
    start_datum: periode.start,
    eind_datum: periode.eind,
    blokkeert_verhuurkalender: true,
    notities: regel.nieuw.blokkade!.notities,
    migration_source: HISTORISCHE_HUUR_BRON,
    migration_external_id: record.source_fingerprint,
  });
  regel.uitkomst = 'WINTERSTOP_CREATED';
  regel.start = periode.start;
  regel.eind = periode.eind;
  regel.database_tabel = 'interne_activiteiten';
  regel.reden = 'Nieuwe winterstop-blokkade. Geen relatie Winterstop.';
  return regel;
}

function planNotitie(werk: Werk, record: ImportRecord): PlanRegel {
  const regel = basisRegel(record, 'notitie');
  const periode = tekst(record.period_raw);
  const match = periode.match(/(\d{1,2})\s+([A-Za-z]+)/);
  const maand = match ? maandVan(match[2]) : null;
  const datum = match && maand ? ymd(record.source_year, maand, Number(match[1])) : null;
  if (!datum || !/^nb\b/i.test(periode)) {
    regel.uitkomst = 'NOTITIE_BEWAARD';
    regel.reden = 'Losse notitie blijft in de bronregistratie. Er is geen reservering van gemaakt.';
    return regel;
  }
  const bestaand = blokkadeOpFingerprint(werk, record.source_fingerprint)
    ?? werk.db.blokkades.find((blok) => blok.start_datum === datum && blok.eind_datum === datum && normNaam(blok.titel) === normNaam(periode));
  if (bestaand) {
    regel.uitkomst = 'NOTITIE_BEWAARD';
    regel.database_id = bestaand.id > 0 ? bestaand.id : null;
    regel.database_tabel = 'interne_activiteiten';
    regel.database_label = `#${bestaand.id} ${bestaand.titel}`;
    regel.start = datum;
    regel.eind = datum;
    regel.reden = 'Notitie was al als interne activiteit vastgelegd en blokkeert de verhuur niet opnieuw.';
    return regel;
  }
  regel.nieuw = {
    blokkade: {
      fingerprint: record.source_fingerprint,
      titel: periode,
      start: datum,
      eind: datum,
      blokkeert: false,
      notities: `Notitie uit ${record.source_file}, rij ${record.source_row}. Blokkeert de verhuurkalender niet.`,
      sourceFile: record.source_file,
      sourceRow: record.source_row,
    },
  };
  werk.db.blokkades.push({
    id: werk.volgendeId--,
    titel: periode,
    start_datum: datum,
    eind_datum: datum,
    blokkeert_verhuurkalender: false,
    notities: regel.nieuw.blokkade!.notities,
    migration_source: HISTORISCHE_HUUR_BRON,
    migration_external_id: record.source_fingerprint,
  });
  regel.uitkomst = 'NOTITIE_BEWAARD';
  regel.start = datum;
  regel.eind = datum;
  regel.database_tabel = 'interne_activiteiten';
  regel.reden = 'Losse kalendernotitie vastgelegd als interne activiteit die de verhuur niet blokkeert.';
  return regel;
}

function planBeschikbaar(werk: Werk, record: ImportRecord): PlanRegel {
  const regel = basisRegel(record, 'beschikbaar');
  const periode = parsePeriode(record.period_raw, record.source_year);
  regel.start = periode.start;
  regel.eind = periode.eind;
  if (periode.start && periode.eind) {
    const bezet = werk.db.boekingen.filter((boeking) => boeking.status !== 'geannuleerd' && boeking.start_datum === periode.start && boeking.eind_datum === periode.eind);
    if (bezet.length) {
      regel.warnings.push(waarschuwing(
        'bron_leeg_database_bezet',
        'De bronregel is leeg terwijl de database op deze periode een reservering heeft. Die reservering blijft staan.',
        'period_raw',
        bezet.map((boeking) => labelVan(boeking)).join(' | '),
      ));
      regel.database_id = bezet[0].id > 0 ? bezet[0].id : null;
      regel.database_label = labelVan(bezet[0]);
      regel.database_tabel = 'boekingen';
    }
  } else if (tekst(record.period_raw)) {
    regel.warnings.push(...periode.waarschuwingen);
  }
  regel.uitkomst = 'BESCHIKBAAR';
  regel.reden = 'Lege periode. Beschikbaarheid volgt uit het ontbreken van een reservering; er is geen fictieve huurder gemaakt.';
  return regel;
}

function renderSql(regels: PlanRegel[]): string[] {
  const sql: string[] = [];
  const relaties = new Set<string>();
  for (const regel of regels) {
    const relatie = regel.nieuw?.relatie;
    if (relatie && !relaties.has(relatie.externalId)) {
      relaties.add(relatie.externalId);
      sql.push(`insert into public.relaties (naam, email, telefoon, organisatie, migration_source, migration_external_id, migration_source_file, migration_source_row, migration_batch_id)
select ${sqlTekst(relatie.naam)}, ${sqlTekst(relatie.email)}, ${sqlTekst(relatie.telefoon)}, ${sqlTekst(relatie.organisatie)}, ${sqlTekst(HISTORISCHE_HUUR_BRON)}, ${sqlTekst(relatie.externalId)}, ${sqlTekst(regel.source_file)}, ${sqlTekst(String(regel.source_row))}, ${sqlTekst(HISTORISCHE_HUUR_BATCH)}
where not exists (
  select 1 from public.relaties
  where migration_source = ${sqlTekst(HISTORISCHE_HUUR_BRON)} and migration_external_id = ${sqlTekst(relatie.externalId)}
);`);
      sql.push(`insert into public.relatie_rollen (relatie_id, rol, migration_source, migration_external_id, migration_batch_id)
select r.id, 'huurder', ${sqlTekst(HISTORISCHE_HUUR_BRON)}, ${sqlTekst(`rol:${relatie.externalId}`)}, ${sqlTekst(HISTORISCHE_HUUR_BATCH)}
from public.relaties r
where r.migration_source = ${sqlTekst(HISTORISCHE_HUUR_BRON)} and r.migration_external_id = ${sqlTekst(relatie.externalId)}
  and not exists (select 1 from public.relatie_rollen bestaande where bestaande.relatie_id = r.id and bestaande.rol = 'huurder');`);
    }
    const boeking = regel.nieuw?.boeking;
    if (boeking) {
      const relatieSql = boeking.relatieId
        ? String(boeking.relatieId)
        : `(select id from public.relaties where migration_source = ${sqlTekst(HISTORISCHE_HUUR_BRON)} and migration_external_id = ${sqlTekst(boeking.relatieExternalId)} limit 1)`;
      sql.push(`insert into public.boekingen (
  nummer, status, verhuurtype_sleutel, interne_titel, start_datum, eind_datum, huurder_relatie_id,
  huurder_naam_snapshot, huurder_email_snapshot, huurder_telefoon_snapshot, mede_exposanten,
  tarief_prijstype, tarief_bedrag, aanbetaling_bedrag, interne_notities,
  migration_source, migration_external_id, migration_source_file, migration_source_row, migration_batch_id
)
select ${sqlTekst(boeking.nummer)}, ${sqlTekst(boeking.status)}::public.boeking_status, ${sqlTekst(boeking.verhuurtype)}, ${sqlTekst(boeking.titel)},
  ${sqlDatum(boeking.start)}, ${sqlDatum(boeking.eind)}, ${relatieSql},
  ${sqlTekst(boeking.naam)}, ${sqlTekst(boeking.email)}, ${sqlTekst(boeking.telefoon)}, ${sqlTekst(boeking.mede)},
  ${boeking.tarief == null ? 'null' : `'vast'::public.prijstype`}, ${boeking.tarief == null ? 'null' : sqlGetal(boeking.tarief)}, ${boeking.aanbetaling == null ? 'null' : sqlGetal(boeking.aanbetaling)},
  ${sqlTekst(boeking.notities)},
  ${sqlTekst(HISTORISCHE_HUUR_BRON)}, ${sqlTekst(boeking.fingerprint)}, ${sqlTekst(boeking.sourceFile)}, ${sqlTekst(String(boeking.sourceRow))}, ${sqlTekst(HISTORISCHE_HUUR_BATCH)}
where not exists (
  select 1 from public.boekingen
  where migration_source = ${sqlTekst(HISTORISCHE_HUUR_BRON)} and migration_external_id = ${sqlTekst(boeking.fingerprint)}
);`);
    }
    for (const betaling of regel.nieuw?.betalingen ?? []) {
      const boekingSql = betaling.boekingId
        ? String(betaling.boekingId)
        : `(select id from public.boekingen where migration_source = ${sqlTekst(HISTORISCHE_HUUR_BRON)} and migration_external_id = ${sqlTekst(betaling.boekingFingerprint)})`;
      sql.push(`insert into public.betalingen (
  boeking_id, soort, bedrag, status, vervaldatum, ontvangen_op, referentie,
  migration_source, migration_external_id, migration_source_file, migration_source_row, migration_batch_id
)
select ${boekingSql}, ${sqlTekst(betaling.soort)}, ${sqlGetal(betaling.bedrag)}, ${sqlTekst(betaling.status)},
  ${betaling.vervaldatum ? sqlDatum(betaling.vervaldatum) : 'null'},
  ${betaling.ontvangenOp ? `${sqlDatum(betaling.ontvangenOp)}::timestamptz` : 'null'},
  ${sqlTekst(betaling.referentie)},
  ${sqlTekst(HISTORISCHE_HUUR_BRON)}, ${sqlTekst(betaling.externalId)}, ${sqlTekst(betaling.sourceFile)}, ${sqlTekst(String(betaling.sourceRow))}, ${sqlTekst(HISTORISCHE_HUUR_BATCH)}
where ${boekingSql} is not null
  and not exists (
    select 1 from public.betalingen where migration_source = ${sqlTekst(HISTORISCHE_HUUR_BRON)} and migration_external_id = ${sqlTekst(betaling.externalId)}
  )
  and not exists (
    select 1 from public.betalingen where boeking_id = ${boekingSql} and soort = ${sqlTekst(betaling.soort)}
  );`);
    }
    const blok = regel.nieuw?.blokkade;
    if (blok) {
      sql.push(`insert into public.interne_activiteiten (
  titel, start_datum, eind_datum, blokkeert_verhuurkalender, notities,
  migration_source, migration_external_id, migration_source_file, migration_source_row, migration_batch_id
)
select ${sqlTekst(blok.titel)}, ${sqlDatum(blok.start)}, ${sqlDatum(blok.eind)}, ${blok.blokkeert ? 'true' : 'false'}, ${sqlTekst(blok.notities)},
  ${sqlTekst(HISTORISCHE_HUUR_BRON)}, ${sqlTekst(blok.fingerprint)}, ${sqlTekst(blok.sourceFile)}, ${sqlTekst(String(blok.sourceRow))}, ${sqlTekst(HISTORISCHE_HUUR_BATCH)}
where not exists (
  select 1 from public.interne_activiteiten
  where migration_source = ${sqlTekst(HISTORISCHE_HUUR_BRON)} and migration_external_id = ${sqlTekst(blok.fingerprint)}
);`);
    }
    const perDoel = new Map<string, Aanvulling[]>();
    for (const aanvulling of regel.aanvullingen) {
      if (aanvulling.id <= 0) continue;
      const sleutel = `${aanvulling.tabel}:${aanvulling.id}`;
      perDoel.set(sleutel, [...(perDoel.get(sleutel) ?? []), aanvulling]);
    }
    for (const groep of perDoel.values()) {
      const tabel = groep[0].tabel;
      const id = groep[0].id;
      const sets = groep.map((aanvulling) => {
        const waarde = aanvulling.veld.endsWith('bedrag') || aanvulling.veld === 'tarief_bedrag' || aanvulling.veld === 'aanbetaling_bedrag'
          ? sqlGetal(Number(aanvulling.naar))
          : aanvulling.veld === 'tarief_prijstype'
            ? `'${aanvulling.naar}'::public.prijstype`
            : sqlTekst(aanvulling.naar);
        if (aanvulling.modus === 'cas') {
          return `${aanvulling.veld} = case when coalesce(${aanvulling.veld}, '') = ${sqlTekst(aanvulling.van)} then ${waarde} else ${aanvulling.veld} end`;
        }
        const leegCheck = aanvulling.veld.includes('bedrag') || aanvulling.veld === 'tarief_prijstype' || aanvulling.veld === 'verhuurtype_sleutel'
          ? `${aanvulling.veld} is null`
          : `${aanvulling.veld} is null or btrim(${aanvulling.veld}::text) = ''`;
        return `${aanvulling.veld} = case when ${leegCheck} then ${waarde} else ${aanvulling.veld} end`;
      });
      const guards = groep.map((aanvulling) => {
        if (aanvulling.modus === 'cas') return `coalesce(${aanvulling.veld}, '') = ${sqlTekst(aanvulling.van)}`;
        if (aanvulling.veld.includes('bedrag') || aanvulling.veld === 'tarief_prijstype' || aanvulling.veld === 'verhuurtype_sleutel') return `${aanvulling.veld} is null`;
        return `(${aanvulling.veld} is null or btrim(${aanvulling.veld}::text) = '')`;
      });
      const bijgewerkt = tabel === 'boekingen' || tabel === 'relaties' ? ', bijgewerkt_op = now()' : '';
      sql.push(`update public.${tabel} set ${sets.join(', ')}${bijgewerkt} where id = ${id} and (${guards.join(' or ')});`);
      for (const aanvulling of groep) {
        const dedup = `${HISTORISCHE_HUUR_BRON}:${regel.source_fingerprint}:${tabel}:${id}:${aanvulling.veld}`;
        sql.push(`insert into public.auditlog (actor_type, actor_naam, onderwerp_type, onderwerp_id, actie, van, naar, reden, details, dedup_sleutel)
select 'systeem', 'historische huurimport', ${sqlTekst(tabel === 'boekingen' ? 'boeking' : tabel === 'relaties' ? 'relatie' : tabel === 'betalingen' ? 'betaling' : 'interne_activiteit')}, ${sqlTekst(String(id))}, 'historische_import_aangevuld', ${sqlTekst(aanvulling.van)}, ${sqlTekst(aanvulling.naar)}, ${sqlTekst(`${regel.source_file} rij ${regel.source_row}`)}, ${dollar(JSON.stringify({ fingerprint: regel.source_fingerprint, veld: aanvulling.veld }))}::jsonb, ${sqlTekst(dedup)}
where exists (select 1 from public.${tabel} where id = ${id})
on conflict (dedup_sleutel) where dedup_sleutel is not null do nothing;`);
      }
    }
    const doelTabel = regel.nieuw?.boeking || regel.database_tabel === 'boekingen'
      ? 'boekingen'
      : regel.nieuw?.blokkade || regel.database_tabel === 'interne_activiteiten'
        ? 'interne_activiteiten'
        : regel.database_tabel;
    const doelId = regel.database_id
      ? String(regel.database_id)
      : regel.nieuw?.boeking
        ? `(select id from public.boekingen where migration_source = ${sqlTekst(HISTORISCHE_HUUR_BRON)} and migration_external_id = ${sqlTekst(regel.nieuw.boeking.fingerprint)})`
        : regel.gekoppeld_fingerprint
          ? `(select id from public.boekingen where migration_source = ${sqlTekst(HISTORISCHE_HUUR_BRON)} and migration_external_id = ${sqlTekst(regel.gekoppeld_fingerprint)})`
          : regel.nieuw?.blokkade
            ? `(select id from public.interne_activiteiten where migration_source = ${sqlTekst(HISTORISCHE_HUUR_BRON)} and migration_external_id = ${sqlTekst(regel.nieuw.blokkade.fingerprint)})`
            : 'null';
    sql.push(`insert into public.import_bronregels (
  migration_source, source_fingerprint, source_file, source_year, source_row, source_sheet, row_type,
  uitkomst, doel_tabel, doel_id, waarschuwingen, conflicten, veld_aanvullingen, payload, batch_id
)
select ${sqlTekst(HISTORISCHE_HUUR_BRON)}, ${sqlTekst(regel.source_fingerprint)}, ${sqlTekst(regel.source_file)}, ${regel.source_year}, ${regel.source_row},
  ${sqlTekst(regel.source_sheet)}, ${sqlTekst(regel.record.row_type ?? regel.klasse)}, ${sqlTekst(regel.uitkomst)}, ${sqlTekst(doelTabel)}, ${doelId},
  ${dollar(JSON.stringify(regel.warnings))}::jsonb, ${dollar(JSON.stringify(regel.conflicten))}::jsonb, ${dollar(JSON.stringify(regel.aanvullingen))}::jsonb,
  ${dollar(JSON.stringify(regel.record))}::jsonb, ${sqlTekst(HISTORISCHE_HUUR_BATCH)}
on conflict (migration_source, source_fingerprint) do update set
  uitkomst = excluded.uitkomst,
  doel_tabel = excluded.doel_tabel,
  doel_id = coalesce(excluded.doel_id, public.import_bronregels.doel_id),
  waarschuwingen = excluded.waarschuwingen,
  conflicten = excluded.conflicten,
  veld_aanvullingen = excluded.veld_aanvullingen,
  payload = excluded.payload,
  bijgewerkt_op = now();`);
  }
  return sql;
}

export function planHistorischeHuur(bestand: BronBestand, db: HistorischeDb): HistorischPlan {
  const werk = maakWerk(db);
  const regels: PlanRegel[] = [];
  for (const record of bestand.import_records) {
    const klasse = klasseer(record);
    if (klasse === 'winterstop') regels.push(planWinterstop(werk, record));
    else if (klasse === 'notitie') regels.push(planNotitie(werk, record));
    else if (klasse === 'beschikbaar') regels.push(planBeschikbaar(werk, record));
    else regels.push(planHuur(werk, record));
  }
  for (const record of bestand.all_source_rows ?? []) {
    if (record.row_type !== 'month_header') continue;
    const regel = basisRegel(record, 'kop');
    regel.uitkomst = 'BRONKOP';
    regel.reden = 'Maandkop. Geen domeinrecord.';
    regels.push(regel);
  }
  const perJaar: Record<string, JaarTelling> = {};
  for (const jaar of [2026, 2027, 2028, 2029]) perJaar[String(jaar)] = legeJaar();
  const velden: Record<string, number> = {};
  const gewijzigd = new Set<string>();
  let conflicten = 0;
  for (const regel of regels) {
    if (regel.uitkomst === 'BRONKOP') continue;
    const jaar = perJaar[String(regel.source_year)] ?? (perJaar[String(regel.source_year)] = legeJaar());
    jaar.bronregels += 1;
    if (regel.uitkomst === 'CREATED' || regel.uitkomst === 'WINTERSTOP_CREATED') jaar.nieuw += 1;
    const gekoppeldBestaand = regel.uitkomst === 'MATCHED_UNCHANGED'
      || regel.uitkomst === 'MATCHED_ENRICHED'
      || regel.uitkomst === 'WINTERSTOP_MATCHED'
      || (regel.uitkomst === 'CONFLICT_REVIEW_REQUIRED' && (regel.database_tabel === 'boekingen' || regel.database_tabel === 'interne_activiteiten'));
    if (gekoppeldBestaand) jaar.bestaand += 1;
    if (regel.aanvullingen.length) jaar.aangevuld += 1;
    if (regel.conflicten.length) jaar.conflict += 1;
    if (regel.warnings.length) jaar.warning += 1;
    if (regel.klasse === 'beschikbaar') jaar.beschikbaar += 1;
    if (regel.klasse === 'winterstop') jaar.winterstop += 1;
    if (regel.uitkomst === 'NIET_VERWERKT') jaar.nietVerwerkt += 1;
    conflicten += regel.conflicten.length;
    for (const aanvulling of regel.aanvullingen) {
      if (aanvulling.id <= 0) continue;
      gewijzigd.add(`${aanvulling.tabel}:${aanvulling.id}`);
      const sleutel = `${aanvulling.tabel}.${aanvulling.veld}`;
      velden[sleutel] = (velden[sleutel] ?? 0) + 1;
    }
  }
  return {
    bron: HISTORISCHE_HUUR_BRON,
    batchId: HISTORISCHE_HUUR_BATCH,
    regels,
    sql: renderSql(regels),
    perJaar,
    veiligheid: {
      bestaandeRecordsGewijzigd: gewijzigd.size,
      veldenAangevuld: velden,
      conflictenNietOverschreven: conflicten,
      gevuldeVeldenGewist: 0,
    },
  };
}

export function pasPlanToe(db: HistorischeDb, plan: HistorischPlan): HistorischeDb {
  const werk = structuredClone(db);
  const maxId = () => Math.max(0, ...werk.boekingen.map((rij) => rij.id), ...werk.relaties.map((rij) => rij.id), ...werk.betalingen.map((rij) => rij.id), ...werk.blokkades.map((rij) => rij.id));
  const relaties = new Map<string, number>();
  for (const regel of plan.regels) {
    if (regel.nieuw?.relatie && !werk.relaties.some((relatie) => relatie.migration_external_id === regel.nieuw?.relatie?.externalId && relatie.migration_source === HISTORISCHE_HUUR_BRON)) {
      const id = maxId() + 1;
      relaties.set(regel.nieuw.relatie.externalId, id);
      werk.relaties.push({
        id,
        naam: regel.nieuw.relatie.naam,
        email: regel.nieuw.relatie.email,
        telefoon: regel.nieuw.relatie.telefoon,
        organisatie: regel.nieuw.relatie.organisatie,
        notities: null,
        migration_source: HISTORISCHE_HUUR_BRON,
        migration_external_id: regel.nieuw.relatie.externalId,
      });
    }
    if (regel.nieuw?.boeking && !werk.boekingen.some((boeking) => boeking.migration_external_id === regel.nieuw?.boeking?.fingerprint)) {
      const relatieId = regel.nieuw.boeking.relatieId ?? (regel.nieuw.boeking.relatieExternalId ? relaties.get(regel.nieuw.boeking.relatieExternalId) ?? null : null);
      werk.boekingen.push({
        id: maxId() + 1,
        status: regel.nieuw.boeking.status,
        start_datum: regel.nieuw.boeking.start,
        eind_datum: regel.nieuw.boeking.eind,
        interne_titel: regel.nieuw.boeking.titel,
        huurder_naam_snapshot: regel.nieuw.boeking.naam,
        huurder_email_snapshot: regel.nieuw.boeking.email,
        huurder_telefoon_snapshot: regel.nieuw.boeking.telefoon,
        huurder_relatie_id: relatieId,
        interne_notities: regel.nieuw.boeking.notities,
        mede_exposanten: regel.nieuw.boeking.mede,
        tarief_bedrag: regel.nieuw.boeking.tarief,
        tarief_prijstype: regel.nieuw.boeking.tarief == null ? null : 'vast',
        aanbetaling_bedrag: regel.nieuw.boeking.aanbetaling,
        verhuurtype_sleutel: regel.nieuw.boeking.verhuurtype,
        migration_source: HISTORISCHE_HUUR_BRON,
        migration_external_id: regel.nieuw.boeking.fingerprint,
        nummer: regel.nieuw.boeking.nummer,
      });
    }
    if (regel.nieuw?.blokkade && !werk.blokkades.some((blok) => blok.migration_external_id === regel.nieuw?.blokkade?.fingerprint)) {
      werk.blokkades.push({
        id: maxId() + 1,
        titel: regel.nieuw.blokkade.titel,
        start_datum: regel.nieuw.blokkade.start,
        eind_datum: regel.nieuw.blokkade.eind,
        blokkeert_verhuurkalender: regel.nieuw.blokkade.blokkeert,
        notities: regel.nieuw.blokkade.notities,
        migration_source: HISTORISCHE_HUUR_BRON,
        migration_external_id: regel.nieuw.blokkade.fingerprint,
      });
    }
    for (const aanvulling of regel.aanvullingen) {
      if (aanvulling.id <= 0) continue;
      const rij = aanvulling.tabel === 'boekingen'
        ? werk.boekingen.find((item) => item.id === aanvulling.id)
        : aanvulling.tabel === 'relaties'
          ? werk.relaties.find((item) => item.id === aanvulling.id)
          : aanvulling.tabel === 'betalingen'
            ? werk.betalingen.find((item) => item.id === aanvulling.id)
            : werk.blokkades.find((item) => item.id === aanvulling.id);
      if (!rij) continue;
      const huidige = tekst((rij as unknown as Record<string, unknown>)[aanvulling.veld]);
      if (aanvulling.modus === 'leeg' && huidige === '') (rij as unknown as Record<string, unknown>)[aanvulling.veld] = aanvulling.naar;
      if (aanvulling.modus === 'cas' && huidige === aanvulling.van) (rij as unknown as Record<string, unknown>)[aanvulling.veld] = aanvulling.naar;
    }
    const doelId = regel.database_id
      ?? werk.boekingen.find((boeking) => boeking.migration_external_id === regel.nieuw?.boeking?.fingerprint)?.id
      ?? werk.blokkades.find((blok) => blok.migration_external_id === regel.nieuw?.blokkade?.fingerprint)?.id
      ?? null;
    if (!werk.bronregels.some((bron) => bron.source_fingerprint === regel.source_fingerprint)) {
      werk.bronregels.push({
        source_fingerprint: regel.source_fingerprint,
        doel_tabel: regel.database_tabel ?? (regel.nieuw?.boeking ? 'boekingen' : regel.nieuw?.blokkade ? 'interne_activiteiten' : null),
        doel_id: doelId,
        uitkomst: regel.uitkomst,
      });
    }
    for (const betaling of regel.nieuw?.betalingen ?? []) {
      const boekingId = betaling.boekingId ?? werk.boekingen.find((boeking) => boeking.migration_external_id === betaling.boekingFingerprint)?.id;
      if (!boekingId) continue;
      if (werk.betalingen.some((bestaand) => bestaand.boeking_id === boekingId && bestaand.soort === betaling.soort)) continue;
      werk.betalingen.push({
        id: maxId() + 1,
        boeking_id: boekingId,
        soort: betaling.soort,
        bedrag: betaling.bedrag,
        status: betaling.status,
        vervaldatum: betaling.vervaldatum,
        ontvangen_op: betaling.ontvangenOp,
        referentie: betaling.referentie,
        migration_source: HISTORISCHE_HUUR_BRON,
        migration_external_id: betaling.externalId,
      });
    }
  }
  return werk;
}

function primaireNieuw(regel: PlanRegel): boolean {
  return regel.uitkomst === 'CREATED' || regel.uitkomst === 'WINTERSTOP_CREATED' || Boolean(regel.nieuw?.blokkade && regel.uitkomst === 'NOTITIE_BEWAARD');
}

export function formatRapport(plan: HistorischPlan): string {
  const domein = plan.regels.filter((regel) => regel.uitkomst !== 'BRONKOP');
  const tel = (uitkomst: Uitkomst) => domein.filter((regel) => regel.uitkomst === uitkomst).length;
  const regels: string[] = [];
  regels.push('Historische huurimport Kerkje van Persingen 2026–2029');
  regels.push(`Bronrecords: ${domein.length}`);
  regels.push(`Nieuw (reservering): ${tel('CREATED')}`);
  regels.push(`Winterstop nieuw: ${tel('WINTERSTOP_CREATED')}`);
  regels.push(`Winterstop bestaand: ${tel('WINTERSTOP_MATCHED')}`);
  regels.push(`Bestaand ongewijzigd: ${tel('MATCHED_UNCHANGED')}`);
  regels.push(`Bestaand aangevuld: ${tel('MATCHED_ENRICHED')}`);
  regels.push(`Conflict, review nodig: ${tel('CONFLICT_REVIEW_REQUIRED')}`);
  regels.push(`Beschikbare perioden zonder record: ${tel('BESCHIKBAAR')}`);
  regels.push(`Notities bewaard: ${tel('NOTITIE_BEWAARD')}`);
  regels.push(`Niet automatisch verwerkt: ${tel('NIET_VERWERKT')}`);
  regels.push(`Waarschuwingen: ${domein.filter((regel) => regel.warnings.length).length} regels / ${domein.reduce((som, regel) => som + regel.warnings.length, 0)} meldingen`);
  regels.push(`Maandkoppen apart vastgelegd: ${plan.regels.filter((regel) => regel.uitkomst === 'BRONKOP').length}`);
  regels.push('');
  regels.push('Jaar | Bronregels | Nieuw | Bestaand | Aangevuld | Conflict | Warning');
  for (const jaar of ['2026', '2027', '2028', '2029']) {
    const rij = plan.perJaar[jaar] ?? legeJaar();
    regels.push(`${jaar} | ${rij.bronregels} | ${rij.nieuw} | ${rij.bestaand} | ${rij.aangevuld} | ${rij.conflict} | ${rij.warning}`);
  }
  regels.push('Aangevuld en conflict kunnen dezelfde gekoppelde reservering zijn. Nieuw telt reserveringen en nieuwe winterstop-blokkades. Bestaand telt koppelingen, niet de lege perioden.');
  regels.push('');
  regels.push(`Bestaande records met een aanvulling: ${plan.veiligheid.bestaandeRecordsGewijzigd}`);
  regels.push(`Conflicten niet overschreven: ${plan.veiligheid.conflictenNietOverschreven}`);
  regels.push('Gevulde velden gewist door een lege broncel: 0');
  const velden = Object.entries(plan.veiligheid.veldenAangevuld).sort((a, b) => b[1] - a[1]);
  if (velden.length) {
    regels.push('Aangevulde velden:');
    for (const [veld, aantal] of velden) regels.push(`- ${veld}: ${aantal}`);
  }
  const niet = domein.filter((regel) => regel.uitkomst === 'NIET_VERWERKT');
  if (niet.length) {
    regels.push('');
    regels.push('Niet automatisch verwerkt:');
    for (const regel of niet) {
      regels.push(`- ${regel.source_year} rij ${regel.source_row} ${regel.huurder ?? ''} ${regel.periode ?? ''} — ${regel.reden}`);
    }
  }
  const conflicten = domein.filter((regel) => regel.conflicten.length);
  if (conflicten.length) {
    regels.push('');
    regels.push('Conflicten:');
    for (const regel of conflicten) {
      regels.push(`- ${regel.source_year} ${regel.source_file} rij ${regel.source_row} | ${regel.huurder ?? ''} | ${regel.periode ?? ''} | ${regel.database_label ?? 'geen database-record'}`);
      regels.push(`  reden: ${regel.reden}`);
      for (const conflict of regel.conflicten) {
        regels.push(`  veld ${conflict.veld}: bron "${conflict.bronwaarde}" / database "${conflict.databasewaarde}" (${conflict.database_label})`);
      }
    }
  }
  const perCode = new Map<string, PlanRegel[]>();
  for (const regel of domein) {
    for (const warning of regel.warnings) {
      perCode.set(warning.code, [...(perCode.get(warning.code) ?? []), regel]);
    }
  }
  if (perCode.size) {
    regels.push('');
    regels.push('Waarschuwingen per soort:');
    for (const [code, items] of [...perCode.entries()].sort((a, b) => b[1].length - a[1].length)) {
      regels.push(`- ${code}: ${items.length}`);
      for (const regel of items.slice(0, 6)) {
        const warning = regel.warnings.find((item) => item.code === code);
        regels.push(`  ${regel.source_year} rij ${regel.source_row} ${regel.huurder ?? ''} ${regel.periode ?? ''} — ${warning?.bericht ?? ''}`);
      }
    }
  }
  return regels.join('\n');
}

export function formatConflictenCsv(plan: HistorischPlan): string {
  const regels = ['jaar,bestand,rij,huurder,periode,database_id,database_label,veld,bronwaarde,databasewaarde,reden'];
  for (const regel of plan.regels) {
    for (const conflict of regel.conflicten) {
      const cellen = [
        regel.source_year,
        regel.source_file,
        regel.source_row,
        regel.huurder ?? '',
        regel.periode ?? '',
        conflict.database_id ?? '',
        conflict.database_label,
        conflict.veld,
        conflict.bronwaarde,
        conflict.databasewaarde,
        regel.reden,
      ].map((waarde) => `"${String(waarde).replace(/"/g, '""')}"`);
      regels.push(cellen.join(','));
    }
  }
  return `${regels.join('\n')}\n`;
}

export function sqlIsVeilig(sql: string[]): string[] {
  const fouten: string[] = [];
  const tekstSql = sql.join('\n').toLowerCase();
  if (/\btruncate\b/.test(tekstSql)) fouten.push('TRUNCATE');
  if (/\bdelete\s+from\b/.test(tekstSql)) fouten.push('DELETE');
  if (/\bdrop\s+table\b/.test(tekstSql)) fouten.push('DROP TABLE');
  return fouten;
}
