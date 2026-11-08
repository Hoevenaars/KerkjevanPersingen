/**
 * Leesmodel voor het verhuuroverzicht.
 * Geen database, geen mail, geen schrijfactie.
 * Bezetting volgt public.publieke_bezetting: optie, definitief,
 * migratie_vastgelegd, optie_verlopen, blokkerende interne activiteiten
 * en activiteit_bron met zichtbaarheid publiek of bezet.
 * Een losse aanvraag telt niet als bezetting.
 * Betaalbolletjes komen uit betalingen, niet uit aanbetaling_ontvangen.
 */

import { dagenInPeriode, dagenVerschil, voegDagenToe, weekdag } from './datum.ts';
import { formatNl } from './demo-data.ts';
import type { DemoAanvraag, DemoBoeking } from './demo-data.ts';

export const BEZETTENDE_STATUSSEN = ['optie', 'definitief', 'migratie_vastgelegd', 'optie_verlopen'] as const;

export const OPEN_AANVRAAG = ['nieuw', 'in_behandeling', 'wacht_op_aanvrager'] as const;

export type Bol = 'afgerond' | 'openstaand' | 'onbekend' | 'tegenstrijdig' | 'niet_zichtbaar';

export type RijHerkomst = 'boeking' | 'winterstop' | 'kalender' | 'vrij';

export interface OverzichtBetaling {
  id: string;
  boekingId: string;
  soort: string;
  bedrag: number;
  status: string;
  vervaldatum: string;
  ontvangenOp: string;
}

export interface OverzichtDocument {
  boekingId: string;
  naam: string;
  soort: string;
  datum: string;
}

export interface OverzichtBron {
  id: string;
  titel: string;
  start: string;
  eind: string;
  zichtbaarheid: 'publiek' | 'bezet' | 'verborgen' | null;
  levenscyclus: 'actief' | 'geannuleerd';
}

export interface OverzichtBlok {
  id: string;
  titel: string;
  start: string;
  eind: string;
  blokkeert: boolean;
  notities: string;
}

export interface OverzichtInvoer {
  jaar: number;
  maand: number | null;
  boekingen: readonly DemoBoeking[];
  betalingen: readonly OverzichtBetaling[];
  betaalregelsZichtbaar: boolean;
  blokkades: readonly OverzichtBlok[];
  bronnen: readonly OverzichtBron[];
  aanvragen: readonly DemoAanvraag[];
  documenten: readonly OverzichtDocument[];
}

export interface VerhuurRij {
  sleutel: string;
  herkomst: RijHerkomst;
  start: string;
  eind: string;
  periodeLabel: string;
  huurder: string;
  huurderExtra: string;
  activiteit: string;
  statusLabel: string;
  bezet: boolean;
  contract: Bol;
  aanbetaling: Bol;
  rest: Bol;
  bijzonderheden: string;
  boekingId: string | null;
  vlagWijktAf: boolean;
}

export interface OpenAanvraagRij {
  id: string;
  naam: string;
  periodeLabel: string;
  soort: string;
  statusLabel: string;
  heeftBoeking: boolean;
  toelichting: string;
}

export interface VerhuurOverzicht {
  venster: { start: string; eind: string };
  rijen: VerhuurRij[];
  aanvragen: OpenAanvraagRij[];
  aanvragenBuitenPeriode: number;
  jaren: number[];
}

const BETAALSTATUS = new Set(['open', 'ontvangen', 'geannuleerd']);

export function boekingBezetKalender(status: string): boolean {
  return (BEZETTENDE_STATUSSEN as readonly string[]).includes(status);
}

export function leesPeriodeKeuze(
  params: { get(naam: string): string | null },
  vandaag: string,
): { jaar: number; maand: number | null } {
  const fallback = Number(vandaag.slice(0, 4));
  const ruwJaar = Number(params.get('jaar'));
  const jaar = Number.isInteger(ruwJaar) && ruwJaar >= 2000 && ruwJaar <= 2100 ? ruwJaar : fallback;
  const ruwMaand = params.get('maand');
  if (!ruwMaand || ruwMaand === 'alle') return { jaar, maand: null };
  const maand = Number(ruwMaand);
  if (!Number.isInteger(maand) || maand < 1 || maand > 12) return { jaar, maand: null };
  return { jaar, maand };
}

export function vensterVan(jaar: number, maand: number | null): { start: string; eind: string } {
  if (maand == null) return { start: `${jaar}-01-01`, eind: `${jaar}-12-31` };
  const mm = String(maand).padStart(2, '0');
  const laatste = new Date(Date.UTC(jaar, maand, 0)).getUTCDate();
  return { start: `${jaar}-${mm}-01`, eind: `${jaar}-${mm}-${String(laatste).padStart(2, '0')}` };
}

export function periodeLabel(start: string, eind: string): string {
  if (!start) return 'Datum onbekend';
  const tot = eind || start;
  if (tot === start) return formatNl(start);
  const maandJaar = formatNl(tot).replace(/^\d+\s/, '');
  const dagStart = Number(start.slice(8, 10));
  const dagEind = Number(tot.slice(8, 10));
  if (start.slice(0, 7) === tot.slice(0, 7) && dagenVerschil(start, tot) === 1) {
    return `${dagStart} en ${dagEind} ${maandJaar}`;
  }
  if (start.slice(0, 7) === tot.slice(0, 7)) return `${dagStart} t/m ${dagEind} ${maandJaar}`;
  return `${formatNl(start)} t/m ${formatNl(tot)}`;
}

export function bolTekst(bol: Bol, kolom: 'contract' | 'betaling'): string {
  if (bol === 'niet_zichtbaar') return 'Afgeschermd';
  if (bol === 'tegenstrijdig') return 'Tegenstrijdig';
  if (bol === 'onbekend') return 'Onbekend';
  if (kolom === 'contract') return bol === 'afgerond' ? 'Vastgelegd' : 'Open';
  return bol === 'afgerond' ? 'Ontvangen' : 'Open';
}

function overlapt(
  a: { start: string; eind: string },
  b: { start: string; eind: string },
): boolean {
  return a.start <= b.eind && a.eind >= b.start;
}

function kort(tekst: string, max = 140): string {
  const schoon = tekst.replace(/\s+/g, ' ').trim();
  if (schoon.length <= max) return schoon;
  return `${schoon.slice(0, max - 1)}…`;
}

export function bolVoorSoort(regels: readonly OverzichtBetaling[], soort: string): Bol {
  const vanSoort = regels.filter((regel) => regel.soort === soort);
  if (vanSoort.length === 0) return 'onbekend';
  if (vanSoort.some((regel) => !BETAALSTATUS.has(regel.status))) return 'tegenstrijdig';
  const actief = vanSoort.filter((regel) => regel.status !== 'geannuleerd');
  if (actief.length === 0) return 'onbekend';
  const statussen = new Set(actief.map((regel) => regel.status));
  if (statussen.size > 1) return 'tegenstrijdig';
  if (statussen.has('ontvangen')) return 'afgerond';
  if (statussen.has('open')) return 'openstaand';
  return 'tegenstrijdig';
}

function vlagWijktAf(boeking: DemoBoeking, aanbetaling: Bol): boolean {
  if (aanbetaling === 'niet_zichtbaar' || aanbetaling === 'onbekend' || aanbetaling === 'tegenstrijdig') return false;
  const ontvangen = aanbetaling === 'afgerond';
  return boeking.aanbetalingBinnen !== ontvangen;
}

function betaalBol(
  boeking: DemoBoeking,
  betalingen: readonly OverzichtBetaling[],
  zichtbaar: boolean,
  soort: string,
): Bol {
  if (!zichtbaar) return 'niet_zichtbaar';
  return bolVoorSoort(
    betalingen.filter((regel) => regel.boekingId === boeking.id),
    soort,
  );
}

function bezetteDagen(invoer: OverzichtInvoer): Set<string> {
  const dagen = new Set<string>();
  const blokkerendeBoekingen = invoer.boekingen.filter((boeking) => boekingBezetKalender(boeking.status));
  const markeer = (start: string, eind: string) => {
    if (!start || !eind || eind < start) return;
    for (const dag of dagenInPeriode(start, eind)) dagen.add(dag);
  };
  for (const boeking of blokkerendeBoekingen) markeer(boeking.start, boeking.eind);
  for (const blok of invoer.blokkades) {
    if (blok.blokkeert) markeer(blok.start, blok.eind);
  }
  for (const bron of invoer.bronnen) {
    if (bron.levenscyclus === 'geannuleerd') continue;
    if (bron.zichtbaarheid !== 'publiek' && bron.zichtbaarheid !== 'bezet') continue;
    const dektBoeking = blokkerendeBoekingen.some((boeking) =>
      overlapt(boeking, { start: bron.start, eind: bron.eind }),
    );
    if (!dektBoeking) markeer(bron.start, bron.eind);
  }
  return dagen;
}

function vrijeWeekenden(
  venster: { start: string; eind: string },
  bezet: ReadonlySet<string>,
): { start: string; eind: string }[] {
  let zaterdag = venster.start;
  while (weekdag(zaterdag) !== 6) zaterdag = voegDagenToe(zaterdag, -1);
  const rijen: { start: string; eind: string }[] = [];
  let veiligheid = 0;
  while (zaterdag <= venster.eind && veiligheid < 60) {
    const zondag = voegDagenToe(zaterdag, 1);
    const dagen = [zaterdag, zondag].filter((dag) => dag >= venster.start && dag <= venster.eind && !bezet.has(dag));
    if (dagen.length === 2) rijen.push({ start: zaterdag, eind: zondag });
    else if (dagen.length === 1) rijen.push({ start: dagen[0], eind: dagen[0] });
    zaterdag = voegDagenToe(zaterdag, 7);
    veiligheid += 1;
  }
  return rijen;
}

function activiteitVanBoeking(boeking: DemoBoeking): string {
  if (boeking.soort.trim()) return boeking.soort.trim();
  if (boeking.interneTitel.trim() && boeking.interneTitel.trim() !== boeking.huurder.trim()) {
    return boeking.interneTitel.trim();
  }
  return 'Soort niet ingevuld';
}

function statusVanBoeking(boeking: DemoBoeking): string {
  if (boeking.status === 'migratie_vastgelegd') return 'Vastgelegd';
  if (boeking.status === 'migratie_aanvraag') return 'Aanvraag uit import';
  if (boeking.status === 'optie') return 'Optie';
  if (boeking.status === 'optie_verlopen') return 'Optie verlopen';
  if (boeking.status === 'definitief') return 'Definitief';
  if (boeking.status === 'geannuleerd') return 'Geannuleerd';
  if (boeking.status === 'afgerond') return 'Afgerond';
  if (boeking.status === 'afgewezen') return 'Afgewezen';
  if (boeking.status === 'gearchiveerd') return 'Gearchiveerd';
  return boeking.status;
}

function bijzonderhedenVanBoeking(boeking: DemoBoeking): string {
  const delen = [boeking.notities, boeking.toelichting ?? ''].map((deel) => deel.trim()).filter(Boolean);
  if (!boekingBezetKalender(boeking.status)) delen.unshift('Telt niet als bezet.');
  return kort(delen.join(' '));
}

const AANVRAAG_STATUS: Record<DemoAanvraag['status'], string> = {
  nieuw: 'Nieuw',
  in_behandeling: 'In behandeling',
  wacht_op_aanvrager: 'Wacht op aanvrager',
  goedgekeurd: 'Goedgekeurd',
  afgewezen: 'Afgewezen',
  gesloten: 'Gesloten',
};

export function maakVerhuurOverzicht(invoer: OverzichtInvoer): VerhuurOverzicht {
  const venster = vensterVan(invoer.jaar, invoer.maand);
  const bezet = bezetteDagen(invoer);
  const rijen: VerhuurRij[] = [];

  for (const boeking of invoer.boekingen) {
    if (!boeking.start || !overlapt(boeking, venster)) continue;
    const aanbetaling = betaalBol(boeking, invoer.betalingen, invoer.betaalregelsZichtbaar, 'aanbetaling');
    rijen.push({
      sleutel: `boeking:${boeking.id}`,
      herkomst: 'boeking',
      start: boeking.start,
      eind: boeking.eind || boeking.start,
      periodeLabel: periodeLabel(boeking.start, boeking.eind || boeking.start),
      huurder: boeking.huurder.trim() || 'Naam niet ingevuld',
      huurderExtra: (boeking.medeExposanten ?? '').trim(),
      activiteit: activiteitVanBoeking(boeking),
      statusLabel: statusVanBoeking(boeking),
      bezet: boekingBezetKalender(boeking.status),
      contract: 'onbekend',
      aanbetaling,
      rest: betaalBol(boeking, invoer.betalingen, invoer.betaalregelsZichtbaar, 'restant'),
      bijzonderheden: bijzonderhedenVanBoeking(boeking),
      boekingId: boeking.id,
      vlagWijktAf: invoer.betaalregelsZichtbaar && vlagWijktAf(boeking, aanbetaling),
    });
  }

  for (const blok of invoer.blokkades) {
    if (!blok.blokkeert || !blok.start || !overlapt(blok, venster)) continue;
    rijen.push({
      sleutel: `winter:${blok.id}`,
      herkomst: 'winterstop',
      start: blok.start,
      eind: blok.eind || blok.start,
      periodeLabel: periodeLabel(blok.start, blok.eind || blok.start),
      huurder: '—',
      huurderExtra: '',
      activiteit: blok.titel.trim() || 'Blokkade',
      statusLabel: 'Winterstop of blokkade',
      bezet: true,
      contract: 'niet_zichtbaar',
      aanbetaling: 'niet_zichtbaar',
      rest: 'niet_zichtbaar',
      bijzonderheden: kort(blok.notities),
      boekingId: null,
      vlagWijktAf: false,
    });
  }

  const blokkerendeBoekingen = invoer.boekingen.filter((boeking) => boekingBezetKalender(boeking.status));
  for (const bron of invoer.bronnen) {
    if (!bron.start || bron.levenscyclus === 'geannuleerd') continue;
    if (bron.zichtbaarheid !== 'publiek' && bron.zichtbaarheid !== 'bezet') continue;
    if (!overlapt(bron, venster)) continue;
    if (blokkerendeBoekingen.some((boeking) => overlapt(boeking, bron))) continue;
    rijen.push({
      sleutel: `kalender:${bron.id}`,
      herkomst: 'kalender',
      start: bron.start,
      eind: bron.eind || bron.start,
      periodeLabel: periodeLabel(bron.start, bron.eind || bron.start),
      huurder: '—',
      huurderExtra: '',
      activiteit: bron.titel.trim() || 'Bezet op de kalender',
      statusLabel: 'Bezet volgens de kalender',
      bezet: true,
      contract: 'niet_zichtbaar',
      aanbetaling: 'niet_zichtbaar',
      rest: 'niet_zichtbaar',
      bijzonderheden: 'Geen gekoppelde boeking. Deze rij volgt activiteit_bron en telt mee als bezet.',
      boekingId: null,
      vlagWijktAf: false,
    });
  }

  for (const vrij of vrijeWeekenden(venster, bezet)) {
    rijen.push({
      sleutel: `vrij:${vrij.start}:${vrij.eind}`,
      herkomst: 'vrij',
      start: vrij.start,
      eind: vrij.eind,
      periodeLabel: periodeLabel(vrij.start, vrij.eind),
      huurder: '—',
      huurderExtra: '',
      activiteit: 'Vrij',
      statusLabel: 'Vrij',
      bezet: false,
      contract: 'niet_zichtbaar',
      aanbetaling: 'niet_zichtbaar',
      rest: 'niet_zichtbaar',
      bijzonderheden: '',
      boekingId: null,
      vlagWijktAf: false,
    });
  }

  rijen.sort((a, b) => a.start.localeCompare(b.start) || a.eind.localeCompare(b.eind) || rang(a) - rang(b) || a.sleutel.localeCompare(b.sleutel));

  const open = invoer.aanvragen.filter((aanvraag) =>
    (OPEN_AANVRAAG as readonly string[]).includes(aanvraag.status),
  );
  const inPeriode = open.filter((aanvraag) => !aanvraag.start || overlapt({ start: aanvraag.start, eind: aanvraag.eind || aanvraag.start }, venster));
  const jaren = new Set<number>([invoer.jaar, 2026, 2027, 2028, 2029]);
  for (const boeking of invoer.boekingen) {
    if (boeking.start) jaren.add(Number(boeking.start.slice(0, 4)));
  }

  return {
    venster,
    rijen,
    aanvragen: inPeriode
      .sort((a, b) => (a.start || '9999').localeCompare(b.start || '9999') || a.id.localeCompare(b.id))
      .map((aanvraag) => ({
        id: aanvraag.id,
        naam: aanvraag.naam,
        periodeLabel: periodeLabel(aanvraag.start, aanvraag.eind || aanvraag.start),
        soort: aanvraag.soort.trim() || 'Soort niet ingevuld',
        statusLabel: AANVRAAG_STATUS[aanvraag.status],
        heeftBoeking: Boolean(aanvraag.boekingId),
        toelichting: kort(aanvraag.toelichting),
      })),
    aanvragenBuitenPeriode: open.length - inPeriode.length,
    jaren: [...jaren].filter((jaar) => Number.isInteger(jaar)).sort((a, b) => a - b),
  };
}

function rang(rij: VerhuurRij): number {
  if (rij.herkomst === 'boeking' && rij.bezet) return 0;
  if (rij.herkomst === 'winterstop') return 1;
  if (rij.herkomst === 'kalender') return 2;
  if (rij.herkomst === 'boeking') return 3;
  return 4;
}

export interface DossierRegel {
  label: string;
  waarde: string;
}

export interface DossierBlok {
  titel: string;
  toelichting: string;
  regels: DossierRegel[];
}

export interface DossierSporen {
  verzendingen: { status: string; verzondenOp: string; test: boolean; fout: string }[];
  verzendingFout: string | null;
  audit: { actie: string; op: string; actorType: string; van: string; naar: string }[];
  auditFout: string | null;
  auditZichtbaar: boolean;
}

export interface DossierRelatie {
  naam: string;
  organisatie: string;
  email: string;
  telefoon: string;
  adres: string;
}

export function maakDossier(
  boeking: DemoBoeking,
  invoer: OverzichtInvoer,
  relatie: DossierRelatie | null,
  gekoppeldeActiviteit: { titel: string; zichtbaarheid: string; levenscyclus: string } | null,
  sporen: DossierSporen,
): DossierBlok[] {
  const betalingen = invoer.betalingen.filter((regel) => regel.boekingId === boeking.id);
  const documenten = invoer.documenten.filter((document) => document.boekingId === boeking.id);
  const aanbetaling = betaalBol(boeking, invoer.betalingen, invoer.betaalregelsZichtbaar, 'aanbetaling');
  const rest = betaalBol(boeking, invoer.betalingen, invoer.betaalregelsZichtbaar, 'restant');
  const bezet = boekingBezetKalender(boeking.status);

  const correspondentie: DossierRegel[] = sporen.verzendingen.length
    ? sporen.verzendingen.map((regel) => ({
        label: regel.test ? 'Testregel' : 'Verzendregel',
        waarde: [regel.status || 'zonder status', regel.verzondenOp, regel.fout].filter(Boolean).join(' · '),
      }))
    : [{ label: 'Verzendbewijs', waarde: 'Geen verzendregel gevonden.' }];

  const auditregels: DossierRegel[] = !sporen.auditZichtbaar
    ? [{ label: 'Audit', waarde: 'De auditgeschiedenis is alleen zichtbaar voor de super-admin, en niet tijdens een kijkrol.' }]
    : sporen.auditFout
      ? [{ label: 'Audit', waarde: 'De auditlog kon niet worden gelezen.' }]
      : sporen.audit.length
        ? sporen.audit.map((regel) => ({
            label: regel.op || 'Onbekend tijdstip',
            waarde: [regel.actie, regel.actorType, auditVeld(regel.van), auditVeld(regel.naar)].filter(Boolean).join(' · '),
          }))
        : [{ label: 'Audit', waarde: 'Geen auditregels voor deze boeking.' }];

  return [
    {
      titel: '1. Boekingsgegevens',
      toelichting: '',
      regels: [
        { label: 'Nummer', waarde: boeking.nummer || boeking.id },
        { label: 'Periode', waarde: periodeLabel(boeking.start, boeking.eind || boeking.start) },
        { label: 'Status', waarde: statusVanBoeking(boeking) },
        { label: 'Interne titel', waarde: boeking.interneTitel || '—' },
        { label: 'Mede-exposant', waarde: (boeking.medeExposanten ?? '').trim() || '—' },
      ],
    },
    {
      titel: '2. Huurder en contactgegevens',
      toelichting: relatie
        ? 'Telefoon en adres komen van de huidige relatiekaart. De naam en het e-mailadres op de boeking zijn een momentopname.'
        : 'Er is geen relatie gekoppeld. Alleen de gegevens op de boeking zelf zijn beschikbaar.',
      regels: [
        { label: 'Naam op de boeking', waarde: boeking.huurder || '—' },
        { label: 'E-mail op de boeking', waarde: boeking.email || '—' },
        { label: 'Relatie', waarde: relatie?.naam || '—' },
        { label: 'Organisatie', waarde: relatie?.organisatie || '—' },
        { label: 'E-mail op de relatiekaart', waarde: relatie?.email || '—' },
        { label: 'Telefoon', waarde: relatie?.telefoon || '—' },
        { label: 'Adres', waarde: relatie?.adres || '—' },
      ],
    },
    {
      titel: '3. Activiteit en beschikbaarheid',
      toelichting: bezet
        ? 'Deze status telt mee als bezet, net als in de publieke verhuurkalender.'
        : 'Deze status telt niet mee als bezet. De dagen kunnen in het overzicht ook als vrij staan.',
      regels: [
        { label: 'Activiteit', waarde: activiteitVanBoeking(boeking) },
        { label: 'Bezetting', waarde: bezet ? 'Bezet' : 'Niet bezet' },
        { label: 'Gekoppelde agenda', waarde: gekoppeldeActiviteit ? `${gekoppeldeActiviteit.titel || 'Zonder titel'} · ${gekoppeldeActiviteit.zichtbaarheid || 'onbekend'} · ${gekoppeldeActiviteit.levenscyclus || 'actief'}` : 'Geen gekoppelde publieke activiteit.' },
      ],
    },
    {
      titel: '4. Contracten en documenten',
      toelichting: 'Er is geen contractstatus-kolom. De ruwe Excel-tekst in de import wordt hier niet als status gelezen. Een ontbrekend document is daarom Onbekend, niet Open of Afgerond.',
      regels: documenten.length
        ? documenten.map((document) => ({
            label: document.soort || 'Document',
            waarde: [document.naam, document.datum].filter(Boolean).join(' · ') || 'Naamloos bestand',
          }))
        : [{ label: 'Contractstatus', waarde: 'Onbekend. Er staat geen document bij deze boeking.' }],
    },
    {
      titel: '5. Betalingstermijnen en ontvangen bedragen',
      toelichting: invoer.betaalregelsZichtbaar
        ? 'De bolletjes volgen de betaalregels. Het oudere veld aanbetaling_ontvangen beslist niet.'
        : 'Betaalregels zijn alleen zichtbaar met leesrecht op finance.',
      regels: betaalRegels(boeking, betalingen, invoer.betaalregelsZichtbaar, aanbetaling, rest),
    },
    {
      titel: '6. Bijzonderheden',
      toelichting: '',
      regels: [
        { label: 'Notities', waarde: boeking.notities.trim() || '—' },
        { label: 'Toelichting', waarde: (boeking.toelichting ?? '').trim() || '—' },
      ],
    },
    {
      titel: '7. Correspondentie en auditgeschiedenis',
      toelichting: sporen.verzendingFout
        ? 'De verzendtabel kon niet worden gelezen. Een mail wordt hier niet als verstuurd getoond.'
        : 'Een verzendregel of een mailtaak is geen bewijs dat de ontvanger de mail heeft gekregen. Zonder verzendregel blijft de mail onbevestigd.',
      regels: [...correspondentie, ...auditregels],
    },
  ];
}

function betaalRegels(
  boeking: DemoBoeking,
  betalingen: readonly OverzichtBetaling[],
  zichtbaar: boolean,
  aanbetaling: Bol,
  rest: Bol,
): DossierRegel[] {
  if (!zichtbaar) return [{ label: 'Betalingen', waarde: 'Afgeschermd' }];
  const regels: DossierRegel[] = [
    { label: 'Aanbetaling', waarde: bolTekst(aanbetaling, 'betaling') },
    { label: 'Restbetaling', waarde: bolTekst(rest, 'betaling') },
  ];
  if (vlagWijktAf(boeking, aanbetaling)) {
    regels.push({
      label: 'Ouder veld',
      waarde: 'aanbetaling_ontvangen wijkt af van de betaalregels en wordt niet gebruikt.',
    });
  }
  if (betalingen.length === 0) {
    regels.push({ label: 'Regels', waarde: 'Geen betaalregels.' });
    return regels;
  }
  for (const regel of betalingen) {
    regels.push({
      label: regel.soort || 'Regel',
      waarde: [regel.status || 'zonder status', euro(regel.bedrag), regel.ontvangenOp ? `ontvangen ${formatNl(regel.ontvangenOp)}` : '', regel.vervaldatum ? `vervalt ${formatNl(regel.vervaldatum)}` : '']
        .filter(Boolean)
        .join(' · '),
    });
  }
  return regels;
}

function euro(bedrag: number): string {
  if (!Number.isFinite(bedrag)) return '';
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(bedrag);
}

export function auditVeld(waarde: string): string {
  const schoon = waarde.trim();
  if (!schoon) return '';
  if (schoon.includes('@')) return 'adres verborgen';
  return schoon.length > 80 ? `${schoon.slice(0, 79)}…` : schoon;
}

export function rijKlasse(rij: VerhuurRij): string {
  if (rij.herkomst === 'vrij') return 'vh-rij vh-rij--vrij';
  if (rij.herkomst === 'winterstop') return 'vh-rij vh-rij--winter';
  if (rij.herkomst === 'boeking' && !rij.bezet) return 'vh-rij vh-rij--geannuleerd';
  return 'vh-rij vh-rij--bezet';
}
