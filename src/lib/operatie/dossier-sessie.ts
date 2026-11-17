/**
 * Dossieracties met de ingelogde beheer-sessie.
 * Geen service-role, geen communicatiejob, geen mail, geen workflow.
 * Een losse aanbetaling wijzigt de status niet. Alleen een complete checklist doet dat.
 */

import { magStatusZetten } from '../../platform/aanvraag.ts';
import {
  beoordeelAanvraag,
  magGoedkeuren,
  type FaseActiviteit,
  type FaseAanvraag,
  type FaseBlokkade,
  type FaseBoeking,
  type FaseWereld,
} from '../../platform/aanvraag-fase.ts';
import { ymdInAmsterdam, periodesOverlappen } from '../../platform/datum.ts';
import {
  adviesVoorPeriode,
  boekingNummer,
  interneAgendaTitel,
  interneSoortNaam,
  leesHandmatigeBoeking,
  magAfwijken,
  notitiesVoorIntern,
  procesTekst,
  type HandmatigeBoeking,
} from '../../platform/handmatige-boeking.ts';
import { optieSnapshot, STANDAARD_OPTIETERMIJN_DAGEN } from '../../platform/optie.ts';
import { magSchrijven } from '../../platform/rechten.ts';
import { verstuurHandmatigeBevestiging } from './handmatige-bevestiging.ts';
import { statusActieToegestaan, statusTeltVoorOverlap } from '../../platform/status-overgang.ts';
import type { AanvraagStatus, GebruikerRechten } from '../../platform/types.ts';
import type { Actor, Opdracht } from './kern.ts';
import { annuleerBoekingViaSessie, type AnnuleerSessie } from './annuleer-boeking.ts';
import { koppelGastheerViaSessie, type GastheerSessie } from './gastheer-koppelen.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DossierResultaat {
  ok: boolean;
  melding: string;
  boekingId?: string;
  aanvraagId?: string;
  activiteitId?: string;
}

interface BoekingRij {
  id: number;
  status: string;
  start_datum: string;
  eind_datum: string;
  nummer: string | null;
  interne_titel: string | null;
  huurder_naam_snapshot: string | null;
}

interface AanvraagRij {
  id: number;
  status: string;
  naam: string;
  email: string;
  telefoon: string | null;
  adres: string | null;
  verhuurtype_sleutel: string | null;
  start_datum: string | null;
  eind_datum: string | null;
  boeking_id: number | null;
  relatie_id: number | null;
  toelichting: string | null;
  aantal_personen: string | null;
  website: string | null;
  mede_exposanten: string | null;
}

type Fout = { message: string; code?: string } | null;

interface Query {
  select: (kolommen: string, opties?: { count?: 'exact'; head?: boolean }) => Query;
  update: (waarden: Record<string, unknown>) => Query;
  insert: (rij: Record<string, unknown>) => Query;
  eq: (kolom: string, waarde: unknown) => Query;
  neq: (kolom: string, waarde: unknown) => Query;
  in: (kolom: string, waarden: string[]) => Query;
  maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null; error: Fout }>;
  then: PromiseLike<{ data: Record<string, unknown>[] | null; error: Fout; count: number | null }>['then'];
}

export interface DossierSessie {
  from: (tabel: string) => Query;
  rpc?: (naam: string, args: Record<string, unknown>) => PromiseLike<{ data?: unknown; error: Fout }>;
}

function rechtenVan(actor: Actor): GebruikerRechten {
  return actor.rechten ?? { isSuperAdmin: false, perModule: {} };
}

function mag(actor: Actor, module: 'boekingen' | 'aanvragen' | 'planning'): boolean {
  return magSchrijven(rechtenVan(actor), module);
}

function actorId(actor: Actor): string | null {
  return actor.id && UUID.test(actor.id) ? actor.id : null;
}

export function leesbareAuthFout(bericht: string): string {
  if (/invalid api key|jwt|unauthorized|401|permission denied|row-level security/i.test(bericht)) {
    return 'Geen recht of de sessie is verlopen. Er is niets gewijzigd. Log opnieuw in.';
  }
  if (/boekingen_geen_dubbele_bezetting|boekingen_een_actieve_optie|exclusion constraint/i.test(bericht)) {
    return 'Deze periode overlapt met een bestaande optie of definitieve boeking. Er is niets opgeslagen.';
  }
  return bericht;
}

async function audit(
  client: DossierSessie,
  actor: Actor,
  rij: { actie: string; type: string; id: string; van?: string; naar?: string; reden?: string; dedup: string },
): Promise<void> {
  await client.from('auditlog').insert({
    actor_id: actorId(actor),
    actor_naam: actor.naam,
    actor_type: actor.type,
    onderwerp_type: rij.type,
    onderwerp_id: rij.id,
    actie: rij.actie,
    van: rij.van ?? null,
    naar: rij.naar ?? null,
    reden: rij.reden ?? null,
    dedup_sleutel: rij.dedup,
  });
}

async function leesBoeking(client: DossierSessie, id: number): Promise<BoekingRij | { fout: string }> {
  const { data, error } = await client
    .from('boekingen')
    .select('id,status,start_datum,eind_datum,nummer,interne_titel,huurder_naam_snapshot')
    .eq('id', id)
    .maybeSingle();
  if (error) return { fout: leesbareAuthFout(error.message) };
  if (!data?.status) return { fout: 'Boeking niet gevonden.' };
  return {
    id: Number(data.id),
    status: String(data.status),
    start_datum: String(data.start_datum),
    eind_datum: String(data.eind_datum),
    nummer: data.nummer == null ? null : String(data.nummer),
    interne_titel: data.interne_titel == null ? null : String(data.interne_titel),
    huurder_naam_snapshot: data.huurder_naam_snapshot == null ? null : String(data.huurder_naam_snapshot),
  };
}

/** Definitieve boeking zonder agendarecord houdt de publieke agenda anders vrij. */
async function agendaAlsBezet(
  client: DossierSessie,
  boeking: { id: number; titel: string; start: string; eind: string; exposant: string },
): Promise<string | null> {
  if (client.rpc) {
    const { error } = await client.rpc('agenda_bezet_voor_definitieve_boeking', { p_boeking_id: boeking.id });
    if (!error) return null;
    if (!/agenda_bezet_voor_definitieve_boeking|could not find the function|schema cache/i.test(error.message)) {
      return leesbareAuthFout(error.message);
    }
  }

  const bestaand = await client
    .from('publieke_activiteiten')
    .select('id')
    .eq('boeking_id', boeking.id)
    .maybeSingle();
  if (bestaand.error) return leesbareAuthFout(bestaand.error.message);
  if (bestaand.data?.id != null) return null;

  const insert = await client.from('publieke_activiteiten').insert({
    boeking_id: boeking.id,
    titel: boeking.titel || 'Bezet',
    start_datum: boeking.start,
    eind_datum: boeking.eind,
    zichtbaarheid: 'bezet',
    gepubliceerd: false,
    exposanten: boeking.exposant || null,
    legacy_source: 'beheer',
  }).select('id').maybeSingle();
  if (insert.error) {
    if (insert.error.code === '23505') return null;
    return leesbareAuthFout(insert.error.message);
  }
  return null;
}

async function overlapMetActieve(
  client: DossierSessie,
  id: number,
  start: string,
  eind: string,
): Promise<{ nummers: string[] } | { fout: string }> {
  const { data, error } = await client
    .from('boekingen')
    .select('id,nummer,status,start_datum,eind_datum')
    .in('status', ['optie', 'definitief'])
    .neq('id', id);
  if (error) return { fout: leesbareAuthFout(error.message) };
  const nummers = (data ?? [])
    .filter((rij) => statusTeltVoorOverlap(String(rij.status)) && periodesOverlappen(
      { start: String(rij.start_datum), eind: String(rij.eind_datum) },
      { start, eind },
    ))
    .map((rij) => String(rij.nummer || rij.id));
  return { nummers };
}

async function zetStatus(
  client: DossierSessie,
  id: number,
  velden: Record<string, unknown>,
): Promise<{ fout?: string }> {
  const { data, error } = await client
    .from('boekingen')
    .update({ ...velden, bijgewerkt_op: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) return { fout: leesbareAuthFout(error.message) };
  if (!data) return { fout: 'De wijziging is niet opgeslagen. Controleer je rechten.' };
  return {};
}

async function verleng(client: DossierSessie, id: number, actor: Actor): Promise<DossierResultaat> {
  if (!mag(actor, 'boekingen')) return { ok: false, melding: 'Geen recht om een optie te verlengen.' };
  const boeking = await leesBoeking(client, id);
  if ('fout' in boeking) return { ok: false, melding: boeking.fout };
  const poort = statusActieToegestaan(boeking.status, 'verleng');
  if (!poort.ok) return { ok: false, melding: poort.melding };
  const vandaag = ymdInAmsterdam(new Date());
  const optie = optieSnapshot(vandaag, STANDAARD_OPTIETERMIJN_DAGEN);
  const gezet = await zetStatus(client, id, {
    status: 'optie',
    optie_einddatum: optie.optieEinddatum,
    optietermijn_dagen: optie.optietermijnDagen,
  });
  if (gezet.fout) return { ok: false, melding: gezet.fout };
  await audit(client, actor, {
    actie: 'optie_verlengd',
    type: 'boeking',
    id: String(id),
    van: boeking.status,
    naar: 'optie',
    reden: optie.optieEinddatum,
    dedup: `boeking:${id}:verlengd:${vandaag}`,
  });
  return { ok: true, melding: `Optie verlengd tot ${optie.optieEinddatum}. Er is geen mail verstuurd.` };
}

async function schrijfDefinitief(
  client: DossierSessie,
  boeking: BoekingRij,
  actor: Actor,
  spoor: { actie: string; reden: string; dedup: string; melding: string },
): Promise<DossierResultaat> {
  const overlap = await overlapMetActieve(client, boeking.id, boeking.start_datum, boeking.eind_datum);
  if ('fout' in overlap) return { ok: false, melding: overlap.fout };
  if (overlap.nummers.length > 0) {
    return {
      ok: false,
      melding: `Niet definitief gemaakt. De periode overlapt met ${overlap.nummers.join(', ')}. Migratieboekingen tellen niet mee en zijn niet gewijzigd.`,
    };
  }
  const gezet = await zetStatus(client, boeking.id, { status: 'definitief', optie_einddatum: null });
  if (gezet.fout) return { ok: false, melding: gezet.fout };
  await audit(client, actor, {
    actie: spoor.actie,
    type: 'boeking',
    id: String(boeking.id),
    van: boeking.status,
    naar: 'definitief',
    reden: spoor.reden,
    dedup: spoor.dedup,
  });
  const agendaFout = await agendaAlsBezet(client, {
    id: boeking.id,
    titel: boeking.interne_titel || 'Bezet',
    start: boeking.start_datum,
    eind: boeking.eind_datum,
    exposant: boeking.huurder_naam_snapshot || '',
  });
  if (agendaFout) return { ok: true, melding: `${spoor.melding} De agenda is niet geblokkeerd: ${agendaFout}` };
  return { ok: true, melding: spoor.melding };
}

async function definitief(client: DossierSessie, id: number, reden: string, actor: Actor): Promise<DossierResultaat> {
  if (!mag(actor, 'boekingen')) return { ok: false, melding: 'Geen recht om definitief te maken.' };
  if (!reden.trim()) return { ok: false, melding: 'Een reden is verplicht bij definitief zetten.' };
  const boeking = await leesBoeking(client, id);
  if ('fout' in boeking) return { ok: false, melding: boeking.fout };
  const poort = statusActieToegestaan(boeking.status, 'definitief');
  if (!poort.ok) return { ok: false, melding: poort.melding };
  if (poort.melding === 'al') return { ok: true, melding: 'Boeking is al definitief.' };
  return schrijfDefinitief(client, boeking, actor, {
    actie: 'override_definitief',
    reden: reden.trim(),
    dedup: `boeking:${id}:handmatig_definitief`,
    melding: 'Boeking is definitief. Aanbetaling is geen voorwaarde. Er is geen mail of workflow gestart.',
  });
}

/** Checklist is al bewezen. Geen extra bevestiging en geen mail. */
export async function legAutomatischDefinitief(
  client: DossierSessie,
  id: number,
  actor: Actor,
  reden: string,
): Promise<DossierResultaat> {
  const boeking = await leesBoeking(client, id);
  if ('fout' in boeking) return { ok: false, melding: boeking.fout };
  const poort = statusActieToegestaan(boeking.status, 'definitief');
  if (!poort.ok) return { ok: false, melding: poort.melding };
  if (poort.melding === 'al') return { ok: true, melding: 'Boeking is al definitief.' };
  return schrijfDefinitief(client, boeking, actor, {
    actie: 'automatisch_definitief',
    reden,
    dedup: `boeking:${id}:automatisch_definitief`,
    melding: 'Boeking is definitief. Er is geen mail verstuurd.',
  });
}

async function afronden(client: DossierSessie, id: number, reden: string, actor: Actor): Promise<DossierResultaat> {
  if (!mag(actor, 'boekingen')) return { ok: false, melding: 'Geen recht om een dossier af te ronden.' };
  const boeking = await leesBoeking(client, id);
  if ('fout' in boeking) return { ok: false, melding: boeking.fout };
  const poort = statusActieToegestaan(boeking.status, 'afronden');
  if (!poort.ok) return { ok: false, melding: poort.melding };
  if (poort.melding === 'al') return { ok: true, melding: 'Dossier was al afgerond.' };
  const open = await client.from('incidenten').select('id').eq('boeking_id', id).neq('status', 'gesloten');
  if (open.error) return { ok: false, melding: leesbareAuthFout(open.error.message) };
  if ((open.data ?? []).length > 0) return { ok: false, melding: 'Een open incident houdt het dossier open.' };
  const gezet = await zetStatus(client, id, { status: 'afgerond' });
  if (gezet.fout) return { ok: false, melding: gezet.fout };
  await audit(client, actor, {
    actie: 'afgerond',
    type: 'boeking',
    id: String(id),
    van: boeking.status,
    naar: 'afgerond',
    reden,
    dedup: `boeking:${id}:afgerond`,
  });
  return { ok: true, melding: 'Dossier afgerond. Er is geen mail verstuurd.' };
}

async function incident(client: DossierSessie, id: number, omschrijving: string, actor: Actor): Promise<DossierResultaat> {
  if (!mag(actor, 'boekingen')) return { ok: false, melding: 'Geen recht om een incident te melden.' };
  if (!omschrijving.trim()) return { ok: false, melding: 'Een incident heeft een omschrijving nodig.' };
  const boeking = await leesBoeking(client, id);
  if ('fout' in boeking) return { ok: false, melding: boeking.fout };
  const gezet = await client.from('incidenten').insert({
    boeking_id: id,
    omschrijving: omschrijving.trim(),
    status: 'open',
    gemeld_door: actorId(actor),
  }).select('id').maybeSingle();
  if (gezet.error) return { ok: false, melding: leesbareAuthFout(gezet.error.message) };
  await audit(client, actor, {
    actie: 'incident',
    type: 'boeking',
    id: String(id),
    reden: omschrijving.trim(),
    dedup: `incident:${id}:${new Date().toISOString()}`,
  });
  return { ok: true, melding: 'Incident vastgelegd. De boekingsstatus is niet gewijzigd en er is geen mail verstuurd.' };
}

async function incidentSluiten(client: DossierSessie, incidentId: number, actor: Actor): Promise<DossierResultaat> {
  if (!mag(actor, 'boekingen')) return { ok: false, melding: 'Geen recht om een incident te sluiten.' };
  const { data, error } = await client.from('incidenten').select('id,boeking_id,status').eq('id', incidentId).maybeSingle();
  if (error) return { ok: false, melding: leesbareAuthFout(error.message) };
  if (!data) return { ok: false, melding: 'Incident niet gevonden.' };
  if (String(data.status) === 'gesloten') return { ok: true, melding: 'Incident was al gesloten.' };
  const gezet = await client
    .from('incidenten')
    .update({ status: 'gesloten', gesloten_op: new Date().toISOString() })
    .eq('id', incidentId)
    .select('id')
    .maybeSingle();
  if (gezet.error) return { ok: false, melding: leesbareAuthFout(gezet.error.message) };
  await audit(client, actor, {
    actie: 'incident_gesloten',
    type: 'incident',
    id: String(incidentId),
    naar: 'gesloten',
    dedup: `incident:${incidentId}:gesloten`,
  });
  return { ok: true, melding: 'Incident gesloten. Er is geen mail verstuurd.' };
}

async function leesAanvraag(client: DossierSessie, id: number): Promise<AanvraagRij | { fout: string }> {
  const { data, error } = await client
    .from('aanvragen')
    .select('id,status,naam,email,telefoon,adres,verhuurtype_sleutel,start_datum,eind_datum,boeking_id,relatie_id,toelichting,aantal_personen,website,mede_exposanten')
    .eq('id', id)
    .maybeSingle();
  if (error) return { fout: leesbareAuthFout(error.message) };
  if (!data?.status) return { fout: 'Aanvraag niet gevonden.' };
  return data as unknown as AanvraagRij;
}

async function afwijzen(client: DossierSessie, id: number, reden: string, actor: Actor): Promise<DossierResultaat> {
  if (!mag(actor, 'aanvragen')) return { ok: false, melding: 'Geen recht om een aanvraag af te wijzen.' };
  if (!reden.trim()) return { ok: false, melding: 'Vul een afwijsreden in. Er is niets gewijzigd.' };
  const aanvraag = await leesAanvraag(client, id);
  if ('fout' in aanvraag) return { ok: false, melding: aanvraag.fout };
  const poort = magStatusZetten(aanvraag.status as AanvraagStatus, 'afgewezen', rechtenVan(actor));
  if (!poort.ok) return { ok: false, melding: poort.melding ?? 'Overgang geweigerd.' };
  const { error } = await client
    .from('aanvragen')
    .update({ status: 'afgewezen', afwijsreden: reden.trim() || null })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) return { ok: false, melding: leesbareAuthFout(error.message) };
  await audit(client, actor, {
    actie: 'afgewezen',
    type: 'aanvraag',
    id: String(id),
    van: aanvraag.status,
    naar: 'afgewezen',
    reden,
    dedup: `aanvraag:${id}:afgewezen`,
  });
  return { ok: true, melding: 'Aanvraag afgewezen. Er is geen mail verstuurd.' };
}

async function leesLijst(
  client: DossierSessie,
  tabel: string,
  kolommen: string,
): Promise<{ data: Record<string, unknown>[] } | { fout: string }> {
  const antwoord = await client.from(tabel).select(kolommen);
  if (antwoord.error) return { fout: leesbareAuthFout(antwoord.error.message) };
  return { data: antwoord.data ?? [] };
}

function tekst(waarde: unknown): string {
  return waarde == null ? '' : String(waarde);
}

/** Zelfde periodecontrole als de pagina, opnieuw gelezen op het moment van goedkeuren. */
async function wereldVoorGoedkeuren(client: DossierSessie): Promise<FaseWereld | { fout: string }> {
  const [boekingen, aanvragen, blokkades, activiteiten] = await Promise.all([
    leesLijst(client, 'boekingen', 'id,nummer,status,start_datum,eind_datum,interne_titel,huurder_naam_snapshot,aanvraag_id,aanbetaling_ontvangen'),
    leesLijst(client, 'aanvragen', 'id,status,naam,start_datum,eind_datum,boeking_id'),
    leesLijst(client, 'interne_activiteiten', 'id,titel,start_datum,eind_datum,blokkeert_verhuurkalender,notities'),
    leesLijst(client, 'activiteit_bron', 'id,titel,interne_titel,start_datum,eind_datum,zichtbaarheid,levenscyclus'),
  ]);
  if ('fout' in boekingen) return boekingen;
  if ('fout' in aanvragen) return aanvragen;
  if ('fout' in blokkades) return blokkades;
  if ('fout' in activiteiten) return activiteiten;
  return {
    aanvragen: aanvragen.data.map((rij): FaseAanvraag => ({
      id: tekst(rij.id),
      status: tekst(rij.status),
      naam: tekst(rij.naam),
      start: tekst(rij.start_datum),
      eind: tekst(rij.eind_datum),
      boekingId: rij.boeking_id == null ? undefined : tekst(rij.boeking_id),
    })),
    boekingen: boekingen.data.map((rij): FaseBoeking => ({
      id: tekst(rij.id),
      nummer: tekst(rij.nummer) || tekst(rij.id),
      status: tekst(rij.status),
      start: tekst(rij.start_datum),
      eind: tekst(rij.eind_datum),
      titel: tekst(rij.interne_titel),
      huurder: tekst(rij.huurder_naam_snapshot),
      aanbetalingBinnen: rij.aanbetaling_ontvangen === true,
      aanvraagId: rij.aanvraag_id == null ? undefined : tekst(rij.aanvraag_id),
    })),
    documenten: [],
    mails: [],
    betalingen: [],
    blokkades: blokkades.data.map((rij): FaseBlokkade => ({
      id: tekst(rij.id),
      titel: tekst(rij.titel),
      start: tekst(rij.start_datum),
      eind: tekst(rij.eind_datum),
      blokkeert: rij.blokkeert_verhuurkalender === true,
      notities: tekst(rij.notities),
    })),
    activiteiten: activiteiten.data.map((rij): FaseActiviteit => ({
      id: tekst(rij.id),
      titel: tekst(rij.titel || rij.interne_titel),
      start: tekst(rij.start_datum),
      eind: tekst(rij.eind_datum),
      zichtbaarheid: tekst(rij.zichtbaarheid),
      levenscyclus: tekst(rij.levenscyclus) || 'actief',
    })),
  };
}

async function geschikt(client: DossierSessie, id: number, actor: Actor): Promise<DossierResultaat> {
  if (!Number.isInteger(id)) return { ok: false, melding: 'Deze aanvraag kan niet worden beoordeeld. Er is niets gewijzigd.' };
  if (!mag(actor, 'aanvragen')) return { ok: false, melding: 'Geen recht om een aanvraag te beoordelen.' };
  const aanvraag = await leesAanvraag(client, id);
  if ('fout' in aanvraag) return { ok: false, melding: aanvraag.fout };
  if (aanvraag.status === 'in_behandeling') return { ok: true, melding: 'De activiteit is al als geschikt beoordeeld.' };
  const poort = magStatusZetten(aanvraag.status as AanvraagStatus, 'in_behandeling', rechtenVan(actor));
  if (!poort.ok) return { ok: false, melding: poort.melding ?? 'Overgang geweigerd.' };
  const gezet = await client
    .from('aanvragen')
    .update({ status: 'in_behandeling' })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (gezet.error) return { ok: false, melding: leesbareAuthFout(gezet.error.message) };
  if (gezet.data?.id == null) return { ok: false, melding: 'De beoordeling is niet opgeslagen. Er is niets gewijzigd.' };
  await audit(client, actor, {
    actie: 'geschikt',
    type: 'aanvraag',
    id: String(id),
    van: aanvraag.status,
    naar: 'in_behandeling',
    dedup: `aanvraag:${id}:geschikt`,
  });
  return { ok: true, melding: 'Activiteit beoordeeld als geschikt. Er is nog geen boeking en er is geen mail verstuurd.' };
}

async function goedkeuren(client: DossierSessie, id: number, actor: Actor): Promise<DossierResultaat> {
  if (!mag(actor, 'aanvragen')) return { ok: false, melding: 'Geen recht om een aanvraag goed te keuren.' };
  const aanvraag = await leesAanvraag(client, id);
  if ('fout' in aanvraag) return { ok: false, melding: aanvraag.fout };
  if (aanvraag.boeking_id) return { ok: true, melding: 'Deze aanvraag heeft al een boeking.' };
  const poort = magStatusZetten(aanvraag.status as AanvraagStatus, 'goedgekeurd', rechtenVan(actor));
  if (!poort.ok) return { ok: false, melding: poort.melding ?? 'Overgang geweigerd.' };
  if (!aanvraag.start_datum || !aanvraag.eind_datum) return { ok: false, melding: 'De aanvraag heeft geen periode.' };
  const wereld = await wereldVoorGoedkeuren(client);
  if ('fout' in wereld) return { ok: false, melding: wereld.fout };
  const beeld = beoordeelAanvraag({
    id: String(aanvraag.id),
    status: aanvraag.status,
    naam: aanvraag.naam,
    start: aanvraag.start_datum,
    eind: aanvraag.eind_datum,
    boekingId: undefined,
  }, wereld);
  const vrij = magGoedkeuren(beeld, aanvraag.status);
  if (!vrij.ok) return { ok: false, melding: vrij.melding ?? 'Niet goedgekeurd.' };
  const vandaag = ymdInAmsterdam(new Date());
  const optie = optieSnapshot(vandaag, STANDAARD_OPTIETERMIJN_DAGEN);
  const insert = await client.from('boekingen').insert({
    nummer: `KVP-${aanvraag.start_datum.replaceAll('-', '')}-${aanvraag.id}`,
    status: 'optie',
    verhuurtype_sleutel: aanvraag.verhuurtype_sleutel,
    interne_titel: aanvraag.naam,
    start_datum: aanvraag.start_datum,
    eind_datum: aanvraag.eind_datum,
    huurder_relatie_id: aanvraag.relatie_id,
    aanvraag_id: aanvraag.id,
    huurder_naam_snapshot: aanvraag.naam,
    huurder_email_snapshot: aanvraag.email,
    huurder_telefoon_snapshot: aanvraag.telefoon,
    huurder_adres_snapshot: aanvraag.adres,
    aantal_personen: aanvraag.aantal_personen,
    toelichting: aanvraag.toelichting,
    website: aanvraag.website,
    mede_exposanten: aanvraag.mede_exposanten,
    optie_aangemaakt_op: optie.optieAangemaaktOp,
    optietermijn_dagen: optie.optietermijnDagen,
    optie_einddatum: optie.optieEinddatum,
  }).select('id').maybeSingle();
  if (insert.error) return { ok: false, melding: leesbareAuthFout(insert.error.message) };
  const boekingId = insert.data?.id;
  const update = await client
    .from('aanvragen')
    .update({ status: 'goedgekeurd', boeking_id: boekingId ?? null })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (update.error) return { ok: false, melding: leesbareAuthFout(update.error.message) };
  await audit(client, actor, {
    actie: 'goedgekeurd',
    type: 'aanvraag',
    id: String(id),
    van: aanvraag.status,
    naar: 'goedgekeurd',
    dedup: `aanvraag:${id}:goedgekeurd`,
  });
  return { ok: true, melding: 'Goedgekeurd en in behandeling genomen. De bestaande optie is vastgelegd. Er is geen mail verstuurd.' };
}

async function maakHandmatigeBoeking(
  client: DossierSessie,
  opdracht: Extract<Opdracht, { soort: 'handmatige_boeking' }>,
  actor: Actor,
): Promise<DossierResultaat> {
  if (!magSchrijven(rechtenVan(actor), 'handmatige_boeking')) {
    return { ok: false, melding: 'Geen recht om een handmatige boeking vast te leggen.' };
  }
  const { soort: _soort, ...rest } = opdracht;
  const gelezen = leesHandmatigeBoeking(rest);
  if (!gelezen.ok) return { ok: false, melding: gelezen.melding };
  const boeking = gelezen.boeking;
  if (boeking.soort === 'verhuur' && boeking.fase !== 'nieuw' && !mag(actor, 'boekingen')) {
    return { ok: false, melding: 'Geen recht om een boeking aan te maken.' };
  }
  const wereld = await wereldVoorGoedkeuren(client);
  if ('fout' in wereld) return { ok: false, melding: wereld.fout };
  const eigenTijd = boeking.soort === 'intern' && !boeking.heleDag ? `${boeking.tijdVan}-${boeking.tijdTot}` : null;
  const advies = adviesVoorPeriode(wereld, boeking.start, boeking.eind, eigenTijd);
  const afwijking = magAfwijken(advies, boeking);
  if (!afwijking.ok) return { ok: false, melding: afwijking.melding };

  if (boeking.soort === 'intern') return schrijfInterneActiviteit(client, boeking, actor, advies.uitkomst !== 'beschikbaar');

  const vandaag = ymdInAmsterdam(new Date());
  const optie = optieSnapshot(vandaag, STANDAARD_OPTIETERMIJN_DAGEN);
  const aanvraagStatus = boeking.fase === 'nieuw' ? 'nieuw' : 'in_behandeling';
  const aanvraag = await schrijfAanvraag(client, boeking, aanvraagStatus);
  if ('fout' in aanvraag) return { ok: false, melding: aanvraag.fout };

  let boekingId: string | undefined;
  if (boeking.fase !== 'nieuw') {
    let insert = await schrijfBoeking(client, boeking, optie, boekingNummer(boeking.start), aanvraag.id, advies.uitkomst !== 'beschikbaar');
    if ('fout' in insert && insert.fout === 'nummer') {
      insert = await schrijfBoeking(client, boeking, optie, boekingNummer(boeking.start), aanvraag.id, advies.uitkomst !== 'beschikbaar');
    }
    if ('fout' in insert) {
      return {
        ok: false,
        melding: insert.fout === 'nummer'
          ? 'Dit boekingsnummer bestond al. Probeer opnieuw. Er is niets opgeslagen.'
          : insert.fout,
      };
    }
    boekingId = insert.id;
    await client.from('aanvragen').update({ boeking_id: Number(insert.id) }).eq('id', Number(aanvraag.id));
  }

  const onderwerpType = boekingId ? 'boeking' : 'aanvraag';
  const onderwerpId = boekingId ?? aanvraag.id;
  await audit(client, actor, {
    actie: 'handmatig_aangemaakt',
    type: onderwerpType,
    id: onderwerpId,
    naar: boeking.definitief ? 'definitief' : boeking.fase,
    reden: boeking.definitief ? boeking.uitzondering : 'Handmatig aangemaakt, zonder openbaar aanvraagformulier.',
    dedup: `${onderwerpType}:${onderwerpId}:handmatig_aangemaakt`,
  });
  if (advies.uitkomst !== 'beschikbaar') {
    const namen = [...advies.regels, ...advies.aanvragen].map((regel) => regel.naam).join(', ');
    await audit(client, actor, {
      actie: 'beschikbaarheid_afwijking',
      type: onderwerpType,
      id: onderwerpId,
      van: advies.kop,
      naar: namen,
      reden: boeking.conflictReden,
      dedup: `${onderwerpType}:${onderwerpId}:beschikbaarheid_afwijking`,
    });
  }
  if (boeking.fase === 'gereed' && !boeking.definitief) {
    await audit(client, actor, {
      actie: 'fase_overgeslagen',
      type: 'aanvraag',
      id: aanvraag.id,
      van: 'in_behandeling',
      naar: 'gereed',
      reden: `${boeking.uitzondering} ${procesTekst(boeking)}`.trim(),
      dedup: `aanvraag:${aanvraag.id}:fase_overgeslagen`,
    });
  }
  if (boeking.definitief && !(boeking.contractVerzonden && boeking.contractOndertekend && boeking.aanbetalingOntvangen)) {
    await audit(client, actor, {
      actie: 'stappen_overgeslagen',
      type: 'boeking',
      id: boekingId ?? aanvraag.id,
      naar: 'definitief',
      reden: `${boeking.uitzondering} ${procesTekst(boeking)}`.trim(),
      dedup: `boeking:${boekingId}:stappen_overgeslagen`,
    });
  }

  let melding = boeking.definitief
    ? 'Boeking is definitief vastgelegd. Gereed in de aanvraaglijst volgt die boekingsstatus.'
    : boeking.fase === 'gereed'
      ? 'Vastgelegd als in behandeling. Gereed in de aanvraaglijst volgt de bestaande checklist, of een definitieve boeking. De uitzondering staat in de auditlog.'
      : boeking.fase === 'in_behandeling'
        ? 'Aanvraag in behandeling. De optie is vastgelegd en nog niet definitief.'
        : 'Aanvraag vastgelegd als nieuw. Er is nog geen reservering die de kalender blokkeert.';
  if (boeking.definitief && boekingId) {
    const agendaFout = await agendaAlsBezet(client, {
      id: Number(boekingId),
      titel: boeking.titel,
      start: boeking.start,
      eind: boeking.eind,
      exposant: boeking.naam,
    });
    if (agendaFout) melding = `${melding} De agenda is niet geblokkeerd: ${agendaFout}`;
  }
  const mail = await verstuurHandmatigeBevestiging(client, boeking, { boekingId, aanvraagId: aanvraag.id });
  return { ok: true, melding: `${melding} ${mail}`, boekingId, aanvraagId: aanvraag.id };
}

async function schrijfInterneActiviteit(
  client: DossierSessie,
  boeking: HandmatigeBoeking,
  actor: Actor,
  afwijking: boolean,
): Promise<DossierResultaat> {
  const soortNaam = boeking.interneSoort === 'overig' ? boeking.titel : interneSoortNaam(boeking.interneSoort);
  const insert = await client.from('interne_activiteiten').insert({
    titel: interneAgendaTitel(soortNaam),
    start_datum: boeking.start,
    eind_datum: boeking.eind,
    blokkeert_verhuurkalender: true,
    notities: notitiesVoorIntern(boeking),
  }).select('id').maybeSingle();
  if (insert.error) return { ok: false, melding: leesbareAuthFout(insert.error.message) };
  const id = insert.data?.id;
  if (id == null || id === '') return { ok: false, melding: 'De interne activiteit is niet opgeslagen.' };
  const activiteitId = String(id);
  await audit(client, actor, {
    actie: 'handmatig_aangemaakt',
    type: 'interne_activiteit',
    id: activiteitId,
    naar: 'gereed',
    reden: 'Interne activiteit, zonder huurder, contract of betaling.',
    dedup: `interne_activiteit:${activiteitId}:handmatig_aangemaakt`,
  });
  if (afwijking) {
    await audit(client, actor, {
      actie: 'beschikbaarheid_afwijking',
      type: 'interne_activiteit',
      id: activiteitId,
      reden: boeking.conflictReden,
      dedup: `interne_activiteit:${activiteitId}:beschikbaarheid_afwijking`,
    });
  }
  return {
    ok: true,
    melding: 'Interne activiteit vastgelegd als gereed. Er is geen huurder, contract of betaling en er is geen bevestigingsmail verstuurd.',
    activiteitId,
  };
}

async function schrijfAanvraag(
  client: DossierSessie,
  boeking: HandmatigeBoeking,
  status: 'nieuw' | 'in_behandeling',
): Promise<{ id: string } | { fout: string }> {
  const insert = await client.from('aanvragen').insert({
    status,
    naam: boeking.naam,
    email: boeking.email,
    telefoon: boeking.telefoon || null,
    adres: boeking.adres || null,
    verhuurtype_sleutel: boeking.verhuurtype,
    start_datum: boeking.start,
    eind_datum: boeking.eind,
    toelichting: boeking.toelichting || null,
    aantal_personen: boeking.personen || null,
  }).select('id').maybeSingle();
  if (insert.error) return { fout: leesbareAuthFout(insert.error.message) };
  const id = insert.data?.id;
  if (id == null || id === '') return { fout: 'De aanvraag is niet opgeslagen.' };
  return { id: String(id) };
}

async function schrijfBoeking(
  client: DossierSessie,
  boeking: HandmatigeBoeking,
  optie: { optieAangemaaktOp: string; optietermijnDagen: number; optieEinddatum: string },
  nummer: string,
  aanvraagId: string,
  overlapToegestaan: boolean,
): Promise<{ id: string } | { fout: string }> {
  const insert = await client.from('boekingen').insert({
    nummer,
    status: boeking.definitief ? 'definitief' : 'optie',
    verhuurtype_sleutel: boeking.verhuurtype,
    interne_titel: boeking.titel,
    start_datum: boeking.start,
    eind_datum: boeking.eind,
    aanvraag_id: Number(aanvraagId),
    huurder_naam_snapshot: boeking.naam,
    huurder_email_snapshot: boeking.email,
    huurder_telefoon_snapshot: boeking.telefoon || null,
    huurder_adres_snapshot: boeking.adres || null,
    aantal_personen: boeking.personen || null,
    toelichting: boeking.toelichting || null,
    interne_notities: boeking.uitzondering || null,
    aanbetaling_ontvangen: boeking.aanbetalingOntvangen,
    overlap_toegestaan: overlapToegestaan,
    optie_aangemaakt_op: optie.optieAangemaaktOp,
    optietermijn_dagen: optie.optietermijnDagen,
    optie_einddatum: optie.optieEinddatum,
  }).select('id').maybeSingle();
  if (insert.error) {
    if (insert.error.code === '23505') return { fout: 'nummer' };
    return { fout: leesbareAuthFout(insert.error.message) };
  }
  const id = insert.data?.id;
  if (id == null || id === '') return { fout: 'De boeking is niet opgeslagen. Controleer je rechten.' };
  return { id: String(id) };
}

export async function voerDossierViaSessie(
  client: DossierSessie,
  opdracht: Opdracht,
  actor: Actor,
): Promise<DossierResultaat> {
  if (opdracht.soort === 'annuleer') {
    const id = Number(opdracht.boekingId);
    const boeking = await leesBoeking(client, id);
    if ('fout' in boeking) return { ok: false, melding: boeking.fout };
    const poort = statusActieToegestaan(boeking.status, 'annuleer');
    if (!poort.ok) return { ok: false, melding: poort.melding };
    if (!mag(actor, 'boekingen')) return { ok: false, melding: 'Geen recht om te annuleren.' };
    const uit = await annuleerBoekingViaSessie(client as AnnuleerSessie, id, opdracht.reden ?? '', actor);
    if (uit.ok) return { ok: true, melding: `${uit.melding} Annuleringsmail staat uit.` };
    return { ok: false, melding: leesbareAuthFout(uit.melding) };
  }
  if (opdracht.soort === 'gastheer') {
    if (!mag(actor, 'boekingen') && !mag(actor, 'planning')) {
      return { ok: false, melding: 'Geen recht om een gastheer te koppelen.' };
    }
    return koppelGastheerViaSessie(client as GastheerSessie, Number(opdracht.boekingId), opdracht.gastheerId, actor);
  }
  if (opdracht.soort === 'verleng') return verleng(client, Number(opdracht.boekingId), actor);
  if (opdracht.soort === 'handmatig_definitief') {
    return definitief(client, Number(opdracht.boekingId), opdracht.reden, actor);
  }
  if (opdracht.soort === 'handmatige_boeking') return maakHandmatigeBoeking(client, opdracht, actor);
  if (opdracht.soort === 'sluit') return afronden(client, Number(opdracht.boekingId), opdracht.reden ?? '', actor);
  if (opdracht.soort === 'incident') return incident(client, Number(opdracht.boekingId), opdracht.omschrijving, actor);
  if (opdracht.soort === 'incident_sluiten') return incidentSluiten(client, Number(opdracht.incidentId), actor);
  if (opdracht.soort === 'beoordeel' && opdracht.besluit === 'afwijzen') {
    return afwijzen(client, Number(opdracht.aanvraagId), opdracht.reden ?? '', actor);
  }
  if (opdracht.soort === 'beoordeel' && opdracht.besluit === 'in_behandeling') {
    return geschikt(client, Number(opdracht.aanvraagId), actor);
  }
  if (opdracht.soort === 'beoordeel' && opdracht.besluit === 'goedkeuren') {
    return goedkeuren(client, Number(opdracht.aanvraagId), actor);
  }
  if (opdracht.soort === 'beoordeel' && opdracht.besluit === 'meer_informatie') {
    const { bewaarInformatievraag } = await import('./informatievraag.ts');
    return bewaarInformatievraag(client as never, Number(opdracht.aanvraagId), opdracht.vraag ?? '', actor);
  }
  if (opdracht.soort === 'verstuur_informatie') {
    const { verstuurInformatievraag } = await import('./informatievraag.ts');
    return verstuurInformatievraag(client as never, Number(opdracht.aanvraagId), actor);
  }
  if (opdracht.soort === 'betaling') {
    return { ok: false, melding: 'Aanbetaling is in deze fase geen actie. Er is niets gewijzigd.' };
  }
  return { ok: false, melding: 'Deze actie is niet beschikbaar vanuit de browser. Er is niets gewijzigd.' };
}
