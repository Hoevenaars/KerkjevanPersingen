/**
 * Documentenflow v1: één contractversie per boeking, bestuursakkoord,
 * verzending, ondertekening en opvolging. Geen bedrag, IBAN of Gereed-regel
 * wordt hier verzonnen. Lege instellingen houden verzenden dicht.
 */

import { createHash } from 'node:crypto';
import { voegDagenToe } from './datum.ts';
import { magSchrijven } from './rechten.ts';
import type { GebruikerRechten } from './types.ts';
import { contractMailTekst, contractPakketTekst, PRIVACY_URL } from './contract-pakket.ts';
import {
  DOCUMENTVERSIE,
  HUISREGELS_V1,
  PLATTEGROND_V1,
  VOORWAARDEN_V1,
  interneLijsten,
  type InterneLijst,
} from './documenten/teksten-v1.ts';
import { VERHUURDER } from './verhuurder.ts';

const PRIVACY = PRIVACY_URL;
const VERBODEN = /toegangs.?code|slotcode|pincode|wachtwoord|\{\{/;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/;

export type GereedRegel = '' | 'ondertekend' | 'ondertekend_en_aanbetaling';
export type BestuurStand = 'open' | 'wacht' | 'akkoord' | 'terug';
export type MailVenster = 'niet' | 'te_vroeg' | 'concept' | 'te_laat' | 'verzonden';

export interface DocumentenflowInstellingen {
  bestuursakkoordVerplicht: boolean;
  gereedRegel: GereedRegel;
  ondertekenaarNaam: string;
  ondertekenaarFunctie: string;
  iban: string;
  tenaamstelling: string;
  voorwaardenVastgesteldOp: string;
  huisregelsVastgesteldOp: string;
  coordinatorContact: string;
  publicatieRoute: string;
}

export interface ContractAfspraken {
  tijdVan: string;
  tijdTot: string;
  opbouw: string;
  afbouw: string;
  contactpersoon: string;
}

export interface ContractBron {
  boekingId: string;
  soort: string;
  soortLabel: string;
  activiteit: string;
  toelichting: string;
  periodeVan: string;
  periodeTot: string;
  geboektOp: string;
  huurderNaam: string;
  straat: string;
  huisnummer: string;
  toevoeging: string;
  postcode: string;
  woonplaats: string;
  email: string;
  telefoon: string;
  personen: string;
  huurprijsCent: number | null;
  aanbetalingCent: number | null;
  aanbetalingVerval: string;
  restCent: number | null;
  restVerval: string;
  gastNaam: string;
  gastEmail: string;
  gastTelefoon: string;
  promotieAanwezig: boolean;
  boekingStatus: string;
}

export interface ContractVerzending {
  soort: 'contract' | 'proef' | 'praktisch' | 'promotie' | 'bevestiging' | 'herhaling';
  idempotentie: string;
  ontvanger: string;
  werkelijk: string;
  status: 'bezig' | 'verzonden' | 'geweigerd' | 'ingetrokken';
  berichtId: string | null;
  op: string;
  versie: number;
  providerStatus?: 'geaccepteerd' | null;
}

export interface ContractVersie {
  versie: number;
  contractnummer: string;
  opgesteldOp: string;
  tekst: string;
  voorwaardenTekst: string;
  huisregelsTekst: string;
  plattegrondTekst: string;
  vingerafdruk: string;
  afspraken: ContractAfspraken;
  bestuurVerplicht: boolean;
  bestuur: BestuurStand;
  bestuurActor: string | null;
  bestuurOp: string | null;
  bestuurToelichting: string | null;
  ondertekening: 'open' | 'ontvangen';
  ondertekeningActor: string | null;
  ondertekeningOp: string | null;
  ondertekeningNummer: string | null;
  ondertekeningVersie: number | null;
  checks: Record<string, boolean>;
  verzendingen: ContractVerzending[];
}

export interface GeldRegel {
  soort: string;
  bedrag: number | null;
  status: string;
  vervaldatum: string;
}

export interface BetalingStand {
  stand: 'niet_vastgelegd' | 'open' | 'ontvangen';
  toelichting: string;
}

export interface FlowMail {
  soort: ContractVerzending['soort'];
  idempotentie: string;
  naar: string;
  bedoelde: string;
  onderwerp: string;
  tekst: string;
  bijlagen: { bestandsnaam: string; tekst: string; bytes?: Uint8Array }[];
  teltAlsVerzonden: boolean;
  versie: number;
}

export type FlowActie =
  | { soort: 'maken'; afspraken: ContractAfspraken }
  | { soort: 'voorleggen' }
  | { soort: 'akkoord' }
  | { soort: 'terug'; toelichting: string }
  | { soort: 'verzend'; proef: boolean; poging: string }
  | { soort: 'opnieuw'; poging: string }
  | { soort: 'ondertekend'; contractnummer: string; versie: number }
  | { soort: 'vink'; id: string; aan: boolean }
  | { soort: 'praktisch'; proef: boolean; poging: string }
  | { soort: 'promotie'; proef: boolean; poging: string }
  | { soort: 'gereed'; poging: string };

export interface FlowContext {
  nu: string;
  vandaag: string;
  actorNaam: string;
  rechten: GebruikerRechten;
  instellingen: DocumentenflowInstellingen;
  bron: ContractBron;
  versies: readonly ContractVersie[];
  betaling: BetalingStand;
  modus: 'uit' | 'test' | 'aan';
  testadres: string | null;
  tekenLink?: string | null;
}

export type FlowUitkomst =
  | { ok: false; melding: string }
  | { ok: true; melding: string; versies: ContractVersie[]; mail: FlowMail | null; promoveer: boolean };

export function legeInstellingen(): DocumentenflowInstellingen {
  return {
    bestuursakkoordVerplicht: true,
    gereedRegel: '',
    ondertekenaarNaam: '',
    ondertekenaarFunctie: '',
    iban: '',
    tenaamstelling: '',
    voorwaardenVastgesteldOp: '',
    huisregelsVastgesteldOp: '',
    coordinatorContact: '',
    publicatieRoute: '',
  };
}

function tekstWaarde(waarde: unknown): string {
  if (typeof waarde === 'string') return waarde.trim();
  if (typeof waarde === 'number' || typeof waarde === 'boolean') return String(waarde);
  return '';
}

export function leesInstellingen(rijen: readonly { sleutel: string; waarde: unknown }[]): DocumentenflowInstellingen {
  const map = new Map(rijen.map((rij) => [rij.sleutel, rij.waarde]));
  const lees = (sleutel: string) => tekstWaarde(map.get(sleutel));
  const ofStandaard = (sleutel: string, standaard: string) => (map.has(sleutel) ? lees(sleutel) : standaard);
  const bestuur = map.has('documentenflow_bestuursakkoord') ? lees('documentenflow_bestuursakkoord') : '';
  const regel = lees('documentenflow_gereed_regel');
  return {
    bestuursakkoordVerplicht: bestuur !== 'false',
    gereedRegel: regel === 'ondertekend' || regel === 'ondertekend_en_aanbetaling' ? regel : '',
    ondertekenaarNaam: ofStandaard('documentenflow_ondertekenaar_naam', VERHUURDER.ondertekenaarNaam),
    ondertekenaarFunctie: ofStandaard('documentenflow_ondertekenaar_functie', VERHUURDER.ondertekenaarFunctie),
    iban: ofStandaard('documentenflow_iban', VERHUURDER.iban).replace(/\s+/g, '').toUpperCase(),
    tenaamstelling: ofStandaard('documentenflow_tenaamstelling', VERHUURDER.tenaamstelling),
    voorwaardenVastgesteldOp: ofStandaard('documentenflow_voorwaarden_vastgesteld_op', VERHUURDER.voorwaardenVastgesteldOp),
    huisregelsVastgesteldOp: ofStandaard('documentenflow_huisregels_vastgesteld_op', VERHUURDER.huisregelsVastgesteldOp),
    coordinatorContact: ofStandaard('documentenflow_coordinator', VERHUURDER.coordinatorContact),
    publicatieRoute: ofStandaard('documentenflow_publicatie_route', VERHUURDER.publicatieRoute),
  };
}

export function instellingRijen(instellingen: DocumentenflowInstellingen): { sleutel: string; groep: string; waarde: string; toelichting: string }[] {
  const paar = (sleutel: string, waarde: string, toelichting: string) => ({ sleutel, groep: 'documentenflow', waarde, toelichting });
  return [
    paar('documentenflow_bestuursakkoord', instellingen.bestuursakkoordVerplicht ? 'true' : 'false', 'Bestuursakkoord voor nieuwe contracten'),
    paar('documentenflow_gereed_regel', instellingen.gereedRegel, 'Wanneer een boeking definitief mag'),
    paar('documentenflow_ondertekenaar_naam', instellingen.ondertekenaarNaam, 'Bevoegde ondertekenaar'),
    paar('documentenflow_ondertekenaar_functie', instellingen.ondertekenaarFunctie, 'Functie van de ondertekenaar'),
    paar('documentenflow_iban', instellingen.iban, 'IBAN voor verhuur'),
    paar('documentenflow_tenaamstelling', instellingen.tenaamstelling, 'Tenaamstelling van de huurrekening'),
    paar('documentenflow_voorwaarden_vastgesteld_op', instellingen.voorwaardenVastgesteldOp, 'Datum formele vaststelling voorwaarden'),
    paar('documentenflow_huisregels_vastgesteld_op', instellingen.huisregelsVastgesteldOp, 'Datum formele vaststelling huisregels'),
    paar('documentenflow_coordinator', instellingen.coordinatorContact, 'Contact van de coördinator voor exposanten'),
    paar('documentenflow_publicatie_route', instellingen.publicatieRoute, 'Waar promotiemateriaal naartoe gaat'),
  ];
}

export function controleerInstellingen(instellingen: DocumentenflowInstellingen): string | null {
  if (instellingen.iban && !IBAN.test(instellingen.iban)) return 'Het rekeningnummer is onvolledig. Er is niets opgeslagen.';
  if (instellingen.voorwaardenVastgesteldOp && !DATUM.test(instellingen.voorwaardenVastgesteldOp)) {
    return 'De vaststellingsdatum van de voorwaarden is geen datum. Er is niets opgeslagen.';
  }
  if (instellingen.huisregelsVastgesteldOp && !DATUM.test(instellingen.huisregelsVastgesteldOp)) {
    return 'De vaststellingsdatum van de huisregels is geen datum. Er is niets opgeslagen.';
  }
  return null;
}

export function magContractBeheren(rechten: GebruikerRechten): boolean {
  return magSchrijven(rechten, 'aanvragen') || magSchrijven(rechten, 'boekingen');
}

export function magBestuurBesluiten(rechten: GebruikerRechten): boolean {
  return magSchrijven(rechten, 'instellingen');
}

export function centVanBedrag(bedrag: number | null | undefined): number | null {
  if (bedrag == null || !Number.isFinite(bedrag)) return null;
  return Math.round(bedrag * 100);
}

export function euroTekst(cent: number): string {
  const negatief = cent < 0;
  const abs = Math.abs(cent);
  return `${negatief ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

export function geldUitAdministratie(input: {
  huurprijs: number | null;
  aanbetaling: number | null;
  regels: readonly GeldRegel[];
}): {
  huurprijsCent: number | null;
  aanbetalingCent: number | null;
  aanbetalingVerval: string;
  restCent: number | null;
  restVerval: string;
  gaten: string[];
} {
  const gaten: string[] = [];
  const huurprijsCent = centVanBedrag(input.huurprijs);
  const aanbetalingCent = centVanBedrag(input.aanbetaling);
  if (huurprijsCent == null) gaten.push('Huurprijs staat niet op de boeking.');
  if (aanbetalingCent == null) gaten.push('Aanbetaling staat niet op de boeking. Leg 0 vast als er geen aanbetaling is.');
  const actief = input.regels.filter((regel) => regel.status !== 'geannuleerd');
  const zoek = (soort: string) => actief.filter((regel) => regel.soort === soort);
  let aanbetalingVerval = '';
  let restVerval = '';
  if (aanbetalingCent != null && aanbetalingCent > 0) {
    const regels = zoek('aanbetaling');
    if (regels.length !== 1) gaten.push('De aanbetaling heeft geen enkele betaalregel.');
    else if (centVanBedrag(regels[0].bedrag) !== aanbetalingCent) gaten.push('Het aanbetalingsbedrag wijkt af van de betaalregel.');
    else if (!DATUM.test(regels[0].vervaldatum)) gaten.push('De vervaldatum van de aanbetaling ontbreekt.');
    else aanbetalingVerval = regels[0].vervaldatum;
  }
  const restCent = huurprijsCent == null || aanbetalingCent == null ? null : huurprijsCent - aanbetalingCent;
  if (restCent != null && restCent < 0) gaten.push('De aanbetaling is hoger dan de huurprijs.');
  if (restCent != null && restCent > 0) {
    const regels = zoek('restant');
    if (regels.length !== 1) gaten.push('De restbetaling heeft geen enkele betaalregel.');
    else if (centVanBedrag(regels[0].bedrag) !== restCent) gaten.push('De restbetaling wijkt af van huurprijs min aanbetaling.');
    else if (!DATUM.test(regels[0].vervaldatum)) gaten.push('De vervaldatum van de restbetaling ontbreekt.');
    else restVerval = regels[0].vervaldatum;
  }
  return { huurprijsCent, aanbetalingCent, aanbetalingVerval, restCent, restVerval, gaten };
}

export function betalingStand(input: { vlag: boolean; regels: readonly GeldRegel[] }): BetalingStand {
  const actief = input.regels.filter((regel) => regel.status !== 'geannuleerd' && (regel.soort === 'aanbetaling' || regel.soort === 'restant'));
  if (actief.length === 0 && !input.vlag) {
    return { stand: 'niet_vastgelegd', toelichting: 'Er is nog geen gecontroleerde betaling vastgelegd.' };
  }
  if (actief.some((regel) => regel.status === 'open')) {
    return { stand: 'open', toelichting: 'Een vastgelegde betaalregel staat nog open.' };
  }
  if (actief.length > 0 && actief.every((regel) => regel.status === 'ontvangen')) {
    return { stand: 'ontvangen', toelichting: 'De vastgelegde betaalregels zijn ontvangen.' };
  }
  if (input.vlag) {
    return { stand: 'ontvangen', toelichting: 'De aanbetaling is door een beheerder vastgelegd. Een restbetaling is niet vastgelegd.' };
  }
  return { stand: 'niet_vastgelegd', toelichting: 'De betaalregels zijn niet als ontvangen of open vastgelegd.' };
}

function bedragRegel(cent: number | null, verval: string): { bedrag: string; verval: string } {
  if (cent == null) return { bedrag: '', verval: '' };
  if (cent === 0) return { bedrag: 'niet van toepassing', verval: 'niet van toepassing' };
  return { bedrag: `€ ${euroTekst(cent)}`, verval };
}

export function ontbrekendeContractgegevens(
  bron: ContractBron,
  afspraken: ContractAfspraken,
  instellingen: DocumentenflowInstellingen,
): string[] {
  const gaten: string[] = [];
  const eis = (ok: boolean, label: string) => {
    if (!ok) gaten.push(label);
  };
  eis(Boolean(instellingen.ondertekenaarNaam.trim()), 'Bevoegde ondertekenaar');
  eis(Boolean(instellingen.ondertekenaarFunctie.trim()), 'Functie van de ondertekenaar');
  eis(IBAN.test(instellingen.iban), 'Officieel IBAN');
  eis(Boolean(instellingen.tenaamstelling.trim()), 'Tenaamstelling');
  eis(DATUM.test(instellingen.voorwaardenVastgesteldOp), 'Formele vaststellingsdatum verhuurvoorwaarden');
  eis(DATUM.test(instellingen.huisregelsVastgesteldOp), 'Formele vaststellingsdatum huisregels');
  eis(Boolean(bron.huurderNaam.trim()), 'Naam huurder');
  eis(Boolean(bron.straat.trim() && bron.huisnummer.trim() && bron.postcode.trim() && bron.woonplaats.trim()), 'Adres huurder');
  eis(Boolean(bron.email.trim()), 'E-mail huurder');
  eis(Boolean(bron.soortLabel.trim() && bron.activiteit.trim()), 'Activiteit');
  eis(DATUM.test(bron.periodeVan) && DATUM.test(bron.periodeTot), 'Periode');
  eis(Boolean(afspraken.tijdVan.trim() && afspraken.tijdTot.trim()), 'Gebruikstijden');
  eis(Boolean(afspraken.opbouw.trim() && afspraken.afbouw.trim()), 'Opbouw en afbouw');
  eis(Boolean((afspraken.contactpersoon || bron.huurderNaam).trim()), 'Contactpersoon');
  eis(bron.huurprijsCent != null && bron.huurprijsCent > 0, 'Huurprijs');
  eis(bron.aanbetalingCent != null && bron.restCent != null && bron.restCent >= 0, 'Betaling');
  if ((bron.aanbetalingCent ?? 0) > 0) eis(DATUM.test(bron.aanbetalingVerval), 'Vervaldatum aanbetaling');
  if ((bron.restCent ?? 0) > 0) eis(DATUM.test(bron.restVerval), 'Vervaldatum restbetaling');
  return gaten;
}

function schoon(waarde: string): string {
  return waarde.replace(/[{}]/g, '').trim();
}

export function contractTekst(
  bron: ContractBron,
  afspraken: ContractAfspraken,
  instellingen: DocumentenflowInstellingen,
  contractnummer: string,
  versie: number,
  opgesteldOp: string,
): { tekst: string | null; ontbreekt: string[] } {
  const ontbreekt = ontbrekendeContractgegevens(bron, afspraken, instellingen);
  if (ontbreekt.length > 0) return { tekst: null, ontbreekt };
  const aanRegel = bedragRegel(bron.aanbetalingCent, bron.aanbetalingVerval);
  const restRegel = bedragRegel(bron.restCent, bron.restVerval);
  const huis = [schoon(bron.huisnummer), schoon(bron.toevoeging)].filter(Boolean).join('');
  const adres = `${schoon(bron.straat)} ${huis}`.trim();
  const contact = schoon(afspraken.contactpersoon || bron.huurderNaam);
  const tekst = [
    'Huurovereenkomst',
    'Verhuur van het Kerkje van Persingen',
    `VERSIE ${DOCUMENTVERSIE}`,
    `Contractnummer: ${contractnummer} | Documentversie: ${versie} | Datum opgesteld: ${opgesteldOp}`,
    '',
    '1. Partijen',
    `Verhuurder: Stichting Het Kerkje van Persingen, gevestigd aan Persingensestraat 7, 6575 JA Persingen, ingeschreven bij de Kamer van Koophandel onder nummer 41058732, rechtsgeldig vertegenwoordigd door ${schoon(instellingen.ondertekenaarNaam)}, ${schoon(instellingen.ondertekenaarFunctie)}.`,
    `Huurder: ${schoon(bron.huurderNaam)}`,
    `Adres: ${adres}`,
    `Postcode / woonplaats: ${schoon(bron.postcode)} ${schoon(bron.woonplaats)}`,
    `E-mailadres: ${schoon(bron.email)}`,
    `Telefoon: ${schoon(bron.telefoon) || 'niet bekend'}`,
    '',
    '2. Gehuurde ruimte en gebruik',
    `Soort activiteit: ${schoon(bron.soortLabel)}`,
    `Omschrijving: ${schoon(bron.activiteit)}`,
    `Datum / periode: ${bron.periodeVan} t/m ${bron.periodeTot}`,
    `Gebruikstijden: ${schoon(afspraken.tijdVan)} - ${schoon(afspraken.tijdTot)}`,
    `Opbouw / toegang: ${schoon(afspraken.opbouw)}`,
    `Afbouw / oplevering: ${schoon(afspraken.afbouw)}`,
    `Aantal personen: ${schoon(bron.personen) || 'niet van toepassing'}`,
    `Contactpersoon: ${contact}`,
    '',
    '3. Huurprijs en betaling',
    `Totale overeengekomen huurprijs: € ${euroTekst(bron.huurprijsCent ?? 0)}`,
    `Aanbetaling / reserveringsbedrag: ${aanRegel.bedrag}`,
    `Vervaldatum aanbetaling: ${aanRegel.verval}`,
    `Restbetaling: ${restRegel.bedrag}`,
    `Vervaldatum restbetaling: ${restRegel.verval}`,
    `Betalingskenmerk: ${contractnummer}`,
    `Betaalgegevens: ${schoon(instellingen.tenaamstelling)}, ${instellingen.iban}`,
    'Een eventueel betaalverzoek of factuur wordt apart verstrekt. Deze huurovereenkomst is zelf geen factuur.',
    '',
    '4. Voorwaarden en zorgvuldig gebruik',
    `Verhuurvoorwaarden: versie ${DOCUMENTVERSIE} / vastgesteld op ${instellingen.voorwaardenVastgesteldOp}`,
    `Huisregels: versie ${DOCUMENTVERSIE} / vastgesteld op ${instellingen.huisregelsVastgesteldOp}`,
    '',
    '5. Bevestiging en wijzigingen',
    'Een aanvraag of voorlopig akkoord vormt nog geen definitieve reservering. De reservering wordt definitief zodra de verhuurder dit schriftelijk bevestigt, overeenkomstig de door het bestuur vastgestelde boekings- en betalingsafspraken.',
    '',
    '6. Annulering en persoonsgegevens',
    `Op annulering zijn de bijgevoegde verhuurvoorwaarden van toepassing. Privacyverklaring: ${PRIVACY}`,
    '',
    '7. Ondertekening',
    'Partijen verklaren de inhoud van deze overeenkomst en de bijlagen te hebben ontvangen en hiermee akkoord te gaan.',
    `Namens verhuurder: ${schoon(instellingen.ondertekenaarNaam)}`,
    'Plaats: Persingen    Datum: ______________    Handtekening: ______________',
    `Huurder: ${schoon(bron.huurderNaam)}`,
    'Plaats: ______________    Datum: ______________    Handtekening: ______________',
  ].join('\n');
  if (VERBODEN.test(tekst)) return { tekst: null, ontbreekt: ['De contracttekst bevat een niet toegestane passage.'] };
  return { tekst, ontbreekt: [] };
}

export function vingerafdruk(
  bron: ContractBron,
  afspraken: ContractAfspraken,
  instellingen: DocumentenflowInstellingen,
): string {
  const lading = {
    prijs: bron.huurprijsCent,
    aanbetaling: bron.aanbetalingCent,
    rest: bron.restCent,
    aanbetalingVerval: bron.aanbetalingVerval,
    restVerval: bron.restVerval,
    van: bron.periodeVan,
    tot: bron.periodeTot,
    soort: bron.soort,
    activiteit: bron.activiteit,
    huurder: bron.huurderNaam,
    email: bron.email,
    telefoon: bron.telefoon,
    adres: [bron.straat, bron.huisnummer, bron.toevoeging, bron.postcode, bron.woonplaats],
    personen: bron.personen,
    afspraken,
    iban: instellingen.iban,
    ondertekenaar: instellingen.ondertekenaarNaam,
    functie: instellingen.ondertekenaarFunctie,
    voorwaardenOp: instellingen.voorwaardenVastgesteldOp,
    huisregelsOp: instellingen.huisregelsVastgesteldOp,
    voorwaarden: VOORWAARDEN_V1,
    huisregels: HUISREGELS_V1,
    plattegrond: bron.soort.trim().toLowerCase() === 'expositie' ? PLATTEGROND_V1 : '',
  };
  return createHash('sha256').update(JSON.stringify(lading)).digest('hex');
}

export function versiePastBijGegevens(
  versie: ContractVersie,
  bron: ContractBron,
  instellingen: DocumentenflowInstellingen,
): boolean {
  return versie.vingerafdruk === vingerafdruk(bron, versie.afspraken, instellingen);
}

export function contractnummerVoor(boekingId: string, periodeVan: string, versie: number): string {
  const dag = (periodeVan || '00000000').replaceAll('-', '');
  return `KVP-${dag}-${boekingId}-v${versie}`;
}

export function expositieVenster(input: {
  soort: string;
  start: string;
  geboektOp: string;
  vandaag: string;
  dagenVooraf: number;
  nodig: boolean;
  alVerzonden: boolean;
}): MailVenster {
  if (input.soort.trim().toLowerCase() !== 'expositie' || !input.nodig) return 'niet';
  if (input.alVerzonden) return 'verzonden';
  if (!DATUM.test(input.start) || !DATUM.test(input.geboektOp) || !DATUM.test(input.vandaag)) return 'te_laat';
  const drempel = voegDagenToe(input.start, -input.dagenVooraf);
  if (input.geboektOp > drempel || input.vandaag > input.start) return 'te_laat';
  if (input.vandaag < drempel) return 'te_vroeg';
  return 'concept';
}

function voornaam(naam: string): string {
  return naam.trim().split(/\s+/)[0] || naam.trim();
}

export function praktischeMail(bron: ContractBron, instellingen: DocumentenflowInstellingen): { onderwerp: string; tekst: string } | { ontbreekt: string[] } {
  const ontbreekt: string[] = [];
  if (!bron.gastNaam.trim() || !bron.gastEmail.trim() || !bron.gastTelefoon.trim()) ontbreekt.push('Gastbegeleider');
  if (!bron.email.trim() || !bron.huurderNaam.trim()) ontbreekt.push('Exposant');
  if (!DATUM.test(bron.periodeVan)) ontbreekt.push('Expositiedatum');
  if (ontbreekt.length > 0) return { ontbreekt };
  const extra = [
    instellingen.coordinatorContact.trim()
      ? `Wanneer u mij niet kunt bereiken en er is iets dringends, neem dan contact op via ${schoon(instellingen.coordinatorContact)}.`
      : '',
    instellingen.publicatieRoute.trim()
      ? `Heeft u nog een digitale uitnodiging of afbeeldingen voor de agenda, dan kunt u die aanleveren via ${schoon(instellingen.publicatieRoute)}.`
      : 'Heeft u nog een digitale uitnodiging of afbeeldingen voor de agenda, dan horen wij dat graag.',
  ].filter(Boolean);
  const tekst = [
    `Beste ${voornaam(bron.huurderNaam)},`,
    '',
    `Binnenkort exposeert u in het Kerkje van Persingen, op ${bron.periodeVan} t/m ${bron.periodeTot}. Ik ben ${schoon(bron.gastNaam)} en begeleid uw expositie namens het kerkje.`,
    'Ik stem graag met u af wanneer u de expositie wilt inrichten, hoe de sleuteloverdracht verloopt en wanneer we na afloop samen de ruimte controleren.',
    `U kunt mij bereiken via ${schoon(bron.gastTelefoon)} of ${schoon(bron.gastEmail)}.`,
    ...extra,
    'Bij deze mail ontvangt u de huisregels en de plattegrond.',
    `Privacyverklaring: ${PRIVACY}`,
    '',
    'Hartelijke groet,',
    schoon(bron.gastNaam),
    'Gastbegeleider Kerkje van Persingen',
  ].join('\n');
  if (VERBODEN.test(tekst)) return { ontbreekt: ['De mail bevat een niet toegestane passage.'] };
  return { onderwerp: `Praktische afspraken voor uw expositie in Persingen — ${bron.periodeVan}`, tekst };
}

export function promotieMail(bron: ContractBron): { onderwerp: string; tekst: string } {
  const tekst = [
    `Beste ${voornaam(bron.huurderNaam)},`,
    '',
    `Voor de agenda van uw expositie op ${bron.periodeVan} hebben wij nog geen uitnodiging of afbeelding ontvangen.`,
    'Wilt u die nasturen? Zonder dat materiaal plaatsen wij geen aankondiging.',
    `Privacyverklaring: ${PRIVACY}`,
  ].join('\n');
  return { onderwerp: `Promotiemateriaal voor uw expositie op ${bron.periodeVan}`, tekst };
}

export function bevestigingMail(bron: ContractBron, versie: ContractVersie): { onderwerp: string; tekst: string } {
  return {
    onderwerp: `Uw reservering in Persingen is definitief — ${versie.contractnummer}`,
    tekst: [
      `Beste ${voornaam(bron.huurderNaam)},`,
      '',
      'Uw reservering in het Kerkje van Persingen is definitief bevestigd.',
      `Periode: ${bron.periodeVan} t/m ${bron.periodeTot}`,
      `Contract: ${versie.contractnummer}`,
      `Privacyverklaring: ${PRIVACY}`,
    ].join('\n'),
  };
}

function laatste(versies: readonly ContractVersie[]): ContractVersie | null {
  return versies.reduce<ContractVersie | null>((gek, versie) => (!gek || versie.versie > gek.versie ? versie : gek), null);
}

function alVerzonden(versies: readonly ContractVersie[], soort: ContractVerzending['soort']): boolean {
  return versies.some((versie) => versie.verzendingen.some((regel) => regel.soort === soort && regel.status === 'verzonden'));
}

function kopieer(versie: ContractVersie, wijziging: Partial<ContractVersie>): ContractVersie {
  return { ...versie, ...wijziging, checks: { ...versie.checks }, verzendingen: [...versie.verzendingen], afspraken: { ...versie.afspraken } };
}

function vervang(versies: readonly ContractVersie[], versie: ContractVersie): ContractVersie[] {
  return versies.map((item) => (item.versie === versie.versie ? versie : item));
}

function bestuurAkkoord(versie: ContractVersie): boolean {
  return !versie.bestuurVerplicht || versie.bestuur === 'akkoord';
}

function versieIngetrokken(versie: ContractVersie): boolean {
  return versie.verzendingen.some((regel) => {
    return (regel.soort === 'contract' || regel.soort === 'herhaling') && regel.status === 'ingetrokken';
  });
}

function mailDoel(context: FlowContext, proef: boolean): { ok: true; naar: string; telt: boolean } | { ok: false; melding: string } {
  if (context.modus === 'uit') return { ok: false, melding: 'De mailschakelaar staat uit. Er is geen mail verstuurd.' };
  if (!proef && context.modus === 'test') {
    return { ok: false, melding: 'De schakelaar staat op Test. Gebruik Proefmail. Er is geen mail naar de huurder gegaan.' };
  }
  if (proef || context.modus === 'test') {
    if (!context.testadres?.trim()) return { ok: false, melding: 'Er is geen testmailadres. Er is geen mail verstuurd.' };
    return { ok: true, naar: context.testadres.trim(), telt: false };
  }
  if (!context.bron.email.trim()) return { ok: false, melding: 'De huurder heeft geen e-mailadres. Er is geen mail verstuurd.' };
  return { ok: true, naar: context.bron.email.trim(), telt: true };
}

export function voerFlowUit(actie: FlowActie, context: FlowContext): FlowUitkomst {
  const huidig = laatste(context.versies);
  const weiger = (melding: string): FlowUitkomst => ({ ok: false, melding });
  if (actie.soort === 'maken') {
    if (!magContractBeheren(context.rechten)) return weiger('Geen recht om een contract te maken.');
    const nummer = contractnummerVoor(context.bron.boekingId, context.bron.periodeVan, (huidig?.versie ?? 0) + 1);
    const afdruk = vingerafdruk(context.bron, actie.afspraken, context.instellingen);
    if (huidig && huidig.vingerafdruk === afdruk) return { ok: true, melding: 'Deze contractversie bestaat al.', versies: [...context.versies], mail: null, promoveer: false };
    const opgesteld = contractTekst(context.bron, actie.afspraken, context.instellingen, nummer, (huidig?.versie ?? 0) + 1, context.vandaag);
    if (!opgesteld.tekst) return weiger(`Nog niet te maken. Ontbreekt: ${opgesteld.ontbreekt.join(', ')}.`);
    const versie: ContractVersie = {
      versie: (huidig?.versie ?? 0) + 1,
      contractnummer: nummer,
      opgesteldOp: context.vandaag,
      tekst: opgesteld.tekst,
      voorwaardenTekst: VOORWAARDEN_V1,
      huisregelsTekst: HUISREGELS_V1,
      plattegrondTekst: PLATTEGROND_V1,
      vingerafdruk: afdruk,
      afspraken: { ...actie.afspraken },
      bestuurVerplicht: context.instellingen.bestuursakkoordVerplicht,
      bestuur: 'open',
      bestuurActor: null,
      bestuurOp: null,
      bestuurToelichting: null,
      ondertekening: 'open',
      ondertekeningActor: null,
      ondertekeningOp: null,
      ondertekeningNummer: null,
      ondertekeningVersie: null,
      checks: {},
      verzendingen: [],
    };
    return { ok: true, melding: `Contract ${nummer} is gemaakt. Er is geen mail verstuurd.`, versies: [...context.versies, versie], mail: null, promoveer: false };
  }
  if (!huidig) return weiger('Er is nog geen contract. Er is niets gewijzigd.');
  if (actie.soort === 'voorleggen') {
    if (!magContractBeheren(context.rechten)) return weiger('Geen recht om het contract voor te leggen.');
    if (!huidig.bestuurVerplicht) return weiger('Bestuursakkoord staat uit voor deze versie.');
    if (huidig.bestuur === 'akkoord') return { ok: true, melding: 'Deze versie is al akkoord.', versies: [...context.versies], mail: null, promoveer: false };
    return {
      ok: true,
      melding: 'Het contract wacht op bestuursakkoord.',
      versies: vervang(context.versies, kopieer(huidig, { bestuur: 'wacht' })),
      mail: null,
      promoveer: false,
    };
  }
  if (actie.soort === 'akkoord' || actie.soort === 'terug') {
    if (!magBestuurBesluiten(context.rechten)) return weiger('Geen recht om bestuursakkoord te geven.');
    if (!huidig.bestuurVerplicht) return weiger('Deze versie vraagt geen bestuursakkoord.');
    if (!versiePastBijGegevens(huidig, context.bron, context.instellingen)) {
      return weiger('De boekingsgegevens zijn gewijzigd. De eerdere goedkeuring geldt niet meer. Maak een nieuwe versie. Er is niets gewijzigd.');
    }
    if (actie.soort === 'akkoord' && huidig.bestuur === 'akkoord') {
      return { ok: true, melding: 'Deze versie is al goedgekeurd.', versies: [...context.versies], mail: null, promoveer: false };
    }
    if (!['open', 'wacht', 'terug'].includes(huidig.bestuur)) return weiger('Deze versie kan niet worden goedgekeurd.');
    const terug = actie.soort === 'terug';
    return {
      ok: true,
      melding: terug ? 'Terug voor aanpassing. Dit is geen ondertekening.' : 'Akkoord op deze documentversie. Dit is geen ondertekening door de huurder.',
      versies: vervang(context.versies, kopieer(huidig, {
        bestuur: terug ? 'terug' : 'akkoord',
        bestuurActor: context.actorNaam,
        bestuurOp: context.nu,
        bestuurToelichting: terug ? actie.toelichting.trim() : null,
      })),
      mail: null,
      promoveer: false,
    };
  }
  if (actie.soort === 'verzend' || actie.soort === 'opnieuw') {
    if (!magContractBeheren(context.rechten)) return weiger('Geen recht om het contract te verzenden.');
    if (!bestuurAkkoord(huidig)) return weiger('Verzenden kan pas na bestuursakkoord op deze versie.');
    if (!versiePastBijGegevens(huidig, context.bron, context.instellingen)) {
      return weiger('De boekingsgegevens zijn gewijzigd. De eerdere goedkeuring geldt niet meer. Maak een nieuwe versie. Er is geen mail verstuurd.');
    }
    if (versieIngetrokken(huidig)) {
      return weiger('Deze versie is ingetrokken. Maak een nieuwe versie. Er is geen mail verstuurd.');
    }
    const opnieuw = actie.soort === 'opnieuw';
    const doel = mailDoel(context, opnieuw ? false : actie.proef);
    if (!doel.ok) return weiger(doel.melding);
    const geaccepteerd = alVerzonden([huidig], 'contract');
    if (!opnieuw && doel.telt && geaccepteerd) {
      return { ok: true, melding: 'Dit contract is al verzonden. Er is niet opnieuw gemaild.', versies: [...context.versies], mail: null, promoveer: false };
    }
    if (opnieuw && !geaccepteerd) return weiger('Er is nog geen geaccepteerde verzending om te herhalen. Er is geen mail verstuurd.');
    const poging = actie.poging;
    const geweigerd = huidig.verzendingen.some((regel) => regel.soort === 'contract' && regel.status === 'geweigerd');
    const idempotentie = opnieuw
      ? `herhaling:${context.bron.boekingId}:${huidig.versie}:${poging}`
      : doel.telt
        ? geweigerd
          ? `contract:${context.bron.boekingId}:${huidig.versie}:${poging}`
          : `contract:${context.bron.boekingId}:${huidig.versie}`
        : `proef:${huidig.versie}:${poging}`;
    if (huidig.verzendingen.some((regel) => regel.idempotentie === idempotentie && regel.status !== 'geweigerd')) {
      return { ok: true, melding: 'Deze verzending is al gedaan. Er is niet opnieuw gemaild.', versies: [...context.versies], mail: null, promoveer: false };
    }
    const bijlage = contractPakketTekst({
      tekst: huidig.tekst,
      voorwaardenTekst: huidig.voorwaardenTekst,
      huisregelsTekst: huidig.huisregelsTekst,
      plattegrondTekst: huidig.plattegrondTekst,
      soort: context.bron.soort,
    });
    return {
      ok: true,
      melding: doel.telt ? 'Het contract kan worden verzonden.' : 'De proefmail kan naar het testadres.',
      versies: [...context.versies],
      promoveer: false,
      mail: {
        soort: opnieuw ? 'herhaling' : doel.telt ? 'contract' : 'proef',
        idempotentie,
        naar: doel.naar,
        bedoelde: context.bron.email,
        onderwerp: `Huurovereenkomst ${huidig.contractnummer}`,
        tekst: contractMailTekst({
          naam: context.bron.huurderNaam,
          contractnummer: huidig.contractnummer,
          versie: huidig.versie,
          link: context.tekenLink ?? null,
        }),
        bijlagen: [{ bestandsnaam: `${huidig.contractnummer}.pdf`, tekst: bijlage }],
        teltAlsVerzonden: doel.telt,
        versie: huidig.versie,
      },
    };
  }
  if (actie.soort === 'ondertekend') {
    if (!magContractBeheren(context.rechten)) return weiger('Geen recht om een ondertekening vast te leggen.');
    if (actie.contractnummer.trim() !== huidig.contractnummer || actie.versie !== huidig.versie) {
      return weiger(`Dit hoort niet bij ${huidig.contractnummer}, versie ${huidig.versie}. Er is niets vastgelegd.`);
    }
    return {
      ok: true,
      melding: 'Ondertekend exemplaar ontvangen. Bestuursakkoord vervangt deze handtekening niet.',
      versies: vervang(context.versies, kopieer(huidig, {
        ondertekening: 'ontvangen',
        ondertekeningActor: context.actorNaam,
        ondertekeningOp: context.nu,
        ondertekeningNummer: huidig.contractnummer,
        ondertekeningVersie: huidig.versie,
      })),
      mail: null,
      promoveer: false,
    };
  }
  if (actie.soort === 'vink') {
    if (!magContractBeheren(context.rechten) && !magSchrijven(context.rechten, 'planning')) {
      return weiger('Geen recht om de interne lijst af te vinken.');
    }
    return {
      ok: true,
      melding: 'De interne lijst is bijgewerkt.',
      versies: vervang(context.versies, kopieer(huidig, { checks: { ...huidig.checks, [actie.id]: actie.aan } })),
      mail: null,
      promoveer: false,
    };
  }
  if (actie.soort === 'praktisch' || actie.soort === 'promotie') {
    if (!magContractBeheren(context.rechten)) return weiger('Geen recht om deze mail te versturen.');
    const nodig = actie.soort === 'promotie' ? !context.bron.promotieAanwezig : true;
    const venster = expositieVenster({
      soort: context.bron.soort,
      start: context.bron.periodeVan,
      geboektOp: context.bron.geboektOp,
      vandaag: context.vandaag,
      dagenVooraf: actie.soort === 'promotie' ? 35 : 21,
      nodig,
      alVerzonden: alVerzonden(context.versies, actie.soort),
    });
    if (venster === 'te_laat') return weiger('Deze mail is niet automatisch ingehaald. Er is niets verstuurd.');
    if (venster !== 'concept') return weiger('Deze mail is nu niet aan de beurt. Er is niets verstuurd.');
    const brief = actie.soort === 'praktisch' ? praktischeMail(context.bron, context.instellingen) : promotieMail(context.bron);
    if ('ontbreekt' in brief) return weiger(`Nog niet te versturen. Ontbreekt: ${brief.ontbreekt.join(', ')}.`);
    const doel = mailDoel(context, actie.proef);
    if (!doel.ok) return weiger(doel.melding);
    return {
      ok: true,
      melding: doel.telt ? 'De mail kan worden verzonden.' : 'De proef kan naar het testadres.',
      versies: [...context.versies],
      promoveer: false,
      mail: {
        soort: doel.telt ? actie.soort : 'proef',
        idempotentie: doel.telt ? `${actie.soort}:${context.bron.boekingId}` : `${actie.soort}:${actie.poging}`,
        naar: doel.naar,
        bedoelde: context.bron.email,
        onderwerp: brief.onderwerp,
        tekst: brief.tekst,
        bijlagen: actie.soort === 'praktisch'
          ? [
            { bestandsnaam: 'huisregels-v1.pdf', tekst: HUISREGELS_V1 },
            { bestandsnaam: 'plattegrond-expositie.pdf', tekst: PLATTEGROND_V1 },
          ]
          : [],
        teltAlsVerzonden: doel.telt,
        versie: huidig.versie,
      },
    };
  }
  if (actie.soort !== 'gereed') return weiger('Deze actie is niet beschikbaar.');
  if (!magSchrijven(context.rechten, 'boekingen')) return weiger('Geen recht om de boeking definitief te maken.');
  if (context.modus !== 'aan') return weiger('De definitieve bevestiging gaat pas naar de huurder als de mailschakelaar op Aan staat. Er is niets gewijzigd.');
  if (!context.instellingen.gereedRegel) return weiger('Er is nog geen vastgestelde regel voor Gereed. Er is niets gewijzigd.');
  if (huidig.ondertekening !== 'ontvangen') return weiger('Het ondertekende contract is nog niet ontvangen.');
  if (!bestuurAkkoord(huidig)) return weiger('Bestuursakkoord op deze versie ontbreekt.');
  if ((context.bron.aanbetalingCent ?? 0) > 0 && context.betaling.stand !== 'ontvangen') {
    return weiger('De aanbetaling is nog niet ontvangen. Een handtekening maakt de boeking niet definitief.');
  }
  if (context.instellingen.gereedRegel === 'ondertekend_en_aanbetaling' && context.betaling.stand !== 'ontvangen') {
    return weiger('De vastgelegde betaling is nog niet ontvangen.');
  }
  const alDefinitief = ['definitief', 'afgerond', 'gearchiveerd', 'migratie_vastgelegd'].includes(context.bron.boekingStatus);
  const alBevestigd = alVerzonden(context.versies, 'bevestiging');
  if (alBevestigd) return { ok: true, melding: 'De definitieve bevestiging is al verzonden.', versies: [...context.versies], mail: null, promoveer: false };
  const doel = mailDoel(context, false);
  if (!doel.ok) return weiger(doel.melding);
  const brief = bevestigingMail(context.bron, huidig);
  return {
    ok: true,
    melding: alDefinitief ? 'De definitieve bevestiging kan worden verzonden.' : 'De boeking kan definitief worden en de bevestiging kan worden verzonden.',
    versies: [...context.versies],
    promoveer: !alDefinitief,
    mail: doel.telt ? {
      soort: 'bevestiging',
      idempotentie: `bevestiging:${context.bron.boekingId}`,
      naar: doel.naar,
      bedoelde: context.bron.email,
      onderwerp: brief.onderwerp,
      tekst: brief.tekst,
      bijlagen: [],
      teltAlsVerzonden: true,
      versie: huidig.versie,
    } : null,
  };
}

export interface OpvolgingRegel {
  label: string;
  waarde: string;
}

export interface ContractOpvolgingWeergave {
  fout: string;
  regels: OpvolgingRegel[];
  redenen: string[];
  kanMaken: boolean;
  kanBekijken: boolean;
  bekijkHref: string;
  kanVerzenden: boolean;
  kanOpnieuw: boolean;
  kanProef: boolean;
  kanVoorleggen: boolean;
  kanAkkoord: boolean;
  kanGoedkeuren: boolean;
  kanTerug: boolean;
  kanOndertekenen: boolean;
  kanVinken: boolean;
  kanPraktisch: boolean;
  kanPromotie: boolean;
  kanGereed: boolean;
  modus: 'uit' | 'test' | 'aan';
  praktischTekst: string;
  praktischStand: string;
  promotieStand: string;
  lijsten: { lijst: InterneLijst; aangevinkt: Record<string, boolean> }[];
  afspraken: ContractAfspraken;
  contractnummer: string;
  versie: number | null;
  nummerVoorOndertekening: string;
  versieVoorOndertekening: string;
}

export function bouwOpvolging(input: {
  rechten: GebruikerRechten;
  bron: ContractBron;
  instellingen: DocumentenflowInstellingen;
  versies: readonly ContractVersie[];
  betaling: BetalingStand;
  vandaag: string;
  bekijkHref: string;
  fout: string;
  modus: 'uit' | 'test' | 'aan';
}): ContractOpvolgingWeergave {
  const huidig = laatste(input.versies);
  const afspraken = huidig?.afspraken ?? { tijdVan: '', tijdTot: '', opbouw: '', afbouw: '', contactpersoon: input.bron.huurderNaam };
  const past = huidig ? versiePastBijGegevens(huidig, input.bron, input.instellingen) : false;
  const ingetrokken = huidig ? versieIngetrokken(huidig) : false;
  const redenen = [
    ...(huidig ? [] : ontbrekendeContractgegevens(input.bron, afspraken, input.instellingen)),
    ...(huidig && !past ? ['De boekingsgegevens zijn gewijzigd. Maak een nieuwe contractversie'] : []),
    ...(ingetrokken ? ['Deze versie is ingetrokken. Maak een nieuwe versie'] : []),
  ];
  const beheer = magContractBeheren(input.rechten);
  const bestuur = magBestuurBesluiten(input.rechten);
  const klaar = Boolean(huidig) && redenen.length === 0;
  const akkoord = huidig ? bestuurAkkoord(huidig) && past : false;
  const verzonden = huidig ? alVerzonden([huidig], 'contract') : false;
  const verzendRegel = huidig?.verzendingen.find((regel) => regel.soort === 'contract' && regel.status === 'verzonden') ?? null;
  const praktisch = expositieVenster({
    soort: input.bron.soort,
    start: input.bron.periodeVan,
    geboektOp: input.bron.geboektOp,
    vandaag: input.vandaag,
    dagenVooraf: 21,
    nodig: true,
    alVerzonden: alVerzonden(input.versies, 'praktisch'),
  });
  const promotie = expositieVenster({
    soort: input.bron.soort,
    start: input.bron.periodeVan,
    geboektOp: input.bron.geboektOp,
    vandaag: input.vandaag,
    dagenVooraf: 35,
    nodig: !input.bron.promotieAanwezig,
    alVerzonden: alVerzonden(input.versies, 'promotie'),
  });
  const brief = praktischeMail(input.bron, input.instellingen);
  const bestuurTekst = !huidig
    ? 'Nog geen contract'
    : !huidig.bestuurVerplicht
      ? ''
      : huidig.bestuur === 'wacht'
        ? 'Wacht op akkoord'
        : huidig.bestuur === 'akkoord'
          ? 'Akkoord'
          : huidig.bestuur === 'terug'
            ? 'Terug voor aanpassing'
            : 'Nog niet voorgelegd';
  const regels: OpvolgingRegel[] = [
    { label: 'Contract gegenereerd', waarde: huidig ? `${huidig.contractnummer} · versie ${huidig.versie} · ${huidig.opgesteldOp}` : 'Nog niet' },
    {
      label: 'Bestuur akkoord',
      waarde: !huidig?.bestuurVerplicht
        ? 'Niet vereist'
        : huidig && !past
          ? 'Vervallen'
          : huidig?.bestuur === 'akkoord'
            ? `${bestuurTekst}${huidig.bestuurActor ? ` · ${huidig.bestuurActor}` : ''}${huidig.bestuurOp ? ` · ${huidig.bestuurOp.slice(0, 16).replace('T', ' ')}` : ''}`
            : bestuurTekst,
    },
    {
      label: 'Contract verzonden',
      waarde: verzendRegel
        ? `Geaccepteerd door de mailprovider · ${verzendRegel.op.slice(0, 16).replace('T', ' ')}. Aflevering is niet bevestigd.`
        : 'Nog niet',
    },
    {
      label: 'Huurder ondertekend',
      waarde: huidig?.ondertekening === 'ontvangen'
        ? `Ondertekend${huidig.ondertekeningActor ? ` · ${huidig.ondertekeningActor}` : ''}${huidig.ondertekeningOp ? ` · ${huidig.ondertekeningOp.slice(0, 16).replace('T', ' ')}` : ''}`
        : 'Nog niet',
    },
    { label: 'Aanbetaling ontvangen', waarde: input.betaling.stand === 'ontvangen' ? 'Ontvangen' : input.betaling.stand === 'open' ? 'Nog niet' : 'Niet vastgelegd' },
  ];
  const aanbetalingOpen = (input.bron.aanbetalingCent ?? 0) > 0 && input.betaling.stand !== 'ontvangen';
  const gereedKlaar = Boolean(input.instellingen.gereedRegel && huidig && huidig.ondertekening === 'ontvangen' && akkoord
    && !aanbetalingOpen
    && (input.instellingen.gereedRegel === 'ondertekend' || input.betaling.stand === 'ontvangen')
    && !alVerzonden(input.versies, 'bevestiging'));
  return {
    fout: input.fout,
    regels,
    redenen,
    kanMaken: beheer,
    kanBekijken: Boolean(huidig),
    bekijkHref: input.bekijkHref,
    kanVerzenden: beheer && klaar && akkoord && !verzonden && input.modus === 'aan',
    kanOpnieuw: beheer && klaar && akkoord && verzonden && input.modus === 'aan',
    kanProef: beheer && klaar && akkoord && input.modus !== 'uit',
    kanVoorleggen: false,
    kanGoedkeuren: bestuur && Boolean(huidig?.bestuurVerplicht) && past && huidig?.bestuur !== 'akkoord',
    kanAkkoord: bestuur && Boolean(huidig?.bestuurVerplicht) && past && huidig?.bestuur !== 'akkoord',
    kanTerug: bestuur && huidig?.bestuur === 'wacht',
    kanOndertekenen: beheer && Boolean(huidig) && huidig?.ondertekening !== 'ontvangen',
    kanVinken: beheer || magSchrijven(input.rechten, 'planning'),
    kanPraktisch: beheer && praktisch === 'concept' && !('ontbreekt' in brief) && input.modus !== 'uit',
    kanPromotie: beheer && promotie === 'concept' && input.modus !== 'uit',
    kanGereed: magSchrijven(input.rechten, 'boekingen') && gereedKlaar && input.modus === 'aan',
    modus: input.modus,
    praktischTekst: 'tekst' in brief ? brief.tekst : '',
    praktischStand: praktisch === 'te_laat'
      ? 'Niet verstuurd: de boeking is later gemaakt dan drie weken voor aanvang.'
      : praktisch === 'te_vroeg'
        ? 'Het concept komt drie weken voor aanvang beschikbaar. Er gaat niets vanzelf uit.'
        : praktisch === 'verzonden'
          ? 'De praktische mail is eenmaal verzonden.'
          : praktisch === 'concept'
            ? 'Concept, nog niet verzonden.'
            : '',
    promotieStand: promotie === 'te_laat'
      ? 'Geen automatische herinnering: de boeking is later dan vijf weken voor aanvang.'
      : promotie === 'concept'
        ? 'Promotiemateriaal ontbreekt. De herinnering is een concept.'
        : promotie === 'verzonden'
          ? 'De herinnering is eenmaal verzonden.'
          : '',
    lijsten: interneLijsten(input.bron.soort, input.bron.activiteit, input.bron.toelichting).map((lijst) => ({
      lijst,
      aangevinkt: huidig?.checks ?? {},
    })),
    afspraken,
    contractnummer: huidig?.contractnummer ?? '',
    versie: huidig?.versie ?? null,
    nummerVoorOndertekening: huidig?.contractnummer ?? '',
    versieVoorOndertekening: huidig ? String(huidig.versie) : '',
  };
}

export function flowActieUit(actie: string, formulier: { get(naam: string): unknown }): FlowActie | null {
  const lees = (naam: string) => String(formulier.get(naam) ?? '').trim();
  if (actie === 'df_maken') {
    return {
      soort: 'maken',
      afspraken: {
        tijdVan: lees('tijdVan'),
        tijdTot: lees('tijdTot'),
        opbouw: lees('opbouw'),
        afbouw: lees('afbouw'),
        contactpersoon: lees('contactpersoon'),
      },
    };
  }
  if (actie === 'df_voorleggen') return { soort: 'voorleggen' };
  if (actie === 'df_akkoord') return { soort: 'akkoord' };
  if (actie === 'df_terug') return { soort: 'terug', toelichting: lees('toelichting') };
  if (actie === 'df_verzend') return { soort: 'verzend', proef: lees('proef') === 'ja', poging: lees('poging') || 'eenmalig' };
  if (actie === 'df_opnieuw') return { soort: 'opnieuw', poging: lees('poging') || 'eenmalig' };
  if (actie === 'df_ondertekend') return { soort: 'ondertekend', contractnummer: lees('contractnummer'), versie: Number(lees('contractversie')) };
  if (actie === 'df_vink') return { soort: 'vink', id: lees('punt'), aan: lees('aan') !== 'nee' };
  if (actie === 'df_praktisch') return { soort: 'praktisch', proef: lees('proef') === 'ja', poging: lees('poging') || 'eenmalig' };
  if (actie === 'df_promotie') return { soort: 'promotie', proef: lees('proef') === 'ja', poging: lees('poging') || 'eenmalig' };
  if (actie === 'df_gereed') return { soort: 'gereed', poging: lees('poging') || 'eenmalig' };
  return null;
}

export function bijlageTekst(mail: FlowMail): string {
  return [mail.tekst, ...mail.bijlagen.map((bijlage) => bijlage.tekst)].join('\n');
}

export function mailIsToegestaan(mail: FlowMail): boolean {
  return !VERBODEN.test(bijlageTekst(mail));
}
