/**
 * Zet de aanvrager op de reservelijst, of haal die eraf.
 * De aanvraagstatus en de boeking blijven onaangeroerd. Er gaat geen mail uit.
 */

import type { Actor } from './kern.ts';
import { leesbareAuthFout, type DossierResultaat } from './dossier-sessie.ts';
import { magSchrijven } from '../../platform/rechten.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Fout = { message: string } | null;

export interface ReservelijstQuery extends PromiseLike<{ data: Record<string, unknown>[] | null; error: Fout }> {
  select: (kolommen: string) => ReservelijstQuery;
  eq: (kolom: string, waarde: unknown) => ReservelijstQuery;
  ilike: (kolom: string, waarde: string) => ReservelijstQuery;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: Fout }>;
}

export interface ReservelijstSessie {
  from: (tabel: string) => {
    select: (kolommen: string) => ReservelijstQuery;
    update: (waarden: Record<string, unknown>) => ReservelijstQuery;
    insert: (rij: Record<string, unknown>) => ReservelijstQuery;
  };
}

/** Patroon voor een hoofdletterongevoelige, exacte e-mailvergelijking. */
export function emailGelijkPatroon(email: string): string {
  return email.trim().toLowerCase().replace(/[\\%_]/g, (teken) => `\\${teken}`);
}

export async function zetReservelijstViaAanvraag(
  client: ReservelijstSessie,
  aanvraagId: number,
  opLijst: boolean,
  actor: Actor,
): Promise<DossierResultaat> {
  const rechten = actor.rechten ?? { isSuperAdmin: false, perModule: {} };
  if (!magSchrijven(rechten, 'relaties') || !magSchrijven(rechten, 'aanvragen')) {
    return { ok: false, melding: 'Geen schrijfrecht op relaties of aanvragen. Er is niets gewijzigd.' };
  }
  if (!Number.isInteger(aanvraagId) || aanvraagId <= 0) {
    return { ok: false, melding: 'Aanvraag niet gevonden. Er is niets gewijzigd.' };
  }

  const gelezen = await client
    .from('aanvragen')
    .select('id,status,naam,email,telefoon,adres,relatie_id')
    .eq('id', aanvraagId)
    .maybeSingle();
  if (gelezen.error) return { ok: false, melding: leesbareAuthFout(gelezen.error.message) };
  if (!gelezen.data?.id) return { ok: false, melding: 'Aanvraag niet gevonden. Er is niets gewijzigd.' };

  const aanvraag = gelezen.data;
  const email = String(aanvraag.email ?? '').trim().toLowerCase();
  const gekoppeld = nummer(aanvraag.relatie_id);
  const keuze = await kiesRelatie(client, gekoppeld, email);
  if ('fout' in keuze) return { ok: false, melding: keuze.fout };

  let relatieId = keuze.id;
  let stondErop = keuze.opLijst;
  if (!relatieId) {
    if (!opLijst) {
      return { ok: true, melding: 'Er stond niemand op de reservelijst. Er is niets gewijzigd.' };
    }
    if (!email.includes('@')) {
      return { ok: false, melding: 'Deze aanvraag heeft geen e-mailadres. Er is niemand op de reservelijst gezet.' };
    }
    const aangemaakt = await client
      .from('relaties')
      .insert({
        naam: String(aanvraag.naam ?? '').trim().slice(0, 200),
        email,
        telefoon: leegNaarNull(aanvraag.telefoon),
        adres: leegNaarNull(aanvraag.adres),
        op_reservelijst: true,
        bijgewerkt_op: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle();
    if (aangemaakt.error) return { ok: false, melding: leesbareAuthFout(aangemaakt.error.message) };
    relatieId = nummer(aangemaakt.data?.id);
    if (!relatieId) return { ok: false, melding: 'De relatie is niet aangemaakt. Er is niemand op de reservelijst gezet.' };
    stondErop = true;
    await audit(client, actor, relatieId, aanvraagId, 'reservelijst_aan');
  } else if (stondErop !== opLijst) {
    const update = await client
      .from('relaties')
      .update({ op_reservelijst: opLijst, bijgewerkt_op: new Date().toISOString() })
      .eq('id', relatieId)
      .select('id')
      .maybeSingle();
    if (update.error) return { ok: false, melding: leesbareAuthFout(update.error.message) };
    if (!update.data?.id) return { ok: false, melding: 'De reservelijst is niet bijgewerkt.' };
    await audit(client, actor, relatieId, aanvraagId, opLijst ? 'reservelijst_aan' : 'reservelijst_uit');
  }

  if (!gekoppeld) {
    const koppel = await client.from('aanvragen').update({ relatie_id: relatieId }).eq('id', aanvraagId).select('id').maybeSingle();
    if (koppel.error || !koppel.data?.id) {
      return {
        ok: false,
        melding: opLijst
          ? 'Op de reservelijst gezet, maar de aanvraag is niet gekoppeld. Er gaat geen mail uit.'
          : 'Van de reservelijst gehaald, maar de aanvraag is niet gekoppeld. Er gaat geen mail uit.',
      };
    }
  }

  if (stondErop === opLijst && gekoppeld) {
    return {
      ok: true,
      melding: opLijst
        ? 'Staat al op de reservelijst. Er is niets gewijzigd.'
        : 'Stond niet op de reservelijst. Er is niets gewijzigd.',
    };
  }
  if (opLijst) {
    return { ok: true, melding: 'Op de reservelijst gezet. De aanvraag is niet definitief gemaakt en er gaat geen mail uit.' };
  }
  return { ok: true, melding: 'Van de reservelijst gehaald. Er gaat geen mail uit.' };
}

async function kiesRelatie(
  client: ReservelijstSessie,
  gekoppeld: number | null,
  email: string,
): Promise<{ id: number | null; opLijst: boolean } | { fout: string }> {
  if (gekoppeld) {
    const relatie = await client.from('relaties').select('id,op_reservelijst').eq('id', gekoppeld).maybeSingle();
    if (relatie.error) return { fout: leesbareAuthFout(relatie.error.message) };
    if (!relatie.data?.id) return { fout: 'De gekoppelde relatie is niet gevonden. Er is niets gewijzigd.' };
    return { id: gekoppeld, opLijst: relatie.data.op_reservelijst === true };
  }
  if (!email.includes('@')) return { id: null, opLijst: false };
  const lijst = await client.from('relaties').select('id,op_reservelijst').ilike('email', emailGelijkPatroon(email));
  if (lijst.error) return { fout: leesbareAuthFout(lijst.error.message) };
  const rijen = lijst.data ?? [];
  if (rijen.length > 1) {
    return { fout: 'Meerdere relaties hebben dit e-mailadres. Kies de juiste relatie. Er is niets gewijzigd.' };
  }
  const rij = rijen[0];
  if (!rij) return { id: null, opLijst: false };
  const id = nummer(rij.id);
  if (!id) return { fout: 'De relatie is niet leesbaar. Er is niets gewijzigd.' };
  return { id, opLijst: rij.op_reservelijst === true };
}

function nummer(waarde: unknown): number | null {
  const id = typeof waarde === 'number' ? waarde : Number(waarde);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function leegNaarNull(waarde: unknown): string | null {
  const tekst = String(waarde ?? '').trim();
  return tekst ? tekst.slice(0, 300) : null;
}

async function audit(
  client: ReservelijstSessie,
  actor: Actor,
  relatieId: number,
  aanvraagId: number,
  actie: 'reservelijst_aan' | 'reservelijst_uit',
): Promise<void> {
  await client.from('auditlog').insert({
    actor_id: actor.id && UUID.test(actor.id) ? actor.id : null,
    actor_naam: actor.naam,
    actor_type: actor.type,
    onderwerp_type: 'relatie',
    onderwerp_id: String(relatieId),
    actie,
    van: actie === 'reservelijst_aan' ? 'niet op reservelijst' : 'op reservelijst',
    naar: actie === 'reservelijst_aan' ? 'op reservelijst' : 'niet op reservelijst',
    reden: `aanvraag ${aanvraagId}`,
    dedup_sleutel: `reservelijst:${aanvraagId}:${relatieId}:${actie}:${Date.now()}`,
  });
}
