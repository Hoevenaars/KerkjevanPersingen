/**
 * Serverkant van de tekenpagina. De ruwe token en de code komen niet in de database.
 */

import { createHash } from 'node:crypto';
import { CONTRACTBEHEER_EMAIL, VAN_ADRES } from './mail-adressen.ts';
import { verstuurGecontroleerd } from './mail-transport.ts';
import { maakBeheerAdminClient } from './supabase.ts';
import { contractPakketTekst } from '../platform/contract-pakket.ts';
import { ondertekenbrief } from './operatie/ondertekenbevestiging.ts';
import { leesContractSjabloon } from './contract-sjabloon-opslag.ts';
import {
  voerTekenstap,
  hashTekenToken,
  tokenVormGeldig,
  type TekenDossier,
  type TekenStap,
  type TekenUitkomst,
  type TekenWinkel,
} from '../platform/contract-tekenen.ts';
import { besluitVoor } from './automatisering-register.ts';
import { promoveerIndienKlaar } from './operatie/definitief-auto.ts';
import { getTestMailRecipient } from './testmail-adres.ts';
import { tekenwinkelVanClient, type ContractTekenClient } from './operatie/contract-tekenwinkel.ts';

type Rij = Record<string, unknown>;

export { dossierUitRijen } from './operatie/contract-tekenwinkel.ts';

export function supabaseTekenwinkel(env: Record<string, unknown> = process.env): TekenWinkel | null {
  const client = maakBeheerAdminClient(env);
  return client ? tekenwinkelVanClient(client as unknown as ContractTekenClient) : null;
}

async function mailMetPdf(input: {
  naar: string;
  onderwerp: string;
  tekst: string;
  html?: string;
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
      html: input.html,
      richting: input.richting,
      modus: besluit.modus,
      bijlagen: input.pdf && input.naam ? [{ bestandsnaam: input.naam, inhoud: input.pdf }] : undefined,
      eisBijlagen: Boolean(input.pdf),
      idempotentieSleutel: input.idempotentie,
      berichtsoort: 'geen_betaling',
    },
    { modus: besluit.modus, testadres, env: input.env },
  );
  return uit.providerBerichtId ?? null;
}

export async function behandelTekenpagina(input: {
  stap: TekenStap;
  winkel?: TekenWinkel | null;
  env?: Record<string, unknown>;
  /** Alleen een wake-up/herstelhook: de machinejob wordt al in de SQL-transactie vastgelegd. */
  naOndertekening?: (dossier: TekenDossier) => Promise<void>;
}): Promise<TekenUitkomst> {
  const env = input.env ?? process.env;
  const winkel = input.winkel === undefined ? supabaseTekenwinkel(env) : input.winkel;
  if (!winkel) return { ok: false, melding: 'Ondertekenen is nu niet beschikbaar.' };
  if (input.stap.soort === 'download' && tokenVormGeldig(input.stap.token)) {
    try {
      const bewaard = await winkel.lees(hashTekenToken(input.stap.token));
      if (bewaard?.ondertekendOp) {
        // Een bewijsdownload blijft beschikbaar als het actieve sjabloon later
        // is veranderd of ontbreekt. De platformlaag controleert de link opnieuw.
        const uit = await voerTekenstap(input.stap, winkel);
        return uit.ok ? { ...uit, metSjabloon: true } : uit;
      }
    } catch {
      return { ok: false, melding: 'De opgeslagen ondertekende PDF kon niet worden gecontroleerd.' };
    }
  }
  const sjabloon = await leesContractSjabloon(env);
  if (sjabloon.fout) return { ok: false, melding: sjabloon.fout };
  const uit = await voerTekenstap(input.stap, winkel, { sjabloon: sjabloon.bytes });
  if (!uit.ok) return uit;
  let vervolgMelding: string | null = null;
  if (input.stap.soort === 'onderteken' && uit.dossier.ondertekendOp) {
    if (uit.dossier.machineProces) {
      try {
        if (input.naOndertekening) await input.naOndertekening(uit.dossier);
        else {
          const { verwerkVerhuurmachine } = await import('./verhuurmachine/proces.ts');
          await verwerkVerhuurmachine(env, { aanvraagId: uit.dossier.aanvraagId ?? undefined, maxJobs: 3 });
        }
      } catch {
        // Het bewijs en beide vervolgjobs zijn al gecommit. Een mislukte wake-up
        // verandert de ondertekening niet; de volgende worker hervat de queue.
      }
    } else {
      try {
        if (input.naOndertekening) await input.naOndertekening(uit.dossier);
        // Bestaande handmatig beheerde dossiers behouden hun afronding. Nieuwe
        // machineboekingen vervolgen uitsluitend vanuit hun duurzame SQL-job.
        const client = maakBeheerAdminClient(env);
        if (client) {
          const vervolg = await promoveerIndienKlaar(client as never, Number(uit.dossier.boekingId), { naam: 'Ondertekening', type: 'systeem' });
          if (!vervolg.ok) vervolgMelding = 'Het contract is ondertekend. De administratieve afronding vraagt controle door het kerkje.';
        }
      } catch {
        vervolgMelding = 'Het contract is ondertekend. De administratieve afronding vraagt controle door het kerkje.';
      }
    }
  }
  const antwoord = { ...uit, melding: vervolgMelding ?? uit.melding, metSjabloon: Boolean(sjabloon.bytes && sjabloon.bytes.byteLength > 0) };
  if (uit.mail === 'bevestiging' && uit.dossier.machineProces) {
    // De onderteken-RPC heeft de mailjob in dezelfde transactie aangemaakt.
    // Dit request verzendt niet nogmaals naast de geclaimde worker.
    return { ...antwoord, mail: undefined };
  }
  if (!antwoord.mail) return antwoord;
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
    const brief = ondertekenbrief(uit.dossier);
    let id: string | null = null;
    try {
      id = await mailMetPdf({
        naar: uit.dossier.email,
        onderwerp: `Ondertekend contract ${uit.dossier.contractnummer}`,
        tekst: brief.text,
        html: brief.html,
        sleutel: 'handmatige_template',
        richting: 'aanvrager',
        pdf: uit.pdf,
        naam,
        idempotentie: `teken-bevestiging:${uit.dossier.boekingId}:${uit.dossier.versie}`,
        env,
      });
    } catch {
      id = null;
    }
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
      return { ...antwoord, melding: 'Het contract is ondertekend. De bevestigingsmail is niet geaccepteerd door de mailprovider.' };
    }
  }
  return antwoord;
}

export function pakketVanDossier(dossier: TekenDossier): string {
  return contractPakketTekst(dossier.pakket);
}
