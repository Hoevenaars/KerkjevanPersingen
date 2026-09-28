import { magAutomatischVerzenden, type VerzendRecord } from '../communicatie.ts';
import { voegDagenToe, ymdInAmsterdam } from '../datum.ts';
import type { DemoBoeking } from '../demo-data.ts';
import type { MailCommunicatieRegel, MailTemplateDef } from './types.ts';
import { onderwerpUitTemplate } from './render.ts';
import { VOORBEELD_VARIABELEN } from './voorbeeld.ts';

const TIJDGESTUURDE_TEMPLATE_IDS = [
  'booking_content_request',
  'booking_content_reminder',
  'internal_content_overdue',
  'booking_practical_information',
  'host_practical_information',
  'booking_final_instructions',
  'host_final_instructions',
  'booking_review_request',
  'host_post_event_check',
  'internal_host_required',
] as const;

function templateOffset(template: MailTemplateDef): { waarde: number; eenheid: 'dagen' | 'weken'; richting: 'voor' | 'na' } | null {
  const t = template.trigger;
  if (t.offsetWaarde == null || !t.offsetEenheid || !t.offsetRichting) return null;
  return { waarde: t.offsetWaarde, eenheid: t.offsetEenheid, richting: t.offsetRichting };
}

export function berekenGeplandeDatum(startYmd: string, template: MailTemplateDef): string | null {
  const off = templateOffset(template);
  if (!off) return null;
  const teken = off.richting === 'voor' ? -1 : 1;
  const dagen = off.eenheid === 'weken' ? off.waarde * 7 : off.waarde;
  return voegDagenToe(startYmd, teken * dagen);
}

export function geplandeMailsVoorBoeking(
  boeking: DemoBoeking,
  templates: MailTemplateDef[],
  bestaand: MailCommunicatieRegel[],
  nu = new Date(),
): MailCommunicatieRegel[] {
  if (boeking.status !== 'definitief' && boeking.status !== 'optie') return [];
  const vandaag = ymdInAmsterdam(nu);
  const tplMap = new Map(templates.map((t) => [t.id, t]));
  const gepland: MailCommunicatieRegel[] = [];

  for (const id of TIJDGESTUURDE_TEMPLATE_IDS) {
    const template = tplMap.get(id);
    if (!template || !template.actief) continue;
    if (id.startsWith('host_') || id === 'internal_host_required') {
      if (boeking.soort !== 'expositie') continue;
    }
    const datum = berekenGeplandeDatum(boeking.start, template);
    if (!datum) continue;
    if (datum < vandaag) continue;
    const alVerzonden = bestaand.some(
      (r) => r.templateId === id && r.boekingId === boeking.id && r.status === 'verzonden' && !r.test,
    );
    if (alVerzonden) continue;
    const alGepland = bestaand.some(
      (r) => r.templateId === id && r.boekingId === boeking.id && (r.status === 'gepland' || r.status === 'concept'),
    );
    if (alGepland) continue;

    gepland.push({
      id: `plan-${boeking.id}-${id}`,
      boekingId: boeking.id,
      templateId: id,
      templateNaam: template.naam,
      ontvanger: template.ontvanger === 'Gastheer' ? 'Gastheer' : boeking.huurder,
      onderwerp: onderwerpUitTemplate(template, {
        ...VOORBEELD_VARIABELEN,
        naam: boeking.huurder,
        voornaam: boeking.huurder.split(' ')[0] ?? boeking.huurder,
        datum: boeking.start,
      }),
      status: template.trigger.conceptKlaarzetten ? 'concept' : 'gepland',
      geplandOp: datum,
      automatisch: template.verzendwijze === 'automatisch',
      door: 'systeem',
      test: false,
    });
  }

  return gepland.sort((a, b) => (a.geplandOp ?? '').localeCompare(b.geplandOp ?? ''));
}

export function demoNaarVerzendHistorie(regels: MailCommunicatieRegel[]): VerzendRecord[] {
  return regels
    .filter((r) => r.status === 'verzonden' && !r.test)
    .map((r) => ({
      boekingId: r.boekingId,
      templateId: r.templateId,
      relatieId: r.ontvanger,
      status: 'verzonden' as const,
      templateVersie: 1,
    }));
}

export function magOfficieelVersturen(
  historie: MailCommunicatieRegel[],
  boekingId: string,
  templateId: string,
  ontvanger: string,
): { ok: boolean; reden: string } {
  const records = demoNaarVerzendHistorie(historie);
  return magAutomatischVerzenden(records, { boekingId, templateId, relatieId: ontvanger });
}

export function herplanNaBoekingDatumwijziging(
  regels: MailCommunicatieRegel[],
  boeking: DemoBoeking,
  templates: MailTemplateDef[],
): { regels: MailCommunicatieRegel[]; waarschuwing: boolean } {
  let waarschuwing = false;
  const tplMap = new Map(templates.map((t) => [t.id, t]));
  const bijgewerkt = regels.map((r) => {
    if (r.boekingId !== boeking.id) return r;
    if (r.status === 'verzonden') {
      waarschuwing = true;
      return r;
    }
    if (r.status !== 'gepland' && r.status !== 'concept') return r;
    const tpl = tplMap.get(r.templateId);
    if (!tpl) return r;
    const nieuw = berekenGeplandeDatum(boeking.start, tpl);
    if (!nieuw || nieuw === r.geplandOp) return r;
    return { ...r, geplandOp: nieuw };
  });
  return { regels: bijgewerkt, waarschuwing };
}
