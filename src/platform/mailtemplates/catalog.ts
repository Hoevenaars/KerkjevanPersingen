import generated from './generated-catalog.ts';
import { MAILTEMPLATE_META, mapKnopActies } from './meta.ts';
import type { MailKnop, MailTemplateDef } from './types.ts';

type GeneratedEntry = {
  id: string;
  onderwerp: string;
  aanhef: string;
  introductie: string;
  hoofdtekst: string;
  slottekst: string;
  ondertekening: string;
  callToActionTekst: string;
  secundaireTekst: string;
  knoppen: MailKnop[];
};

function bouwTemplate(entry: GeneratedEntry): MailTemplateDef {
  const meta = MAILTEMPLATE_META[entry.id];
  if (!meta) throw new Error(`Ontbrekende meta voor template ${entry.id}`);
  const knoppen = mapKnopActies(entry.id, entry.knoppen ?? []);
  return {
    id: entry.id,
    naam: meta.naam,
    categorie: meta.categorie,
    actief: true,
    ontvanger: meta.ontvanger,
    cc: '',
    bcc: '',
    trigger: meta.trigger,
    verzendwijze: meta.verzendwijze,
    onderwerp: entry.onderwerp,
    aanhef: entry.aanhef,
    introductie: entry.introductie,
    hoofdtekst: entry.hoofdtekst,
    callToActionTekst: entry.callToActionTekst,
    secundaireTekst: entry.secundaireTekst,
    slottekst: entry.slottekst,
    ondertekening: entry.ondertekening,
    knoppen,
  };
}

// Fix typo in generated field access
function normalize(entry: GeneratedEntry): GeneratedEntry {
  return entry;
}

export const STANDAARD_MAILTEMPLATES: MailTemplateDef[] = Object.values(generated as Record<string, GeneratedEntry>)
  .map(normalize)
  .map(bouwTemplate)
  .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));

export function standaardTemplate(id: string): MailTemplateDef | undefined {
  return STANDAARD_MAILTEMPLATES.find((t) => t.id === id);
}

export const MAILTEMPLATE_IDS = STANDAARD_MAILTEMPLATES.map((t) => t.id);
