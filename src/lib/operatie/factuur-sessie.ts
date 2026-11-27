/** Facturatie gebruikt betalingen en instellingen; schrijft pas bij bestuursakkoord. */
import { BETALING_DICHT } from '../../platform/betalingscommunicatie.ts';
import { ymdInAmsterdam } from '../../platform/datum.ts';
import { factuurSnapshotFout, vasteContractbedragenFout, kiesFactuurVanMoment, type BtwRegime, type FactuurSnapshot } from '../../platform/factuur-van-moment.ts';
import type { FlowContext, ContractVersie } from '../../platform/documentenflow.ts';
import type { DossierSessie } from './dossier-sessie.ts';

type Resultaat = { ok: true; factuur: FactuurSnapshot; id: number | null; eerderVerzonden?: boolean } | { ok: false; melding: string };

function s(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}
function cent(v: unknown): number {
  if (typeof v === 'string' || typeof v === 'number') {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.round(n * 100);
  }
  return NaN;
}

/** Read-only, voor de tweede Ja. Geen factuurnummer en geen databasewijziging. */
export async function bekijkFactuurConcept(client: DossierSessie, context: FlowContext, versie: ContractVersie): Promise<Resultaat> {
  const [regelsAntwoord, instAntwoord, contractAntwoord, boekingAntwoord] = await Promise.all([
    client.from('betalingen').select('id,soort,bedrag,status,vervaldatum').eq('boeking_id', Number(context.bron.boekingId)),
    client.from('instellingen').select('sleutel,waarde'),
    client.from('contractversies').select('afspraken').eq('boeking_id', Number(context.bron.boekingId)).eq('versie', versie.versie).maybeSingle(),
    client.from('boekingen').select('nummer').eq('id', Number(context.bron.boekingId)).maybeSingle(),
  ]);
  if (regelsAntwoord.error || instAntwoord.error || contractAntwoord.error || !contractAntwoord.data || boekingAntwoord.error || !boekingAntwoord.data) return { ok: false, melding: 'Betaalregels, contractversie of factuurinstellingen konden niet worden gelezen.' };
  const regels = (regelsAntwoord.data ?? []).map((r) => ({
    id: Number(r.id), soort: s(r.soort), bedrag: Number(r.bedrag), status: s(r.status), vervaldatum: s(r.vervaldatum).slice(0, 10),
  }));
  const moment = kiesFactuurVanMoment({
    huurprijsCent: context.bron.huurprijsCent ?? NaN,
    aanbetalingCent: context.bron.aanbetalingCent ?? NaN,
    regels,
    vandaag: ymdInAmsterdam(new Date()),
  });
  if (!moment.ok) return moment;
  const wizard = (contractAntwoord.data.afspraken && typeof contractAntwoord.data.afspraken === 'object'
    ? (contractAntwoord.data.afspraken as { wizard?: unknown }).wizard : null) ?? null;
  const wizardVelden = wizard && typeof wizard === 'object' && !Array.isArray(wizard)
    ? wizard as Record<string, unknown> : {};
  const bevrorenFout = vasteContractbedragenFout({
    wizard, huurprijsCent: context.bron.huurprijsCent ?? NaN,
    aanbetalingCent: context.bron.aanbetalingCent ?? NaN,
    aanbetalingVerval: context.bron.aanbetalingVerval,
    restVerval: context.bron.restVerval,
    periodeVan: context.bron.periodeVan, periodeTot: context.bron.periodeTot,
  });
  if (bevrorenFout) return { ok: false, melding: bevrorenFout };
  const instellingen = new Map((instAntwoord.data ?? []).map((r) => [s(r.sleutel), s(r.waarde)]));
  const lees = (sleutel: string) => instellingen.get(sleutel) ?? '';
  const regime = lees('factuur_btw_regime') as BtwRegime;
  const bruto = moment.moment.bedragCent;
  const tarief = regime === 'belast_21' ? 21 : regime === 'belast_9' ? 9 : 0;
  const excl = Math.round(bruto / (1 + tarief / 100));
  const bron = context.bron;
  const factuur: FactuurSnapshot = {
    factuurnummer: '',
    factuurdatum: ymdInAmsterdam(new Date()),
    vervaldatum: moment.moment.vervaldatum,
    fase: moment.moment.fase,
    bedragCent: bruto,
    exclusiefCent: excl,
    btwCent: bruto - excl,
    btwRegime: regime,
    btwNummer: lees('factuur_btw_nummer'),
    btwToelichting: lees('factuur_btw_toelichting'),
    verhuurderNaam: lees('factuur_verhuurder_naam'),
    verhuurderAdres: lees('factuur_verhuurder_adres'),
    verhuurderKvk: lees('factuur_kvk'),
    verhuurderIban: context.instellingen.iban,
    huurderNaam: s(wizardVelden.naam),
    huurderAdres: `${s(wizardVelden.straat)} ${s(wizardVelden.huisnummer)}${s(wizardVelden.toevoeging) ? ` ${s(wizardVelden.toevoeging)}` : ''}, ${s(wizardVelden.postcode)} ${s(wizardVelden.woonplaats)}`.trim(),
    omschrijving: `Verhuur Kerkje van Persingen - ${bron.activiteit}`,
    contractnummer: versie.contractnummer,
    boekingsnummer: s(boekingAntwoord.data.nummer),
    periodeVan: bron.periodeVan,
    periodeTot: bron.periodeTot,
  };
  const fout = factuurSnapshotFout(factuur, true);
  if (fout || !s(wizardVelden.straat) || !s(wizardVelden.huisnummer) || !s(wizardVelden.postcode) || !s(wizardVelden.woonplaats)) {
    return { ok: false, melding: `${fout ?? 'Het factuuradres van de huurder ontbreekt.'} Vul de fiscale gegevens aan vóór het contractbesluit.` };
  }
  return { ok: true, factuur, id: null };
}

/** De RPC garandeert één nummer per betaalregel en bevriest de fiscale waarden. */
export async function geefFactuurVoorContract(
  client: DossierSessie,
  context: FlowContext,
  versie: ContractVersie,
  opties?: { betalingscommunicatieAan?: boolean },
): Promise<Resultaat> {
  if (opties?.betalingscommunicatieAan !== true) return { ok: false, melding: BETALING_DICHT };
  if (!client.rpc) return { ok: false, melding: 'De factuurmigratie of databaseverbinding ontbreekt. Er is niets verzonden.' };
  const antwoord = await client.rpc('factuur_bij_contract', { p_boeking_id: Number(context.bron.boekingId), p_versie: versie.versie });
  const payload = Array.isArray(antwoord.data) && antwoord.data.length === 1 ? antwoord.data[0] : antwoord.data;
  if (antwoord.error || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, melding: `Er is geen verifieerbare factuur uitgegeven: ${antwoord.error?.message ?? 'geen data'}. Er is geen mail verstuurd.` };
  }
  const r = payload as Record<string, unknown>;
  const factuur: FactuurSnapshot = {
    factuurnummer: s(r.factuurnummer),
    factuurdatum: s(r.factuurdatum).slice(0, 10),
    vervaldatum: s(r.vervaldatum).slice(0, 10),
    fase: r.fase === 'aanbetaling' ? 'aanbetaling' : 'restant',
    bedragCent: cent(r.bedrag),
    exclusiefCent: cent(r.exclusief_btw),
    btwCent: cent(r.btw_bedrag),
    btwRegime: s(r.btw_regime) as BtwRegime,
    btwNummer: s(r.btw_nummer),
    btwToelichting: s(r.btw_toelichting),
    verhuurderNaam: s(r.verhuurder_naam),
    verhuurderAdres: s(r.verhuurder_adres),
    verhuurderKvk: s(r.verhuurder_kvk),
    verhuurderIban: s(r.verhuurder_iban),
    huurderNaam: s(r.huurder_naam),
    huurderAdres: s(r.huurder_adres),
    omschrijving: s(r.omschrijving),
    contractnummer: s(r.contractnummer),
    boekingsnummer: s(r.boekingsnummer),
    periodeVan: s(r.periode_van).slice(0, 10),
    periodeTot: s(r.periode_tot).slice(0, 10),
  };
  const id = Number(r.id);
  const fout = factuurSnapshotFout(factuur);
  if (!Number.isSafeInteger(id) || id <= 0 || fout || factuur.contractnummer !== versie.contractnummer ||
      Number(r.boeking_id) !== Number(context.bron.boekingId) || Number(r.contract_versie) !== versie.versie) {
    return { ok: false, melding: 'De uitgegeven factuur is onvolledig of hoort niet bij deze contractversie. Er is niets gemaild.' };
  }
  return { ok: true, factuur, id, eerderVerzonden: Boolean(s(r.provider_bericht_id)) };
}

export async function markeerFactuurVerzonden(client: DossierSessie, factuurId: number, berichtId: string, pdfPad: string, sha256: string): Promise<boolean> {
  if (!client.rpc) return false;
  const antwoord = await client.rpc('factuur_markeer_verzonden', {
    p_factuur_id: factuurId, p_bericht_id: berichtId, p_pdf_pad: pdfPad, p_pdf_sha256: sha256,
  });
  return !antwoord.error;
}

/** De nieuwe pakketflow staat standaard uit totdat de fiscale inrichting in staging is goedgekeurd. */
export function factuurpakketAan(env: Record<string, unknown>): boolean {
  return env.FACTUURPAKKET_V3 === 'true';
}

/** Latere betaaltermijn: dezelfde fiscale snapshot en unieke nummering als het contractpakket. */
export async function geefFactuurVoorTermijn(client: DossierSessie, input: {
  boekingId: number; versie: number; betalingId: number; betalingscommunicatieAan: boolean;
}): Promise<Resultaat> {
  if (!input.betalingscommunicatieAan) return { ok: false, melding: BETALING_DICHT };
  if (!client.rpc) return { ok: false, melding: 'De veilige termijnfactuurfunctie ontbreekt.' };
  const antwoord = await client.rpc('factuur_voor_termijn', {
    p_boeking_id: input.boekingId, p_versie: input.versie, p_betaling_id: input.betalingId,
  });
  const r = (Array.isArray(antwoord.data) ? antwoord.data[0] : antwoord.data) as Record<string, unknown> | null;
  if (antwoord.error || !r || Number(r.boeking_id) !== input.boekingId || Number(r.contract_versie) !== input.versie || Number(r.betaling_id) !== input.betalingId) {
    return { ok: false, melding: antwoord.error?.message || 'De termijnfactuur is niet bevestigd door de database.' };
  }
  return factuurVanRij(r);
}

export function factuurVanRij(r: Record<string, unknown>): Resultaat {
  const factuur: FactuurSnapshot = {
    factuurnummer: s(r.factuurnummer), factuurdatum: s(r.factuurdatum).slice(0, 10), vervaldatum: s(r.vervaldatum).slice(0, 10),
    fase: r.fase === 'aanbetaling' ? 'aanbetaling' : 'restant', bedragCent: cent(r.bedrag),
    exclusiefCent: cent(r.exclusief_btw), btwCent: cent(r.btw_bedrag), btwRegime: s(r.btw_regime) as BtwRegime,
    btwNummer: s(r.btw_nummer), btwToelichting: s(r.btw_toelichting),
    verhuurderNaam: s(r.verhuurder_naam), verhuurderAdres: s(r.verhuurder_adres), verhuurderKvk: s(r.verhuurder_kvk), verhuurderIban: s(r.verhuurder_iban),
    huurderNaam: s(r.huurder_naam), huurderAdres: s(r.huurder_adres), omschrijving: s(r.omschrijving),
    contractnummer: s(r.contractnummer), boekingsnummer: s(r.boekingsnummer), periodeVan: s(r.periode_van), periodeTot: s(r.periode_tot),
  };
  const fout = factuurSnapshotFout(factuur);
  const id = Number(r.id);
  if (fout || !Number.isSafeInteger(id) || id <= 0) return { ok: false, melding: fout ?? 'Ongeldig factuur-id.' };
  return { ok: true, factuur, id, eerderVerzonden: Boolean(s(r.provider_bericht_id)) };
}
