/**
 * Zet een ongetekend contract één fase terug.
 * De verzonden versie blijft bevroren. De tekenlink vervalt.
 * Er gaat geen mail uit.
 */

import { randomBytes } from 'node:crypto';
import { isDefinitieveBoeking } from '../../platform/aanvraag-fase.ts';
import { magSchrijven } from '../../platform/rechten.ts';
import type { Actor } from './kern.ts';
import type { DossierResultaat, DossierSessie } from './dossier-sessie.ts';
import { leesbareAuthFout } from './dossier-sessie.ts';

const CONTRACTMAIL = /contract|huurovereenkomst/i;

type Rij = Record<string, unknown>;

function tekst(waarde: unknown): string {
  return waarde == null ? '' : String(waarde);
}

function isContractmail(template: string): boolean {
  return CONTRACTMAIL.test(template);
}

function getekendDocument(rij: Rij): boolean {
  const soort = tekst(rij.type);
  const naam = tekst(rij.bestandsnaam);
  return soort === 'getekend_contract' || /getekend/i.test(`${soort} ${naam}`);
}

async function lijst(
  client: DossierSessie,
  tabel: string,
  kolommen: string,
  kolom: string,
  waarde: number,
): Promise<{ data: Rij[] } | { fout: string }> {
  const antwoord = await client.from(tabel).select(kolommen).eq(kolom, waarde);
  if (antwoord.error) {
    if (/schema cache|does not exist|42P01/i.test(antwoord.error.message)) return { data: [] };
    return { fout: leesbareAuthFout(antwoord.error.message) };
  }
  return { data: antwoord.data ?? [] };
}

async function zet(
  client: DossierSessie,
  tabel: string,
  waarden: Record<string, unknown>,
  id: unknown,
): Promise<string | null> {
  const antwoord = await client.from(tabel).update(waarden).eq('id', id);
  if (antwoord.error) return leesbareAuthFout(antwoord.error.message);
  return null;
}

export async function trekFaseTerug(
  client: DossierSessie,
  aanvraagId: number,
  actor: Actor,
): Promise<DossierResultaat> {
  const rechten = actor.rechten ?? { isSuperAdmin: false, perModule: {} };
  if (!magSchrijven(rechten, 'aanvragen')) {
    return { ok: false, melding: 'Geen recht om een fase terug te zetten. Er is niets gewijzigd.' };
  }
  if (!Number.isInteger(aanvraagId)) {
    return { ok: false, melding: 'Deze aanvraag kan niet een fase terug. Er is niets gewijzigd.' };
  }
  const aanvraag = await client
    .from('aanvragen')
    .select('id,status,boeking_id')
    .eq('id', aanvraagId)
    .maybeSingle();
  if (aanvraag.error) return { ok: false, melding: leesbareAuthFout(aanvraag.error.message) };
  const boekingId = Number(aanvraag.data?.boeking_id);
  if (!aanvraag.data || !Number.isInteger(boekingId)) {
    return { ok: false, melding: 'Er is nog geen boeking. Er is niets gewijzigd.' };
  }
  const boeking = await client
    .from('boekingen')
    .select('id,status,aanbetaling_ontvangen')
    .eq('id', boekingId)
    .maybeSingle();
  if (boeking.error) return { ok: false, melding: leesbareAuthFout(boeking.error.message) };
  if (!boeking.data) return { ok: false, melding: 'De boeking is niet gevonden. Er is niets gewijzigd.' };
  if (isDefinitieveBoeking(tekst(boeking.data.status))) {
    return { ok: false, melding: 'Een definitieve boeking gaat niet een fase terug. Er is niets gewijzigd.' };
  }
  if (boeking.data.aanbetaling_ontvangen === true) {
    return { ok: false, melding: 'De aanbetaling is al ontvangen. Er is niets gewijzigd.' };
  }

  const documenten = await lijst(client, 'documenten', 'id,type,bestandsnaam', 'boeking_id', boekingId);
  if ('fout' in documenten) return { ok: false, melding: documenten.fout };
  if (documenten.data.some(getekendDocument)) {
    return { ok: false, melding: 'Het contract is al ondertekend. Er is niets gewijzigd.' };
  }
  const versies = await lijst(client, 'contractversies', 'versie,ondertekening', 'boeking_id', boekingId);
  if ('fout' in versies) return { ok: false, melding: versies.fout };
  if (versies.data.some((rij) => tekst(rij.ondertekening) === 'ontvangen')) {
    return { ok: false, melding: 'Het contract is al ondertekend. Er is niets gewijzigd.' };
  }
  const tekeningen = await lijst(client, 'contract_tekeningen', 'id,ondertekend_op', 'boeking_id', boekingId);
  if ('fout' in tekeningen) return { ok: false, melding: tekeningen.fout };
  if (tekeningen.data.some((rij) => tekst(rij.ondertekend_op))) {
    return { ok: false, melding: 'Het contract is al ondertekend. Er is niets gewijzigd.' };
  }
  const verzendingen = await lijst(client, 'contract_verzendingen', 'id,soort,status', 'boeking_id', boekingId);
  if ('fout' in verzendingen) return { ok: false, melding: verzendingen.fout };
  const mailsBoeking = await lijst(client, 'communicatie_verzendingen', 'id,status,template_sleutel,test', 'boeking_id', boekingId);
  if ('fout' in mailsBoeking) return { ok: false, melding: mailsBoeking.fout };
  const mailsAanvraag = await lijst(client, 'communicatie_verzendingen', 'id,status,template_sleutel,test', 'aanvraag_id', aanvraagId);
  if ('fout' in mailsAanvraag) return { ok: false, melding: mailsAanvraag.fout };
  const jobsBoeking = await lijst(client, 'communicatie_jobs', 'id,status,template_sleutel', 'boeking_id', boekingId);
  if ('fout' in jobsBoeking) return { ok: false, melding: jobsBoeking.fout };
  const jobsAanvraag = await lijst(client, 'communicatie_jobs', 'id,status,template_sleutel', 'aanvraag_id', aanvraagId);
  if ('fout' in jobsAanvraag) return { ok: false, melding: jobsAanvraag.fout };

  const openVerzending = verzendingen.data.filter((rij) => {
    const soort = tekst(rij.soort);
    const status = tekst(rij.status);
    return (soort === 'contract' || soort === 'herhaling') && (status === 'verzonden' || status === 'bezig');
  });
  const contractMails = [...mailsBoeking.data, ...mailsAanvraag.data].filter((rij) => {
    return tekst(rij.status) === 'verzonden' && rij.test !== true && isContractmail(tekst(rij.template_sleutel));
  });
  const contractJobs = [...jobsBoeking.data, ...jobsAanvraag.data].filter((rij) => {
    return tekst(rij.status) === 'verzonden' && isContractmail(tekst(rij.template_sleutel));
  });
  const contractDocumenten = documenten.data.filter((rij) => tekst(rij.type) === 'contract');
  if (openVerzending.length + contractMails.length + contractJobs.length + contractDocumenten.length + tekeningen.data.length === 0) {
    return { ok: false, melding: 'Er staat geen open contractverzending. Er is niets gewijzigd.' };
  }

  for (const rij of openVerzending) {
    const fout = await zet(client, 'contract_verzendingen', { status: 'ingetrokken' }, rij.id);
    if (fout) return { ok: false, melding: fout };
  }
  for (const rij of tekeningen.data) {
    const fout = await zet(client, 'contract_tekeningen', {
      verloopt_op: '1970-01-01T00:00:00.000Z',
      token_hash: randomBytes(32).toString('hex'),
      code_hash: null,
      code_verloopt: null,
      geverifieerd_op: null,
    }, rij.id);
    if (fout) return { ok: false, melding: fout };
  }
  const mailIds = new Set<string>();
  for (const rij of contractMails) {
    const id = tekst(rij.id);
    if (mailIds.has(id)) continue;
    mailIds.add(id);
    const fout = await zet(client, 'communicatie_verzendingen', {
      status: 'geannuleerd',
      foutmelding: 'Ingetrokken: één fase terug',
    }, rij.id);
    if (fout) return { ok: false, melding: fout };
  }
  const jobIds = new Set<string>();
  for (const rij of contractJobs) {
    const id = tekst(rij.id);
    if (jobIds.has(id)) continue;
    jobIds.add(id);
    const fout = await zet(client, 'communicatie_jobs', {
      status: 'geannuleerd',
      foutmelding: 'Ingetrokken: één fase terug',
    }, rij.id);
    if (fout) return { ok: false, melding: fout };
  }
  for (const rij of contractDocumenten) {
    const fout = await zet(client, 'documenten', { type: 'overig' }, rij.id);
    if (fout) return { ok: false, melding: fout };
  }
  await client.from('auditlog').insert({
    actor_id: actor.id && /^[0-9a-f-]{36}$/i.test(actor.id) ? actor.id : null,
    actor_naam: actor.naam,
    actor_type: actor.type,
    onderwerp_type: 'aanvraag',
    onderwerp_id: String(aanvraagId),
    actie: 'fase_terug',
    van: 'Wachten op ondertekening',
    naar: 'Contract verzenden',
    reden: 'Ongetekend contract ingetrokken',
    dedup_sleutel: `aanvraag:${aanvraagId}:fase_terug:${Date.now()}`,
  });
  return {
    ok: true,
    melding: 'Het contract is ingetrokken. De tekenlink werkt niet meer. De volgende actie is Contract verzenden. Maak een nieuwe versie. Er is geen mail verstuurd.',
  };
}
