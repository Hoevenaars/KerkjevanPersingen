/** Bestaande inhouds- en praktische planning, met opslag vóór verzending. */
import { bouwPlan, jobDedupSleutel, type DienstContext, type Wereld } from '../operatie/kern.ts';
import { automatiseringVoorTemplate } from '../../platform/automatisering.ts';
import { berichtsoortVoorSjabloon, isBetalingsTemplate } from '../../platform/betalingscommunicatie.ts';
import type { MachineClient, Rij } from './beoordeling.ts';

export function isMachineOpvolgtemplate(templateId: string): boolean {
  return templateId !== 'booking_confirmed' && !isBetalingsTemplate(templateId)
    && berichtsoortVoorSjabloon(templateId) === 'geen_betaling';
}

/** Iedere boeking wordt als één transactie gepland, inclusief eventuele klanttokens. */
export async function planVerhuurOpvolging(input: {
  client: MachineClient; wereld: Wereld; ctx: DienstContext; boekingIds: ReadonlySet<string>;
}): Promise<{ gepland: number; meldingen: string[] }> {
  let gepland = 0;
  const meldingen: string[] = [];
  for (const boeking of input.wereld.boekingen.filter(b => input.boekingIds.has(b.id) && b.status === 'definitief')) {
    const recht = await input.client.rpc('verhuur_machine_mag', { p_boeking_id: Number(boeking.id), p_aanvraag_id: null });
    if (recht.error) throw new Error(recht.error.message);
    if (recht.data !== true) continue;
    const jobs = await input.client.from('verhuur_proces_jobs').select('sleutel').eq('boeking_id', Number(boeking.id)).eq('taak', 'opvolgmail');
    if (jobs.error) throw new Error(jobs.error.message);
    const bestaat = new Set<string>((jobs.data ?? []).map((j: Rij) => String(j.sleutel)));
    const plan = bouwPlan({ ...input.wereld, boekingen: [boeking] }, { soort: 'scheduler' }, {
      ...input.ctx,
      sjabloonOpen: templateId => isMachineOpvolgtemplate(templateId)
        && !bestaat.has(`opvolgmail:${jobDedupSleutel(boeking.id, templateId)}`)
        && (input.ctx.sjabloonOpen?.(templateId, boeking.id) ?? true),
    });
    if (!plan.ok || !plan.mutaties.length) continue;
    const berichten = plan.teVersturen.map(mail => {
      const templateId = mail.dedup.split(':').at(-1)!;
      const sleutel = automatiseringVoorTemplate(templateId);
      if (!sleutel || !isMachineOpvolgtemplate(templateId)) throw new Error('De vervolgmail heeft geen toegestane automatisering.');
      return {
        sleutel: `opvolgmail:${mail.dedup}`,
        payload: { ...mail, templateId, automatisering: sleutel, communicatieDedup: mail.dedup,
          tokenHash: ['booking_content_request','booking_content_reminder'].includes(templateId)
            ? plan.mutaties.find(m => m.soort === 'insert_token')?.velden?.token_hash ?? null : null,
          tokenVerlooptOp: ['booking_content_request','booking_content_reminder'].includes(templateId)
            ? plan.mutaties.find(m => m.soort === 'insert_token')?.velden?.verloopt_op ?? null : null },
      };
    });
    const opgeslagen = await input.client.rpc('verhuur_plan_opvolging', {
      p_boeking_id: Number(boeking.id), p_mutaties: plan.mutaties, p_berichten: berichten,
    });
    if (opgeslagen.error) throw new Error(opgeslagen.error.message);
    const r = opgeslagen.data as Rij | null;
    gepland += Number(r?.gepland ?? 0);
    if (r?.melding) meldingen.push(String(r.melding));
  }
  return { gepland, meldingen };
}
