/**
 * Gastheer koppelen of losmaken met de ingelogde beheer-sessie.
 * Lege keuze maakt de koppeling leeg. Er gaat geen mail uit.
 */

import { magSchrijven } from '../../platform/rechten.ts';
import type { Actor } from './kern.ts';

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

interface Rij {
  id?: number | string;
  naam?: string;
  gastheer_relatie_id?: number | string | null;
}

interface Query extends PromiseLike<{ data: Rij | null; error: Fout }> {
  select: (kolommen: string) => Query;
  update: (waarden: Record<string, unknown>) => Query;
  insert: (rij: Record<string, unknown>) => PromiseLike<{ error: Fout }>;
  eq: (kolom: string, waarde: unknown) => Query;
  maybeSingle: () => PromiseLike<{ data: Rij | null; error: Fout }>;
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
    if (!Number.isInteger(id) || id <= 0) return { ok: false, melding: 'Expositiebegeleider niet gevonden.' };
    const relatie = await client.from('relaties').select('id,naam').eq('id', id).maybeSingle();
    if (relatie.error) return { ok: false, melding: relatie.error.message };
    if (!relatie.data) return { ok: false, melding: 'Expositiebegeleider niet gevonden.' };
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
  if (!update.data) return { ok: false, melding: 'Expositiebegeleider koppelen is niet gelukt.' };
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
  return { ok: true, melding: leeg ? 'Expositiebegeleider losgekoppeld.' : 'Expositiebegeleider gekoppeld.' };
}

export interface BegeleiderKeuze {
  boekingId: string;
  gastheerId: string;
}

const MAX_KEUZES = 400;

/** Velden heten `begeleider:<boekingId>`. De laatste waarde wint bij een dubbele boeking. */
export function leesBegeleiderKeuzes(data: FormData): BegeleiderKeuze[] {
  const perBoeking = new Map<string, string>();
  for (const [sleutel, waarde] of data.entries()) {
    if (!sleutel.startsWith('begeleider:') || typeof waarde !== 'string') continue;
    const boekingId = sleutel.slice('begeleider:'.length).trim();
    if (!boekingId) continue;
    perBoeking.set(boekingId, waarde);
  }
  return [...perBoeking.entries()].map(([boekingId, gastheerId]) => ({ boekingId, gastheerId }));
}

function magKoppelen(actor: Actor): boolean {
  const rechten = actor.rechten ?? { isSuperAdmin: false, perModule: {} };
  return magSchrijven(rechten, 'boekingen') || magSchrijven(rechten, 'planning');
}

function zelfdeGastheer(huidig: unknown, gekozen: string): boolean {
  const links = huidig == null || huidig === '' ? '' : String(huidig);
  return links === gekozen.trim();
}

/**
 * Slaat alleen boekingen op waarvan de gekozen begeleider afwijkt.
 * Een ongewijzigde rij krijgt geen nieuwe auditregel.
 */
export async function koppelGastherenViaSessie(
  client: GastheerSessie,
  keuzes: readonly BegeleiderKeuze[],
  actor: GastheerActor & { rechten?: Actor['rechten'] },
): Promise<GastheerResultaat> {
  if (!magKoppelen(actor)) return { ok: false, melding: 'Geen recht om een gastheer te koppelen.' };
  if (keuzes.length > MAX_KEUZES) {
    return { ok: false, melding: 'Te veel boekingen in één keer. Kies een maand en probeer opnieuw.' };
  }
  let opgeslagen = 0;
  const fouten: string[] = [];
  for (const keuze of keuzes) {
    const boekingId = Number(keuze.boekingId);
    if (!Number.isInteger(boekingId) || boekingId <= 0) {
      fouten.push('Boeking niet gevonden.');
      continue;
    }
    const huidig = await client.from('boekingen').select('id,gastheer_relatie_id').eq('id', boekingId).maybeSingle();
    if (huidig.error) return { ok: false, melding: huidig.error.message };
    if (!huidig.data) {
      fouten.push('Boeking niet gevonden.');
      continue;
    }
    if (zelfdeGastheer(huidig.data.gastheer_relatie_id, keuze.gastheerId)) continue;
    const uit = await koppelGastheerViaSessie(client, boekingId, keuze.gastheerId, actor);
    if (!uit.ok) {
      if (/geen recht|sessie is verlopen/i.test(uit.melding)) return uit;
      fouten.push(uit.melding);
      continue;
    }
    opgeslagen += 1;
  }
  if (opgeslagen === 0 && fouten.length === 0) return { ok: true, melding: 'Niets gewijzigd.' };
  if (opgeslagen === 0) return { ok: false, melding: fouten[0] ?? 'Opslaan is niet gelukt.' };
  const basis = opgeslagen === 1
    ? '1 expositiebegeleider opgeslagen.'
    : `${opgeslagen} expositiebegeleiders opgeslagen.`;
  if (fouten.length === 0) return { ok: true, melding: basis };
  const niet = fouten.length === 1 ? '1 boeking niet gelukt' : `${fouten.length} boekingen niet gelukt`;
  return { ok: true, melding: `${basis} ${niet}: ${fouten[0]}` };
}
