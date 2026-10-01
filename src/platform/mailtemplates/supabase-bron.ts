/**
 * Mailtemplates uit Supabase voor de testmodus.
 * De code-catalogus wordt hier niet gelezen en niet als fallback gebruikt.
 */

import type { MailKnop, MailTemplateDef, MailTemplateInhoud, MailTriggerConfig, MailVerzendwijze } from './types.ts';

export interface TemplateRij {
  sleutel: string;
  naam: string;
  actief: boolean;
  ontvanger_rol: string;
  trigger_soort: string;
  termijn_waarde: number | null;
  termijn_eenheid: string | null;
  verzendwijze: string;
  huidige_versie: number;
}

export interface VersieRij {
  sleutel: string;
  versie: number;
  onderwerp: string;
  inhoud: string;
  vastgelegd_op?: string;
}

const TRIGGER_SOORTEN = new Set<MailTriggerConfig['soort']>([
  'nieuwe_aanvraag',
  'aanvraag_compleet',
  'besluit_meer_info',
  'aanvulling_ontvangen',
  'besluit_afwijzing',
  'besluit_goedkeuring',
  'betaling_open_dagen',
  'voor_betaaldeadline',
  'betaaldeadline_verstreken',
  'betaling_ontvangen',
  'weken_voor_activiteit',
  'dagen_voor_activiteit',
  'dagen_na_activiteit',
  'content_compleet',
  'besluit_content',
  'geen_gastheer',
  'handmatig_gestart',
  'gastheer_accepteert',
  'boeking_geannuleerd',
  'expositie_vrijgegeven',
]);

export function parseTemplateInhoud(onderwerp: string, inhoud: string): MailTemplateInhoud & {
  categorie?: MailTemplateDef['categorie'];
  ontvanger?: string;
  cc?: string;
  bcc?: string;
  verzendwijze?: MailVerzendwijze;
  trigger?: MailTriggerConfig;
  bijgewerktOp?: string;
} {
  const leeg: MailTemplateInhoud = {
    onderwerp,
    aanhef: '',
    introductie: '',
    hoofdtekst: inhoud,
    callToActionTekst: '',
    secundaireTekst: '',
    slottekst: '',
    ondertekening: '',
    knoppen: [],
  };
  if (!inhoud.trim().startsWith('{')) return leeg;
  try {
    const parsed = JSON.parse(inhoud) as Partial<MailTemplateInhoud> & {
      categorie?: MailTemplateDef['categorie'];
      ontvanger?: string;
      cc?: string;
      bcc?: string;
      verzendwijze?: MailVerzendwijze;
      trigger?: MailTriggerConfig;
    };
    return {
      onderwerp,
      aanhef: parsed.aanhef ?? '',
      introductie: parsed.introductie ?? '',
      hoofdtekst: parsed.hoofdtekst ?? '',
      callToActionTekst: parsed.callToActionTekst ?? '',
      secundaireTekst: parsed.secundaireTekst ?? '',
      slottekst: parsed.slottekst ?? '',
      ondertekening: parsed.ondertekening ?? '',
      knoppen: Array.isArray(parsed.knoppen) ? (parsed.knoppen as MailKnop[]) : [],
      categorie: parsed.categorie,
      ontvanger: parsed.ontvanger,
      cc: parsed.cc,
      bcc: parsed.bcc,
      verzendwijze: parsed.verzendwijze,
      trigger: parsed.trigger,
    };
  } catch {
    return leeg;
  }
}

export function templateUitRijen(rij: TemplateRij, versie: VersieRij | undefined): MailTemplateDef {
  const lichaam = parseTemplateInhoud(versie?.onderwerp ?? rij.naam, versie?.inhoud ?? '');
  const eenheid = rij.termijn_eenheid === 'weken' || rij.termijn_eenheid === 'dagen' ? rij.termijn_eenheid : undefined;
  const trigger: MailTriggerConfig = lichaam.trigger ?? {
    soort: TRIGGER_SOORTEN.has(rij.trigger_soort as MailTriggerConfig['soort'])
      ? (rij.trigger_soort as MailTriggerConfig['soort'])
      : 'handmatig_gestart',
    beschrijving: rij.trigger_soort,
    offsetWaarde: rij.termijn_waarde ?? undefined,
    offsetEenheid: eenheid,
    automatischVersturen: rij.verzendwijze === 'automatisch',
    conceptKlaarzetten: rij.verzendwijze !== 'automatisch',
  };
  const verzendwijze: MailVerzendwijze =
    lichaam.verzendwijze ??
    (rij.verzendwijze === 'automatisch' || rij.verzendwijze === 'handmatig' ? rij.verzendwijze : 'besluit');
  return {
    id: rij.sleutel,
    naam: rij.naam,
    categorie: lichaam.categorie ?? 'Intern',
    actief: rij.actief,
    ontvanger: lichaam.ontvanger || rij.ontvanger_rol,
    cc: lichaam.cc ?? '',
    bcc: lichaam.bcc ?? '',
    trigger,
    verzendwijze,
    onderwerp: lichaam.onderwerp,
    aanhef: lichaam.aanhef,
    introductie: lichaam.introductie,
    hoofdtekst: lichaam.hoofdtekst,
    callToActionTekst: lichaam.callToActionTekst,
    secundaireTekst: lichaam.secundaireTekst,
    slottekst: lichaam.slottekst,
    ondertekening: lichaam.ondertekening,
    knoppen: lichaam.knoppen,
  };
}

export function inhoudJson(template: Pick<MailTemplateDef, keyof MailTemplateInhoud | 'categorie' | 'ontvanger' | 'cc' | 'bcc' | 'verzendwijze' | 'trigger'>): string {
  return JSON.stringify({
    aanhef: template.aanhef,
    introductie: template.introductie,
    hoofdtekst: template.hoofdtekst,
    callToActionTekst: template.callToActionTekst,
    secundaireTekst: template.secundaireTekst,
    slottekst: template.slottekst,
    ondertekening: template.ondertekening,
    knoppen: template.knoppen,
    categorie: template.categorie,
    ontvanger: template.ontvanger,
    cc: template.cc,
    bcc: template.bcc,
    verzendwijze: template.verzendwijze,
    trigger: template.trigger,
  });
}

export interface MailLeesClient {
  from(tabel: string): {
    select(kolommen: string): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
  };
}

export async function laadMailtemplateUitSupabase(client: MailLeesClient, id: string): Promise<{ template: MailTemplateDef; versies: { versie: number; opgeslagenOp: string; gebruiker: string }[] } | null> {
  const alle = await laadMailtemplatesUitSupabase(client);
  const template = alle.find((item) => item.id === id);
  if (!template) return null;
  const versies = await client.from('communicatie_template_versies').select('template_id,versie,vastgelegd_op');
  if (versies.error) throw new Error(versies.error.message);
  const templates = await client.from('communicatie_templates').select('id,sleutel');
  if (templates.error) throw new Error(templates.error.message);
  const idVan = new Map(((templates.data ?? []) as { id: number; sleutel: string }[]).map((rij) => [String(rij.id), rij.sleutel]));
  const lijst = ((versies.data ?? []) as { template_id: number; versie: number; vastgelegd_op?: string }[])
    .filter((rij) => idVan.get(String(rij.template_id)) === id)
    .map((rij) => ({
      versie: Number(rij.versie),
      opgeslagenOp: rij.vastgelegd_op ?? '',
      gebruiker: 'Supabase',
    }))
    .sort((a, b) => b.versie - a.versie);
  return { template, versies: lijst };
}

export async function laadMailtemplatesUitSupabase(client: MailLeesClient): Promise<MailTemplateDef[]> {
  const [templates, versies] = await Promise.all([
    client.from('communicatie_templates').select('id,sleutel,naam,actief,ontvanger_rol,trigger_soort,termijn_waarde,termijn_eenheid,verzendwijze,huidige_versie'),
    client.from('communicatie_template_versies').select('template_id,versie,onderwerp,inhoud,vastgelegd_op'),
  ]);
  if (templates.error) throw new Error(templates.error.message);
  if (versies.error) throw new Error(versies.error.message);
  const sleutelPerId = new Map<string, string>();
  for (const rij of (templates.data ?? []) as Record<string, unknown>[]) {
    sleutelPerId.set(String(rij.id), String(rij.sleutel ?? ''));
  }
  const perSleutel = new Map<string, VersieRij>();
  for (const rij of (versies.data ?? []) as Record<string, unknown>[]) {
    const sleutel = sleutelPerId.get(String(rij.template_id));
    if (!sleutel) continue;
    const bestaand = perSleutel.get(sleutel);
    const versie = Number(rij.versie ?? 0);
    if (bestaand && bestaand.versie >= versie) continue;
    perSleutel.set(sleutel, {
      sleutel,
      versie,
      onderwerp: String(rij.onderwerp ?? ''),
      inhoud: String(rij.inhoud ?? ''),
      vastgelegd_op: rij.vastgelegd_op == null ? undefined : String(rij.vastgelegd_op),
    });
  }
  return ((templates.data ?? []) as TemplateRij[]).map((rij) => templateUitRijen(rij, perSleutel.get(rij.sleutel)));
}

export interface MailSchrijfClient extends MailLeesClient {
  from(tabel: string): {
    select(kolommen: string): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> & {
      eq(kolom: string, waarde: string): {
        maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
    insert(waarden: unknown): PromiseLike<{ error: { message: string } | null }>;
    update(waarden: unknown): {
      eq(kolom: string, waarde: string | number): PromiseLike<{ error: { message: string } | null }>;
    };
    upsert(waarden: unknown, opties?: { onConflict?: string }): PromiseLike<{ error: { message: string } | null }>;
  };
}

export async function bewaarMailtemplateInSupabase(
  client: MailSchrijfClient,
  id: string,
  template: MailTemplateDef,
): Promise<void> {
  const huidig = await client
    .from('communicatie_templates')
    .select('id,huidige_versie')
    .eq('sleutel', id)
    .maybeSingle();
  if (huidig.error) throw new Error(huidig.error.message);
  const rij = huidig.data;
  if (!rij) throw new Error('Template ontbreekt in Supabase.');
  const versie = Number(rij.huidige_versie ?? 1) + 1;
  const insert = await client.from('communicatie_template_versies').insert({
    template_id: rij.id,
    versie,
    onderwerp: template.onderwerp,
    inhoud: inhoudJson(template),
  });
  if (insert.error) throw new Error(insert.error.message);
  const kolomVerzend =
    template.verzendwijze === 'automatisch' || template.verzendwijze === 'handmatig' ? template.verzendwijze : undefined;
  const update = await client
    .from('communicatie_templates')
    .update({
      naam: template.naam,
      actief: template.actief,
      huidige_versie: versie,
      ...(kolomVerzend ? { verzendwijze: kolomVerzend } : {}),
    })
    .eq('id', rij.id as number);
  if (update.error) throw new Error(update.error.message);
}
