/** De procesjob claimt deze stap; providerbewijs wordt per ontvanger opgeslagen. */
import { PRIVACY_URL, sha256Hex } from '../../platform/contract-pakket.ts';
import type { TekenDossier } from '../../platform/contract-tekenen.ts';
import { CONTRACTBEHEER_EMAIL, VAN_ADRES } from '../mail-adressen.ts';
import { kerkjeMail } from '../kerkje-mail.ts';
import type { verstuurGecontroleerd as VerstuurGecontroleerd } from '../mail-transport.ts';
import { dossierUitRijen, type ContractTekenClient } from './contract-tekenwinkel.ts';

type Rij = Record<string, unknown>;
type Resultaat = { ok: boolean; melding: string; onzeker?: boolean; wachtOpMens?: boolean; providerId?: string };

export function ondertekenbrief(dossier: TekenDossier) {
  return kerkjeMail({
    titel: 'Uw ondertekende huurovereenkomst',
    aanhef: `Beste ${dossier.naam || dossier.huurderNaam},`,
    hoofdtekst: [
      'Uw elektronische ondertekening is vastgelegd. De definitieve PDF zit bij deze mail.',
      'Dit is een elektronische bevestiging en geen gekwalificeerde elektronische handtekening.',
      'Het concept en de ondertekende PDF blijven in het verhuurdossier bewaard.',
      'De reservering wordt definitief volgens de betaalafspraken in het contract.',
      `Privacyverklaring: ${PRIVACY_URL}`,
    ].join('\n\n'),
    ondertekening: 'Team Kerkje van Persingen',
  });
}

function rij(waarde: unknown): Rij | null {
  return waarde != null && typeof waarde === 'object' && !Array.isArray(waarde) ? waarde as Rij : null;
}

export async function verwerkOndertekenbevestiging(input: {
  client: ContractTekenClient;
  boekingId: number;
  contractversieId: number;
  env: Record<string, unknown>;
  sleutel?: string;
  /** Injectie voor lokale tests; productie gebruikt altijd de centrale mailpoort. */
  verstuur?: typeof VerstuurGecontroleerd;
}): Promise<Resultaat> {
  if (input.env.VERHUUR_MACHINE !== 'true' || !Number.isInteger(input.boekingId) || input.boekingId < 1 ||
      !Number.isInteger(input.contractversieId) || input.contractversieId < 1) {
    return { ok: false, wachtOpMens: true, melding: 'De ontvangstmail is niet vrijgegeven of de contractversie ontbreekt.' };
  }
  const sleutel = `ondertekend:${input.boekingId}:${input.contractversieId}`;
  if (input.sleutel != null && input.sleutel !== sleutel) {
    return { ok: false, wachtOpMens: true, melding: 'De mailjob hoort niet bij deze ondertekening.' };
  }
  const lees = async () => {
    const antwoord = await input.client.rpc('lees_contract_ondertekening_voor_bevestiging', {
      p_boeking_id: input.boekingId, p_contractversie_id: input.contractversieId,
    });
    if (antwoord.error) throw new Error('De ondertekening kon niet worden gecontroleerd.');
    const gegevens = rij(antwoord.data);
    const tekening = rij(gegevens?.tekening);
    const contract = rij(gegevens?.contract);
    const boeking = rij(gegevens?.boeking);
    if (!tekening || !contract || !boeking || Number(gegevens?.contractversie_id) !== input.contractversieId ||
        Number(tekening.boeking_id) !== input.boekingId) return null;
    const dossier = dossierUitRijen(tekening, contract, boeking, Number(gegevens?.actuele_versie), gegevens?.machine_proces === true);
    dossier.bestuurAkkoord = dossier.bestuurAkkoord && gegevens?.machine_mandaat_geldig !== false;
    if (!dossier.ondertekendOp || !dossier.pdfPad || !dossier.pdfHash || !dossier.documentHash ||
        dossier.ingetrokkenOp || !['optie', 'definitief'].includes(dossier.boekingStatus ?? '') ||
        dossier.actueleVersie !== dossier.versie || !dossier.machineProces || !dossier.bestuurAkkoord) return null;
    return { dossier, internId: typeof tekening.bestuur_bevestiging_id === 'string' ? tekening.bestuur_bevestiging_id : null };
  };
  let providerBegonnen = false;
  let providerId: string | undefined;
  let lopendeClaim: { richting: 'huurder' | 'bestuur'; token: string } | null = null;
  const registreer = async (status: 'verzonden' | 'niet_verzonden' | 'onzeker', id: string | null, melding: string): Promise<boolean> => {
    if (!lopendeClaim) return false;
    const r = await input.client.rpc('registreer_contract_ontvangstmail_resultaat', {
      p_boeking_id: input.boekingId, p_contractversie_id: input.contractversieId,
      p_richting: lopendeClaim.richting, p_claim_token: lopendeClaim.token,
      p_status: status, p_provider_id: id, p_melding: melding,
    });
    return !r.error && r.data === true;
  };
  try {
    let huidig = await lees();
    if (!huidig) return { ok: false, wachtOpMens: true, melding: 'De ondertekening is ingetrokken, gewijzigd of niet volledig vastgelegd.' };
    providerId = huidig.dossier.bevestigingId ?? undefined;
    if (providerId && huidig.internId) return { ok: true, providerId, melding: 'De ontvangstbevestigingen zijn al verstuurd.' };
    const bucket = input.client.storage.from('booking-documents');
    if (!bucket.download) return { ok: false, wachtOpMens: true, melding: 'De ondertekende PDF kon niet worden gelezen.' };
    const download = await bucket.download(huidig.dossier.pdfPad!);
    if (download.error || !download.data) return { ok: false, wachtOpMens: true, melding: 'De opgeslagen bewijs-PDF ontbreekt.' };
    const pdf = new Uint8Array(await download.data.arrayBuffer());
    if (sha256Hex(pdf) !== huidig.dossier.pdfHash) return { ok: false, wachtOpMens: true, melding: 'De opgeslagen bewijs-PDF heeft een afwijkende inhoud.' };
    const pdfPad = huidig.dossier.pdfPad;
    const verstuur = input.verstuur ?? (await import('../mail-transport.ts')).verstuurGecontroleerd;
    for (const richting of ['aanvrager', 'intern'] as const) {
      // Direct vóór iedere externe actie opnieuw controleren; na annulering
      // wordt geen nog niet begonnen provideractie gestart.
      huidig = await lees();
      if (!huidig || huidig.dossier.pdfPad !== pdfPad) {
        return { ok: false, wachtOpMens: true, providerId, melding: 'De boeking is tijdens de verwerking gewijzigd. De ontvangstmail is gestopt.' };
      }
      if ((richting === 'aanvrager' && huidig.dossier.bevestigingId) || (richting === 'intern' && huidig.internId)) continue;
      const claim = await input.client.rpc('claim_contract_ontvangstmail', {
        p_boeking_id: input.boekingId, p_contractversie_id: input.contractversieId,
        p_richting: richting === 'aanvrager' ? 'huurder' : 'bestuur',
      });
      const stand = rij(claim.data);
      if (claim.error || !stand) return { ok: false, wachtOpMens: true, providerId, melding: 'De ontvangstmail kon niet exclusief worden geclaimd.' };
      if (stand.status === 'verzonden' && typeof stand.providerId === 'string' && stand.providerId) {
        if (richting === 'aanvrager') providerId = stand.providerId;
        continue;
      }
      if (stand.status !== 'geclaimd' || typeof stand.claimToken !== 'string' || !/^[0-9a-f-]{36}$/i.test(stand.claimToken)) {
        return { ok: false, onzeker: true, wachtOpMens: true, providerId,
          melding: `De eerdere ontvangstmail aan ${richting === 'aanvrager' ? 'de huurder' : 'het bestuur'} heeft nog geen zekere uitkomst. Controleer die ontvanger afzonderlijk.` };
      }
      lopendeClaim = { richting: richting === 'aanvrager' ? 'huurder' : 'bestuur', token: stand.claimToken };
      const dossier = huidig.dossier;
      const brief = ondertekenbrief(dossier);
      providerBegonnen = true;
      const uit = await verstuur({
        sleutel: richting === 'aanvrager' ? 'handmatige_template' : 'aanvraag_bestuur',
        naar: richting === 'aanvrager' ? dossier.email : CONTRACTBEHEER_EMAIL,
        onderwerp: richting === 'aanvrager' ? `Ondertekend contract ${dossier.contractnummer}` : `Contract ondertekend ${dossier.contractnummer}`,
        tekst: richting === 'aanvrager' ? brief.text : `Het contract ${dossier.contractnummer} is elektronisch ondertekend. Dezelfde PDF staat in het boekingsdossier. Afzender van deze melding: ${VAN_ADRES}.`,
        html: richting === 'aanvrager' ? brief.html : undefined,
        richting, bijlagen: [{ bestandsnaam: `${dossier.contractnummer}-getekend.pdf`, inhoud: pdf }],
        eisBijlagen: true, idempotentieSleutel: `${sleutel}:${richting}`, berichtsoort: 'geen_betaling',
      }, { env: input.env, vereisteLiveModus: true });
      if (!uit.providerAangeroepen) {
        providerBegonnen = false;
        const bewaard = await registreer('niet_verzonden', null, uit.melding || 'Mailpoort blokkeert; provider niet benaderd.');
        if (!bewaard) return { ok: false, onzeker: true, wachtOpMens: true, providerId, melding: 'De provider is niet benaderd, maar de verzendclaim kon niet worden afgesloten.' };
        lopendeClaim = null;
        return { ok: false, wachtOpMens: true, providerId, melding: uit.melding || 'De bestaande mailpoort blokkeert de ontvangstmail.' };
      }
      if (!uit.verzonden || !uit.providerBerichtId) {
        await registreer('onzeker', uit.providerBerichtId ?? null, 'Provideruitkomst ontbreekt.').catch(() => false);
        return { ok: false, onzeker: true, wachtOpMens: true, providerId, melding: 'De provideruitkomst is onbekend. Controleer het verzendbewijs voordat u hervat.' };
      }
      if (richting === 'aanvrager') providerId = uit.providerBerichtId;
      const bewaard = await registreer('verzonden', uit.providerBerichtId, 'Provider heeft de ontvangstmail geaccepteerd.');
      if (!bewaard) {
        await registreer('onzeker', uit.providerBerichtId, 'Provideracceptatie kon niet volledig worden vastgelegd.').catch(() => false);
        return { ok: false, onzeker: true, wachtOpMens: true, providerId, melding: 'De provider heeft de mail geaccepteerd, maar het ontvangstbewijs kon niet worden opgeslagen.' };
      }
      providerBegonnen = false;
      lopendeClaim = null;
    }
    return { ok: true, providerId, melding: 'De ondertekende overeenkomst en de interne ontvangstmelding zijn verstuurd.' };
  } catch {
    if (providerBegonnen && lopendeClaim) {
      await registreer('onzeker', null, 'Verwerking onderbroken rond de provideractie.').catch(() => false);
    }
    return { ok: false, onzeker: providerBegonnen, wachtOpMens: true, providerId,
      melding: providerBegonnen ? 'De verzenduitkomst is onbekend. Controleer de provider voordat u hervat.' : 'De ontvangstmail kon niet veilig worden voorbereid.' };
  }
}
