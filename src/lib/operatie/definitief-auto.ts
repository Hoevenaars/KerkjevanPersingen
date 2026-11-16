/**
 * Zet een optie op definitief zodra de checklist klopt.
 * Gebeurt bij de schrijfactie die de laatste voorwaarde vervult, niet bij het openen van een pagina.
 * Er gaat geen mail uit.
 */

import { periodesOverlappen } from '../../platform/datum.ts';
import {
  aanbetalingVoorwaarde,
  DEFINITIEF_REDEN,
  magAutomatischDefinitief,
  type ContractVersieVoorwaarde,
} from '../../platform/definitief-voorwaarde.ts';
import { statusTeltVoorOverlap } from '../../platform/status-overgang.ts';
import type { Actor } from './kern.ts';
import { legAutomatischDefinitief, type DossierResultaat, type DossierSessie } from './dossier-sessie.ts';

type Rij = Record<string, unknown>;

function tekst(waarde: unknown): string {
  return waarde == null ? '' : String(waarde);
}

function getal(waarde: unknown): number | null {
  if (typeof waarde === 'number' && Number.isFinite(waarde)) return waarde;
  if (typeof waarde === 'string' && waarde.trim() && Number.isFinite(Number(waarde))) return Number(waarde);
  return null;
}

async function rijen(
  client: DossierSessie,
  tabel: string,
  kolommen: string,
  kolom: string,
  waarde: unknown,
): Promise<Rij[]> {
  const antwoord = await client.from(tabel).select(kolommen).eq(kolom, waarde);
  if (antwoord.error) return [];
  return antwoord.data ?? [];
}

export async function promoveerIndienKlaar(
  client: DossierSessie,
  boekingId: number,
  actor: Actor,
): Promise<DossierResultaat & { gepromoveerd: boolean }> {
  if (!Number.isInteger(boekingId)) {
    return { ok: true, gepromoveerd: false, melding: 'Geen boeking om definitief te maken.' };
  }
  const boeking = await client
    .from('boekingen')
    .select('id,status,start_datum,eind_datum,aanvraag_id,aanbetaling_bedrag,aanbetaling_ontvangen,nummer')
    .eq('id', boekingId)
    .maybeSingle();
  if (boeking.error || !boeking.data) {
    return { ok: true, gepromoveerd: false, melding: 'De boeking is niet definitief gemaakt.' };
  }
  const status = tekst(boeking.data.status);
  if (status !== 'optie' && status !== 'optie_verlopen') {
    return { ok: true, gepromoveerd: false, melding: 'De boeking stond niet op optie.' };
  }
  const aanvraagId = getal(boeking.data.aanvraag_id);
  const aanvraag = aanvraagId == null
    ? null
    : await client.from('aanvragen').select('id,status').eq('id', aanvraagId).maybeSingle();
  const versies = await rijen(client, 'contractversies', 'versie,ondertekening,bestuur,bestuur_verplicht', 'boeking_id', boekingId);
  const huidig = versies.reduce<Rij | null>((hoogste, rij) => {
    if (!hoogste || Number(rij.versie) > Number(hoogste.versie)) return rij;
    return hoogste;
  }, null);
  const versie: ContractVersieVoorwaarde | null = huidig
    ? {
      ondertekening: tekst(huidig.ondertekening),
      bestuur: tekst(huidig.bestuur),
      bestuurVerplicht: huidig.bestuur_verplicht !== false,
    }
    : null;
  const betalingen = await rijen(client, 'betalingen', 'soort,status', 'boeking_id', boekingId);
  const betaling = aanbetalingVoorwaarde(
    betalingen.map((rij) => ({ soort: tekst(rij.soort), status: tekst(rij.status) })),
    boeking.data.aanbetaling_ontvangen === true,
  );
  const anderen = await client.from('boekingen').select('id,status,start_datum,eind_datum').in('status', ['optie', 'definitief']);
  const start = tekst(boeking.data.start_datum);
  const eind = tekst(boeking.data.eind_datum);
  const overlapt = (anderen.data ?? []).some((rij) => {
    if (Number(rij.id) === boekingId) return false;
    if (!statusTeltVoorOverlap(tekst(rij.status))) return false;
    return periodesOverlappen(
      { start: tekst(rij.start_datum), eind: tekst(rij.eind_datum) },
      { start, eind },
    );
  });
  const klaar = magAutomatischDefinitief({
    boekingStatus: status,
    aanvraagStatus: aanvraag?.data ? tekst(aanvraag.data.status) : null,
    versie,
    aanbetalingBedrag: getal(boeking.data.aanbetaling_bedrag),
    aanbetalingOntvangen: betaling.ontvangen,
    aanbetalingTegenstrijdig: betaling.tegenstrijdig,
    overlapt,
  });
  if (!klaar) return { ok: true, gepromoveerd: false, melding: 'De checklist is nog niet compleet.' };
  const gezet = await legAutomatischDefinitief(client, boekingId, actor, DEFINITIEF_REDEN);
  return { ...gezet, gepromoveerd: gezet.ok && gezet.melding.startsWith('Boeking is definitief') };
}
