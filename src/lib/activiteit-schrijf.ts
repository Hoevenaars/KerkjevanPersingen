/**
 * Schrijft een bestuurshandeling naar Supabase.
 * De bridge blijft Sanity naar Supabase. Deze functie mailt niet.
 */

import { maakBeheerAdminClient } from './supabase.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function voerActiviteitActie(
  env: Record<string, unknown>,
  input: {
    tabel: string;
    id: string;
    actie: 'annuleer' | 'publicatiestatus' | 'contentstatus' | 'bewaar';
    payload: Record<string, unknown>;
    actorNaam: string;
    actorId?: string;
  },
): Promise<{ ok: boolean; melding: string }> {
  const client = maakBeheerAdminClient(env);
  if (!client) return { ok: false, melding: 'Supabase service-role ontbreekt. Er is niets opgeslagen en er is geen mail verstuurd.' };
  const id = Number(input.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, melding: 'Deze activiteit heeft geen opslag-id.' };
  const actorId = input.actorId && UUID.test(input.actorId) ? input.actorId : null;
  const { data, error } = await client.rpc('beheer_activiteit_mutatie' as never, {
    p_tabel: input.tabel,
    p_id: id,
    p_actie: input.actie,
    p_payload: input.payload,
    p_actor_naam: input.actorNaam,
    p_actor_id: actorId,
  } as never);
  if (error) return { ok: false, melding: error.message };
  const antwoord = (data ?? {}) as { ok?: boolean; melding?: string; mail?: boolean; jobs?: number };
  if (antwoord.mail || (antwoord.jobs ?? 0) > 0) {
    return { ok: false, melding: 'De actie probeerde mail of een communicatiejob te starten en is daarom niet vertrouwd.' };
  }
  return { ok: antwoord.ok !== false, melding: antwoord.melding || (antwoord.ok === false ? 'Opslaan mislukt.' : 'Opgeslagen.') };
}
