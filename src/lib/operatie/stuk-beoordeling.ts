/**
 * Beoordeelt één aangeleverd stuk.
 * Schrijft alleen een nieuwe beoordelingsrij en een auditregel.
 * Geen publicatie, geen contract, geen betaling en geen e-mail.
 */

import { magSchrijven } from '../../platform/rechten.ts';
import { STUK_BRONNEN, type StukBron } from '../../platform/verhuur-overzicht.ts';
import type { Actor } from './kern.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StukBeoordelingInvoer {
  boekingId: string;
  bron: string;
  bronId: string;
  versie: string;
  besluit: 'goedgekeurd' | 'afgekeurd';
  reden?: string;
}

export interface StukBeoordelingResultaat {
  ok: boolean;
  melding: string;
}

type Fout = { message: string; code?: string } | null;

interface Query extends PromiseLike<{ data: { status?: string; reden?: string; beoordeeld_op?: string }[] | null; error: Fout }> {
  select: (kolommen: string) => Query;
  eq: (kolom: string, waarde: unknown) => Query;
  insert: (rij: Record<string, unknown>) => PromiseLike<{ error: Fout }>;
}

export interface StukBeoordelingSessie {
  from: (tabel: 'stuk_beoordelingen' | 'auditlog') => Query;
}

function tabelOntbreekt(fout: Fout): boolean {
  if (!fout) return false;
  if (fout.code === '42P01' || fout.code === 'PGRST205') return true;
  const tekst = fout.message.toLowerCase();
  return tekst.includes('stuk_beoordelingen') && (tekst.includes('does not exist') || tekst.includes('schema cache') || tekst.includes('kon niet'));
}

export async function beoordeelStukViaSessie(
  client: StukBeoordelingSessie,
  invoer: StukBeoordelingInvoer,
  actor: Actor,
): Promise<StukBeoordelingResultaat> {
  if (!actor.rechten || !magSchrijven(actor.rechten, 'boekingen')) {
    return { ok: false, melding: 'U kunt dit alleen bekijken. Er is niets gewijzigd.' };
  }
  const boekingId = Number(invoer.boekingId);
  if (!Number.isInteger(boekingId) || boekingId <= 0) return { ok: false, melding: 'Boeking niet gevonden. Er is niets gewijzigd.' };
  if (!STUK_BRONNEN.includes(invoer.bron as StukBron)) return { ok: false, melding: 'Dit stuk is niet bekend. Er is niets gewijzigd.' };
  const bronId = invoer.bronId.trim();
  const versie = invoer.versie.trim();
  if (!bronId || bronId.length > 200 || !versie || versie.length > 400) {
    return { ok: false, melding: 'Dit stuk is niet bekend. Er is niets gewijzigd.' };
  }
  if (invoer.besluit !== 'goedgekeurd' && invoer.besluit !== 'afgekeurd') {
    return { ok: false, melding: 'Kies goedkeuren of afkeuren. Er is niets gewijzigd.' };
  }
  const reden = (invoer.reden ?? '').trim();
  if (invoer.besluit === 'afgekeurd' && !reden) return { ok: false, melding: 'Vul een korte reden in. Er is niets gewijzigd.' };
  if (reden.length > 500) return { ok: false, melding: 'De reden is te lang. Er is niets gewijzigd.' };
  if (invoer.besluit === 'goedgekeurd' && reden) return { ok: false, melding: 'Een goedkeuring heeft geen reden. Er is niets gewijzigd.' };

  const gelezen = await client
    .from('stuk_beoordelingen')
    .select('status,reden,beoordeeld_op')
    .eq('boeking_id', boekingId)
    .eq('bron', invoer.bron)
    .eq('bron_id', bronId)
    .eq('versie', versie);
  if (gelezen.error) {
    if (tabelOntbreekt(gelezen.error)) return { ok: false, melding: 'Goedkeuren kan nog niet worden opgeslagen. Er is niets gewijzigd.' };
    return { ok: false, melding: 'De beoordeling kon niet worden gelezen. Er is niets gewijzigd.' };
  }
  const laatste = [...(gelezen.data ?? [])].sort((a, b) => String(b.beoordeeld_op ?? '').localeCompare(String(a.beoordeeld_op ?? '')))[0];
  if (laatste?.status === invoer.besluit && (invoer.besluit === 'goedgekeurd' || (laatste.reden ?? '') === reden)) {
    return {
      ok: true,
      melding: invoer.besluit === 'goedgekeurd'
        ? 'Dit stuk was al goedgekeurd. Er is niets opnieuw opgeslagen.'
        : 'Dit stuk was al afgekeurd met dezelfde reden. Er is niets opnieuw opgeslagen.',
    };
  }

  const naam = actor.naam.trim() || 'Beheerder';
  const opgeslagen = await client.from('stuk_beoordelingen').insert({
    boeking_id: boekingId,
    bron: invoer.bron,
    bron_id: bronId,
    versie,
    status: invoer.besluit,
    reden: invoer.besluit === 'afgekeurd' ? reden : null,
    beoordeeld_door: actor.id && UUID.test(actor.id) ? actor.id : null,
    beoordeeld_door_naam: naam,
  });
  if (opgeslagen.error) {
    if (tabelOntbreekt(opgeslagen.error)) return { ok: false, melding: 'Goedkeuren kan nog niet worden opgeslagen. Er is niets gewijzigd.' };
    return { ok: false, melding: 'De beoordeling is niet opgeslagen. Er is niets gewijzigd.' };
  }

  const audit = await client.from('auditlog').insert({
    actor_id: actor.id && UUID.test(actor.id) ? actor.id : null,
    actor_naam: naam,
    actor_type: actor.type,
    onderwerp_type: 'boeking',
    onderwerp_id: String(boekingId),
    actie: invoer.besluit === 'goedgekeurd' ? 'stuk_goedgekeurd' : 'stuk_afgekeurd',
    naar: `${invoer.bron}:${bronId}:${versie}`,
    reden: invoer.besluit === 'afgekeurd' ? reden : null,
    dedup_sleutel: `stuk:${boekingId}:${invoer.bron}:${bronId}:${versie}:${invoer.besluit}:${new Date().toISOString().slice(0, 16)}`,
  });
  const basis = invoer.besluit === 'goedgekeurd'
    ? 'Goedgekeurd. Er is geen e-mail verstuurd en er is niets gepubliceerd.'
    : 'Afgekeurd. De reden is opgeslagen. Er is geen e-mail verstuurd.';
  if (audit.error) return { ok: true, melding: `${basis} Het logboek kon de wijziging niet vastleggen.` };
  return { ok: true, melding: basis };
}
