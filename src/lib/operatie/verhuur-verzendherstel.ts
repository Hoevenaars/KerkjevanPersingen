import { createHash } from 'node:crypto';
import { magSchrijven } from '../../platform/rechten.ts';
import { maakDrieContractBijlagen, maakFactuurBijlage } from '../../platform/factuur-van-moment.ts';
import { factuurVanRij } from './factuur-sessie.ts';
import type { Actor } from './kern.ts';
import type { DossierSessie } from './dossier-sessie.ts';
import type { PdfBucket } from './onveranderlijke-pdf-opslag.ts';

/** Menselijke reconciliatie na controle in het providerlog. Nooit een providerretry. */
export async function herstelVerhuurVerzending(input: {
  client: DossierSessie; actor: Actor; boekingId: number; type: 'contract' | 'factuur'; claimId: number;
  uitkomst: 'geaccepteerd' | 'niet_verzonden'; providerId?: string; bewijs: string;
}): Promise<{ ok: boolean; melding: string }> {
  const r = input.actor.rechten ?? { isSuperAdmin: false, perModule: {} };
  if (input.actor.type !== 'gebruiker' || !magSchrijven(r, 'instellingen') ||
      !(magSchrijven(r, 'finance') || magSchrijven(r, 'boekingen') || magSchrijven(r, 'aanvragen'))) {
    return { ok: false, melding: 'Alleen een bevoegde beheerder kan de provideruitkomst herstellen.' };
  }
  if (!input.client.rpc || !Number.isSafeInteger(input.boekingId) || !Number.isSafeInteger(input.claimId) ||
      input.boekingId <= 0 || input.claimId <= 0 || input.bewijs.trim().length < 20 || input.bewijs.length > 2000 ||
      !['geaccepteerd', 'niet_verzonden'].includes(input.uitkomst) || !['contract', 'factuur'].includes(input.type)) {
    return { ok: false, melding: 'Leg het gecontroleerde providerbewijs en de juiste verzendclaim vast.' };
  }
  if (input.uitkomst === 'geaccepteerd' && (!input.providerId?.trim() || input.providerId.length > 200)) return { ok: false, melding: 'Het bevestigde providerbericht-id is verplicht.' };
  const manifest: { pad: string; bestandsnaam: string; sha256: string; bytes: number; mime: string }[] = [];
  if (input.uitkomst === 'geaccepteerd') {
    const claim = await input.client.from(input.type === 'contract' ? 'contract_verzendingen' : 'verhuur_factuurverzendingen')
      .select('*').eq('id', input.claimId).maybeSingle();
    if (claim.error || !claim.data) return { ok: false, melding: 'Verzendclaim niet gevonden.' };
    const facturen = await input.client.from('facturen').select('*').eq('boeking_id', input.boekingId);
    if (facturen.error) return { ok: false, melding: 'De factuursnapshot kon niet worden gecontroleerd.' };
    const factuur = input.type === 'factuur'
      ? (facturen.data ?? []).find((f) => Number(f.id) === Number(claim.data!.factuur_id))
      : (facturen.data ?? []).filter((f) => Number(f.contract_versie) === Number(claim.data!.versie))
        .sort((a, b) => Number(a.id) - Number(b.id))[0];
    if (!factuur) return { ok: false, melding: 'Geen bijbehorende uitgegeven factuur gevonden. Niet opnieuw verzenden.' };
    const nota = factuurVanRij(factuur);
    if (!nota.ok) return nota;
    const verwacht: { pad: string; bestandsnaam: string; inhoud: Uint8Array }[] = [];
    if (input.type === 'contract') {
      if (Number(claim.data.boeking_id) !== input.boekingId) return { ok: false, melding: 'Deze claim hoort niet bij dit dossier.' };
      const versie = await input.client.from('contractversies').select('*').eq('boeking_id', input.boekingId).eq('versie', Number(claim.data.versie)).maybeSingle();
      const boeking = await input.client.from('boekingen').select('verhuurtype_sleutel').eq('id', input.boekingId).maybeSingle();
      if (versie.error || !versie.data || boeking.error || !boeking.data) return { ok: false, melding: 'Bevroren contractgegevens ontbreken.' };
      const v = versie.data;
      const delen = maakDrieContractBijlagen({ tekst: String(v.tekst), voorwaardenTekst: String(v.voorwaarden_tekst),
        huisregelsTekst: String(v.huisregels_tekst), plattegrondTekst: String(v.plattegrond_tekst ?? ''), soort: String(boeking.data.verhuurtype_sleutel) }, String(v.contractnummer), nota.factuur);
      delen.forEach((d, i) => verwacht.push({ ...d, pad: i === 0 ? `contracten/${input.boekingId}/overeenkomst-v${v.versie}.pdf`
        : i === 1 ? `contracten/${input.boekingId}/voorwaarden-v${v.versie}.pdf` : `facturen/${input.boekingId}/${nota.factuur.factuurnummer}.pdf` }));
    } else {
      verwacht.push({ ...maakFactuurBijlage(nota.factuur), pad: `facturen/${input.boekingId}/${nota.factuur.factuurnummer}.pdf` });
    }
    const opslag = input.client as DossierSessie & { storage?: { from(bucket: string): PdfBucket } };
    const bucket = opslag.storage?.from('booking-documents');
    if (!bucket?.download) return { ok: false, melding: 'De oorspronkelijke documenten kunnen niet worden gecontroleerd.' };
    for (const stuk of verwacht) {
      const uit = await bucket.download(stuk.pad);
      if (uit.error || !uit.data) return { ok: false, melding: 'Een oorspronkelijke PDF ontbreekt; providercontrole alleen is onvoldoende.' };
      const bytes = new Uint8Array(await uit.data.arrayBuffer());
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (hash !== createHash('sha256').update(stuk.inhoud).digest('hex')) return { ok: false, melding: 'Het opgeslagen document wijkt af van de bevroren afspraken.' };
      manifest.push({ pad: stuk.pad, bestandsnaam: stuk.bestandsnaam, sha256: hash, bytes: bytes.length, mime: 'application/pdf' });
    }
  }
  const herstel = await input.client.rpc('verhuur_herstel_verzending', {
    p_boeking_id: input.boekingId, p_type: input.type, p_claim_id: input.claimId, p_uitkomst: input.uitkomst,
    p_provider_id: input.providerId?.trim() || null, p_bewijs: input.bewijs.trim(), p_manifest: manifest,
  });
  return herstel.error ? { ok: false, melding: herstel.error.message } : { ok: true, melding: 'Providerbewijs en administratie zijn hersteld. Er is geen nieuwe mail verstuurd.' };
}
