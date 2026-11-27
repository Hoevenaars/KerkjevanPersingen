/**
 * Interne beoordeling vóór de bestuursmail en opnieuw vóór het besluit.
 * Pure berekeningen: geen database, provider, klok of wijziging van publieke bezetting.
 *
 * De standaardtermijn is 18 kalendermaanden van einde vorige expositie tot
 * begin volgende. Een waarschuwing over dit beleid is nooit een capaciteitsrecht:
 * het bestuur kan beleid overrulen, maar geen bestaande reservering overschrijven.
 */
import { createHash } from 'node:crypto';
import { medeExposantenFout, parseMedeExposanten } from './mede-exposanten.ts';

export type BeoordelingsId = string | number;
export type HistorieZekerheid = 'bevestigd' | 'waarschijnlijk' | 'mogelijk';

export interface BeoordelingsPersoon {
  naam: string;
  relatieId?: BeoordelingsId | null;
  /** Alleen invullen bij een eerder bevestigde persoonskoppeling. */
  persoonId?: string | null;
  email?: string | null;
  aliassen?: readonly string[];
}

export interface BeoordelingsAanvraag {
  id: BeoordelingsId;
  status: string;
  naam: string;
  email: string;
  start: string;
  eind: string;
  verhuurtype: string;
  boekingId?: BeoordelingsId | null;
  relatieId?: BeoordelingsId | null;
  persoonId?: string | null;
  medeExposanten?: string | readonly BeoordelingsPersoon[];
  personen?: string | number | null;
  telefoon?: string | null;
  adres?: string | null;
  toelichting?: string | null;
  website?: string | null;
  eerderGeexposeerd?: string | null;
  /** Alle aanvullende materiële afspraken horen ook in de vingerafdruk. */
  afspraken?: Readonly<Record<string, unknown>>;
  prijsAfspraakCent?: number | null;
  prijsVastgesteld?: boolean;
}

export interface AndereBeoordelingsAanvraag {
  id: BeoordelingsId;
  status: string;
  naam: string;
  start: string;
  eind: string;
  boekingId?: BeoordelingsId | null;
  binnengekomenOp?: string | null;
}

export interface BeoordelingsBoeking {
  id: BeoordelingsId;
  status: string;
  start: string;
  eind: string;
  aanvraagId?: BeoordelingsId | null;
  naam?: string | null;
  nummer?: string | null;
}

export interface BeoordelingsActiviteit {
  id: BeoordelingsId;
  start: string;
  eind: string;
  titel: string;
  blokkeert?: boolean;
  zichtbaarheid?: string;
  levenscyclus?: string;
  /** Aanwezigheid van lokale_override.annulering: een bewuste annulering van een bezetmelding. */
  annuleringBevestigd?: boolean;
  boekingId?: BeoordelingsId | null;
}

export interface ExpositieHistorie {
  id: BeoordelingsId;
  /** Gelijke expositieId ontdubbelt boeking/agenda/import van één expositie. */
  expositieId?: string;
  bron?: string;
  referentie?: string;
  boekingId?: BeoordelingsId | null;
  aanvraagId?: BeoordelingsId | null;
  start: string;
  eind: string;
  status: string;
  verhuurtype?: string;
  deelnemers: readonly BeoordelingsPersoon[];
}

export interface BeoordelingsTarief {
  prijstype: 'vast' | 'vanaf' | 'op_aanvraag';
  /** Euro, overeenkomstig de bestaande tarieven-tabel. */
  bedrag: number | null;
  geldigVanaf?: string | null;
  geldigTot?: string | null;
}

export interface ExpositieBeleid {
  maanden?: number;
  grondslag?: 'einde_begin' | 'begin_begin';
  versie?: string;
}

export interface VerhuurBeoordelingInvoer {
  aanvraag: BeoordelingsAanvraag;
  aanvragen?: readonly AndereBeoordelingsAanvraag[];
  boekingen?: readonly BeoordelingsBoeking[];
  activiteiten?: readonly BeoordelingsActiviteit[];
  historie?: readonly ExpositieHistorie[];
  /** Alleen expliciet true als de adapter de vereiste historische dekking kent. */
  historieCompleet?: boolean;
  tarief?: BeoordelingsTarief | null;
  vandaag: string;
  beleid?: ExpositieBeleid;
}

export interface VerhuurConflict {
  id: string;
  type: 'aanvraag' | 'optie' | 'boeking' | 'blokkade' | 'activiteit';
  naam: string;
  start: string;
  eind: string;
  status: string;
  binnengekomenOp: string | null;
  /** Een bestaande capaciteitstoewijzing kan niet met beleidsakkoord worden genegeerd. */
  hard: boolean;
  melding: string;
}

export interface HistorieWaarschuwing {
  code: 'expositie_binnen_termijn';
  persoon: string;
  rol: 'hoofd' | 'mede';
  overeenkomstMet: string;
  zekerheid: HistorieZekerheid;
  grondslag: 'persoon_id' | 'relatie_id' | 'email_en_naam' | 'email' | 'naam_of_alias';
  expositieId: string;
  bronId: string;
  bron: string;
  referentie: string;
  start: string;
  eind: string;
  status: string;
  voorlopig: boolean;
  richting: 'eerder' | 'later' | 'overlap';
  /** Alleen een eerdere expositie levert een volgende vrije datum voor deze aanvraag. */
  regulierVanaf: string | null;
  minimaleLatereStart: string;
  melding: string;
}

export interface BeoordelingsMelding {
  code: 'periode_onvolledig' | 'beschikbaarheid_onvolledig' | 'historie_onvolledig' | 'historie_datum_onbekend' | 'beleid_onvolledig' | 'aanvraag_niet_actief';
  ernst: 'waarschuwing' | 'blokkade';
  tekst: string;
}

export interface PrijsBeoordeling {
  vastgesteld: boolean;
  bedragCent: number | null;
  indicatieCent: number | null;
  moetVaststellen: boolean;
  prijstype: 'vast' | 'vanaf' | 'op_aanvraag' | 'onbekend';
  reden: string;
}

export interface VerhuurBeoordeling {
  aanvraagId: string;
  vandaag: string;
  beschikbaarheid: 'beschikbaar' | 'aanvraag' | 'bezet' | 'onvolledig';
  conflicts: VerhuurConflict[];
  historieWaarschuwingen: HistorieWaarschuwing[];
  historieCompleet: boolean;
  meldingen: BeoordelingsMelding[];
  prijs: PrijsBeoordeling;
  beleid: { maanden: number; grondslag: 'einde_begin' | 'begin_begin'; versie: string };
  beleidsversie: string;
  hardeBlokkade: boolean;
  /** Beleidswaarschuwingen op zichzelf blokkeren dit nooit; akkoord blijft vereist. */
  kanAutomatischVerder: boolean;
  aanvraagVingerafdruk: string;
  vingerafdruk: string;
}

const ACTIEVE_AANVRAGEN = new Set(['nieuw', 'in_behandeling', 'wacht_op_aanvrager', 'goedgekeurd']);
const BEZETTENDE_BOEKINGEN = new Set(['optie', 'optie_verlopen', 'definitief', 'migratie_vastgelegd']);
const GESTOPT = new Set(['geannuleerd', 'afgewezen', 'gesloten', 'vervallen']);
const HISTORIE_STATUS = new Set(['definitief', 'afgerond', 'gearchiveerd', 'migratie_vastgelegd', 'uitgevoerd', 'optie', 'optie_verlopen', 'nieuw', 'in_behandeling', 'wacht_op_aanvrager', 'goedgekeurd', 'migratie_aanvraag']);
const VOORLOPIG = new Set(['optie', 'optie_verlopen', 'nieuw', 'in_behandeling', 'wacht_op_aanvrager', 'goedgekeurd', 'migratie_aanvraag']);
const tekst = (v: unknown): string => v == null ? '' : String(v).trim();
const id = (v: unknown): string => tekst(v);
const gelijkId = (a: unknown, b: unknown): boolean => Boolean(id(a) && id(a) === id(b));
const normaliseerNaam = (naam: string): string => tekst(naam).normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase('nl-NL');
const normaliseerEmail = (email: unknown): string => tekst(email).toLowerCase();
const overlapt = (a: { start: string; eind: string }, b: { start: string; eind: string }): boolean => a.start <= b.eind && b.start <= a.eind;
const vergelijkTekst = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

export function geldigeBeoordelingsDatum(datum: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return false;
  if (Number(datum.slice(0, 4)) < 1) return false;
  const d = new Date(`${datum}T12:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === datum;
}

function geldigePeriode(p: { start: string; eind: string }): boolean {
  return geldigeBeoordelingsDatum(p.start) && geldigeBeoordelingsDatum(p.eind) && p.eind >= p.start;
}

/** Kalendermaanden met afkappen op de laatste bestaande dag, onafhankelijk van DST. */
export function voegKalendermaandenToe(datum: string, maanden: number): string {
  if (!geldigeBeoordelingsDatum(datum) || !Number.isInteger(maanden) || maanden < 0 || maanden > 1200) {
    throw new Error('Ongeldige kalenderdatum of maandtermijn.');
  }
  const [jaar, maand, dag] = datum.split('-').map(Number);
  const doel = new Date(`${datum}T12:00:00.000Z`);
  doel.setUTCDate(1);
  doel.setUTCMonth(maand! - 1 + maanden);
  const laatste = new Date(doel);
  laatste.setUTCMonth(laatste.getUTCMonth() + 1, 0);
  doel.setUTCDate(Math.min(dag!, laatste.getUTCDate()));
  if (jaar! < 1 || doel.getUTCFullYear() > 9999) throw new Error('Kalenderdatum buiten bereik.');
  return doel.toISOString().slice(0, 10);
}

/** Stabiele JSON voor mandaatcontrole; objectvolgorde en undefined zijn niet materieel. */
function canoniek(waarde: unknown): unknown {
  if (waarde == null) return null;
  if (Array.isArray(waarde)) return waarde.map(canoniek);
  if (typeof waarde === 'object') {
    return Object.fromEntries(Object.entries(waarde as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => vergelijkTekst(a, b))
      .map(([k, v]) => [k, canoniek(v)]));
  }
  if (typeof waarde === 'number' && !Number.isFinite(waarde)) return String(waarde);
  return waarde;
}

export function beoordelingsVingerafdruk(waarde: unknown): string {
  return createHash('sha256').update(JSON.stringify(canoniek(waarde))).digest('hex');
}

function personen(aanvraag: BeoordelingsAanvraag): (BeoordelingsPersoon & { rol: 'hoofd' | 'mede' })[] {
  const mede = typeof aanvraag.medeExposanten === 'string'
    ? parseMedeExposanten(aanvraag.medeExposanten).map((naam) => ({ naam }))
    : aanvraag.medeExposanten ?? [];
  return [
    { naam: aanvraag.naam, email: aanvraag.email, relatieId: aanvraag.relatieId, persoonId: aanvraag.persoonId, rol: 'hoofd' as const },
    ...mede.map((p) => ({ ...p, rol: 'mede' as const })),
  ].filter((p) => tekst(p.naam));
}

function vergelijkPersonen(a: BeoordelingsPersoon, b: BeoordelingsPersoon): Pick<HistorieWaarschuwing, 'zekerheid' | 'grondslag'> | null {
  if (a.persoonId && b.persoonId) {
    return a.persoonId === b.persoonId ? { zekerheid: 'bevestigd', grondslag: 'persoon_id' } : null;
  }
  if (gelijkId(a.relatieId, b.relatieId)) return { zekerheid: 'bevestigd', grondslag: 'relatie_id' };
  const namenA = [a.naam, ...(a.aliassen ?? [])].map(normaliseerNaam).filter(Boolean);
  const namenB = [b.naam, ...(b.aliassen ?? [])].map(normaliseerNaam).filter(Boolean);
  const naamGelijk = namenA.some((naam) => namenB.includes(naam));
  const email = normaliseerEmail(a.email);
  const emailGelijk = email.includes('@') && email === normaliseerEmail(b.email);
  if (emailGelijk && naamGelijk) return { zekerheid: 'waarschijnlijk', grondslag: 'email_en_naam' };
  if (emailGelijk) return { zekerheid: 'mogelijk', grondslag: 'email' };
  if (naamGelijk) return { zekerheid: 'mogelijk', grondslag: 'naam_of_alias' };
  return null;
}

function geldigeCenten(waarde: unknown): waarde is number {
  // De bestaande prijsopslag is numeric(10,2); hoger mag niet pas bij opslaan falen.
  return typeof waarde === 'number' && Number.isSafeInteger(waarde) && waarde > 0 && waarde <= 9_999_999_999;
}

function tariefCenten(tarief: BeoordelingsTarief | null | undefined): number | null {
  if (!tarief || typeof tarief.bedrag !== 'number' || !Number.isFinite(tarief.bedrag) || tarief.bedrag <= 0) return null;
  const cent = Math.round(tarief.bedrag * 100);
  return geldigeCenten(cent) && Math.abs(tarief.bedrag * 100 - cent) < 0.000001 ? cent : null;
}

export function beoordeelHuurprijs(aanvraag: BeoordelingsAanvraag, tarief?: BeoordelingsTarief | null): PrijsBeoordeling {
  const geldig = Boolean(tarief
    && (!tarief.geldigVanaf || (geldigeBeoordelingsDatum(tarief.geldigVanaf) && tarief.geldigVanaf <= aanvraag.start))
    && (!tarief.geldigTot || (geldigeBeoordelingsDatum(tarief.geldigTot) && tarief.geldigTot >= aanvraag.start)));
  const indicatieCent = geldig ? tariefCenten(tarief) : null;
  const prijstype = geldig && tarief ? tarief.prijstype : 'onbekend';
  if (aanvraag.prijsVastgesteld === true && geldigeCenten(aanvraag.prijsAfspraakCent)) {
    return { vastgesteld: true, bedragCent: aanvraag.prijsAfspraakCent, indicatieCent, moetVaststellen: false, prijstype, reden: 'De huurprijs is voor deze aanvraag vastgesteld.' };
  }
  const maatwerk = aanvraag.verhuurtype === 'concert' || aanvraag.verhuurtype === 'diverse';
  if (!maatwerk && aanvraag.prijsAfspraakCent == null && prijstype === 'vast' && indicatieCent != null) {
    return { vastgesteld: true, bedragCent: indicatieCent, indicatieCent, moetVaststellen: false, prijstype, reden: 'Vast tarief voor de aangevraagde periode.' };
  }
  const reden = aanvraag.prijsAfspraakCent != null
    ? 'De voorgestelde huurprijs is nog niet geldig en expliciet vastgesteld.'
    : prijstype === 'vanaf'
      ? 'Het vanafbedrag is alleen een indicatie. Het bestuur moet de definitieve huurprijs vaststellen.'
      : maatwerk || prijstype === 'op_aanvraag'
        ? 'Het bestuur moet de huurprijs voor deze aanvraag vaststellen.'
        : 'Er is geen geldig vast tarief voor deze periode. De huurprijs moet worden vastgesteld.';
  return { vastgesteld: false, bedragCent: null, indicatieCent, moetVaststellen: true, prijstype, reden };
}

export function beoordeelVerhuuraanvraag(input: VerhuurBeoordelingInvoer): VerhuurBeoordeling {
  const a = input.aanvraag;
  const conflicts: VerhuurConflict[] = [];
  const meldingen: BeoordelingsMelding[] = [];
  const historieWaarschuwingen: HistorieWaarschuwing[] = [];
  const beleidGeldig = (input.beleid?.maanden == null || (Number.isInteger(input.beleid.maanden) && input.beleid.maanden > 0 && input.beleid.maanden <= 120))
    && (input.beleid?.grondslag == null || ['einde_begin', 'begin_begin'].includes(input.beleid.grondslag));
  const beleid = {
    maanden: beleidGeldig ? input.beleid?.maanden ?? 18 : 18,
    grondslag: (beleidGeldig ? input.beleid?.grondslag ?? 'einde_begin' : 'einde_begin') as 'einde_begin' | 'begin_begin',
    versie: tekst(input.beleid?.versie) || `expositie-${beleidGeldig ? input.beleid?.maanden ?? 18 : 18}-${beleidGeldig ? input.beleid?.grondslag ?? 'einde_begin' : 'einde_begin'}-v1`,
  };
  if (!beleidGeldig && a.verhuurtype === 'expositie') meldingen.push({ code: 'beleid_onvolledig', ernst: 'blokkade', tekst: 'De ingestelde expositietermijn is ongeldig. Controleer de beleidsinstellingen.' });
  if (!geldigePeriode(a) || !geldigeBeoordelingsDatum(input.vandaag)) {
    meldingen.push({ code: 'periode_onvolledig', ernst: 'blokkade', tekst: 'De periode of beoordelingsdatum is onvolledig. Beschikbaarheid kan niet betrouwbaar worden vastgesteld.' });
  }
  if (!ACTIEVE_AANVRAGEN.has(a.status)) meldingen.push({ code: 'aanvraag_niet_actief', ernst: 'blokkade', tekst: 'Deze aanvraag staat niet in een actieve beoordelingsfase.' });
  const boekingen = input.boekingen ?? [];
  const capaciteitOnvolledig = (naam: string) => meldingen.push({ code: 'beschikbaarheid_onvolledig', ernst: 'blokkade', tekst: `De periode van ${naam || 'een ander actief dossier'} is onvolledig. Controleer de beschikbaarheid.` });
  if (geldigePeriode(a)) {
    for (const b of boekingen) {
      if (gelijkId(b.id, a.boekingId) || gelijkId(b.aanvraagId, a.id) || !BEZETTENDE_BOEKINGEN.has(b.status)) continue;
      if (!geldigePeriode(b)) { capaciteitOnvolledig(tekst(b.naam || b.nummer)); continue; }
      if (!overlapt(a, b)) continue;
      const optie = b.status === 'optie' || b.status === 'optie_verlopen';
      conflicts.push({ id: id(b.id), type: optie ? 'optie' : 'boeking', naam: tekst(b.naam || b.nummer) || `Boeking ${id(b.id)}`, start: b.start, eind: b.eind, status: b.status, binnengekomenOp: null, hard: true,
        melding: b.status === 'optie_verlopen' ? 'Een verlopen optie is nog niet vrijgegeven.' : optie ? 'De periode staat al in optie.' : 'De periode is al vastgelegd voor een andere boeking.' });
    }
    for (const ander of input.aanvragen ?? []) {
      if (gelijkId(ander.id, a.id) || !ACTIEVE_AANVRAGEN.has(ander.status)) continue;
      const boeking = boekingen.find((b) => gelijkId(b.id, ander.boekingId) || gelijkId(b.aanvraagId, ander.id));
      if (boeking && (GESTOPT.has(boeking.status) || ['afgerond', 'gearchiveerd'].includes(boeking.status))) continue;
      if (boeking && BEZETTENDE_BOEKINGEN.has(boeking.status)) continue; // Dezelfde toewijzing staat al als boekingsconflict.
      if (!geldigePeriode(ander)) { capaciteitOnvolledig(ander.naam); continue; }
      if (!overlapt(a, ander)) continue;
      conflicts.push({ id: id(ander.id), type: 'aanvraag', naam: ander.naam, start: ander.start, eind: ander.eind, status: ander.status, binnengekomenOp: ander.binnengekomenOp ?? null, hard: false,
        melding: 'Let op: er loopt al een aanvraag voor deze periode.' });
    }
    for (const activiteit of input.activiteiten ?? []) {
      if (gelijkId(activiteit.boekingId, a.boekingId)) continue;
      // Bezetmeldingen volgen de bestaande bronregel: alleen een bewuste annulering
      // maakt ze vrij; een oude losse levenscycluswaarde is hiervoor onvoldoende.
      const geannuleerd = activiteit.zichtbaarheid === 'bezet'
        ? activiteit.annuleringBevestigd === true
        : activiteit.levenscyclus === 'geannuleerd';
      if (geannuleerd) continue;
      const blokkeert = activiteit.blokkeert === true || (activiteit.blokkeert !== false && ['publiek', 'bezet'].includes(activiteit.zichtbaarheid ?? ''));
      if (!blokkeert) continue;
      if (!geldigePeriode(activiteit)) { capaciteitOnvolledig(activiteit.titel); continue; }
      if (activiteit.boekingId != null && boekingen.some((b) => gelijkId(b.id, activiteit.boekingId)
        && BEZETTENDE_BOEKINGEN.has(b.status) && geldigePeriode(b)
        && b.start <= activiteit.start && b.eind >= activiteit.eind)) continue;
      if (!overlapt(a, activiteit)) continue;
      conflicts.push({ id: id(activiteit.id), type: activiteit.blokkeert === true ? 'blokkade' : 'activiteit', naam: activiteit.titel, start: activiteit.start, eind: activiteit.eind,
        status: activiteit.levenscyclus || 'actief', binnengekomenOp: null, hard: true, melding: 'De periode is geblokkeerd door een activiteit of interne afspraak.' });
    }
  }
  let historieCompleet = input.historieCompleet === true;
  if (a.verhuurtype === 'expositie') {
    if (typeof a.medeExposanten === 'string' && medeExposantenFout(a.medeExposanten)) {
      historieCompleet = false;
      meldingen.push({ code: 'historie_onvolledig', ernst: 'waarschuwing', tekst: 'De mede-exposanten zijn niet volledig leesbaar. Controleer hun namen en expositiehistorie afzonderlijk.' });
    }
    if (!historieCompleet) meldingen.push({ code: 'historie_onvolledig', ernst: 'waarschuwing', tekst: 'Controle niet volledig: de beschikbare expositiehistorie is niet als compleet bevestigd. Geen match is geen bewijs dat iemand niet eerder heeft geëxposeerd.' });
    const huidigePersonen = personen(a);
    const gevonden = new Map<string, HistorieWaarschuwing>();
    const rang = { bevestigd: 3, waarschijnlijk: 2, mogelijk: 1 };
    for (const h of input.historie ?? []) {
      if (GESTOPT.has(h.status) || !HISTORIE_STATUS.has(h.status) || (h.verhuurtype && h.verhuurtype !== 'expositie')) continue;
      if (gelijkId(h.boekingId, a.boekingId) || gelijkId(h.aanvraagId, a.id)) continue;
      for (const persoon of huidigePersonen) {
        for (const eerder of h.deelnemers) {
          const match = vergelijkPersonen(persoon, eerder);
          if (!match) continue;
          if (!geldigePeriode(h)) {
            historieCompleet = false;
            meldingen.push({ code: 'historie_datum_onbekend', ernst: 'waarschuwing', tekst: `Mogelijke eerdere of geplande expositie van ${persoon.naam} heeft geen betrouwbare periode (bron ${tekst(h.bron) || 'historie'} ${id(h.id)}).` });
            continue;
          }
          if (!geldigePeriode(a)) continue;
          const richting = h.eind < a.start ? 'eerder' : a.eind < h.start ? 'later' : 'overlap';
          const vroeg = h.start <= a.start ? h : a;
          const laat = h.start <= a.start ? a : h;
          const basis = beleid.grondslag === 'begin_begin' ? vroeg.start : vroeg.eind;
          const minimaal = voegKalendermaandenToe(basis, beleid.maanden);
          if (richting !== 'overlap' && laat.start >= minimaal) continue;
          const voorlopig = VOORLOPIG.has(h.status);
          const gepland = h.start >= input.vandaag;
          const zekerheidTekst = match.zekerheid === 'mogelijk' ? 'Mogelijke overeenkomst' : match.zekerheid === 'waarschijnlijk' ? 'Waarschijnlijke overeenkomst' : 'Bevestigde overeenkomst';
          const expositieId = h.expositieId || (h.boekingId != null ? `boeking:${id(h.boekingId)}` : `periode:${h.start}:${h.eind}`);
          const item: HistorieWaarschuwing = {
            code: 'expositie_binnen_termijn', persoon: persoon.naam, rol: persoon.rol, overeenkomstMet: eerder.naam, ...match,
            expositieId, bronId: id(h.id), bron: h.bron || 'historie', referentie: h.referentie || id(h.id), start: h.start, eind: h.eind, status: h.status,
            voorlopig, richting, regulierVanaf: richting === 'eerder' ? minimaal : null, minimaleLatereStart: minimaal,
            melding: `${zekerheidTekst}: ${persoon.naam} (${persoon.rol === 'mede' ? 'mede-exposant' : 'hoofdexposant'}) staat ook bij een ${voorlopig ? 'voorlopig aangevraagde of gereserveerde' : gepland ? 'geplande' : 'eerdere'} expositie van ${h.start} tot ${h.eind}. Dit valt binnen ${beleid.maanden} maanden. Het bestuur mag afwijken van deze beleidsregel.`,
          };
          const sleutel = `${persoon.rol}:${normaliseerNaam(persoon.naam)}:${expositieId}`;
          const bestaand = gevonden.get(sleutel);
          if (!bestaand || rang[item.zekerheid] > rang[bestaand.zekerheid] || (rang[item.zekerheid] === rang[bestaand.zekerheid] && bestaand.voorlopig && !item.voorlopig)
            || (rang[item.zekerheid] === rang[bestaand.zekerheid] && bestaand.voorlopig === item.voorlopig && `${item.bron}:${item.bronId}` < `${bestaand.bron}:${bestaand.bronId}`)) gevonden.set(sleutel, item);
        }
      }
    }
    historieWaarschuwingen.push(...gevonden.values());
  }
  const uniekConflicts = [...new Map(conflicts.map((c) => [`${c.type}:${c.id}`, c])).values()]
    .sort((x, y) => vergelijkTekst(`${x.start}:${x.type}:${x.id}`, `${y.start}:${y.type}:${y.id}`));
  const uniekeMeldingen = [...new Map(meldingen.map((m) => [`${m.code}:${m.tekst}`, m])).values()]
    .sort((x, y) => vergelijkTekst(`${x.code}:${x.tekst}`, `${y.code}:${y.tekst}`));
  historieWaarschuwingen.sort((x, y) => vergelijkTekst(`${x.persoon}:${x.start}:${x.expositieId}`, `${y.persoon}:${y.start}:${y.expositieId}`));
  const hardeBlokkade = uniekConflicts.some((c) => c.hard) || uniekeMeldingen.some((m) => m.ernst === 'blokkade');
  const beschikbaarheid = uniekeMeldingen.some((m) => ['periode_onvolledig', 'beschikbaarheid_onvolledig'].includes(m.code)) ? 'onvolledig'
    : uniekConflicts.some((c) => c.hard) ? 'bezet' : uniekConflicts.length > 0 ? 'aanvraag' : 'beschikbaar';
  const prijs = beoordeelHuurprijs(a, input.tarief);
  const aanvraagVingerafdruk = beoordelingsVingerafdruk({
    ...a, id: id(a.id), boekingId: id(a.boekingId) || null, relatieId: id(a.relatieId) || null, email: normaliseerEmail(a.email),
    medeExposanten: personen(a).filter((p) => p.rol === 'mede').map((p) => ({ ...p, relatieId: id(p.relatieId) || null, email: normaliseerEmail(p.email) }))
      .sort((x, y) => vergelijkTekst(beoordelingsVingerafdruk(x), beoordelingsVingerafdruk(y))),
  });
  const beoordeling: Omit<VerhuurBeoordeling, 'vingerafdruk'> = {
    aanvraagId: id(a.id), vandaag: input.vandaag, beschikbaarheid, conflicts: uniekConflicts, historieWaarschuwingen,
    historieCompleet, meldingen: uniekeMeldingen, prijs, beleid, beleidsversie: beleid.versie, hardeBlokkade,
    kanAutomatischVerder: !hardeBlokkade && uniekConflicts.length === 0 && prijs.vastgesteld, aanvraagVingerafdruk,
  };
  return { ...beoordeling, vingerafdruk: beoordelingsVingerafdruk(beoordeling) };
}
