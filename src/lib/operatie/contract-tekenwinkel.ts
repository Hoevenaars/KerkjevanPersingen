/** Opslagadapter zonder SDK-imports; iedere schrijfstap wordt atomair gevalideerd. */
import { sha256Hex } from '../../platform/contract-pakket.ts';
import type { TekenDossier, TekenWinkel } from '../../platform/contract-tekenen.ts';
import { bewaarOnveranderlijkePdf, type PdfBucket } from './onveranderlijke-pdf-opslag.ts';

type Rij = Record<string, unknown>;

export interface ContractTekenClient {
  rpc(naam: string, parameters: Rij): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  storage: { from(bucket: string): PdfBucket };
}

function tekst(waarde: unknown): string {
  return waarde == null ? '' : String(waarde);
}

function rij(waarde: unknown): Rij | null {
  return waarde != null && typeof waarde === 'object' && !Array.isArray(waarde) ? waarde as Rij : null;
}

export function dossierUitRijen(tekening: Rij, versie: Rij, boeking: Rij, actueleVersie?: number, machineProces = false): TekenDossier {
  return {
    boekingId: tekst(tekening.boeking_id),
    aanvraagId: boeking.aanvraag_id == null ? null : Number(boeking.aanvraag_id),
    versie: Number(tekening.versie),
    actueleVersie: actueleVersie ?? Number(tekening.versie),
    boekingStatus: tekst(boeking.status),
    ingetrokkenOp: tekening.ingetrokken_op == null ? null : tekst(tekening.ingetrokken_op),
    bestuurAkkoord: versie.bestuur === 'akkoord' || (versie.bestuur_verplicht === false && versie.bestuur !== 'terug'),
    machineProces,
    contractnummer: tekst(versie.contractnummer),
    tokenHash: tekst(tekening.token_hash),
    verlooptOp: tekst(tekening.verloopt_op),
    codeHash: tekening.code_hash == null ? null : tekst(tekening.code_hash),
    codeVerloopt: tekening.code_verloopt == null ? null : tekst(tekening.code_verloopt),
    pogingen: Number(tekening.pogingen ?? 0),
    geverifieerdOp: tekening.geverifieerd_op == null ? null : tekst(tekening.geverifieerd_op),
    ondertekendOp: tekening.ondertekend_op == null ? null : tekst(tekening.ondertekend_op),
    naam: tekening.naam == null ? null : tekst(tekening.naam),
    email: tekst(tekening.email),
    vrijgegeven: tekening.vrijgegeven === true,
    documentHash: tekening.document_hash == null ? null : tekst(tekening.document_hash),
    pdfHash: tekening.pdf_hash == null ? null : tekst(tekening.pdf_hash),
    pdfPad: tekening.pdf_pad == null ? null : tekst(tekening.pdf_pad),
    bevestigingId: tekening.bevestiging_id == null ? null : tekst(tekening.bevestiging_id),
    huurderNaam: tekst(boeking.huurder_naam_snapshot),
    pakket: {
      tekst: tekst(versie.tekst),
      voorwaardenTekst: tekst(versie.voorwaarden_tekst),
      huisregelsTekst: tekst(versie.huisregels_tekst),
      plattegrondTekst: tekst(versie.plattegrond_tekst),
      soort: tekst(boeking.verhuurtype_sleutel),
    },
  };
}

async function mutatie(client: ContractTekenClient, parameters: Rij): Promise<void> {
  const antwoord = await client.rpc('werk_contract_tekening_bij', parameters);
  if (antwoord.error || rij(antwoord.data)?.ok !== true) {
    throw new Error('De tekenlink of verificatiecode kon niet veilig worden bijgewerkt.');
  }
}

export function tekenwinkelVanClient(client: ContractTekenClient): TekenWinkel {
  return {
    async lees(tokenHash) {
      const antwoord = await client.rpc('lees_contract_tekening', { p_token_hash: tokenHash });
      if (antwoord.error) throw new Error('Het contract kon niet worden gecontroleerd.');
      if (antwoord.data == null) return null;
      const gegevens = rij(antwoord.data);
      const tekening = rij(gegevens?.tekening);
      const contract = rij(gegevens?.contract);
      const boeking = rij(gegevens?.boeking);
      const actueleVersie = Number(gegevens?.actuele_versie);
      if (!tekening || !contract || !boeking || !Number.isInteger(actueleVersie) || actueleVersie < 1 || !boeking.status) {
        throw new Error('Het contractdossier is onvolledig.');
      }
      const dossier = dossierUitRijen(tekening, contract, boeking, actueleVersie, gegevens?.machine_proces === true);
      dossier.bestuurAkkoord = dossier.bestuurAkkoord && gegevens?.machine_mandaat_geldig !== false;
      if (dossier.tokenHash !== tokenHash) return null;
      return dossier;
    },
    async bewaarCode(tokenHash, codeHash, verloopt, pogingen) {
      await mutatie(client, {
        p_token_hash: tokenHash, p_actie: 'code', p_code_hash: codeHash,
        p_code_verloopt: verloopt, p_pogingen: pogingen,
      });
    },
    async registreerFouteCode(tokenHash, verwachteCodeHash) {
      await mutatie(client, { p_token_hash: tokenHash, p_actie: 'foute_code', p_verwachte_code_hash: verwachteCodeHash });
    },
    async zetGeverifieerd(tokenHash, op, verwachteCodeHash) {
      if (!verwachteCodeHash) throw new Error('De gecontroleerde code ontbreekt.');
      await mutatie(client, { p_token_hash: tokenHash, p_actie: 'geverifieerd', p_op: op, p_verwachte_code_hash: verwachteCodeHash });
    },
    async leesGetekendePdf(dossier) {
      if (!dossier.ondertekendOp || !dossier.pdfPad) return null;
      const bucket = client.storage.from('booking-documents');
      if (!bucket.download) throw new Error('De opgeslagen PDF kan niet worden gecontroleerd.');
      const antwoord = await bucket.download(dossier.pdfPad);
      if (antwoord.error || !antwoord.data) throw new Error('De opgeslagen PDF ontbreekt.');
      const bytes = new Uint8Array(await antwoord.data.arrayBuffer());
      if (dossier.pdfHash && sha256Hex(bytes) !== dossier.pdfHash) throw new Error('De bewijs-PDF wijkt af.');
      return bytes;
    },
    async legOndertekening(input) {
      const pdfHash = sha256Hex(input.pdf);
      const opgeslagen = await bewaarOnveranderlijkePdf(client.storage.from('booking-documents'), input.pdfPad, input.pdf);
      if (!opgeslagen.ok) throw new Error(opgeslagen.melding);
      const antwoord = await client.rpc('leg_contract_ondertekening_vast', {
        p_token_hash: input.tokenHash, p_naam: input.naam, p_op: input.op,
        p_document_hash: input.documentHash, p_pdf_hash: pdfHash,
        p_pdf_pad: input.pdfPad, p_pdf_grootte: input.pdf.byteLength, p_audit: input.audit,
      });
      const uitkomst = rij(antwoord.data);
      if (antwoord.error || !uitkomst || !['nieuw', 'al'].includes(tekst(uitkomst.status))) {
        throw new Error('De ondertekening is niet aantoonbaar vastgelegd.');
      }
      return uitkomst.status as 'nieuw' | 'al';
    },
  };
}
