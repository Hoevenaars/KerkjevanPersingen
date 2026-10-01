/**
 * Gastheer koppelen of losmaken met de ingelogde beheer-sessie.
 * Lege keuze maakt de koppeling leeg. Er gaat geen mail uit.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GastheerActor {
  id?: string;
  naam: string;
  type: string;
}

export interface GastheerResultaat {
  ok: boolean;
  melding: string;
}

type Fout = { message: string; code?: string } | null;

interface Query extends PromiseLike<{ data: { id?: number | string; naam?: string } | null; error: Fout }> {
  select: (kolommen: string) => Query;
  update: (waarden: Record<string, unknown>) => Query;
  insert: (rij: Record<string, unknown>) => PromiseLike<{ error: Fout }>;
  eq: (kolom: string, waarde: unknown) => Query;
  maybeSingle: () => PromiseLike<{ data: { id?: number | string; naam?: string } | null; error: Fout }>;
}

export interface GastheerSessie {
  from: (tabel: 'boekingen' | 'relaties' | 'auditlog') => Query;
}

export async function koppelGastheerViaSessie(
  client: GastheerSessie,
  boekingId: number,
  gastheerId: string,
  actor: GastheerActor,
): Promise<GastheerResultaat> {
  if (!Number.isInteger(boekingId) || boekingId <= 0) return { ok: false, melding: 'Boeking niet gevonden.' };
  const leeg = gastheerId.trim() === '';
  let naam = '';
  if (!leeg) {
    const id = Number(gastheerId);
    if (!Number.isInteger(id) || id <= 0) return { ok: false, melding: 'Gastheer niet gevonden.' };
    const relatie = await client.from('relaties').select('id,naam').eq('id', id).maybeSingle();
    if (relatie.error) return { ok: false, melding: relatie.error.message };
    if (!relatie.data) return { ok: false, melding: 'Gastheer niet gevonden.' };
    naam = String(relatie.data.naam ?? '');
  }
  const update = await client
    .from('boekingen')
    .update({
      gastheer_relatie_id: leeg ? null : Number(gastheerId),
      bijgewerkt_op: new Date().toISOString(),
    })
    .eq('id', boekingId)
    .select('id')
    .maybeSingle();
  if (update.error) return { ok: false, melding: update.error.message };
  if (!update.data) return { ok: false, melding: 'Gastheer koppelen is niet gelukt.' };
  const actorId = actor.id && UUID.test(actor.id) ? actor.id : null;
  await client.from('auditlog').insert({
    actor_id: actorId,
    actor_naam: actor.naam,
    actor_type: actor.type,
    onderwerp_type: 'boeking',
    onderwerp_id: String(boekingId),
    actie: leeg ? 'gastheer_losgekoppeld' : 'gastheer_gekoppeld',
    naar: leeg ? '' : gastheerId,
    reden: naam || null,
    dedup_sleutel: `gastheer:${boekingId}:${leeg ? 'leeg' : gastheerId}:${new Date().toISOString().slice(0, 16)}`,
  });
  return { ok: true, melding: leeg ? 'Gastheer losgekoppeld.' : 'Gastheer gekoppeld.' };
}
