import type { Actor } from './kern.ts';
import type { DossierSessie } from './dossier-sessie.ts';

/** Alleen expliciet door SQL vastgestelde legacy-dossiers gebruiken het oude pad. */
export async function promoveerMachineAlsKlaar(client: DossierSessie, boekingId: number, actor: Actor): Promise<
  { behandeld: false } | { behandeld: true; ok: boolean; gepromoveerd: boolean; melding: string }
> {
  if (!client.rpc) return { behandeld: false };
  try {
    const r = await client.rpc('verhuur_promoveer_indien_klaar', { p_boeking_id: boekingId, p_actor_label: actor.naam });
    if (r.error) return { behandeld: true, ok: false, gepromoveerd: false, melding: r.error.message };
    const data = r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data as Record<string, unknown> : null;
    if (data?.machine === false && data.ok === true) return { behandeld: false };
    if (data?.machine !== true || typeof data.ok !== 'boolean' || typeof data.gepromoveerd !== 'boolean' ||
        (data.gepromoveerd && !data.ok)) {
      return { behandeld: true, ok: false, gepromoveerd: false, melding: 'De definitiefvoorwaarde is niet eenduidig bevestigd. De boeking blijft ongewijzigd.' };
    }
    return { behandeld: true, ok: data.ok, gepromoveerd: data.gepromoveerd,
      melding: String(data.melding || 'De actuele dossiervoorwaarden zijn gecontroleerd.') };
  } catch {
    return { behandeld: true, ok: false, gepromoveerd: false, melding: 'De transactionele definitiefcontrole is onderbroken. De procesjob kan veilig opnieuw controleren.' };
  }
}
