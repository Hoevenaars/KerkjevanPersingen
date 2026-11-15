/**
 * Bewaart een definitief contract bij de boeking.
 * De aanvraagstatus blijft staan. Er gaat geen mail uit.
 */

import { ymdInAmsterdam } from '../../platform/datum.ts';
import { HUISREGELS_V1, PLATTEGROND_V1, VOORWAARDEN_V1 } from '../../platform/documenten/teksten-v1.ts';
import { leesbareAuthFout } from './dossier-sessie.ts';
import { magContractBeheren } from '../../platform/documentenflow.ts';
import {
  euroNaarCent,
  maakDefinitiefContract,
  type ContractWizardVelden,
} from '../../platform/contract-wizard.ts';
import type { Actor } from './kern.ts';

type Fout = { message: string } | null;

interface Query extends PromiseLike<{ data: Record<string, unknown>[] | null; error: Fout }> {
  select: (kolommen: string) => Query;
  eq: (kolom: string, waarde: unknown) => Query;
  order: (kolom: string, opties?: { ascending?: boolean }) => Query;
  limit: (aantal: number) => Query;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: Fout }>;
}

export interface ContractWizardSessie {
  from: (tabel: string) => {
    select: (kolommen: string) => Query;
    update: (waarden: Record<string, unknown>) => Query;
    insert: (rij: Record<string, unknown>) => Query;
    upsert: (rij: Record<string, unknown>) => Query;
  };
}

export interface ContractWizardStand {
  definitief: boolean;
  nummer: string;
  versie: number;
  velden: Partial<ContractWizardVelden> | null;
  vingerafdruk: string;
}

export async function leesContractWizardStand(
  client: ContractWizardSessie,
  boekingId: number,
): Promise<ContractWizardStand | { mist: true } | { fout: string }> {
  const antwoord = await client
    .from('contractversies')
    .select('versie,contractnummer,vingerafdruk,afspraken,bestuur_verplicht,bestuur')
    .eq('boeking_id', boekingId)
    .order('versie', { ascending: false })
    .limit(1);
  if (antwoord.error) {
    if (/does not exist|schema cache|42P01|contractversies/i.test(antwoord.error.message)) return { mist: true };
    return { fout: leesbareAuthFout(antwoord.error.message) };
  }
  const rij = antwoord.data?.[0];
  if (!rij) return { definitief: false, nummer: '', versie: 0, velden: null, vingerafdruk: '' };
  const definitief = Boolean(String(rij.contractnummer ?? '').trim());
  const afspraken = rij.afspraken && typeof rij.afspraken === 'object' ? rij.afspraken as { wizard?: unknown } : {};
  return {
    definitief,
    nummer: String(rij.contractnummer ?? ''),
    versie: Number(rij.versie) || 0,
    velden: wizardVeldenUit(afspraken.wizard),
    vingerafdruk: String(rij.vingerafdruk ?? ''),
  };
}

function wizardVeldenUit(waarde: unknown): Partial<ContractWizardVelden> | null {
  if (!waarde || typeof waarde !== 'object') return null;
  const bron = waarde as Record<string, unknown>;
  const velden: Partial<ContractWizardVelden> = {};
  for (const [sleutel, item] of Object.entries(bron)) {
    if (typeof item === 'string') velden[sleutel as keyof ContractWizardVelden] = item;
  }
  return velden;
}

export async function bewaarDefinitiefContract(
  client: ContractWizardSessie,
  input: { boekingId: number; aanvraagId: number | null; velden: ContractWizardVelden; actor: Actor },
): Promise<{ ok: boolean; melding: string; nummer?: string }> {
  if (!magContractBeheren(input.actor.rechten ?? { isSuperAdmin: false, perModule: {} })) {
    return { ok: false, melding: 'Geen recht om een contract definitief te maken. Er is niets opgeslagen.' };
  }
  const velden: ContractWizardVelden = { ...input.velden, iban: input.velden.iban.replace(/\s+/g, '').toUpperCase() };
  input = { ...input, velden };
  const stand = await leesContractWizardStand(client, input.boekingId);
  if ('fout' in stand) return { ok: false, melding: stand.fout };
  if ('mist' in stand) return { ok: false, melding: 'De contracttabel ontbreekt. Er is niets opgeslagen.' };
  const versie = stand.versie + 1;
  const gemaakt = maakDefinitiefContract(input.velden, String(input.boekingId), versie, ymdInAmsterdam(new Date()));
  if ('fout' in gemaakt) return { ok: false, melding: gemaakt.fout };
  if (stand.definitief && stand.vingerafdruk === gemaakt.vingerafdruk) {
    return { ok: true, melding: `Contract ${stand.nummer} is al opgeslagen. Er is geen mail verstuurd.`, nummer: stand.nummer };
  }
  const vandaag = ymdInAmsterdam(new Date());
  const insert = await client.from('contractversies').insert({
    boeking_id: input.boekingId,
    versie,
    contractnummer: gemaakt.nummer,
    opgesteld_op: vandaag,
    tekst: gemaakt.tekst,
    voorwaarden_tekst: VOORWAARDEN_V1,
    huisregels_tekst: HUISREGELS_V1,
    plattegrond_tekst: PLATTEGROND_V1,
    vingerafdruk: gemaakt.vingerafdruk,
    afspraken: { ...gemaakt.afspraken, wizard: input.velden },
    bestuur_verplicht: true,
    bestuur: 'open',
  }).select('id').maybeSingle();
  if (insert.error || !insert.data?.id) {
    const reden = insert.error ? leesbareAuthFout(insert.error.message) : 'De contractversie is niet opgeslagen.';
    return { ok: false, melding: `${reden} Er is niets definitief gemaakt.` };
  }
  const huur = euroNaarCent(input.velden.huurprijs);
  const aan = euroNaarCent(input.velden.aanbetaling);
  const boekingBijgewerkt = await client.from('boekingen').update({
    tarief_bedrag: huur == null ? null : huur / 100,
    aanbetaling_bedrag: aan == null ? null : aan / 100,
    aantal_personen: input.velden.personen.trim() || null,
    start_datum: input.velden.periodeVan,
    eind_datum: input.velden.periodeTot,
    huurder_naam_snapshot: input.velden.naam.trim(),
    huurder_email_snapshot: input.velden.email.trim(),
    huurder_telefoon_snapshot: input.velden.telefoon.trim() || null,
    interne_titel: input.velden.activiteit.trim(),
    bijgewerkt_op: new Date().toISOString(),
  }).eq('id', input.boekingId);
  if (boekingBijgewerkt.error) {
    return {
      ok: true,
      melding: `Contract ${gemaakt.nummer} is opgeslagen. De boeking zelf is niet bijgewerkt. Het bestuur keurt deze versie nog goed. Er is geen mail verstuurd.`,
      nummer: gemaakt.nummer,
    };
  }
  if (input.aanvraagId) {
    await client.from('aanvragen').update({
      naam: input.velden.naam.trim(),
      email: input.velden.email.trim(),
      telefoon: input.velden.telefoon.trim() || null,
      straat: input.velden.straat.trim(),
      huisnummer: input.velden.huisnummer.trim(),
      huisnummer_toevoeging: input.velden.toevoeging.trim() || null,
      postcode: input.velden.postcode.trim(),
      woonplaats: input.velden.woonplaats.trim(),
      aantal_personen: input.velden.personen.trim() || null,
    }).eq('id', input.aanvraagId);
  }
  const instellingen = [
    ['documentenflow_ondertekenaar_naam', input.velden.ondertekenaarNaam.trim(), 'Bevoegde ondertekenaar'],
    ['documentenflow_ondertekenaar_functie', input.velden.ondertekenaarFunctie.trim(), 'Functie van de ondertekenaar'],
    ['documentenflow_iban', input.velden.iban, 'IBAN voor verhuur'],
    ['documentenflow_tenaamstelling', input.velden.tenaamstelling.trim(), 'Tenaamstelling van de huurrekening'],
    ['documentenflow_voorwaarden_vastgesteld_op', input.velden.voorwaardenVastgesteldOp, 'Datum formele vaststelling voorwaarden'],
    ['documentenflow_huisregels_vastgesteld_op', input.velden.huisregelsVastgesteldOp, 'Datum formele vaststelling huisregels'],
  ] as const;
  for (const [sleutel, waarde, toelichting] of instellingen) {
    await client.from('instellingen').upsert({ sleutel, groep: 'documentenflow', waarde, toelichting });
  }
  return {
    ok: true,
    melding: `Contract ${gemaakt.nummer} is opgeslagen. Het bestuur keurt deze versie nog goed. Er is geen mail verstuurd.`,
    nummer: gemaakt.nummer,
  };
}
