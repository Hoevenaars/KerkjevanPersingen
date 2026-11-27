import { magSchrijven } from '../../platform/rechten.ts';
import type { VerhuurBeoordeling } from '../../platform/verhuur-beoordeling.ts';
import { dossierUitBron, type MachineClient, type Rij } from '../verhuurmachine/beoordeling.ts';
import type { Actor } from './kern.ts';

const hash = (waarde: unknown): waarde is string => typeof waarde === 'string' && /^[a-f0-9]{64}$/.test(waarde);
const object = (waarde: unknown): Rij => waarde && typeof waarde === 'object' && !Array.isArray(waarde) ? waarde as Rij : {};

export interface MachineConceptBeoordeling {
  aanvraagVersie: string;
  bronVersie: string;
  snapshotHash: string;
  goedgekeurdeBronVersie: string | null;
  /** id, boeking_id, versie, contractnummer, opgesteld_op, tekst en de vaste bijlageteksten. */
  contract: Rij;
  /** Exact opgeslagen formulier: huurprijs/aanbetaling, vervaldagen, tijden, opbouw/afbouw en bijzondereAfspraken. */
  wizard: Rij;
  /** Exacte bestaande termijnen: id, soort, bedrag, vervaldatum en factuur_op. */
  betalingen: Rij[];
  beoordeling: VerhuurBeoordeling;
  toelaatbaar: boolean;
  blokkade: string | null;
  eigenaar: string;
  opvolgenVoor: string | null;
}

/** De hash omvat de getoonde tekst, prijs, termijnen én de actuele waarschuwingenbron. */
export async function leesMachineConceptBeoordeling(
  client: MachineClient, aanvraagId: number, contractversieId: number,
): Promise<MachineConceptBeoordeling> {
  if (!Number.isSafeInteger(aanvraagId) || aanvraagId <= 0 || !Number.isSafeInteger(contractversieId) || contractversieId <= 0) {
    throw new Error('Een concreet dossier en contractversie zijn verplicht.');
  }
  const r = await client.rpc('verhuur_concept_beoordelingsbron', {
    p_aanvraag_id: aanvraagId, p_contractversie_id: contractversieId,
  });
  if (r.error || !r.data) throw new Error(r.error?.message || 'De conceptbeoordeling kon niet worden geladen.');
  const bron = object(r.data), contract = object(bron.contract), wizard = object(bron.wizard);
  if (!hash(bron.aanvraag_versie) || !hash(bron.bron_versie) || !hash(bron.snapshot_hash) ||
      Number(contract.id) !== contractversieId || typeof bron.toelaatbaar !== 'boolean' || !Array.isArray(bron.betalingen)) {
    throw new Error('De contractpreview is onvolledig. Er kan geen mandaat worden vastgelegd.');
  }
  const dossier = dossierUitBron(object(bron.beoordelingsbron));
  if (Number(dossier.aanvraagRij.id) !== aanvraagId || dossier.aanvraagVersie !== bron.aanvraag_versie) {
    throw new Error('De contractpreview hoort niet bij de actuele aanvraag.');
  }
  return {
    aanvraagVersie: bron.aanvraag_versie, bronVersie: bron.bron_versie, snapshotHash: bron.snapshot_hash,
    goedgekeurdeBronVersie: object(bron.huidig_besluit).status === 'toegewezen' &&
      Number(object(bron.huidig_besluit).contractversie_id) === contractversieId &&
      object(bron.huidig_besluit).aanvraag_versie === bron.aanvraag_versie && hash(object(bron.huidig_besluit).concept_bron_versie)
      ? String(object(bron.huidig_besluit).concept_bron_versie) : null,
    contract, wizard, betalingen: bron.betalingen as Rij[], beoordeling: dossier.beoordeling,
    toelaatbaar: bron.toelaatbaar, blokkade: typeof bron.blokkade === 'string' ? bron.blokkade : null,
    eigenaar: String(bron.eigenaar || 'Bestuur en penningmeester'),
    opvolgenVoor: typeof bron.opvolgen_voor === 'string' ? bron.opvolgen_voor : null,
  };
}

export async function keurMachineConceptGoed(input: {
  client: MachineClient; actor: Actor; aanvraagId: number; contractversieId: number;
  aanvraagVersie: string; bronVersie: string; reden: string;
}): Promise<{ ok: boolean; melding: string; wachtOpMens?: boolean; boekingId?: number; revisie?: number;
  eigenaar?: string; opvolgenVoor?: string }> {
  const rechten = input.actor.rechten ?? { isSuperAdmin: false, perModule: {} };
  if (input.actor.type !== 'gebruiker' || !input.actor.id ||
      !magSchrijven(rechten, 'aanvragen') || !magSchrijven(rechten, 'instellingen')) {
    return { ok: false, melding: 'Alleen een ingelogde bestuurder kan dit concrete concept goedkeuren.' };
  }
  if (!hash(input.aanvraagVersie) || !hash(input.bronVersie) || input.reden.trim().length < 20 || input.reden.length > 2000) {
    return { ok: false, melding: 'Bekijk de actuele conceptafspraken en leg een reden van minimaal 20 tekens vast.' };
  }
  try {
    const preview = await leesMachineConceptBeoordeling(input.client, input.aanvraagId, input.contractversieId);
    if (preview.aanvraagVersie !== input.aanvraagVersie ||
        (preview.bronVersie !== input.bronVersie && preview.goedgekeurdeBronVersie !== input.bronVersie)) {
      return { ok: false, melding: 'Concept, termijnen of waarschuwingen zijn gewijzigd. Bekijk de actuele beoordeling opnieuw.' };
    }
    const b = preview.beoordeling;
    const onvolledig = b.meldingen.find(m => ['periode_onvolledig', 'beleid_onvolledig'].includes(m.code));
    if (onvolledig) return { ok: false, melding: onvolledig.tekst, wachtOpMens: true };
    const uit = await input.client.rpc('verhuur_keur_concept_goed', {
      p_aanvraag_id: input.aanvraagId, p_contractversie_id: input.contractversieId,
      p_aanvraag_versie: input.aanvraagVersie, p_bron_versie: input.bronVersie, p_reden: input.reden.trim(),
      p_waarschuwingen: [...b.conflicts, ...b.historieWaarschuwingen, ...b.meldingen],
      p_beleid: { ...b.beleid, afwijking18Maanden: b.historieWaarschuwingen.length > 0, waarschuwingen: b.historieWaarschuwingen },
    });
    if (uit.error || !uit.data) return { ok: false, melding: uit.error?.message || 'Het conceptbesluit is niet opgeslagen.' };
    const r = object(uit.data);
    if (typeof r.ok !== 'boolean' || !Number.isSafeInteger(Number(r.boekingId)) || Number(r.boekingId) <= 0) {
      return { ok: false, melding: 'De database heeft de conceptgoedkeuring niet eenduidig bevestigd. Controleer het dossier.', wachtOpMens: true };
    }
    return { ok: r.ok, melding: String(r.melding || (r.ok ? 'Concept goedgekeurd.' : 'Menselijke opvolging vereist.')),
      wachtOpMens: r.wachtOpMens === true, boekingId: Number(r.boekingId),
      ...(Number.isInteger(r.revisie) ? { revisie: Number(r.revisie) } : {}),
      ...(typeof r.eigenaar === 'string' ? { eigenaar: r.eigenaar } : {}),
      ...(typeof r.opvolgenVoor === 'string' ? { opvolgenVoor: r.opvolgenVoor } : {}),
    };
  } catch (fout) {
    return { ok: false, melding: fout instanceof Error ? fout.message : 'De conceptbeoordeling is niet opgeslagen.' };
  }
}
