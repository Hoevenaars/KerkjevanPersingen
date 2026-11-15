/**
 * Beoordeling van één aangeleverd onderdeel.
 * De beslissing hoort bij de versie. Publiceren, betalen en mailen gebeurt hier niet.
 */

export type StukSoort = 'inhoud' | 'document' | 'intake';
export type StukBesluit = 'goedgekeurd' | 'afgekeurd';

export interface StukBeoordeling {
  stukType: StukSoort;
  stukId: string;
  versie: number;
  status: StukBesluit;
  reden: string;
  beoordelaar: string;
  beoordeeldOp: string;
}

export interface StukSleutel {
  stukType: StukSoort;
  stukId: string;
  versie: number;
  aanwezig: boolean;
}

export interface StukPaneel {
  stukType: StukSoort;
  stukId: string;
  versie: number;
  status: 'te_beoordelen' | StukBesluit;
  statusTekst: string;
  kleur: 'ok' | 'pending' | 'unknown' | 'no';
  beoordelaar: string;
  datum: string;
  reden: string;
  kan: boolean;
  toelichting: string;
  eerdere: string;
}

export interface StukBesluitOk {
  ok: true;
  status: StukBesluit;
  reden: string | null;
  sleutel: StukSleutel;
}

const SOORTEN = new Set<StukSoort>(['inhoud', 'document', 'intake']);
const NIETS = ' Er is niets gewijzigd.';

export function inhoudVersieNummer(versie: number | null | undefined): number {
  if (versie == null || !Number.isFinite(versie) || versie < 0) return 0;
  return Math.floor(versie);
}

export function inhoudStukId(deel: 'tekst' | 'foto', activiteitId: string): string {
  return `${deel}:${activiteitId.trim()}`;
}

export function stukKanBeoordelen(input: {
  aanwezig: boolean;
  magSchrijven: boolean;
  alBeoordeeld: boolean;
}): boolean {
  return input.aanwezig && input.magSchrijven && !input.alBeoordeeld;
}

export function formatBeoordelingsdatum(iso: string): string {
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return 'nog niet vastgelegd';
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(datum);
}

function zelfdeSleutel(links: StukBeoordeling | StukSleutel, rechts: { stukType: string; stukId: string; versie: number }): boolean {
  return links.stukType === rechts.stukType && links.stukId === rechts.stukId && links.versie === rechts.versie;
}

export function stukPaneel(input: {
  sleutel: StukSleutel;
  magSchrijven: boolean;
  demo: boolean;
  leesfout: string;
  beoordelingen: readonly StukBeoordeling[];
}): StukPaneel {
  const huidig = input.beoordelingen.find((rij) => zelfdeSleutel(rij, input.sleutel)) ?? null;
  const eerdere = input.beoordelingen
    .filter((rij) => rij.stukType === input.sleutel.stukType && rij.stukId === input.sleutel.stukId && rij.versie < input.sleutel.versie)
    .sort((links, rechts) => rechts.versie - links.versie)[0] ?? null;
  const status = huidig?.status ?? 'te_beoordelen';
  const kan = !input.demo && !input.leesfout && stukKanBeoordelen({
    aanwezig: input.sleutel.aanwezig,
    magSchrijven: input.magSchrijven,
    alBeoordeeld: Boolean(huidig),
  });
  let toelichting = 'Afkeuren bewaart de reden bij deze versie. De website wordt hier niet gepubliceerd.';
  if (input.demo) toelichting = 'Voorbeeld. Er is niets opgeslagen.';
  else if (input.leesfout) toelichting = input.leesfout;
  else if (!input.sleutel.aanwezig) toelichting = 'Er is nog niets om te beoordelen.';
  else if (!input.magSchrijven) toelichting = 'Je kunt dit bekijken. Opslaan vraagt schrijfrecht op boekingen.';
  else if (huidig) {
    toelichting = 'Deze versie is beoordeeld. Een nieuwe upload vraagt een nieuwe beoordeling. De eerdere beslissing blijft staan en geldt niet voor de nieuwe versie. De website wordt hier niet gepubliceerd.';
  }
  const eerdereTekst = eerdere
    ? `Versie ${eerdere.versie} is ${eerdere.status === 'goedgekeurd' ? 'goedgekeurd' : 'afgekeurd'} door ${eerdere.beoordelaar} en geldt niet voor versie ${input.sleutel.versie}.`
    : '';
  return {
    stukType: input.sleutel.stukType,
    stukId: input.sleutel.stukId,
    versie: input.sleutel.versie,
    status,
    statusTekst: status === 'goedgekeurd' ? 'Goedgekeurd' : status === 'afgekeurd' ? 'Afgekeurd' : 'Te beoordelen',
    kleur: status === 'goedgekeurd' ? 'ok' : status === 'afgekeurd' ? 'no' : input.sleutel.aanwezig ? 'pending' : 'unknown',
    beoordelaar: huidig?.beoordelaar || 'nog niet vastgelegd',
    datum: huidig ? formatBeoordelingsdatum(huidig.beoordeeldOp) : 'nog niet vastgelegd',
    reden: huidig?.reden ?? '',
    kan,
    toelichting,
    eerdere: eerdereTekst,
  };
}

export function verwachtStuk(input: {
  stukType: string;
  stukId: string;
  activiteitId: string;
  inhoudVersie: number | null | undefined;
  heeftTekst: boolean;
  heeftFoto: boolean;
  documentIds: readonly string[];
  intakePaden: readonly string[];
}): StukSleutel | null {
  const activiteitId = input.activiteitId.trim();
  if (input.stukType === 'inhoud' && activiteitId) {
    const versie = inhoudVersieNummer(input.inhoudVersie);
    if (input.stukId === inhoudStukId('tekst', activiteitId)) {
      return { stukType: 'inhoud', stukId: input.stukId, versie, aanwezig: input.heeftTekst };
    }
    if (input.stukId === inhoudStukId('foto', activiteitId)) {
      return { stukType: 'inhoud', stukId: input.stukId, versie, aanwezig: input.heeftFoto };
    }
  }
  if (input.stukType === 'document' && input.documentIds.includes(input.stukId)) {
    return { stukType: 'document', stukId: input.stukId, versie: 1, aanwezig: true };
  }
  if (input.stukType === 'intake' && input.intakePaden.includes(input.stukId)) {
    return { stukType: 'intake', stukId: input.stukId, versie: 1, aanwezig: true };
  }
  return null;
}

export function beoordeelStukActie(input: {
  besluit: string;
  stukType: string;
  stukId: string;
  versie: string;
  reden: string;
  verwacht: StukSleutel | null;
  alBeoordeeld: boolean;
}): StukBesluitOk | { ok: false; melding: string } {
  const besluit = input.besluit.trim();
  if (besluit !== 'goedkeuren' && besluit !== 'afkeuren') {
    return { ok: false, melding: `Kies goedkeuren of afkeuren.${NIETS}` };
  }
  const verwacht = input.verwacht;
  if (!verwacht || !SOORTEN.has(verwacht.stukType) || !verwacht.aanwezig) {
    return { ok: false, melding: `Dit onderdeel hoort niet bij deze boeking of er is niets om te beoordelen.${NIETS}` };
  }
  const versie = Number(input.versie);
  if (
    input.stukType !== verwacht.stukType
    || input.stukId !== verwacht.stukId
    || !Number.isInteger(versie)
    || versie !== verwacht.versie
  ) {
    return { ok: false, melding: `Dit is niet de huidige versie. Vernieuw het dossier.${NIETS}` };
  }
  if (input.alBeoordeeld) {
    return { ok: false, melding: `Deze versie is al beoordeeld.${NIETS}` };
  }
  if (besluit === 'afkeuren') {
    const reden = input.reden.trim();
    if (!reden) return { ok: false, melding: `Afkeuren vraagt een reden.${NIETS}` };
    if (reden.length > 1000) return { ok: false, melding: `De reden is te lang.${NIETS}` };
    return { ok: true, status: 'afgekeurd', reden, sleutel: verwacht };
  }
  return { ok: true, status: 'goedgekeurd', reden: null, sleutel: verwacht };
}
