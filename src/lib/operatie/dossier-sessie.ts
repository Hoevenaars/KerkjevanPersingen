/**
 * Dossieracties met de ingelogde beheer-sessie.
 * Geen service-role, geen communicatiejob, geen mail, geen workflow.
 * Aanbetaling wijzigt hier geen status: finance is in deze fase niet leidend.
 */

import { magStatusZetten } from '../../platform/aanvraag.ts';
import { ymdInAmsterdam, periodesOverlappen } from '../../platform/datum.ts';
import { boekingNummer, leesHandmatigeBoeking, type HandmatigeBoeking } from '../../platform/handmatige-boeking.ts';
import { optieSnapshot, STANDAARD_OPTIETERMIJN_DAGEN } from '../../platform/optie.ts';
import { magSchrijven } from '../../platform/rechten.ts';
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
}

interface BoekingRij {
  id: number;
  status: string;
  start_datum: string;
  eind_datum: string;
  nummer: string | null;
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
    .select('id,status,start_datum,eind_datum,nummer')
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
  };
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

async function definitief(client: DossierSessie, id: number, reden: string, actor: Actor): Promise<DossierResultaat> {
  if (!mag(actor, 'boekingen')) return { ok: false, melding: 'Geen recht om definitief te maken.' };
  if (!reden.trim()) return { ok: false, melding: 'Een reden is verplicht bij definitief zetten.' };
  const boeking = await leesBoeking(client, id);
  if ('fout' in boeking) return { ok: false, melding: boeking.fout };
  const poort = statusActieToegestaan(boeking.status, 'definitief');
  if (!poort.ok) return { ok: false, melding: poort.melding };
  if (poort.melding === 'al') return { ok: true, melding: 'Boeking is al definitief.' };
  const overlap = await overlapMetActieve(client, id, boeking.start_datum, boeking.eind_datum);
  if ('fout' in overlap) return { ok: false, melding: overlap.fout };
  if (overlap.nummers.length > 0) {
    return {
      ok: false,
      melding: `Niet definitief gemaakt. De periode overlapt met ${overlap.nummers.join(', ')}. Migratieboekingen tellen niet mee en zijn niet gewijzigd.`,
    };
  }
  const gezet = await zetStatus(client, id, { status: 'definitief' });
  if (gezet.fout) return { ok: false, melding: gezet.fout };
  await audit(client, actor, {
    actie: 'override_definitief',
    type: 'boeking',
    id: String(id),
    van: boeking.status,
    naar: 'definitief',
    reden: reden.trim(),
    dedup: `boeking:${id}:handmatig_definitief`,
  });
  return { ok: true, melding: 'Boeking is definitief. Aanbetaling is geen voorwaarde. Er is geen mail of workflow gestart.' };
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
    .select('id,status,naam,email,telefoon,adres,verhuurtype_sleutel,start_datum,eind_datum,boeking_id,relatie_id,toelichting,aantal_personen')
    .eq('id', id)
    .maybeSingle();
  if (error) return { fout: leesbareAuthFout(error.message) };
  if (!data?.status) return { fout: 'Aanvraag niet gevonden.' };
  return data as unknown as AanvraagRij;
}

async function afwijzen(client: DossierSessie, id: number, reden: string, actor: Actor): Promise<DossierResultaat> {
  if (!mag(actor, 'aanvragen')) return { ok: false, melding: 'Geen recht om een aanvraag af te wijzen.' };
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

async function goedkeuren(client: DossierSessie, id: number, actor: Actor): Promise<DossierResultaat> {
  if (!mag(actor, 'aanvragen')) return { ok: false, melding: 'Geen recht om een aanvraag goed te keuren.' };
  const aanvraag = await leesAanvraag(client, id);
  if ('fout' in aanvraag) return { ok: false, melding: aanvraag.fout };
  if (aanvraag.boeking_id) return { ok: true, melding: 'Deze aanvraag heeft al een boeking.' };
  const poort = magStatusZetten(aanvraag.status as AanvraagStatus, 'goedgekeurd', rechtenVan(actor));
  if (!poort.ok) return { ok: false, melding: poort.melding ?? 'Overgang geweigerd.' };
  if (!aanvraag.start_datum || !aanvraag.eind_datum) return { ok: false, melding: 'De aanvraag heeft geen periode.' };
  const overlap = await overlapMetActieve(client, 0, aanvraag.start_datum, aanvraag.eind_datum);
  if ('fout' in overlap) return { ok: false, melding: overlap.fout };
  if (overlap.nummers.length > 0) {
    return { ok: false, melding: `Niet goedgekeurd. De periode overlapt met ${overlap.nummers.join(', ')}.` };
  }
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
  return { ok: true, melding: 'Optie vastgelegd. Er is geen mail of workflow gestart. Aanbetaling is geen voorwaarde.' };
}

async function maakHandmatigeBoeking(
  client: DossierSessie,
  opdracht: Extract<Opdracht, { soort: 'handmatige_boeking' }>,
  actor: Actor,
): Promise<DossierResultaat> {
  if (!mag(actor, 'boekingen')) return { ok: false, melding: 'Geen recht om een boeking aan te maken.' };
  const gelezen = leesHandmatigeBoeking(opdracht);
  if (!gelezen.ok) return { ok: false, melding: gelezen.melding };
  const boeking = gelezen.boeking;
  const overlap = await overlapMetActieve(client, 0, boeking.start, boeking.eind);
  if ('fout' in overlap) return { ok: false, melding: overlap.fout };
  if (overlap.nummers.length > 0) {
    return { ok: false, melding: `Niet opgeslagen. De periode overlapt met ${overlap.nummers.join(', ')}.` };
  }
  const vandaag = ymdInAmsterdam(new Date());
  const optie = optieSnapshot(vandaag, STANDAARD_OPTIETERMIJN_DAGEN);
  let insert = await schrijfBoeking(client, boeking, optie, boekingNummer(boeking.start));
  if ('fout' in insert && insert.fout === 'nummer') {
    insert = await schrijfBoeking(client, boeking, optie, boekingNummer(boeking.start));
  }
  if ('fout' in insert) {
    const melding = insert.fout === 'nummer'
      ? 'Dit boekingsnummer bestond al. Probeer opnieuw. Er is niets opgeslagen.'
      : insert.fout;
    return { ok: false, melding };
  }
  await audit(client, actor, {
    actie: 'handmatig_aangemaakt',
    type: 'boeking',
    id: insert.id,
    naar: boeking.status,
    reden: boeking.status === 'definitief' ? boeking.reden : 'Handmatig aangemaakt, zonder aanvraag.',
    dedup: `boeking:${insert.id}:handmatig_aangemaakt`,
  });
  const melding = boeking.status === 'definitief'
    ? 'Boeking is definitief vastgelegd. Er is geen mail of workflow gestart.'
    : 'Optie vastgelegd. Er is geen mail of workflow gestart.';
  return { ok: true, melding, boekingId: insert.id };
}

async function schrijfBoeking(
  client: DossierSessie,
  boeking: HandmatigeBoeking,
  optie: { optieAangemaaktOp: string; optietermijnDagen: number; optieEinddatum: string },
  nummer: string,
): Promise<{ id: string } | { fout: string }> {
  const insert = await client.from('boekingen').insert({
    nummer,
    status: boeking.status,
    verhuurtype_sleutel: boeking.verhuurtype,
    interne_titel: boeking.titel,
    start_datum: boeking.start,
    eind_datum: boeking.eind,
    huurder_naam_snapshot: boeking.naam,
    huurder_email_snapshot: boeking.email,
    huurder_telefoon_snapshot: boeking.telefoon || null,
    huurder_adres_snapshot: boeking.adres || null,
    aantal_personen: boeking.personen || null,
    toelichting: boeking.toelichting || null,
    interne_notities: boeking.status === 'definitief' ? boeking.reden : null,
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
  if (opdracht.soort === 'beoordeel' && opdracht.besluit === 'goedkeuren') {
    return goedkeuren(client, Number(opdracht.aanvraagId), actor);
  }
  if (opdracht.soort === 'beoordeel' && opdracht.besluit === 'meer_informatie') {
    return { ok: false, melding: 'Meer informatie is nog niet beschikbaar. Er is geen mail verstuurd en de aanvraag is niet gewijzigd.' };
  }
  if (opdracht.soort === 'betaling') {
    return { ok: false, melding: 'Aanbetaling is in deze fase geen actie. Er is niets gewijzigd.' };
  }
  return { ok: false, melding: 'Deze actie is niet beschikbaar vanuit de browser. Er is niets gewijzigd.' };
}
