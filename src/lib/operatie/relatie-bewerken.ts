/**
 * Relatie bewerken met de ingelogde sessie. Geen mail en geen workflow.
 */

import { leesRelatieInvoer, relatieKolommen, type RelatieInvoer } from '../../platform/relatie-invoer.ts';
import { magSchrijven } from '../../platform/rechten.ts';
import type { Actor } from './kern.ts';
import { leesbareAuthFout, type DossierResultaat, type DossierSessie } from './dossier-sessie.ts';

function mag(actor: Actor): boolean {
  return magSchrijven(actor.rechten ?? { isSuperAdmin: false, perModule: {} }, 'relaties');
}

export async function bewaarRelatieViaSessie(
  client: DossierSessie,
  relatieId: number,
  invoer: RelatieInvoer,
  actor: Actor,
): Promise<DossierResultaat> {
  if (!mag(actor)) return { ok: false, melding: 'Geen schrijfrecht op relaties.' };
  if (!Number.isInteger(relatieId) || relatieId <= 0) return { ok: false, melding: 'Relatie niet gevonden.' };
  const huidig = await client.from('relaties').select('id,naam,email').eq('id', relatieId).maybeSingle();
  if (huidig.error) return { ok: false, melding: leesbareAuthFout(huidig.error.message) };
  if (!huidig.data?.id) return { ok: false, melding: 'Relatie niet gevonden.' };
  const update = await client.from('relaties').update(relatieKolommen(invoer)).eq('id', relatieId).select('id').maybeSingle();
  if (update.error) return { ok: false, melding: leesbareAuthFout(update.error.message) };
  if (!update.data?.id) return { ok: false, melding: 'Relatie niet bijgewerkt.' };
  const weg = await client.from('relatie_rollen').select('rol').eq('relatie_id', relatieId);
  if (weg.error) return { ok: false, melding: leesbareAuthFout(weg.error.message) };
  const bestaand = new Set((weg.data ?? []).map((rij) => String(rij.rol)));
  await vervangRollen(client, relatieId, invoer.rollen, bestaand);
  await client.from('auditlog').insert({
    actor_id: actor.id && /^[0-9a-f-]{36}$/i.test(actor.id) ? actor.id : null,
    actor_naam: actor.naam,
    actor_type: actor.type,
    onderwerp_type: 'relatie',
    onderwerp_id: String(relatieId),
    actie: 'bijgewerkt',
    van: String(huidig.data.naam ?? ''),
    naar: invoer.naam,
    dedup_sleutel: `relatie:${relatieId}:${invoer.naam}:${invoer.email}:${Date.now()}`,
  });
  return { ok: true, melding: 'Relatie opgeslagen.' };
}

async function vervangRollen(
  client: DossierSessie,
  relatieId: number,
  rollen: string[],
  bestaand: Set<string>,
): Promise<void> {
  const db = client as unknown as {
    from: (tabel: string) => {
      delete: () => { eq: (kolom: string, waarde: unknown) => { eq: (kolom: string, waarde: unknown) => Promise<{ error: { message: string } | null }> } };
      insert: (rij: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };
  for (const rol of bestaand) {
    if (rollen.includes(rol)) continue;
    await db.from('relatie_rollen').delete().eq('relatie_id', relatieId).eq('rol', rol);
  }
  for (const rol of rollen) {
    if (bestaand.has(rol)) continue;
    await db.from('relatie_rollen').insert({ relatie_id: relatieId, rol, actief: true });
  }
}

export function invoerUitFormulier(data: FormData): RelatieInvoer | { fout: string } {
  return leesRelatieInvoer(data);
}
