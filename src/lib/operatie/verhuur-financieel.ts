import { planFinancieleTermijnen, type FinancieleTermijn } from '../../platform/verhuur-financieel.ts';
import { ymdInAmsterdam } from '../../platform/datum.ts';
import { maakFactuurBijlage } from '../../platform/factuur-van-moment.ts';
import { sha256Hex } from '../../platform/contract-pakket.ts';
import { besluitVoor } from '../automatisering-register.ts';
import { verstuurGecontroleerd, type MailTransport } from '../mail-transport.ts';
import { factuurVanRij, geefFactuurVoorTermijn } from './factuur-sessie.ts';
import { bewaarOnveranderlijkePdf, type PdfBucket } from './onveranderlijke-pdf-opslag.ts';
import { leesGecontroleerdMandaat } from './verhuur-mandaat.ts';
import type { MachineResultaat } from './verhuur-contract-machine.ts';
import type { Actor } from './kern.ts';
import type { DossierSessie } from './dossier-sessie.ts';

const cent = (waarde: unknown) => Math.round(Number(waarde) * 100);
const euro = (waarde: number) => (waarde / 100).toFixed(2).replace('.', ',');

export { verwerkBetaalontvangst } from './verhuur-betaalontvangst.ts';

/** De dagelijkse vervolgjob gebruikt betaalregels, uitgegeven facturen en werkelijk saldo. */
export async function verwerkFinancieleTermijnen(input: {
  client: DossierSessie; boekingId: number; actor: Actor; env: Record<string, unknown>;
  basisUrl?: string; vandaag?: string; transport?: MailTransport;
}): Promise<MachineResultaat> {
  if (input.env.VERHUUR_MACHINE !== 'true' || input.actor.type !== 'systeem' || input.actor.id !== 'system') {
    return { ok: false, melding: 'Financiële automatisering is niet vrijgegeven.', wachtOpMens: true };
  }
  const client = input.client;
  if (!client.rpc) return { ok: false, melding: 'De financiële databasefuncties ontbreken.', wachtOpMens: true };
  const b = await client.from('boekingen').select('id,status,aanvraag_id,aanbetaling_bedrag,huurder_email_snapshot').eq('id', input.boekingId).maybeSingle();
  if (b.error || !b.data) return { ok: false, melding: 'Boeking niet beschikbaar.' };
  if (!['optie', 'definitief'].includes(String(b.data.status))) return { ok: true, melding: 'Geen financiële vervolgactie voor deze boekingsstatus.' };
  const mandaat = await leesGecontroleerdMandaat(client, Number(b.data.aanvraag_id), input.boekingId);
  if (!mandaat.ok) return { ...mandaat, wachtOpMens: true };
  const poort = await besluitVoor('betalingscommunicatie', undefined, input.env);
  if (poort.modus !== 'aan') return { ok: false, melding: 'Betalingscommunicatie staat niet op Aan.', wachtOpMens: true };
  const herinneringPoort = await besluitVoor('betaalherinnering', undefined, input.env);
  const [p, f, c, contractmails] = await Promise.all([
    client.from('betalingen').select('id,soort,bedrag,ontvangen_bedrag,status,vervaldatum,factuur_op').eq('boeking_id', input.boekingId),
    client.from('facturen').select('*').eq('boeking_id', input.boekingId),
    client.from('contractversies').select('id,versie,mandaat_aanvraag_versie').eq('boeking_id', input.boekingId),
    client.from('contract_verzendingen').select('versie,soort,status,bericht_id').eq('boeking_id', input.boekingId),
  ]);
  if ([p, f, c, contractmails].some((r) => r.error)) return { ok: false, melding: 'Termijnen of verzendbewijs konden niet betrouwbaar worden gelezen.' };
  const factuurIds = (f.data ?? []).map((r) => String(r.id));
  const z = factuurIds.length
    ? await client.from('verhuur_factuurverzendingen').select('factuur_id,soort,status').in('factuur_id', factuurIds)
    : { data: [] as Record<string, unknown>[], error: null };
  if (z.error) return { ok: false, melding: 'De eerdere herinneringen konden niet worden gecontroleerd.' };
  const versie = (c.data ?? []).reduce((max, r) => Math.max(max, Number(r.versie)), 0);
  if (!versie || !(c.data ?? []).some((r) => Number(r.versie) === versie && r.mandaat_aanvraag_versie === mandaat.mandaat.aanvraagVersie)) {
    return { ok: false, melding: 'De financiële termijn hoort niet bij het actuele bestuurscontract.', wachtOpMens: true };
  }
  const actueelContract = (c.data ?? []).find((r) => Number(r.versie) === versie);
  const contractMandaat = await client.rpc('verhuur_contract_mandaat_geldig', {
    p_boeking_id: input.boekingId, p_contractversie_id: Number(actueelContract?.id),
  });
  if (contractMandaat.error || contractMandaat.data !== true) return { ok: false,
    melding: 'De concrete contract- of termijnsnapshot is gewijzigd. Finance moet de bestaande afspraak controleren.', wachtOpMens: true };
  if (!(contractmails.data ?? []).some((r) => Number(r.versie) === versie && ['contract', 'herhaling'].includes(String(r.soort)) && r.status === 'verzonden' && r.bericht_id)) {
    return { ok: false, melding: 'Eerst moet het contractpakket aantoonbaar zijn verzonden.', wachtOpMens: true };
  }
  const eersteSoort = Number(b.data.aanbetaling_bedrag) > 0 ? 'aanbetaling' : 'restant';
  const eerste = (f.data ?? []).find((r) => Number(r.contract_versie) === versie && r.fase === eersteSoort);
  if (!eerste?.provider_bericht_id || !eerste.verzonden_op) {
    return { ok: false, melding: 'De factuur uit het geaccepteerde contractpakket mist verzendregistratie. Herstel dit bewijs; geen tweede factuurmail.', onzeker: true, wachtOpMens: true };
  }
  const vandaag = input.vandaag ?? ymdInAmsterdam(new Date());
  const termijnen: FinancieleTermijn[] = (p.data ?? []).map((r) => {
    const factuur = (f.data ?? []).find((i) => Number(i.betaling_id) === Number(r.id));
    return { id: Number(r.id), soort: String(r.soort), bedragCent: cent(r.bedrag), ontvangenCent: cent(r.ontvangen_bedrag ?? 0),
      status: String(r.status), vervaldatum: String(r.vervaldatum ?? '').slice(0, 10), factuurMoment: String(r.factuur_op ?? '').slice(0, 10),
      factuurId: factuur ? Number(factuur.id) : null, factuurVerzondenOp: factuur?.verzonden_op ? String(factuur.verzonden_op) : null,
      herinneringen: (z.data ?? []).filter((i) => Number(i.factuur_id) === Number(factuur?.id) && i.status === 'verzonden').map((i) => String(i.soort)),
    };
  });
  const stappen = planFinancieleTermijnen({ status: String(b.data.status), vandaag, termijnen });
  for (const stap of stappen) {
    if (stap.soort !== 'factuur' && herinneringPoort.modus !== 'aan') continue;
    const bestaand = (f.data ?? []).find((r) => Number(r.betaling_id) === stap.betalingId);
    const nota = bestaand ? factuurVanRij(bestaand) : await geefFactuurVoorTermijn(client, {
      boekingId: input.boekingId, versie, betalingId: stap.betalingId, betalingscommunicatieAan: true,
    });
    if (!nota.ok) return { ...nota, wachtOpMens: true };
    if (nota.id == null) return { ok: false, melding: 'Geen definitief factuurnummer beschikbaar.', wachtOpMens: true };
    const claim = await client.rpc('verhuur_claim_factuurmail', { p_factuur_id: nota.id, p_soort: stap.soort });
    const q = claim.data as Record<string, unknown> | null;
    if (claim.error || !q) return { ok: false, melding: claim.error?.message || 'Geen verzendclaim verkregen.' };
    if (q.status === 'verzonden') continue;
    if (q.status !== 'geclaimd') return { ok: false, melding: 'Deze factuurverzending wacht op controle van de provideruitkomst.', onzeker: true, wachtOpMens: true };
    const registreer = async (status: 'verzonden' | 'geweigerd' | 'onzeker', berichtId: string | null, pad: string | null, sha: string | null, melding: string) => {
      const r = await client.rpc!('verhuur_factuurmail_resultaat', { p_claim_id: Number(q.id), p_status: status,
        p_bericht_id: berichtId, p_pdf_pad: pad, p_pdf_sha256: sha, p_melding: melding });
      return !r.error;
    };
    let pad: string | null = null;
    let sha: string | null = null;
    const bijlagen: { bestandsnaam: string; inhoud: Uint8Array }[] = [];
    try {
      if (stap.soort === 'factuur') {
        const pdf = maakFactuurBijlage(nota.factuur);
        const opslag = client as DossierSessie & { storage?: { from(bucket: string): PdfBucket } };
        if (!opslag.storage) throw new Error('Documentopslag is niet beschikbaar.');
        pad = `facturen/${input.boekingId}/${nota.factuur.factuurnummer}.pdf`;
        sha = sha256Hex(pdf.inhoud);
        const opgeslagen = await bewaarOnveranderlijkePdf(opslag.storage.from('booking-documents'), pad, pdf.inhoud);
        if (!opgeslagen.ok) throw new Error(opgeslagen.melding);
        bijlagen.push(pdf);
      }
    } catch {
      await registreer('geweigerd', null, null, null, 'Factuurdocument niet beschikbaar; provider niet benaderd.');
      return { ok: false, melding: 'Factuurdocument kon niet betrouwbaar worden opgeslagen.' };
    }
    const actueel = await client.from('betalingen').select('bedrag,ontvangen_bedrag,status').eq('id', stap.betalingId).maybeSingle();
    const recht = await leesGecontroleerdMandaat(client, mandaat.mandaat.aanvraagId, input.boekingId);
    if (actueel.error || !actueel.data || !recht.ok) {
      await registreer('geweigerd', null, pad, sha, 'Dossier gewijzigd vóór verzending.');
      return { ok: false, melding: 'Dossier of betaling is gewijzigd vóór verzending.', wachtOpMens: true };
    }
    const saldo = cent(actueel.data.bedrag) - cent(actueel.data.ontvangen_bedrag);
    if (actueel.data.status === 'geannuleerd' || (stap.soort !== 'factuur' && saldo <= 0)) {
      await registreer('geweigerd', null, pad, sha, 'Termijn is inmiddels voldaan of geannuleerd.');
      continue;
    }
    const herinnering = stap.soort !== 'factuur';
    const tekst = [ `Beste ${nota.factuur.huurderNaam},`, '',
      herinnering ? `Voor factuur ${nota.factuur.factuurnummer} staat nog EUR ${euro(saldo)} open.` : `Bijgaand ontvangt u factuur ${nota.factuur.factuurnummer} voor de overeengekomen resttermijn.`,
      `Vervaldatum: ${nota.factuur.vervaldatum}.`,
      `Nog te betalen: EUR ${euro(Math.max(0, saldo))}.`,
      `IBAN: ${nota.factuur.verhuurderIban}, ten name van ${nota.factuur.verhuurderNaam}.`,
      `Vermeld bij betaling: ${nota.factuur.factuurnummer}.`, '', 'Met vriendelijke groet,', 'Kerkje van Persingen' ].join('\n');
    try {
      const uit = await verstuurGecontroleerd({ sleutel: herinnering ? 'betaalherinnering' : 'betalingscommunicatie',
        naar: String(b.data.huurder_email_snapshot ?? ''), onderwerp: `${herinnering ? 'Betalingsherinnering' : 'Factuur'} ${nota.factuur.factuurnummer}`,
        tekst, richting: 'aanvrager', berichtsoort: 'betaling', bijlagen, eisBijlagen: !herinnering, idempotentieSleutel: String(q.idempotentie),
      }, { env: input.env, vereisteLiveModus: true, transport: input.transport });
      if (!uit.verzonden || !uit.providerBerichtId) {
        const onzeker = uit.providerAangeroepen;
        await registreer(onzeker ? 'onzeker' : 'geweigerd', null, pad, sha, onzeker ? 'Provideruitkomst onbekend.' : 'Provider niet benaderd.');
        return { ok: false, melding: uit.melding || 'Factuurverzending niet bevestigd.', onzeker, wachtOpMens: onzeker };
      }
      if (!await registreer('verzonden', uit.providerBerichtId, pad, sha, 'Provider heeft bericht geaccepteerd.')) {
        return { ok: false, melding: 'Provider accepteerde de mail maar de registratie is niet bevestigd. Niet opnieuw versturen.', onzeker: true, wachtOpMens: true };
      }
    } catch {
      await registreer('onzeker', null, pad, sha, 'Provider-call onderbroken; eerst bewijs controleren.');
      return { ok: false, melding: 'Provideruitkomst onbekend; geen automatische herverzending.', onzeker: true, wachtOpMens: true };
    }
  }
  // Ook de toekomstige resttermijn krijgt een duurzame wekker. De datum maakt de
  // sleutel uniek; dezelfde dag of een retry plant nooit twee jobs.
  if (termijnen.some((t) => t.status !== 'geannuleerd' && (t.ontvangenCent < t.bedragCent || !t.factuurVerzondenOp))) {
    const morgen = new Date(`${vandaag}T12:00:00Z`); morgen.setUTCDate(morgen.getUTCDate() + 1);
    const dag = morgen.toISOString().slice(0, 10);
    const gepland = await client.rpc('verhuur_plan_stap', { p_aanvraag_id: mandaat.mandaat.aanvraagId, p_boeking_id: input.boekingId,
      p_taak: 'financieel', p_sleutel: `financieel:${input.boekingId}:${dag}`, p_payload: {}, p_gepland_op: `${dag}T06:00:00Z` });
    if (gepland.error) return { ok: false, melding: 'Financiële vervolgcontrole kon niet duurzaam worden gepland.' };
  }
  return { ok: true, melding: 'Financiële termijnen gecontroleerd; toekomstig vervolg staat gepland waar nodig.' };
}
