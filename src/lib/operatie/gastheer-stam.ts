/**
 * Stamgegevens van gastheren. Deactiveren bewaart historische toewijzingen.
 */

import { gastheerInvoer, relatieKolommen, type RelatieInvoer } from '../../platform/relatie-invoer.ts';
import { magSchrijven } from '../../platform/rechten.ts';
import type { Actor } from './kern.ts';
import { leesbareAuthFout, type DossierResultaat, type DossierSessie } from './dossier-sessie.ts';

function mag(actor: Actor): boolean {
  const rechten = actor.rechten ?? { isSuperAdmin: false, perModule: {} };
  return magSchrijven(rechten, 'gastheerbeheer') || magSchrijven(rechten, 'instellingen');
}

type RolClient = DossierSessie & {
  from: (tabel: string) => {
    insert: (rij: Record<string, unknown>) => {
      select: (kolommen: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> };
    } & Promise<{ error: { message: string } | null }>;
    update: (waarden: Record<string, unknown>) => {
      eq: (kolom: string, waarde: unknown) => {
        eq: (kolom: string, waarde: unknown) => Promise<{ error: { message: string } | null }>;
        select: (kolommen: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> };
      };
    };
    select: (kolommen: string) => {
      eq: (kolom: string, waarde: unknown) => {
        eq: (kolom: string, waarde: unknown) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> };
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
  };
};

export async function voegGastheerToe(
  client: DossierSessie,
  data: FormData,
  actor: Actor,
): Promise<DossierResultaat> {
  if (!mag(actor)) return { ok: false, melding: 'Geen schrijfrecht op gastheerbeheer.' };
  const invoer = gastheerInvoer(data);
  if ('fout' in invoer) return { ok: false, melding: invoer.fout };
  const bestaandId = String(data.get('relatieId') ?? '').trim();
  if (bestaandId) return koppelBestaande(client, Number(bestaandId), invoer, actor);
  const db = client as RolClient;
  const insert = await db.from('relaties').insert({ ...relatieKolommen(invoer), naam: invoer.naam }).select('id').maybeSingle();
  if (insert.error) return { ok: false, melding: leesbareAuthFout(insert.error.message) };
  const id = Number(insert.data?.id);
  if (!id) return { ok: false, melding: 'Gastheer niet opgeslagen.' };
  const rol = await db.from('relatie_rollen').insert({ relatie_id: id, rol: 'gastheer', actief: true });
  if (rol.error) return { ok: false, melding: leesbareAuthFout(rol.error.message) };
  await audit(client, actor, id, 'gastheer_toegevoegd', '', invoer.naam);
  return { ok: true, melding: 'Gastheer toegevoegd. Er is geen mail verstuurd.' };
}

async function koppelBestaande(
  client: DossierSessie,
  relatieId: number,
  invoer: RelatieInvoer,
  actor: Actor,
): Promise<DossierResultaat> {
  if (!Number.isInteger(relatieId) || relatieId <= 0) return { ok: false, melding: 'Relatie niet gevonden.' };
  const db = client as RolClient;
  const update = await db.from('relaties').update(relatieKolommen(invoer)).eq('id', relatieId).select('id').maybeSingle();
  if (update.error) return { ok: false, melding: leesbareAuthFout(update.error.message) };
  if (!update.data?.id) return { ok: false, melding: 'Relatie niet gevonden.' };
  const rol = await db.from('relatie_rollen').select('rol,actief').eq('relatie_id', relatieId).eq('rol', 'gastheer').maybeSingle();
  if (rol.error) return { ok: false, melding: leesbareAuthFout(rol.error.message) };
  if (!rol.data) {
    const insert = await db.from('relatie_rollen').insert({ relatie_id: relatieId, rol: 'gastheer', actief: true });
    if (insert.error) return { ok: false, melding: leesbareAuthFout(insert.error.message) };
  } else {
    const aan = await db.from('relatie_rollen').update({ actief: true }).eq('relatie_id', relatieId).eq('rol', 'gastheer');
    if (aan.error) return { ok: false, melding: leesbareAuthFout(aan.error.message) };
  }
  await audit(client, actor, relatieId, 'gastheer_gekoppeld', '', invoer.naam);
  return { ok: true, melding: 'Bestaande relatie gekoppeld als gastheer. Er is geen mail verstuurd.' };
}

export async function werkGastheerBij(
  client: DossierSessie,
  relatieId: number,
  data: FormData,
  actor: Actor,
): Promise<DossierResultaat> {
  if (!mag(actor)) return { ok: false, melding: 'Geen schrijfrecht op gastheerbeheer.' };
  const invoer = gastheerInvoer(data);
  if ('fout' in invoer) return { ok: false, melding: invoer.fout };
  const actief = String(data.get('actief') ?? 'ja') !== 'nee';
  const db = client as RolClient;
  const update = await db.from('relaties').update(relatieKolommen(invoer)).eq('id', relatieId).select('id').maybeSingle();
  if (update.error) return { ok: false, melding: leesbareAuthFout(update.error.message) };
  if (!update.data?.id) return { ok: false, melding: 'Gastheer niet gevonden.' };
  const rol = await db.from('relatie_rollen').update({ actief }).eq('relatie_id', relatieId).eq('rol', 'gastheer');
  if (rol.error) return { ok: false, melding: leesbareAuthFout(rol.error.message) };
  await audit(client, actor, relatieId, actief ? 'gastheer_actief' : 'gastheer_inactief', '', invoer.naam);
  return {
    ok: true,
    melding: actief
      ? 'Gastheer opgeslagen. Er is geen mail verstuurd.'
      : 'Gastheer gedeactiveerd. Historische toewijzingen blijven staan. Er is geen mail verstuurd.',
  };
}

async function audit(client: DossierSessie, actor: Actor, id: number, actie: string, van: string, naar: string): Promise<void> {
  await client.from('auditlog').insert({
    actor_id: actor.id && /^[0-9a-f-]{36}$/i.test(actor.id) ? actor.id : null,
    actor_naam: actor.naam,
    actor_type: actor.type,
    onderwerp_type: 'relatie',
    onderwerp_id: String(id),
    actie,
    van,
    naar,
    dedup_sleutel: `gastheer:${id}:${actie}:${Date.now()}`,
  });
}
