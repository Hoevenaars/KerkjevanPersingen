import fs from 'node:fs/promises';
import path from 'node:path';
import { STANDAARD_MAILTEMPLATES, standaardTemplate } from './catalog.ts';
import type {
  MailAuditRegel,
  MailCommunicatieRegel,
  MailTemplateDef,
  MailTemplateInhoud,
  MailTemplateVersie,
} from './types.ts';

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_BESTAND = path.join(DATA_DIR, 'mailtemplates-state.json');

export interface MailTemplateState {
  templates: Record<string, Partial<MailTemplateDef> & { bijgewerktOp?: string; versie?: number }>;
  versies: MailTemplateVersie[];
  communicatie: MailCommunicatieRegel[];
  audit: MailAuditRegel[];
}

const legeState = (): MailTemplateState => ({
  templates: {},
  versies: [],
  communicatie: [],
  audit: [],
});

let geheugenState: MailTemplateState | null = null;

async function leesState(): Promise<MailTemplateState> {
  if (geheugenState) return geheugenState;
  try {
    const raw = await fs.readFile(STATE_BESTAND, 'utf8');
    geheugenState = { ...legeState(), ...JSON.parse(raw) };
    return geheugenState!;
  } catch {
    geheugenState = legeState();
    return geheugenState;
  }
}

async function schrijfState(state: MailTemplateState): Promise<void> {
  geheugenState = state;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STATE_BESTAND, JSON.stringify(state, null, 2), 'utf8');
}

function mergeTemplate(base: MailTemplateDef, override?: Partial<MailTemplateDef>): MailTemplateDef {
  if (!override) return { ...base };
  return {
    ...base,
    ...override,
    trigger: { ...base.trigger, ...(override.trigger ?? {}) },
    knoppen: override.knoppen ?? base.knoppen,
  };
}

export async function laadMailtemplates(): Promise<MailTemplateDef[]> {
  const state = await leesState();
  return STANDAARD_MAILTEMPLATES.map((base) => mergeTemplate(base, state.templates[base.id]));
}

export async function laadMailtemplate(id: string): Promise<MailTemplateDef | null> {
  const base = standaardTemplate(id);
  if (!base) return null;
  const state = await leesState();
  return mergeTemplate(base, state.templates[id]);
}

export async function bewaarMailtemplate(
  id: string,
  patch: Partial<MailTemplateDef>,
  gebruiker: string,
): Promise<MailTemplateDef> {
  const huidig = await laadMailtemplate(id);
  if (!huidig) throw new Error('Template niet gevonden');
  if (patch.id && patch.id !== id) throw new Error('Template-ID is niet wijzigbaar');

  const state = await leesState();
  const nieuweVersie = (state.templates[id]?.versie ?? 1) + 1;
  const bijgewerktOp = new Date().toISOString();

  const inhoudSnapshot: MailTemplateInhoud = {
    onderwerp: patch.onderwerp ?? huidig.onderwerp,
    aanhef: patch.aanhef ?? huidig.aanhef,
    introductie: patch.introductie ?? huidig.introductie,
    hoofdtekst: patch.hoofdtekst ?? huidig.hoofdtekst,
    callToActionTekst: patch.callToActionTekst ?? huidig.callToActionTekst,
    secundaireTekst: patch.secundaireTekst ?? huidig.secundaireTekst,
    slottekst: patch.slottekst ?? huidig.slottekst,
    ondertekening: patch.ondertekening ?? huidig.ondertekening,
    knoppen: patch.knoppen ?? huidig.knoppen,
  };

  state.versies.unshift({
    templateId: id,
    versie: nieuweVersie,
    opgeslagenOp: bijgewerktOp,
    gebruiker,
    inhoud: inhoudSnapshot,
    meta: {
      naam: patch.naam ?? huidig.naam,
      categorie: patch.categorie ?? huidig.categorie,
      actief: patch.actief ?? huidig.actief,
      ontvanger: patch.ontvanger ?? huidig.ontvanger,
      cc: patch.cc ?? huidig.cc,
      bcc: patch.bcc ?? huidig.bcc,
      trigger: patch.trigger ?? huidig.trigger,
      verzendwijze: patch.verzendwijze ?? huidig.verzendwijze,
    },
  });
  state.versies = state.versies.slice(0, 200);

  const merged = mergeTemplate(huidig, { ...patch, bijgewerktOp, versie: nieuweVersie } as Partial<MailTemplateDef>);
  state.templates[id] = { ...merged, bijgewerktOp, versie: nieuweVersie };

  state.audit.unshift({
    id: `audit-${Date.now()}`,
    op: bijgewerktOp,
    gebruiker,
    actie: 'template_gewijzigd',
    metadata: { templateId: id, versie: String(nieuweVersie) },
  });
  state.audit = state.audit.slice(0, 500);

  await schrijfState(state);
  return merged;
}

export async function herstelMailtemplateVersie(
  id: string,
  versie: number,
  gebruiker: string,
): Promise<MailTemplateDef | null> {
  const state = await leesState();
  const snap = state.versies.find((v) => v.templateId === id && v.versie === versie);
  if (!snap) return null;
  return bewaarMailtemplate(id, { ...snap.inhoud, ...snap.meta }, gebruiker);
}

export async function laadTemplateVersies(id: string): Promise<MailTemplateVersie[]> {
  const state = await leesState();
  return state.versies.filter((v) => v.templateId === id);
}

export async function registreerTestmail(input: {
  templateId: string;
  email: string;
  gebruiker: string;
  boekingId?: string;
}): Promise<void> {
  const state = await leesState();
  state.audit.unshift({
    id: `audit-test-${Date.now()}`,
    op: new Date().toISOString(),
    gebruiker: input.gebruiker,
    boekingId: input.boekingId,
    actie: 'testmail_verstuurd',
    metadata: { templateId: input.templateId, email: input.email },
  });
  await schrijfState(state);
}

export async function laadCommunicatieVoorBoeking(boekingId: string): Promise<MailCommunicatieRegel[]> {
  const state = await leesState();
  return state.communicatie.filter((c) => c.boekingId === boekingId);
}

export async function voegCommunicatieToe(regel: MailCommunicatieRegel): Promise<void> {
  const state = await leesState();
  state.communicatie.unshift(regel);
  await schrijfState(state);
}

export async function vervangCommunicatieLijst(boekingId: string, regels: MailCommunicatieRegel[]): Promise<void> {
  const state = await leesState();
  state.communicatie = [...regels, ...state.communicatie.filter((c) => c.boekingId !== boekingId)];
  await schrijfState(state);
}

export async function laadAudit(): Promise<MailAuditRegel[]> {
  const state = await leesState();
  return state.audit;
}

export function resetMailtemplateStoreForTests(): void {
  geheugenState = null;
}
