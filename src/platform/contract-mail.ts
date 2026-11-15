/**
 * De contractmail op een goedgekeurde aanvraag.
 * De tekst die de beheerder ziet, is de tekst die verstuurd wordt.
 */

import { formatNl } from './demo-data.ts';
import { plainTekstUitTemplate } from './mailtemplates/render.ts';
import type { MailTemplateDef } from './mailtemplates/types.ts';

export const CONTRACT_TEMPLATE_SLEUTEL = 'contract_begeleiding';

const STANDAARD_ONDERWERP = 'Contract voor uw boeking';
const STANDAARD_BRIEF = `Beste {naam},

Hierbij de afspraak voor uw {soort} op {datum}. Het tarief is {tarief}.

Wilt u per e-mail bevestigen dat u akkoord gaat? Daarna volgt de aanbetaling. Zodra die binnen is, is de boeking definitief.

Vragen kunt u stellen door op deze mail te antwoorden.

Met vriendelijke groet,
Stichting Het Kerkje van Persingen`;

export function boekingIdVoorLog(
  dossier: { soort: 'aanvraag' | 'boeking'; id: string; boekingId?: string | null },
  modus: string,
): string | null {
  if (dossier.soort === 'boeking') return dossier.id;
  if (modus !== 'aan') return null;
  const id = dossier.boekingId?.trim() ?? '';
  return id || null;
}

export function isContractTemplate(sleutel: string): boolean {
  return /contract|huurovereenkomst/i.test(sleutel);
}

export function contractTemplateVan<T extends { id: string; naam: string }>(templates: readonly T[]): T | null {
  return (
    templates.find((item) => item.id === CONTRACT_TEMPLATE_SLEUTEL) ??
    templates.find((item) => isContractTemplate(`${item.id} ${item.naam}`)) ??
    null
  );
}

export function tariefTekst(ruw: string): string {
  const schoon = ruw.trim();
  if (!schoon) return 'nog niet ingevuld';
  if (schoon.startsWith('€')) return schoon;
  const getal = Number(schoon.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(getal)) return schoon;
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(getal);
}

export function periodeTekst(start: string, eind: string): string {
  if (!start) return 'datum nog niet ingevuld';
  if (!eind || eind === start) return formatNl(start);
  return `${formatNl(start)} – ${formatNl(eind)}`;
}

export function vulPlaatsHouders(tekst: string, velden: Record<string, string>): string {
  const dubbel = tekst.replace(/\{\{(\w+)\}\}/g, (_heel, sleutel: string) => velden[sleutel] ?? `{{${sleutel}}}`);
  return dubbel.replace(/(?<!\{)\{([a-z0-9_]+)\}(?!\})/gi, (heel, sleutel: string) => {
    const naam = sleutel.toLowerCase();
    return naam in velden ? velden[naam] : heel;
  });
}

export function stelContractbriefOp(input: {
  naam: string;
  soortLabel: string;
  start: string;
  eind: string;
  tarief: string;
  template: MailTemplateDef | null;
}): { onderwerp: string; tekst: string; templateSleutel: string; uitTemplate: boolean } {
  const voornaam = input.naam.trim().split(/\s+/)[0] || input.naam;
  const tarief = tariefTekst(input.tarief);
  const velden: Record<string, string> = {
    voornaam,
    naam: input.naam.trim() || voornaam,
    soort: input.soortLabel.trim() || 'activiteit',
    activiteitstype: input.soortLabel.trim() || 'activiteit',
    activiteitnaam: input.naam.trim(),
    datum: periodeTekst(input.start, input.eind),
    tarief,
    bedrag: tarief,
  };
  const bron = input.template;
  const onderwerp = vulPlaatsHouders(bron?.onderwerp.trim() || STANDAARD_ONDERWERP, velden);
  const lichaam = bron ? plainTekstUitTemplate(bron, {}) : STANDAARD_BRIEF;
  return {
    onderwerp,
    tekst: vulPlaatsHouders(lichaam, velden).trim(),
    templateSleutel: bron?.id || CONTRACT_TEMPLATE_SLEUTEL,
    uitTemplate: Boolean(bron),
  };
}
