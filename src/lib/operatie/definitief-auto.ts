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
import { promoveerMachineAlsKlaar } from './verhuur-promotie.ts';

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
): Promise<{ ok: true; data: Rij[] } | { ok: false }> {
  const antwoord = await client.from(tabel).select(kolommen).eq(kolom, waarde);
  if (antwoord.error || !Array.isArray(antwoord.data)) return { ok: false };
  return { ok: true, data: antwoord.data };
}

export async function promoveerIndienKlaar(
  client: DossierSessie,
  boekingId: number,
  actor: Actor,
): Promise<DossierResultaat & { gepromoveerd: boolean }> {
  if (!Number.isInteger(boekingId)) {
    return { ok: true, gepromoveerd: false, melding: 'Geen boeking om definitief te maken.' };
  }
  const machine = await promoveerMachineAlsKlaar(client, boekingId, actor);
  if (machine.behandeld) return { ok: machine.ok, gepromoveerd: machine.gepromoveerd, melding: machine.melding };
  const boeking = await client
    .from('boekingen')
    .select('id,status,start_datum,eind_datum,aanvraag_id,tarief_bedrag,betaling_vereist,aanbetaling_bedrag,aanbetaling_ontvangen,nummer')
    .eq('id', boekingId)
    .maybeSingle();
  if (boeking.error) return { ok: false, gepromoveerd: false, melding: 'De boeking kon niet worden gelezen. Definitief maken is geblokkeerd.' };
  if (!boeking.data) {
    return { ok: true, gepromoveerd: false, melding: 'De boeking is niet gevonden.' };
  }
  const status = tekst(boeking.data.status);
  if (status !== 'optie' && status !== 'optie_verlopen') {
    return { ok: true, gepromoveerd: false, melding: 'De boeking stond niet op optie.' };
  }
  const aanvraagId = getal(boeking.data.aanvraag_id);
  const aanvraag = aanvraagId == null
    ? null
    : await client.from('aanvragen').select('id,status').eq('id', aanvraagId).maybeSingle();
  if (aanvraag?.error || (aanvraagId != null && !aanvraag?.data)) {
    return { ok: false, gepromoveerd: false, melding: 'De aanvraag kon niet worden gecontroleerd. Boeking blijft op optie.' };
  }
  const versies = await rijen(client, 'contractversies', 'versie,ondertekening,bestuur,bestuur_verplicht', 'boeking_id', boekingId);
  if (!versies.ok) return { ok: false, gepromoveerd: false, melding: 'De contractversies konden niet worden gecontroleerd. Boeking blijft op optie.' };
  const huidig = versies.data.reduce<Rij | null>((hoogste, rij) => {
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
  const betalingen = await rijen(client, 'betalingen', 'soort,status,bedrag,ontvangen_bedrag', 'boeking_id', boekingId);
  if (!betalingen.ok) return { ok: false, gepromoveerd: false, melding: 'De betalingen konden niet worden gecontroleerd. Boeking blijft op optie.' };
  const betaling = aanbetalingVoorwaarde(
    betalingen.data.map((rij) => ({ soort: tekst(rij.soort), status: tekst(rij.status) })),
    boeking.data.aanbetaling_ontvangen === true,
  );
  const actief = betalingen.data.filter((r) => r.status !== 'geannuleerd' && ['aanbetaling', 'restant'].includes(tekst(r.soort)));
  const huur = getal(boeking.data.tarief_bedrag);
  const totaalCent = actief.reduce((som, r) => som + Math.round((getal(r.bedrag) ?? NaN) * 100), 0);
  const volledigBetaald = huur != null && huur > 0 && totaalCent === Math.round(huur * 100) && actief.length > 0 &&
    actief.every((r) => ['ontvangen', 'betaald'].includes(tekst(r.status)) &&
      (r.ontvangen_bedrag == null || Math.round((getal(r.ontvangen_bedrag) ?? 0) * 100) >= Math.round((getal(r.bedrag) ?? Infinity) * 100)));
  const anderen = await client.from('boekingen').select('id,status,start_datum,eind_datum').in('status', ['optie', 'definitief']);
  if (anderen.error || !Array.isArray(anderen.data)) return { ok: false, gepromoveerd: false, melding: 'De bezetting kon niet worden gecontroleerd. Boeking blijft op optie.' };
  const start = tekst(boeking.data.start_datum);
  const eind = tekst(boeking.data.eind_datum);
  const overlapt = anderen.data.some((rij) => {
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
    betalingVereist: ['aanbetaling', 'volledig', 'geen'].includes(tekst(boeking.data.betaling_vereist))
      ? tekst(boeking.data.betaling_vereist) as 'aanbetaling' | 'volledig' | 'geen' : undefined,
    volledigBetaald,
    overlapt,
  });
  if (!klaar) return { ok: true, gepromoveerd: false, melding: 'De checklist is nog niet compleet.' };
  const gezet = await legAutomatischDefinitief(client, boekingId, actor, DEFINITIEF_REDEN);
  return { ...gezet, gepromoveerd: gezet.ok && gezet.melding.startsWith('Boeking is definitief') };
}
