/**
 * Legt vast dat een contract is ondertekend of dat de aanbetaling binnen is.
 * De restbetaling blijft open. Er gaat geen mail uit en de boeking wordt
 * niet definitief.
 */

import { magContractBeheren } from '../../platform/documentenflow.ts';
import { magSchrijven } from '../../platform/rechten.ts';
import type { Actor } from './kern.ts';
import { leesbareAuthFout, type DossierResultaat, type DossierSessie } from './dossier-sessie.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STOP = new Set(['geannuleerd', 'afgewezen']);

type Rij = Record<string, unknown>;
type Fout = { message: string; code?: string } | null;

export interface OntvangstBestand {
  naam: string;
  bytes: Uint8Array;
}

function tekst(waarde: unknown): string {
  return waarde == null ? '' : String(waarde);
}

function getal(waarde: unknown): number | null {
  if (typeof waarde === 'number' && Number.isFinite(waarde)) return waarde;
  if (typeof waarde === 'string' && waarde.trim() && Number.isFinite(Number(waarde))) return Number(waarde);
  return null;
}

function tabelMist(message: string): boolean {
  return /schema cache|does not exist|42P01/i.test(message);
}

function isGetekend(soort: string, naam: string): boolean {
  const sleutel = `${soort} ${naam}`.toLowerCase();
  if (/\b(overig|factuur)\b/.test(soort.toLowerCase())) return false;
  return soort === 'getekend_contract' || /getekend/.test(sleutel);
}

function actorId(actor: Actor): string | null {
  return actor.id && UUID.test(actor.id) ? actor.id : null;
}

async function leesRijen(
  client: DossierSessie,
  tabel: string,
  kolommen: string,
  kolom: string,
  waarde: number,
): Promise<{ data: Rij[] } | { fout: string } | { mist: true }> {
  const antwoord = await client.from(tabel).select(kolommen).eq(kolom, waarde);
  if (antwoord.error) {
    if (tabelMist(antwoord.error.message)) return { mist: true };
    return { fout: leesbareAuthFout(antwoord.error.message) };
  }
  return { data: antwoord.data ?? [] };
}

async function audit(
  client: DossierSessie,
  actor: Actor,
  boekingId: number,
  actie: string,
  reden: string,
): Promise<void> {
  const antwoord = await client.from('auditlog').insert({
    actor_id: actorId(actor),
    actor_naam: actor.naam,
    actor_type: actor.type,
    onderwerp_type: 'boeking',
    onderwerp_id: String(boekingId),
    actie,
    reden,
    dedup_sleutel: `${actie}:${boekingId}`,
  });
  if (antwoord.error && antwoord.error.code !== '23505' && !/duplicate|23505/i.test(antwoord.error.message)) {
    return;
  }
}

export async function noteerGetekendDocument(
  client: DossierSessie,
  boekingId: number,
  bestand: OntvangstBestand | null,
): Promise<string | null> {
  const bestaand = await leesRijen(client, 'documenten', 'id,type,bestandsnaam', 'boeking_id', boekingId);
  if ('fout' in bestaand) return bestaand.fout;
  const rijen = 'data' in bestaand ? bestaand.data : [];
  if (rijen.some((rij) => isGetekend(tekst(rij.type), tekst(rij.bestandsnaam)))) return null;

  if (bestand) {
    if (bestand.bytes.byteLength > 8_000_000 || !tekstVanBytes(bestand.bytes).startsWith('%PDF')) {
      return 'Het bestand is geen PDF. Er is niets vastgelegd.';
    }
    const pad = `contracten/${boekingId}/getekend-handmatig-${Date.now()}.pdf`;
    const opslag = client as DossierSessie & {
      storage?: { from(bucket: string): { upload(pad: string, body: Uint8Array, opties: { contentType: string; upsert: boolean }): Promise<{ error: Fout }> } };
    };
    if (!opslag.storage?.from) return 'Het bestand is niet opgeslagen. De ondertekening is niet vastgelegd.';
    const upload = await opslag.storage.from('booking-documents').upload(pad, bestand.bytes, { contentType: 'application/pdf', upsert: false });
    if (upload.error) return 'Het bestand is niet opgeslagen. De ondertekening is niet vastgelegd.';
    const document = await client.from('documenten').insert({
      boeking_id: boekingId,
      type: 'getekend_contract',
      bestandsnaam: bestand.naam.replace(/[^\w.\- ]+/g, '').slice(0, 120) || 'getekend.pdf',
      storage_pad: pad,
      mime_type: 'application/pdf',
      grootte_bytes: bestand.bytes.byteLength,
    });
    if (document.error) return 'Het bestand is niet in het dossier gezet. De ondertekening is niet vastgelegd.';
    return null;
  }

  const document = await client.from('documenten').insert({
    boeking_id: boekingId,
    type: 'getekend_contract',
    bestandsnaam: 'Ondertekend exemplaar ontvangen',
    storage_pad: `contracten/${boekingId}/ontvangst-zonder-bestand`,
    mime_type: 'text/plain',
    grootte_bytes: 0,
  });
  if (document.error) return leesbareAuthFout(document.error.message);
  return null;
}

export async function legOndertekeningVast(
  client: DossierSessie,
  boekingId: number,
  actor: Actor,
  bestand: OntvangstBestand | null,
): Promise<DossierResultaat> {
  const rechten = actor.rechten ?? { isSuperAdmin: false, perModule: {} };
  if (!magContractBeheren(rechten)) {
    return { ok: false, melding: 'Geen recht om een ondertekening vast te leggen. Er is niets gewijzigd.' };
  }
  if (!Number.isInteger(boekingId)) {
    return { ok: false, melding: 'Deze boeking is niet gevonden. Er is niets vastgelegd.' };
  }
  if (bestand && (bestand.bytes.byteLength > 8_000_000 || !tekstVanBytes(bestand.bytes).startsWith('%PDF'))) {
    return { ok: false, melding: 'Het bestand is geen PDF. Er is niets vastgelegd.' };
  }
  const boeking = await client.from('boekingen').select('id,status').eq('id', boekingId).maybeSingle();
  if (boeking.error && !tabelMist(boeking.error.message)) {
    return { ok: false, melding: leesbareAuthFout(boeking.error.message) };
  }
  if (boeking.data && STOP.has(tekst(boeking.data.status))) {
    return { ok: false, melding: 'Deze boeking is stopgezet. Er is niets vastgelegd.' };
  }

  const versies = await leesRijen(client, 'contractversies', 'versie,contractnummer,ondertekening', 'boeking_id', boekingId);
  if ('fout' in versies) return { ok: false, melding: versies.fout };
  const rijen = 'data' in versies ? versies.data : [];
  const huidig = rijen.reduce<Rij | null>((hoogste, rij) => {
    if (!hoogste || Number(rij.versie) > Number(hoogste.versie)) return rij;
    return hoogste;
  }, null);
  const alGetekend = huidig != null && tekst(huidig.ondertekening) === 'ontvangen';
  if (huidig && !alGetekend) {
    const gezet = await client.from('contractversies').update({
      ondertekening: 'ontvangen',
      ondertekening_actor: actor.naam,
      ondertekening_op: new Date().toISOString(),
      ondertekening_nummer: tekst(huidig.contractnummer),
      ondertekening_versie: Number(huidig.versie),
    }).eq('boeking_id', boekingId).eq('versie', Number(huidig.versie));
    if (gezet.error) return { ok: false, melding: leesbareAuthFout(gezet.error.message) };
  }

  const bewijs = await noteerGetekendDocument(client, boekingId, bestand);
  if (bewijs) return { ok: false, melding: bewijs };
  await audit(
    client,
    actor,
    boekingId,
    'ondertekening_ontvangen',
    'Ondertekend exemplaar vastgelegd. Er is geen mail verstuurd.',
  );
  return {
    ok: true,
    melding: alGetekend
      ? 'Dit contract was al als ondertekend vastgelegd. Er is geen mail verstuurd.'
      : 'Het contract is als ondertekend vastgelegd. Er is geen mail verstuurd. De boeking is niet definitief gemaakt.',
  };
}

export async function legAanbetalingVast(
  client: DossierSessie,
  boekingId: number,
  actor: Actor,
): Promise<DossierResultaat> {
  const rechten = actor.rechten ?? { isSuperAdmin: false, perModule: {} };
  if (!magContractBeheren(rechten) && !magSchrijven(rechten, 'finance')) {
    return { ok: false, melding: 'Geen recht om een aanbetaling vast te leggen. Er is niets gewijzigd.' };
  }
  if (!Number.isInteger(boekingId)) {
    return { ok: false, melding: 'Deze boeking is niet gevonden. Er is niets vastgelegd.' };
  }
  const boeking = await client.from('boekingen').select('id,status,aanbetaling_bedrag,aanbetaling_ontvangen').eq('id', boekingId).maybeSingle();
  if (boeking.error) return { ok: false, melding: leesbareAuthFout(boeking.error.message) };
  if (!boeking.data) return { ok: false, melding: 'Deze boeking is niet gevonden. Er is niets vastgelegd.' };
  if (STOP.has(tekst(boeking.data.status))) {
    return { ok: false, melding: 'Deze boeking is stopgezet. Er is niets vastgelegd.' };
  }

  const regels = await leesRijen(client, 'betalingen', 'id,soort,bedrag,status', 'boeking_id', boekingId);
  if ('fout' in regels) return { ok: false, melding: regels.fout };
  if ('mist' in regels) return { ok: false, melding: 'De betaalregels zijn niet beschikbaar. Er is niets vastgelegd.' };
  const aanbetalingen = regels.data.filter((rij) => tekst(rij.soort) === 'aanbetaling');
  const actief = aanbetalingen.filter((rij) => tekst(rij.status) !== 'geannuleerd');
  const ontvangen = actief.filter((rij) => tekst(rij.status) === 'ontvangen');
  const open = actief.filter((rij) => tekst(rij.status) === 'open');
  if (ontvangen.length > 0 && open.length > 0) {
    return { ok: false, melding: 'De aanbetaling staat zowel open als ontvangen. Er is niets gewijzigd.' };
  }

  const nu = new Date().toISOString();
  if (ontvangen.length === 0) {
    if (open.length > 0) {
      for (const regel of open) {
        const gezet = await client.from('betalingen').update({
          status: 'ontvangen',
          ontvangen_op: nu,
        }).eq('id', regel.id);
        if (gezet.error) return { ok: false, melding: leesbareAuthFout(gezet.error.message) };
      }
    } else if (aanbetalingen.length > 0) {
      const gezet = await client.from('betalingen').update({
        status: 'ontvangen',
        ontvangen_op: nu,
      }).eq('id', aanbetalingen[0]?.id);
      if (gezet.error) return { ok: false, melding: leesbareAuthFout(gezet.error.message) };
    } else {
      const bedrag = getal(boeking.data.aanbetaling_bedrag);
      if (bedrag == null || bedrag <= 0) {
        return { ok: false, melding: 'Er is geen aanbetalingsbedrag. Er is niets vastgelegd.' };
      }
      const gezet = await client.from('betalingen').insert({
        boeking_id: boekingId,
        soort: 'aanbetaling',
        bedrag,
        status: 'ontvangen',
        ontvangen_op: nu,
        referentie: `aanbetaling:${boekingId}`,
      });
      if (gezet.error) return { ok: false, melding: leesbareAuthFout(gezet.error.message) };
    }
    await audit(client, actor, boekingId, 'aanbetaling_ontvangen', 'Aanbetaling als ontvangen vastgelegd. De restbetaling blijft open. Er is geen mail verstuurd.');
  }

  if (boeking.data.aanbetaling_ontvangen !== true) {
    const vlag = await client.from('boekingen').update({
      aanbetaling_ontvangen: true,
      aanbetaling_ontvangen_op: nu,
    }).eq('id', boekingId);
    if (vlag.error && !/permission|row-level|42501/i.test(vlag.error.message)) {
      return { ok: false, melding: leesbareAuthFout(vlag.error.message) };
    }
  }

  return {
    ok: true,
    melding: ontvangen.length > 0
      ? 'De aanbetaling was al ontvangen. Er is geen mail verstuurd.'
      : 'De aanbetaling is als ontvangen vastgelegd. De restbetaling blijft open. Er is geen mail verstuurd en de boeking is niet definitief gemaakt.',
  };
}

export async function verwerkOntvangst(
  actie: string,
  input: {
    client: DossierSessie | null;
    actor: Actor;
    boekingId: string | null;
    bestand: OntvangstBestand | null;
    schrijven: boolean;
  },
): Promise<DossierResultaat | null> {
  if (actie !== 'ondertekening_ontvangen' && actie !== 'aanbetaling_ontvangen') return null;
  if (!input.schrijven) return { ok: false, melding: 'In deze weergave is niets gewijzigd.' };
  if (!input.client) {
    return { ok: false, melding: 'Dit is de voorbeeldweergave. Er is niets opgeslagen en er is geen mail verstuurd.' };
  }
  const boekingId = Number(input.boekingId);
  if (!Number.isInteger(boekingId)) {
    return { ok: false, melding: 'Er is nog geen boeking. Er is niets vastgelegd.' };
  }
  if (actie === 'ondertekening_ontvangen') {
    return legOndertekeningVast(input.client, boekingId, input.actor, input.bestand);
  }
  return legAanbetalingVast(input.client, boekingId, input.actor);
}

function tekstVanBytes(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes.slice(0, 5));
}
