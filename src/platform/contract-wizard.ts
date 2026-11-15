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

export function bronUitWizard(velden: ContractWizardVelden, boekingId: string): ContractBron {
  const huur = euroNaarCent(velden.huurprijs);
  const aan = euroNaarCent(velden.aanbetaling);
  const rest = huur != null && aan != null ? huur - aan : null;
  return {
    boekingId,
    soort: '',
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

export function maakDefinitiefContract(
  invoer: ContractWizardVelden,
  boekingId: string,
  versie: number,
  opgesteldOp: string,
): { tekst: string; nummer: string; vingerafdruk: string; bron: ContractBron; afspraken: ContractAfspraken; instellingen: DocumentenflowInstellingen } | { fout: string } {
  const velden = zonderSpaties(invoer);
  const gaten = controleerWizard(velden);
  if (gaten.length > 0) return { fout: `Nog invullen: ${gaten.join(', ')}. Er is niets opgeslagen.` };
  const bron = bronUitWizard(velden, boekingId);
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
