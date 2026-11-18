/** V5: reserveer de live mail in een database-transactie met boekingslock.
 * Alleen een werkelijk bevestigde claim mag gevolgd worden door een provider-call.
 * Geen fallback naar een losse INSERT als de RPC ontbreekt.
 */
export interface ClaimClient {
  rpc?: (naam: string, args: Record<string, unknown>) => PromiseLike<{
    data?: unknown;
    error?: { message?: string } | null;
  }>;
}

export async function reserveerLiveContractVerzending(
  client: ClaimClient,
  mail: {
    boekingId: number;
    versie: number;
    soort: 'contract' | 'herhaling';
    idempotentie: string;
    ontvanger: string;
    werkelijk: string;
  },
): Promise<{ ok: true; id: number } | { ok: false; melding: string }> {
  if (!client.rpc) return { ok: false, melding: 'Veilige contractverzending ontbreekt in Supabase. Er is geen e-mail verstuurd.' };
  if (!Number.isSafeInteger(mail.boekingId) || mail.boekingId < 1 ||
      !Number.isSafeInteger(mail.versie) || mail.versie < 1 ||
      !['contract', 'herhaling'].includes(mail.soort) ||
      !mail.idempotentie.trim() || !mail.ontvanger.trim() || !mail.werkelijk.trim()) {
    return { ok: false, melding: 'De verzendgegevens zijn ongeldig. Er is geen e-mail verstuurd.' };
  }
  try {
    const antwoord = await client.rpc('claim_contractverzending', {
      p_boeking_id: mail.boekingId,
      p_versie: mail.versie,
      p_soort: mail.soort,
      p_idempotentie: mail.idempotentie,
      p_ontvanger: mail.ontvanger,
      p_werkelijk: mail.werkelijk,
    });
    const id = Number(antwoord.data);
    if (antwoord.error || !Number.isSafeInteger(id) || id < 1) {
      return { ok: false, melding: `De verzendclaim is niet bevestigd. Er is geen nieuwe mail gestart. ${antwoord.error?.message ?? 'Controleer het dossier.'}` };
    }
    return { ok: true, id };
  } catch {
    return { ok: false, melding: 'De verzendclaim is onzeker. Er is geen provider aangeroepen. Controleer het dossier.' };
  }
}
