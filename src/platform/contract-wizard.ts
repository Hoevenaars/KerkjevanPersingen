/**
 * Invulvelden voor een huurovereenkomst.
 * Wat al bekend is, staat ingevuld. Wat nog ontbreekt, blijft leeg.
 * Opslaan maakt het contract definitief. Er gaat dan nog geen mail uit.
 */

import {
  contractTekst,
  contractnummerVoor,
  euroTekst,
  vingerafdruk,
  type ContractAfspraken,
  type ContractBron,
  type DocumentenflowInstellingen,
} from './documentenflow.ts';

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/;

export interface ContractWizardVelden {
  naam: string;
  straat: string;
  huisnummer: string;
  toevoeging: string;
  postcode: string;
  woonplaats: string;
  email: string;
  telefoon: string;
  soortLabel: string;
  activiteit: string;
  periodeVan: string;
  periodeTot: string;
  tijdVan: string;
  tijdTot: string;
  opbouw: string;
  afbouw: string;
  personen: string;
  contactpersoon: string;
  huurprijs: string;
  aanbetaling: string;
  aanbetalingVerval: string;
  restVerval: string;
  ondertekenaarNaam: string;
  ondertekenaarFunctie: string;
  tenaamstelling: string;
  iban: string;
  voorwaardenVastgesteldOp: string;
  huisregelsVastgesteldOp: string;
}

export interface WizardDossier {
  boekingId: string;
  soortLabel: string;
  activiteit: string;
  naam: string;
  email: string;
  telefoon: string;
  adres: string;
  straat: string;
  huisnummer: string;
  toevoeging: string;
  postcode: string;
  woonplaats: string;
  periodeVan: string;
  periodeTot: string;
  personen: string;
  huurprijs: string;
  aanbetaling: string;
}

export function legeWizardVelden(): ContractWizardVelden {
  return {
    naam: '',
    straat: '',
    huisnummer: '',
    toevoeging: '',
    postcode: '',
    woonplaats: '',
    email: '',
    telefoon: '',
    soortLabel: '',
    activiteit: '',
    periodeVan: '',
    periodeTot: '',
    tijdVan: '',
    tijdTot: '',
    opbouw: '',
    afbouw: '',
    personen: '',
    contactpersoon: '',
    huurprijs: '',
    aanbetaling: '',
    aanbetalingVerval: '',
    restVerval: '',
    ondertekenaarNaam: '',
    ondertekenaarFunctie: '',
    tenaamstelling: '',
    iban: '',
    voorwaardenVastgesteldOp: '',
    huisregelsVastgesteldOp: '',
  };
}

function tekst(waarde: string | null | undefined): string {
  return (waarde ?? '').replace(/\s+/g, ' ').trim();
}

/** "490", "490,00" en "€ 1.250,50" worden centen. Leeg of onleesbaar is null. */
export function euroNaarCent(waarde: string): number | null {
  const schoon = waarde.replace(/€/g, '').replace(/\s/g, '').trim();
  if (!schoon) return null;
  const normaal = schoon.includes(',') ? schoon.replace(/\./g, '').replace(',', '.') : schoon;
  if (!/^\d+(\.\d{1,2})?$/.test(normaal)) return null;
  return Math.round(Number(normaal) * 100);
}

export function centNaarInvoer(cent: number | null): string {
  if (cent == null) return '';
  return euroTekst(cent);
}

export function wizardUitDossier(
  dossier: WizardDossier,
  instellingen: Pick<DocumentenflowInstellingen, 'ondertekenaarNaam' | 'ondertekenaarFunctie' | 'tenaamstelling' | 'iban' | 'voorwaardenVastgesteldOp' | 'huisregelsVastgesteldOp'>,
  bewaard?: Partial<ContractWizardVelden> | null,
): ContractWizardVelden {
  const basis = legeWizardVelden();
  basis.naam = tekst(dossier.naam);
  basis.straat = tekst(dossier.straat);
  basis.huisnummer = tekst(dossier.huisnummer);
  basis.toevoeging = tekst(dossier.toevoeging);
  basis.postcode = tekst(dossier.postcode);
  basis.woonplaats = tekst(dossier.woonplaats);
  basis.email = tekst(dossier.email);
  basis.telefoon = tekst(dossier.telefoon);
  basis.soortLabel = tekst(dossier.soortLabel);
  basis.activiteit = tekst(dossier.activiteit);
  basis.periodeVan = tekst(dossier.periodeVan);
  basis.periodeTot = tekst(dossier.periodeTot);
  basis.personen = tekst(dossier.personen);
  basis.contactpersoon = tekst(dossier.naam);
  basis.huurprijs = tekst(dossier.huurprijs).replace(/^€\s*/, '');
  basis.aanbetaling = tekst(dossier.aanbetaling).replace(/^€\s*/, '');
  basis.ondertekenaarNaam = tekst(instellingen.ondertekenaarNaam);
  basis.ondertekenaarFunctie = tekst(instellingen.ondertekenaarFunctie);
  basis.tenaamstelling = tekst(instellingen.tenaamstelling);
  basis.iban = tekst(instellingen.iban);
  basis.voorwaardenVastgesteldOp = tekst(instellingen.voorwaardenVastgesteldOp);
  basis.huisregelsVastgesteldOp = tekst(instellingen.huisregelsVastgesteldOp);
  if (!bewaard) return basis;
  const samen = { ...basis };
  for (const sleutel of Object.keys(basis) as (keyof ContractWizardVelden)[]) {
    const waarde = bewaard[sleutel];
    if (typeof waarde === 'string') samen[sleutel] = waarde;
  }
  return samen;
}

export function leesWizardVelden(data: { get(naam: string): unknown }): ContractWizardVelden {
  const lees = (naam: keyof ContractWizardVelden) => String(data.get(naam) ?? '').trim();
  const velden = legeWizardVelden();
  for (const sleutel of Object.keys(velden) as (keyof ContractWizardVelden)[]) velden[sleutel] = lees(sleutel);
  velden.iban = velden.iban.replace(/\s+/g, '').toUpperCase();
  return velden;
}

export function restCentVan(velden: ContractWizardVelden): number | null {
  const huur = euroNaarCent(velden.huurprijs);
  const aan = euroNaarCent(velden.aanbetaling);
  if (huur == null || aan == null) return null;
  return huur - aan;
}

export function restTekst(velden: ContractWizardVelden): string {
  const rest = restCentVan(velden);
  if (rest == null) return 'Restbetaling wordt huurprijs min aanbetaling.';
  if (rest < 0) return 'De aanbetaling is hoger dan de huurprijs.';
  if (rest === 0) return 'Restbetaling: niet van toepassing.';
  return `Restbetaling: € ${euroTekst(rest)}.`;
}

function verplicht(velden: ContractWizardVelden, sleutel: keyof ContractWizardVelden, label: string, gaten: string[]) {
  if (!velden[sleutel].trim()) gaten.push(label);
}

function zonderSpaties(velden: ContractWizardVelden): ContractWizardVelden {
  return { ...velden, iban: velden.iban.replace(/\s+/g, '').toUpperCase() };
}

export function controleerWizard(invoer: ContractWizardVelden): string[] {
  const velden = zonderSpaties(invoer);
  const gaten: string[] = [];
  verplicht(velden, 'naam', 'Naam huurder', gaten);
  verplicht(velden, 'straat', 'Straat', gaten);
  verplicht(velden, 'huisnummer', 'Huisnummer', gaten);
  verplicht(velden, 'postcode', 'Postcode', gaten);
  verplicht(velden, 'woonplaats', 'Woonplaats', gaten);
  verplicht(velden, 'email', 'E-mail', gaten);
  verplicht(velden, 'soortLabel', 'Soort activiteit', gaten);
  verplicht(velden, 'activiteit', 'Omschrijving', gaten);
  if (!DATUM.test(velden.periodeVan) || !DATUM.test(velden.periodeTot)) gaten.push('Periode');
  else if (velden.periodeTot < velden.periodeVan) gaten.push('De einddatum ligt vóór de startdatum');
  verplicht(velden, 'tijdVan', 'Gebruik van', gaten);
  verplicht(velden, 'tijdTot', 'Gebruik tot', gaten);
  verplicht(velden, 'opbouw', 'Opbouw', gaten);
  verplicht(velden, 'afbouw', 'Afbouw', gaten);
  verplicht(velden, 'contactpersoon', 'Contactpersoon', gaten);
  const huur = euroNaarCent(velden.huurprijs);
  const aan = euroNaarCent(velden.aanbetaling);
  if (huur == null) gaten.push('Huurprijs');
  if (aan == null) gaten.push('Aanbetaling (vul 0 in als die er niet is)');
  const rest = huur != null && aan != null ? huur - aan : null;
  if (rest != null && rest < 0) gaten.push('De aanbetaling is hoger dan de huurprijs');
  if (aan != null && aan > 0 && !DATUM.test(velden.aanbetalingVerval)) gaten.push('Vervaldatum aanbetaling');
  if (rest != null && rest > 0 && !DATUM.test(velden.restVerval)) gaten.push('Vervaldatum restbetaling');
  verplicht(velden, 'ondertekenaarNaam', 'Ondertekenaar', gaten);
  verplicht(velden, 'ondertekenaarFunctie', 'Functie ondertekenaar', gaten);
  verplicht(velden, 'tenaamstelling', 'Tenaamstelling', gaten);
  if (!IBAN.test(velden.iban)) gaten.push('IBAN');
  if (!DATUM.test(velden.voorwaardenVastgesteldOp)) gaten.push('Vaststellingsdatum voorwaarden');
  if (!DATUM.test(velden.huisregelsVastgesteldOp)) gaten.push('Vaststellingsdatum huisregels');
  return gaten;
}

export function instellingenUitWizard(velden: ContractWizardVelden): DocumentenflowInstellingen {
  return {
    bestuursakkoordVerplicht: false,
    gereedRegel: '',
    ondertekenaarNaam: velden.ondertekenaarNaam.trim(),
    ondertekenaarFunctie: velden.ondertekenaarFunctie.trim(),
    iban: velden.iban,
    tenaamstelling: velden.tenaamstelling.trim(),
    voorwaardenVastgesteldOp: velden.voorwaardenVastgesteldOp,
    huisregelsVastgesteldOp: velden.huisregelsVastgesteldOp,
    coordinatorContact: '',
    publicatieRoute: '',
  };
}

export function afsprakenUitWizard(velden: ContractWizardVelden): ContractAfspraken {
  return {
    tijdVan: velden.tijdVan.trim(),
    tijdTot: velden.tijdTot.trim(),
    opbouw: velden.opbouw.trim(),
    afbouw: velden.afbouw.trim(),
    contactpersoon: velden.contactpersoon.trim(),
  };
}

export function bronUitWizard(velden: ContractWizardVelden, boekingId: string, soort = ''): ContractBron {
  const huur = euroNaarCent(velden.huurprijs);
  const aan = euroNaarCent(velden.aanbetaling);
  const rest = huur != null && aan != null ? huur - aan : null;
  return {
    boekingId,
    soort: soort.trim(),
    soortLabel: velden.soortLabel.trim(),
    activiteit: velden.activiteit.trim(),
    toelichting: '',
    periodeVan: velden.periodeVan,
    periodeTot: velden.periodeTot,
    geboektOp: '',
    huurderNaam: velden.naam.trim(),
    straat: velden.straat.trim(),
    huisnummer: velden.huisnummer.trim(),
    toevoeging: velden.toevoeging.trim(),
    postcode: velden.postcode.trim(),
    woonplaats: velden.woonplaats.trim(),
    email: velden.email.trim(),
    telefoon: velden.telefoon.trim(),
    personen: velden.personen.trim(),
    huurprijsCent: huur,
    aanbetalingCent: aan,
    aanbetalingVerval: aan && aan > 0 ? velden.aanbetalingVerval : '',
    restCent: rest,
    restVerval: rest && rest > 0 ? velden.restVerval : '',
    gastNaam: '',
    gastEmail: '',
    gastTelefoon: '',
    promotieAanwezig: false,
    boekingStatus: '',
  };
}

/** De wizard opent voor het eerste contract, en opnieuw als iemand een nieuwe versie vraagt. */
export function toonContractWizard(mag: boolean, heeftVersie: boolean, gevraagd: boolean): boolean {
  return mag && (gevraagd || !heeftVersie);
}

export function adresUitAanvraagOfWizard(
  aanvraag: { straat: string; huisnummer: string; toevoeging: string; postcode: string; woonplaats: string },
  wizard: unknown,
): { straat: string; huisnummer: string; toevoeging: string; postcode: string; woonplaats: string } {
  if (aanvraag.straat.trim() || aanvraag.huisnummer.trim() || aanvraag.postcode.trim()) return aanvraag;
  const bron = wizard && typeof wizard === 'object' ? wizard as Record<string, unknown> : {};
  const lees = (sleutel: string) => typeof bron[sleutel] === 'string' ? bron[sleutel].trim() : '';
  return {
    straat: lees('straat'),
    huisnummer: lees('huisnummer'),
    toevoeging: lees('toevoeging'),
    postcode: lees('postcode'),
    woonplaats: lees('woonplaats'),
  };
}

export interface BetaalregelPlan {
  soort: 'aanbetaling' | 'restant';
  bedrag: number;
  verval: string;
}

export function betaalregelsUitWizard(velden: ContractWizardVelden): BetaalregelPlan[] | { fout: string } {
  const huur = euroNaarCent(velden.huurprijs);
  const aan = euroNaarCent(velden.aanbetaling);
  if (huur == null || aan == null || huur < aan) return { fout: 'De bedragen kloppen niet. Er is niets opgeslagen.' };
  const regels: BetaalregelPlan[] = [];
  if (aan > 0) {
    if (!DATUM.test(velden.aanbetalingVerval)) return { fout: 'De vervaldatum van de aanbetaling ontbreekt. Er is niets opgeslagen.' };
    regels.push({ soort: 'aanbetaling', bedrag: aan / 100, verval: velden.aanbetalingVerval });
  }
  const rest = huur - aan;
  if (rest > 0) {
    if (!DATUM.test(velden.restVerval)) return { fout: 'De vervaldatum van de restbetaling ontbreekt. Er is niets opgeslagen.' };
    regels.push({ soort: 'restant', bedrag: rest / 100, verval: velden.restVerval });
  }
  return regels;
}

export interface BestaandeBetaalregel {
  id: number;
  soort: string;
  bedrag: number | null;
  status: string;
  vervaldatum: string;
}

export interface Betaalmutatie {
  updates: { id: number; bedrag: number; vervaldatum: string | null; status: string }[];
  inserts: { soort: 'aanbetaling' | 'restant'; bedrag: number; vervaldatum: string; status: 'open' }[];
}

function centenVan(bedrag: number | null): number | null {
  if (bedrag == null || !Number.isFinite(bedrag)) return null;
  return Math.round(bedrag * 100);
}

/** Zorgt dat het dossier straks precies één passende aanbetaling en restbetaling ziet. */
export function planBetaalregels(
  bestaand: readonly BestaandeBetaalregel[],
  plan: readonly BetaalregelPlan[],
): Betaalmutatie | { fout: string } {
  const updates: Betaalmutatie['updates'] = [];
  const inserts: Betaalmutatie['inserts'] = [];
  const label = (soort: string) => (soort === 'aanbetaling' ? 'aanbetaling' : 'restbetaling');
  for (const soort of ['aanbetaling', 'restant'] as const) {
    const gewenst = plan.find((regel) => regel.soort === soort) ?? null;
    const vanSoort = bestaand.filter((regel) => regel.soort === soort);
    const actief = vanSoort.filter((regel) => regel.status !== 'geannuleerd');
    const annuleer = (regel: BestaandeBetaalregel) => updates.push({
      id: regel.id,
      bedrag: regel.bedrag ?? 0,
      vervaldatum: regel.vervaldatum || null,
      status: 'geannuleerd',
    });
    if (!gewenst) {
      if (actief.some((regel) => regel.status === 'ontvangen')) {
        return { fout: `De ${label(soort)} is al ontvangen, terwijl dit contract die niet heeft. Er is niets opgeslagen.` };
      }
      for (const regel of actief) annuleer(regel);
      continue;
    }
    const ontvangen = actief.filter((regel) => regel.status === 'ontvangen');
    const open = actief.filter((regel) => regel.status !== 'ontvangen');
    if (ontvangen.length > 1) {
      return { fout: `Er staan twee ontvangen regels voor de ${label(soort)}. Er is niets opgeslagen.` };
    }
    if (ontvangen.length === 1) {
      for (const regel of open) annuleer(regel);
      const regel = ontvangen[0]!;
      if (centenVan(regel.bedrag) !== centenVan(gewenst.bedrag)) {
        return { fout: `De ${label(soort)} is al ontvangen en wijkt af van dit contract. Er is niets opgeslagen.` };
      }
      if ((regel.vervaldatum || '') !== gewenst.verval) {
        updates.push({ id: regel.id, bedrag: gewenst.bedrag, vervaldatum: gewenst.verval, status: 'ontvangen' });
      }
      continue;
    }
    if (open.length > 0) {
      const [houden, ...extra] = open;
      for (const regel of extra) annuleer(regel);
      updates.push({ id: houden!.id, bedrag: gewenst.bedrag, vervaldatum: gewenst.verval, status: 'open' });
      continue;
    }
    const geannuleerd = vanSoort.find((regel) => regel.status === 'geannuleerd');
    if (geannuleerd && soort === 'aanbetaling') {
      updates.push({ id: geannuleerd.id, bedrag: gewenst.bedrag, vervaldatum: gewenst.verval, status: 'open' });
      continue;
    }
    inserts.push({ soort, bedrag: gewenst.bedrag, vervaldatum: gewenst.verval, status: 'open' });
  }
  return { updates, inserts };
}

export function maakDefinitiefContract(
  invoer: ContractWizardVelden,
  boekingId: string,
  versie: number,
  opgesteldOp: string,
  soort = '',
): { tekst: string; nummer: string; vingerafdruk: string; bron: ContractBron; afspraken: ContractAfspraken; instellingen: DocumentenflowInstellingen } | { fout: string } {
  const velden = zonderSpaties(invoer);
  const gaten = controleerWizard(velden);
  if (gaten.length > 0) return { fout: `Nog invullen: ${gaten.join(', ')}. Er is niets opgeslagen.` };
  const bron = bronUitWizard(velden, boekingId, soort);
  const afspraken = afsprakenUitWizard(velden);
  const instellingen = instellingenUitWizard(velden);
  const nummer = contractnummerVoor(boekingId, velden.periodeVan, versie);
  const opgesteld = contractTekst(bron, afspraken, instellingen, nummer, versie, opgesteldOp);
  if (!opgesteld.tekst) return { fout: `Het contract is niet compleet. Ontbreekt: ${opgesteld.ontbreekt.join(', ')}.` };
  return {
    tekst: opgesteld.tekst,
    nummer,
    vingerafdruk: vingerafdruk(bron, afspraken, instellingen),
    bron,
    afspraken,
    instellingen,
  };
}
