import { betaalontvangstFout, type BetaalontvangstEvent } from '../../platform/verhuur-financieel.ts';
import type { DossierSessie } from './dossier-sessie.ts';
import type { Actor } from './kern.ts';
import type { MachineResultaat } from './verhuur-contract-machine.ts';

/** Alleen aanroepen na bronauthenticatie (sessie of ondertekende webhook/import). */
export async function verwerkBetaalontvangst(input: { client: DossierSessie; event: BetaalontvangstEvent; actor: Actor;
  promoveer?: (client: DossierSessie, boekingId: number, actor: Actor) => Promise<{ gepromoveerd: boolean }>
}): Promise<MachineResultaat & { boekingId?: number; dubbel?: boolean }> {
  const fout = betaalontvangstFout(input.event);
  if (fout) return { ok: false, melding: fout, wachtOpMens: true };
  if (!input.client.rpc) return { ok: false, melding: 'De transactionele ontvangstfunctie ontbreekt.', wachtOpMens: true };
  const e = input.event;
  const antwoord = await input.client.rpc('verhuur_registreer_ontvangst', {
    p_bron: e.bron, p_event_id: e.eventId, p_betaling_id: e.betalingId, p_bedrag_cent: e.bedragCent,
    p_ontvangen_op: e.ontvangenOp, p_referentie: e.referentie ?? '', p_actor_label: input.actor.naam,
  });
  const r = antwoord.data as Record<string, unknown> | null;
  if (antwoord.error || !r || (!Number.isSafeInteger(Number(r.boeking_id)) || Number(r.boeking_id) <= 0) || Number(r?.betaling_id) !== e.betalingId || typeof r?.volledig !== 'boolean') {
    return { ok: false, melding: antwoord.error?.message || 'De ontvangst is niet bevestigd.', wachtOpMens: true };
  }
  // Nieuwe machineboekingen hebben daarnaast in dezelfde SQL-transactie een duurzame vervolgjob.
  // Een fout in de vervolgactie maakt een bewezen ontvangst niet ongedaan.
  let promotie: { gepromoveerd: boolean } | null = null;
  if (r.volledig === true) {
    try {
      const promoveer = input.promoveer ?? (await import('./definitief-auto.ts')).promoveerIndienKlaar;
      promotie = await promoveer(input.client, Number(r.boeking_id), input.actor);
    } catch { /* De SQL-vervolgjob herstelt na de reeds gecommitteerde ontvangst. */ }
  }
  return { ok: true, boekingId: Number(r.boeking_id), dubbel: r.dubbel === true,
    melding: r.dubbel === true ? 'Deze ontvangst was al verwerkt.' :
      `${r.volledig === true ? 'De betaaltermijn is ontvangen.' : 'De deelbetaling is vastgelegd; het restant blijft open.'}${promotie?.gepromoveerd ? ' De boeking is definitief.' : ''}` };
}
