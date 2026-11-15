/**
 * Zet een aanvraag één afgeleide processtap terug.
 * Geen mail. Een ontvangen aanbetaling en een definitieve boeking blijven staan.
 */

import { createHash } from 'node:crypto';
import { magAanvraagWijzigen, magStatusZetten } from '../../platform/aanvraag.ts';
import {
  beoordeelAanvraag,
  contractDocumentVorm,
  type FaseBoeking,
  type FaseDocument,
  type FaseMail,
  type FaseWereld,
} from '../../platform/aanvraag-fase.ts';
import { planFaseTerug, type FaseTerugEffect } from '../../platform/fase-terug.ts';
import type { AanvraagStatus } from '../../platform/types.ts';
import { annuleerBoekingViaSessie, type AnnuleerSessie } from './annuleer-boeking.ts';
import { leesbareAuthFout, type DossierResultaat, type DossierSessie } from './dossier-sessie.ts';
import type { Actor } from './kern.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Fout = { message: string; code?: string } | null;
type Rij = Record<string, unknown>;

function tekst(waarde: unknown): string {
  return waarde == null ? '' : String(waarde);
}

function mag(actor: Actor): boolean {
  return magAanvraagWijzigen(actor.rechten ?? { isSuperAdmin: false, perModule: {} });
}

function actorId(actor: Actor): string | null {
  return actor.id && UUID.test(actor.id) ? actor.id : null;
}

function contractmail(template: string): boolean {
  return /contract|huurovereenkomst/i.test(template);
}

function tabelMist(error: Fout): boolean {
  return Boolean(error && /does not exist|schema cache|42P01|PGRST205/i.test(`${error.code ?? ''} ${error.message}`));
}

async function rijen(
  client: DossierSessie,
  tabel: string,
  kolommen: string,
  kolom: string,
  waarde: unknown,
): Promise<{ data: Rij[]; error: Fout }> {
  const antwoord = await client.from(tabel).select(kolommen).eq(kolom, waarde);
  return { data: antwoord.data ?? [], error: antwoord.error };
}

async function zet(
  client: DossierSessie,
  tabel: string,
  id: unknown,
  waarden: Record<string, unknown>,
): Promise<Fout> {
  const antwoord = await client.from(tabel).update(waarden).eq('id', id).select('id').maybeSingle();
  if (antwoord.error) return antwoord.error;
  if (antwoord.data?.id == null) return { message: 'De rij is niet bijgewerkt.' };
  return null;
}

async function audit(
  client: DossierSessie,
  actor: Actor,
  rij: { actie: string; id: string; van?: string; naar?: string; reden: string; dedup: string },
): Promise<void> {
  await client.from('auditlog').insert({
    actor_id: actorId(actor),
    actor_naam: actor.naam,
    actor_type: actor.type,
    onderwerp_type: 'aanvraag',
    onderwerp_id: rij.id,
    actie: rij.actie,
    van: rij.van ?? null,
    naar: rij.naar ?? null,
    reden: rij.reden,
    dedup_sleutel: rij.dedup,
  });
}

function meldingVan(effect: FaseTerugEffect): string {
  if (effect === 'contract_intrekken') {
    return 'Een fase terug. Het contract is ingetrokken. Volgende actie: Contract verzenden. Er is geen mail verstuurd.';
  }
  if (effect === 'handtekening_intrekken') {
    return 'Een fase terug. De handtekening telt niet meer. Volgende actie: Wachten op ondertekening. Er is geen mail verstuurd.';
  }
  if (effect === 'optie_ongedaan') {
    return 'Een fase terug. De optie is geannuleerd. Volgende actie: Goedkeuren en in behandeling nemen. Er is geen mail verstuurd.';
  }
  if (effect === 'status_nieuw') {
    return 'Een fase terug. Volgende actie: Geschiktheid beoordelen. Er is geen mail verstuurd.';
  }
  return 'Een fase terug. De aanvraag wacht niet meer op de aanvrager. Er is geen mail verstuurd.';
}

export async function voerFaseTerug(
  client: DossierSessie,
  aanvraagId: number,
  reden: string,
  actor: Actor,
): Promise<DossierResultaat> {
  const toelichting = reden.trim();
  if (!Number.isInteger(aanvraagId) || aanvraagId <= 0) {
    return { ok: false, melding: 'Deze aanvraag kan niet een fase terug. Er is niets gewijzigd.' };
  }
  if (!toelichting || toelichting.length > 500) {
    return { ok: false, melding: 'Een reden is verplicht. Er is niets gewijzigd.' };
  }
  if (!mag(actor)) return { ok: false, melding: 'Geen recht om een fase terug te zetten.' };

  const aanvraagAntwoord = await client
    .from('aanvragen')
    .select('id,status,naam,start_datum,eind_datum,boeking_id')
    .eq('id', aanvraagId)
    .maybeSingle();
  if (aanvraagAntwoord.error) return { ok: false, melding: leesbareAuthFout(aanvraagAntwoord.error.message) };
  const aanvraag = aanvraagAntwoord.data;
  if (!aanvraag?.id) return { ok: false, melding: 'Aanvraag niet gevonden. Er is niets gewijzigd.' };

  const boekingId = aanvraag.boeking_id == null || aanvraag.boeking_id === '' ? null : Number(aanvraag.boeking_id);
  let boeking: FaseBoeking | null = null;
  if (boekingId != null && Number.isInteger(boekingId)) {
    const boekingAntwoord = await client
      .from('boekingen')
      .select('id,nummer,status,start_datum,eind_datum,interne_titel,huurder_naam_snapshot,aanbetaling_ontvangen,aanvraag_id')
      .eq('id', boekingId)
      .maybeSingle();
    if (boekingAntwoord.error) return { ok: false, melding: leesbareAuthFout(boekingAntwoord.error.message) };
    const rij = boekingAntwoord.data;
    if (rij?.id != null) {
      boeking = {
        id: tekst(rij.id),
        nummer: tekst(rij.nummer),
        status: tekst(rij.status),
        start: tekst(rij.start_datum),
        eind: tekst(rij.eind_datum),
        titel: tekst(rij.interne_titel),
        huurder: tekst(rij.huurder_naam_snapshot),
        aanbetalingBinnen: rij.aanbetaling_ontvangen === true,
        aanvraagId: tekst(rij.aanvraag_id || aanvraag.id),
      };
    }
  }

  const documenten: FaseDocument[] = [];
  const mails: FaseMail[] = [];
  const betalingen: FaseWereld['betalingen'] = [];
  if (boeking) {
    const docs = await rijen(client, 'documenten', 'id,type,bestandsnaam,ingetrokken_op', 'boeking_id', Number(boeking.id));
    if (docs.error) {
      if (/ingetrokken_op/i.test(docs.error.message)) {
        return { ok: false, melding: 'Intrekken van een contract is nog niet beschikbaar in de database. Er is niets gewijzigd.' };
      }
      return { ok: false, melding: leesbareAuthFout(docs.error.message) };
    }
    for (const rij of docs.data) {
      documenten.push({
        boekingId: boeking.id,
        soort: tekst(rij.type),
        naam: tekst(rij.bestandsnaam),
        ingetrokken: rij.ingetrokken_op != null && tekst(rij.ingetrokken_op) !== '',
      });
      (rij as { id?: unknown }).id = rij.id;
    }
    const jobs = await rijen(client, 'communicatie_jobs', 'id,template_sleutel,status', 'boeking_id', Number(boeking.id));
    if (jobs.error && !tabelMist(jobs.error)) return { ok: false, melding: leesbareAuthFout(jobs.error.message) };
    for (const rij of jobs.error ? [] : jobs.data) {
      mails.push({ boekingId: boeking.id, template: tekst(rij.template_sleutel), status: tekst(rij.status) });
    }
    const verzendingen = await rijen(
      client,
      'communicatie_verzendingen',
      'id,template_sleutel,status,test',
      'boeking_id',
      Number(boeking.id),
    );
    if (verzendingen.error && !tabelMist(verzendingen.error)) {
      return { ok: false, melding: leesbareAuthFout(verzendingen.error.message) };
    }
    for (const rij of verzendingen.error ? [] : verzendingen.data) {
      if (rij.test === true) continue;
      mails.push({ boekingId: boeking.id, template: tekst(rij.template_sleutel), status: tekst(rij.status) });
    }
    const geld = await rijen(client, 'betalingen', 'id,soort,status', 'boeking_id', Number(boeking.id));
    if (geld.error && !tabelMist(geld.error)) return { ok: false, melding: leesbareAuthFout(geld.error.message) };
    for (const rij of geld.error ? [] : geld.data) {
      betalingen.push({ boekingId: boeking.id, soort: tekst(rij.soort), status: tekst(rij.status) });
    }
  }

  const status = tekst(aanvraag.status);
  const beeld = beoordeelAanvraag(
    {
      id: tekst(aanvraag.id),
      status,
      naam: tekst(aanvraag.naam),
      start: tekst(aanvraag.start_datum),
      eind: tekst(aanvraag.eind_datum),
      boekingId: boeking?.id,
    },
    {
      aanvragen: [],
      boekingen: boeking ? [boeking] : [],
      documenten,
      mails,
      betalingen,
      blokkades: [],
      activiteiten: [],
    },
  );
  const plan = planFaseTerug(status, beeld);
  if (!plan.kan) {
    return { ok: false, melding: 'Een fase terug kan hier niet. Er is niets gewijzigd.' };
  }

  const nu = new Date().toISOString();
  if (plan.effect === 'contract_intrekken' || plan.effect === 'handtekening_intrekken') {
    if (!boeking) return { ok: false, melding: 'Er is geen boeking bij dit contract. Er is niets gewijzigd.' };
    const vorm = plan.effect === 'contract_intrekken' ? 'contract' : 'getekend';
    const docs = await rijen(client, 'documenten', 'id,type,bestandsnaam,ingetrokken_op', 'boeking_id', Number(boeking.id));
    if (docs.error) return { ok: false, melding: leesbareAuthFout(docs.error.message) };
    const teTrekken = docs.data.filter((rij) => {
      if (rij.ingetrokken_op != null && tekst(rij.ingetrokken_op) !== '') return false;
      return contractDocumentVorm(tekst(rij.type), tekst(rij.bestandsnaam)) === vorm;
    });
    let jobRijen: Rij[] = [];
    let verzendRijen: Rij[] = [];
    let flowRijen: Rij[] = [];
    if (plan.effect === 'contract_intrekken') {
      const jobs = await rijen(client, 'communicatie_jobs', 'id,template_sleutel,status', 'boeking_id', Number(boeking.id));
      if (jobs.error && !tabelMist(jobs.error)) return { ok: false, melding: leesbareAuthFout(jobs.error.message) };
      jobRijen = (jobs.error ? [] : jobs.data)
        .filter((rij) => rij.status === 'verzonden' && contractmail(tekst(rij.template_sleutel)));
      const verzendingen = await rijen(
        client,
        'communicatie_verzendingen',
        'id,template_sleutel,status,test',
        'boeking_id',
        Number(boeking.id),
      );
      if (verzendingen.error && !tabelMist(verzendingen.error)) {
        return { ok: false, melding: leesbareAuthFout(verzendingen.error.message) };
      }
      verzendRijen = (verzendingen.error ? [] : verzendingen.data)
        .filter((rij) => rij.test !== true && rij.status === 'verzonden' && contractmail(tekst(rij.template_sleutel)));
      const flow = await rijen(client, 'contract_verzendingen', 'id,soort,status', 'boeking_id', Number(boeking.id));
      if (flow.error && !tabelMist(flow.error)) return { ok: false, melding: leesbareAuthFout(flow.error.message) };
      flowRijen = (flow.error ? [] : flow.data)
        .filter((rij) => (rij.soort === 'contract' || rij.soort === 'herhaling') && (rij.status === 'verzonden' || rij.status === 'bezig'));
      if (teTrekken.length === 0 && jobRijen.length === 0 && verzendRijen.length === 0 && flowRijen.length === 0) {
        return { ok: false, melding: 'Er was geen verstuurd contract om terug te zetten. Er is niets gewijzigd.' };
      }
    } else {
      const versies = await rijen(client, 'contractversies', 'id,ondertekening', 'boeking_id', Number(boeking.id));
      if (versies.error && !tabelMist(versies.error)) return { ok: false, melding: leesbareAuthFout(versies.error.message) };
      const open = (versies.error ? [] : versies.data).filter((rij) => rij.ondertekening === 'ontvangen');
      if (teTrekken.length === 0 && open.length === 0) {
        return { ok: false, melding: 'Er was geen handtekening om terug te zetten. Er is niets gewijzigd.' };
      }
      for (const rij of open) {
        const fout = await zet(client, 'contractversies', rij.id, {
          ondertekening: 'open',
          ondertekening_actor: null,
          ondertekening_op: null,
          ondertekening_nummer: null,
          ondertekening_versie: null,
        });
        if (fout) return { ok: false, melding: leesbareAuthFout(fout.message) };
      }
    }

    if (plan.effect === 'contract_intrekken') {
      for (const rij of flowRijen) {
        const fout = await zet(client, 'contract_verzendingen', rij.id, { status: 'ingetrokken' });
        if (fout && !tabelMist(fout)) return { ok: false, melding: leesbareAuthFout(fout.message) };
      }
      for (const rij of jobRijen) {
        const fout = await zet(client, 'communicatie_jobs', rij.id, { status: 'geannuleerd' });
        if (fout && !tabelMist(fout)) return { ok: false, melding: leesbareAuthFout(fout.message) };
      }
      for (const rij of verzendRijen) {
        const fout = await zet(client, 'communicatie_verzendingen', rij.id, { status: 'geannuleerd' });
        if (fout && !tabelMist(fout)) return { ok: false, melding: leesbareAuthFout(fout.message) };
      }
      const tekeningen = await rijen(client, 'contract_tekeningen', 'id,ondertekend_op', 'boeking_id', Number(boeking.id));
      if (tekeningen.error && !tabelMist(tekeningen.error)) {
        return { ok: false, melding: leesbareAuthFout(tekeningen.error.message) };
      }
      for (const rij of tekeningen.error ? [] : tekeningen.data) {
        if (rij.ondertekend_op != null && tekst(rij.ondertekend_op) !== '') continue;
        const fout = await zet(client, 'contract_tekeningen', rij.id, { vrijgegeven: false, verloopt_op: nu });
        if (fout && !tabelMist(fout)) return { ok: false, melding: leesbareAuthFout(fout.message) };
      }
    }
    for (const rij of teTrekken) {
      const fout = await zet(client, 'documenten', rij.id, { ingetrokken_op: nu });
      if (fout) return { ok: false, melding: leesbareAuthFout(fout.message) };
    }
  } else if (plan.effect === 'optie_ongedaan') {
    if (!boeking) return { ok: false, melding: 'Er is geen optie om terug te zetten. Er is niets gewijzigd.' };
    const geannuleerd = await annuleerBoekingViaSessie(
      client as AnnuleerSessie,
      Number(boeking.id),
      toelichting,
      actor,
    );
    if (!geannuleerd.ok) return { ok: false, melding: leesbareAuthFout(geannuleerd.melding) };
    const los = await client
      .from('aanvragen')
      .update({ status: 'in_behandeling', boeking_id: null })
      .eq('id', aanvraagId)
      .select('id,status,boeking_id')
      .maybeSingle();
    if (los.error) return { ok: false, melding: leesbareAuthFout(los.error.message) };
    if (los.data?.status !== 'in_behandeling' || los.data.boeking_id != null) {
      return { ok: false, melding: 'De optie is geannuleerd, maar de aanvraag is niet teruggezet.' };
    }
  } else {
    const naar: AanvraagStatus = plan.effect === 'status_nieuw' ? 'nieuw' : 'in_behandeling';
    const poort = magStatusZetten(status as AanvraagStatus, naar, actor.rechten ?? { isSuperAdmin: false, perModule: {} });
    if (!poort.ok) return { ok: false, melding: poort.melding ?? 'Overgang geweigerd. Er is niets gewijzigd.' };
    const gezet = await client.from('aanvragen').update({ status: naar }).eq('id', aanvraagId).select('id,status').maybeSingle();
    if (gezet.error) return { ok: false, melding: leesbareAuthFout(gezet.error.message) };
    if (gezet.data?.status !== naar) return { ok: false, melding: 'De fase is niet teruggezet. Er is niets gewijzigd.' };
  }

  const stempel = createHash('sha256').update(`${aanvraagId}:${plan.effect}:${toelichting}:${nu}`).digest('hex').slice(0, 12);
  await audit(client, actor, {
    actie: 'fase_terug',
    id: String(aanvraagId),
    van: status,
    naar: plan.effect,
    reden: toelichting,
    dedup: `aanvraag:${aanvraagId}:fase_terug:${stempel}`,
  });
  return { ok: true, melding: meldingVan(plan.effect) };
}
