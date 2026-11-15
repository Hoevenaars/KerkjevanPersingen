/**
 * Serverkant van de tekenpagina. De ruwe token en de code komen niet in de database.
 */

import { createHash } from 'node:crypto';
import { CONTRACTBEHEER_EMAIL, VAN_ADRES } from './mail-adressen.ts';
import { verstuurGecontroleerd } from './mail-transport.ts';
import { maakBeheerAdminClient } from './supabase.ts';
import { contractPakketTekst, PRIVACY_URL } from '../platform/contract-pakket.ts';
import { leesContractSjabloon } from './contract-sjabloon-opslag.ts';
import {
  voerTekenstap,
  type TekenDossier,
  type TekenStap,
  type TekenUitkomst,
  type TekenWinkel,
} from '../platform/contract-tekenen.ts';
import { besluitVoor } from './automatisering-register.ts';
import { getTestMailRecipient } from './testmail-adres.ts';

type Rij = Record<string, unknown>;

function tekst(waarde: unknown): string {
  return waarde == null ? '' : String(waarde);
}

export function dossierUitRijen(tekening: Rij, versie: Rij, boeking: Rij): TekenDossier {
  return {
    boekingId: tekst(tekening.boeking_id),
    versie: Number(tekening.versie),
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

export function supabaseTekenwinkel(env: Record<string, unknown> = process.env): TekenWinkel | null {
  const client = maakBeheerAdminClient(env) as unknown as {
    from(tabel: string): {
      select(kolommen: string): {
        eq(kolom: string, waarde: unknown): {
          eq(kolom: string, waarde: unknown): { maybeSingle(): Promise<{ data: Rij | null; error: { message: string } | null }> };
          maybeSingle(): Promise<{ data: Rij | null; error: { message: string } | null }>;
        };
      };
      update(rij: Rij): {
        eq(kolom: string, waarde: unknown): {
          eq(kolom: string, waarde: unknown): Promise<{ error: { message: string } | null }>;
        } & Promise<{ error: { message: string } | null }>;
      };
      insert(rij: Rij): Promise<{ error: { message: string } | null }>;
    };
    storage: {
      from(bucket: string): {
        upload(pad: string, body: Uint8Array, opties: { contentType: string; upsert: boolean }): Promise<{ error: { message: string } | null }>;
      };
    };
  } | null;
  if (!client) return null;
  return {
    async lees(tokenHash) {
      const tekening = await client.from('contract_tekeningen').select('*').eq('token_hash', tokenHash).maybeSingle();
      if (tekening.error || !tekening.data) return null;
      const versie = await client.from('contractversies').select('*').eq('boeking_id', tekening.data.boeking_id).eq('versie', tekening.data.versie).maybeSingle();
      if (versie.error || !versie.data) return null;
      const boeking = await client.from('boekingen').select('huurder_naam_snapshot,verhuurtype_sleutel').eq('id', tekening.data.boeking_id).maybeSingle();
      if (boeking.error || !boeking.data) return null;
      const dossier = dossierUitRijen(tekening.data, versie.data, boeking.data);
      if (dossier.tokenHash !== tokenHash) return null;
      return dossier;
    },
    async bewaarCode(tokenHash, codeHash, verloopt, pogingen) {
      await client.from('contract_tekeningen').update({
        code_hash: codeHash,
        code_verloopt: verloopt,
        pogingen,
      }).eq('token_hash', tokenHash);
    },
    async zetGeverifieerd(tokenHash, op) {
      await client.from('contract_tekeningen').update({ geverifieerd_op: op, pogingen: 0 }).eq('token_hash', tokenHash);
    },
    async legOndertekening(input) {
      const upload = await client.storage.from('booking-documents').upload(input.pdfPad, input.pdf, { contentType: 'application/pdf', upsert: false });
      if (upload.error && !/already exists|Duplicate/i.test(upload.error.message)) return 'al';
      const gezet = await client.from('contract_tekeningen').update({
        ondertekend_op: input.op,
        naam: input.naam,
        document_hash: input.documentHash,
        pdf_pad: input.pdfPad,
        audit: input.audit,
      }).eq('token_hash', input.tokenHash);
      if (gezet.error) return 'al';
      const huidig = await client.from('contract_tekeningen').select('boeking_id,versie,ondertekend_op').eq('token_hash', input.tokenHash).maybeSingle();
      if (!huidig.data?.ondertekend_op) return 'al';
      await client.from('contractversies').update({
        ondertekening: 'ontvangen',
        ondertekening_actor: input.naam,
        ondertekening_op: input.op,
        ondertekening_versie: huidig.data.versie,
      }).eq('boeking_id', huidig.data.boeking_id).eq('versie', huidig.data.versie);
      await client.from('documenten').insert({
        boeking_id: Number(huidig.data.boeking_id),
        type: 'getekend_contract',
        bestandsnaam: `getekend-v${huidig.data.versie}.pdf`,
        storage_pad: input.pdfPad,
        mime_type: 'application/pdf',
        grootte_bytes: input.pdf.byteLength,
      });
      return huidig.data.ondertekend_op === input.op ? 'nieuw' : 'al';
    },
  };
}

async function mailMetPdf(input: {
  naar: string;
  onderwerp: string;
  tekst: string;
  sleutel: string;
  richting: 'intern' | 'aanvrager';
  pdf?: Uint8Array;
  naam?: string;
  idempotentie?: string;
  env: Record<string, unknown>;
}): Promise<string | null> {
  const besluit = await besluitVoor(input.sleutel, undefined, input.env);
  const testadres = besluit.modus === 'test' ? await getTestMailRecipient(input.env) : null;
  const uit = await verstuurGecontroleerd(
    {
      sleutel: input.sleutel,
      naar: input.naar,
      onderwerp: input.onderwerp,
      tekst: input.tekst,
      richting: input.richting,
      modus: besluit.modus,
      bijlagen: input.pdf && input.naam ? [{ bestandsnaam: input.naam, inhoud: input.pdf }] : undefined,
      eisBijlagen: Boolean(input.pdf),
      idempotentieSleutel: input.idempotentie,
    },
    { modus: besluit.modus, testadres, env: input.env },
  );
  return uit.providerBerichtId ?? null;
}

export async function behandelTekenpagina(input: {
  stap: TekenStap;
  winkel?: TekenWinkel | null;
  env?: Record<string, unknown>;
}): Promise<TekenUitkomst> {
  const env = input.env ?? process.env;
  const winkel = input.winkel === undefined ? supabaseTekenwinkel(env) : input.winkel;
  if (!winkel) return { ok: false, melding: 'Ondertekenen is nu niet beschikbaar.' };
  const sjabloon = await leesContractSjabloon(env);
  if (sjabloon.fout) return { ok: false, melding: sjabloon.fout };
  const uit = await voerTekenstap(input.stap, winkel, { sjabloon: sjabloon.bytes });
  if (!uit.ok || !uit.mail) return uit;
  if (uit.mail === 'code' && uit.code) {
    const id = await mailMetPdf({
      naar: uit.dossier.email,
      onderwerp: `Code voor uw contract ${uit.dossier.contractnummer}`,
      tekst: `Uw verificatiecode is ${uit.code}. De code is 15 minuten geldig. Vraag hem niet door.`,
      sleutel: 'handmatige_template',
      richting: 'aanvrager',
      idempotentie: `teken-code:${uit.dossier.boekingId}:${uit.dossier.versie}:${createHash('sha256').update(uit.code).digest('hex').slice(0, 12)}`,
      env,
    });
    if (!id) return { ok: false, melding: 'De code is niet verstuurd. Er is niets ondertekend.' };
    return { ...uit, code: undefined };
  }
  if (uit.mail === 'bevestiging' && uit.pdf) {
    const naam = `${uit.dossier.contractnummer}-getekend.pdf`;
    const tekst = [
      `Beste ${uit.dossier.naam || uit.dossier.huurderNaam},`,
      '',
      'Uw elektronische ondertekening is vastgelegd. De definitieve PDF zit bij deze mail.',
      'Dit is geen gekwalificeerde elektronische handtekening.',
      `Privacyverklaring: ${PRIVACY_URL}`,
      'De reservering wordt definitief volgens de betaalafspraken in het contract.',
    ].join('\n');
    const id = await mailMetPdf({
      naar: uit.dossier.email,
      onderwerp: `Ondertekend contract ${uit.dossier.contractnummer}`,
      tekst,
      sleutel: 'handmatige_template',
      richting: 'aanvrager',
      pdf: uit.pdf,
      naam,
      idempotentie: `teken-bevestiging:${uit.dossier.boekingId}:${uit.dossier.versie}`,
      env,
    });
    if (id) {
      const client = maakBeheerAdminClient(env) as { from?: (tabel: string) => { update: (rij: Rij) => { eq: (kolom: string, waarde: unknown) => Promise<unknown> } } } | null;
      await client?.from?.('contract_tekeningen').update({ bevestiging_id: id }).eq('token_hash', uit.dossier.tokenHash);
    }
    await mailMetPdf({
      naar: CONTRACTBEHEER_EMAIL,
      onderwerp: `Contract ondertekend ${uit.dossier.contractnummer}`,
      tekst: `Het contract ${uit.dossier.contractnummer} is elektronisch ondertekend. Dezelfde PDF staat in het boekingsdossier. Afzender van deze melding: ${VAN_ADRES}.`,
      sleutel: 'aanvraag_bestuur',
      richting: 'intern',
      pdf: uit.pdf,
      naam,
      idempotentie: `teken-intern:${uit.dossier.boekingId}:${uit.dossier.versie}`,
      env,
    }).catch(() => null);
    if (!id) {
      return { ...uit, melding: 'Het contract is ondertekend. De bevestigingsmail is niet geaccepteerd door de mailprovider.' };
    }
  }
  return uit;
}

export function pakketVanDossier(dossier: TekenDossier): string {
  return contractPakketTekst(dossier.pakket);
}
