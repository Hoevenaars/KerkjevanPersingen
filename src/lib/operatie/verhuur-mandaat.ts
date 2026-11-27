import type { DossierSessie } from './dossier-sessie.ts';

export interface VerhuurMandaat {
  aanvraagId: number;
  boekingId: number;
  aanvraagVersie: string;
  huurprijsEuro: number;
  prijsBron: 'tarief' | 'bestuur';
  actorLabel: string;
  beleid: Record<string, unknown>;
  contractProfiel: unknown;
  vastgelegdOp: string;
}

/** De database bewijst de service-bevoegdheid; een actornaam of ingevuld bedrag doet dat niet. */
export async function leesGecontroleerdMandaat(client: DossierSessie, aanvraagId: number, boekingId: number): Promise<
  { ok: true; mandaat: VerhuurMandaat } | { ok: false; melding: string }
> {
  if (!client.rpc || !Number.isSafeInteger(aanvraagId) || aanvraagId <= 0 || !Number.isSafeInteger(boekingId) || boekingId <= 0) {
    return { ok: false, melding: 'Het dossier heeft geen controleerbaar uitvoeringsmandaat.' };
  }
  const recht = await client.rpc('verhuur_machine_mag', { p_boeking_id: boekingId, p_aanvraag_id: aanvraagId });
  if (recht.error || recht.data !== true) return { ok: false, melding: 'Het bestuursmandaat is niet meer geldig voor deze aanvraag, datum of prijs.' };
  const gelezen = await client.from('verhuur_besluiten')
    .select('aanvraag_id,boeking_id,aanvraag_versie,besluit,status,huurprijs_euro,prijs_bron,actor_label,beleid,contract_profiel,vastgelegd_op')
    .eq('aanvraag_id', aanvraagId).maybeSingle();
  const r = gelezen.data;
  if (gelezen.error || !r || r.besluit !== 'ja' || r.status !== 'toegewezen' || Number(r.boeking_id) !== boekingId ||
      !String(r.aanvraag_versie ?? '') || !['tarief', 'bestuur'].includes(String(r.prijs_bron)) ||
      !Number.isFinite(Number(r.huurprijs_euro)) || Number(r.huurprijs_euro) <= 0 || !Number.isFinite(Date.parse(String(r.vastgelegd_op ?? '')))) {
    return { ok: false, melding: 'Het goedgekeurde prijsmandaat is onvolledig.' };
  }
  return { ok: true, mandaat: {
    aanvraagId, boekingId, aanvraagVersie: String(r.aanvraag_versie), huurprijsEuro: Number(r.huurprijs_euro),
    prijsBron: r.prijs_bron as 'tarief' | 'bestuur', actorLabel: String(r.actor_label ?? ''),
    beleid: r.beleid && typeof r.beleid === 'object' && !Array.isArray(r.beleid) ? r.beleid as Record<string, unknown> : {},
    contractProfiel: r.contract_profiel,
    vastgelegdOp: String(r.vastgelegd_op),
  } };
}
