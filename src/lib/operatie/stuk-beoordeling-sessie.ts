/**
 * Bewaart een stukbeoordeling met de ingelogde sessie.
 * Schrijft alleen stuk_beoordelingen en een auditregel.
 */

import type { StukBeoordeling, StukBesluit, StukSoort } from '../../platform/stuk-beoordeling.ts';

function leesbareFout(bericht: string): string {
  if (/invalid api key|jwt|unauthorized|401|permission denied|row-level security/i.test(bericht)) {
    return 'Geen recht of de sessie is verlopen. Er is niets gewijzigd. Log opnieuw in.';
  }
  return bericht;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOORTEN = new Set<StukSoort>(['inhoud', 'document', 'intake']);

export interface StukActor {
  id?: string;
  naam: string;
  type: string;
}

type Fout = { message: string; code?: string } | null;

interface LeesQuery extends PromiseLike<{ data: Record<string, unknown>[] | null; error: Fout }> {
  select: (kolommen: string) => LeesQuery;
  eq: (kolom: string, waarde: unknown) => LeesQuery;
}

interface SchrijfQuery {
  insert: (rij: Record<string, unknown>) => Promise<{ error: Fout }>;
}

export interface StukSessie {
  from: (tabel: 'stuk_beoordelingen' | 'auditlog') => LeesQuery & SchrijfQuery;
}

function soortVan(waarde: unknown): StukSoort | null {
  const tekst = String(waarde ?? '');
  return SOORTEN.has(tekst as StukSoort) ? (tekst as StukSoort) : null;
}

function besluitVan(waarde: unknown): StukBesluit | null {
  return waarde === 'goedgekeurd' || waarde === 'afgekeurd' ? waarde : null;
}

export async function leesStukBeoordelingen(
  client: StukSessie,
  boekingId: number,
): Promise<{ ok: true; rijen: StukBeoordeling[] } | { ok: false; melding: string }> {
  if (!Number.isInteger(boekingId) || boekingId <= 0) return { ok: true, rijen: [] };
  const gelezen = await client
    .from('stuk_beoordelingen')
    .select('stuk_type,stuk_id,versie,status,reden,beoordelaar_naam,beoordeeld_op')
    .eq('boeking_id', boekingId);
  if (gelezen.error) return { ok: false, melding: leesbareFout(gelezen.error.message) };
  const rijen: StukBeoordeling[] = [];
  for (const rij of gelezen.data ?? []) {
    const stukType = soortVan(rij.stuk_type);
    const status = besluitVan(rij.status);
    const versie = Number(rij.versie);
    const stukId = String(rij.stuk_id ?? '');
    if (!stukType || !status || !stukId || !Number.isInteger(versie) || versie < 0) continue;
    rijen.push({
      stukType,
      stukId,
      versie,
      status,
      reden: String(rij.reden ?? ''),
      beoordelaar: String(rij.beoordelaar_naam ?? ''),
      beoordeeldOp: String(rij.beoordeeld_op ?? ''),
    });
  }
  return { ok: true, rijen };
}

export async function bewaarStukBeoordeling(
  client: StukSessie,
  input: {
    boekingId: number;
    stukType: StukSoort;
    stukId: string;
    versie: number;
    status: StukBesluit;
    reden: string | null;
  },
  actor: StukActor,
): Promise<{ ok: boolean; melding: string }> {
  if (!Number.isInteger(input.boekingId) || input.boekingId <= 0) {
    return { ok: false, melding: 'Boeking niet gevonden. Er is niets gewijzigd.' };
  }
  const actorId = actor.id && UUID.test(actor.id) ? actor.id : '';
  if (!actorId) return { ok: false, melding: 'Geen ingelogde beoordelaar. Er is niets gewijzigd.' };
  const naam = actor.naam.trim().slice(0, 200) || 'Beheer';
  const opgeslagen = await client.from('stuk_beoordelingen').insert({
    boeking_id: input.boekingId,
    stuk_type: input.stukType,
    stuk_id: input.stukId,
    versie: input.versie,
    status: input.status,
    reden: input.reden,
    beoordelaar_naam: naam,
    beoordeeld_door: actorId,
  });
  if (opgeslagen.error) {
    if (opgeslagen.error.code === '23505' || /duplicate key|unique/i.test(opgeslagen.error.message)) {
      return { ok: false, melding: 'Deze versie is al beoordeeld. Er is niets gewijzigd.' };
    }
    return { ok: false, melding: leesbareFout(opgeslagen.error.message) };
  }
  const audit = await client.from('auditlog').insert({
    actor_id: actorId,
    actor_naam: naam,
    actor_type: actor.type,
    onderwerp_type: 'stuk_beoordeling',
    onderwerp_id: `${input.stukType}:${input.stukId}:${input.versie}`,
    actie: input.status === 'goedgekeurd' ? 'stuk_goedgekeurd' : 'stuk_afgekeurd',
    naar: input.status,
    reden: input.reden,
    dedup_sleutel: `stuk:${input.stukType}:${input.stukId}:${input.versie}`,
  });
  const besluit = input.status === 'goedgekeurd' ? 'Goedgekeurd' : 'Afgekeurd';
  if (audit.error) {
    return { ok: true, melding: `${besluit} voor versie ${input.versie}. De auditregel kon niet worden weggeschreven.` };
  }
  return { ok: true, melding: `${besluit} voor versie ${input.versie}.` };
}
