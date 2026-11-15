/**
 * Genereert de contractbrief, bewaart die bij de boeking en verstuurt
 * precies de tekst die de beheerder heeft gelezen.
 */

import { contractBestandsnaam, genereerContractbrief, type ContractBron, type ContractBrief } from '../platform/contract-brief.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ContractOpslag {
  storage: {
    from(bucket: string): {
      upload(
        pad: string,
        body: Blob,
        opties: { contentType: string; upsert: boolean },
      ): Promise<{ error: { message: string } | null }>;
    };
  };
  from(tabel: string): {
    insert(rij: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
  };
}

export interface ContractActieUitkomst {
  ok: boolean;
  melding: string;
  toonBrief: boolean;
  brief: ContractBrief | null;
}

function isBrief(waarde: ContractBrief | { fout: string }): waarde is ContractBrief {
  return 'tekst' in waarde;
}

export async function bewaarContractdocument(
  opslag: ContractOpslag,
  bron: ContractBron,
  brief: ContractBrief,
  versie: number,
  gebruikerId: string | null,
): Promise<{ opgeslagen: boolean; detail: string }> {
  const naam = contractBestandsnaam(bron.huurder, versie);
  const pad = `${bron.id}/${naam}`;
  const bytes = new TextEncoder().encode(brief.tekst);
  const upload = await opslag.storage.from('booking-documents').upload(pad, new Blob([bytes], { type: 'text/plain' }), {
    contentType: 'text/plain',
    upsert: false,
  });
  if (upload.error) return { opgeslagen: false, detail: 'Het bestand staat niet in de documentenlijst.' };
  const rij: Record<string, unknown> = {
    boeking_id: Number(bron.id),
    type: 'contract',
    bestandsnaam: naam,
    storage_pad: pad,
    mime_type: 'text/plain',
    grootte_bytes: bytes.byteLength,
    versie,
    sjabloon_sleutel: 'contract_begeleiding',
  };
  if (gebruikerId && UUID.test(gebruikerId)) rij.geupload_door = gebruikerId;
  const insert = await opslag.from('documenten').insert(rij);
  if (insert.error) return { opgeslagen: false, detail: 'Het bestand is geüpload, de documentregel niet.' };
  return { opgeslagen: true, detail: naam };
}

export async function verwerkContractActie(input: {
  actie: 'contract_genereer' | 'contract_verstuur';
  bron: ContractBron;
  bestaandeContracten: number;
  tekst: string;
  onderwerp: string;
  demo: boolean;
  opslag: ContractOpslag | null;
  gebruikerId: string | null;
  verstuur?: (brief: ContractBrief) => Promise<{ ok: boolean; melding: string }>;
}): Promise<ContractActieUitkomst> {
  const vers = genereerContractbrief(input.bron);
  if (!isBrief(vers)) return { ok: false, melding: vers.fout, toonBrief: false, brief: null };
  if (input.actie === 'contract_genereer') {
    if (input.demo) {
      return {
        ok: true,
        melding: 'Contract staat klaar om door te lezen. Dit is een voorbeeld: er is niets opgeslagen.',
        toonBrief: true,
        brief: vers,
      };
    }
    if (!input.opslag) {
      return {
        ok: false,
        melding: 'Geen ingelogde sessie. Het contract staat hier om te lezen. Er is niets opgeslagen.',
        toonBrief: true,
        brief: vers,
      };
    }
    const bewaard = await bewaarContractdocument(
      input.opslag,
      input.bron,
      vers,
      input.bestaandeContracten + 1,
      input.gebruikerId,
    );
    return {
      ok: true,
      melding: bewaard.opgeslagen
        ? `Contract staat klaar om door te lezen. Bestand: ${bewaard.detail}.`
        : `Contract staat klaar om door te lezen. ${bewaard.detail}`,
      toonBrief: true,
      brief: vers,
    };
  }
  const tekst = input.tekst.trim() || vers.tekst;
  const onderwerp = input.onderwerp.trim() || vers.onderwerp;
  const brief = { onderwerp, tekst };
  if (input.bron.email === 'niet ingevuld') {
    return { ok: false, melding: 'Deze boeking heeft geen e-mailadres. Er is geen mail verstuurd.', toonBrief: true, brief };
  }
  if (input.demo) {
    return { ok: true, melding: 'Voorbeeld. De brief is niet verstuurd.', toonBrief: true, brief };
  }
  if (!input.verstuur) return { ok: false, melding: 'Verzenden is niet beschikbaar. Er is geen mail verstuurd.', toonBrief: true, brief };
  const uit = await input.verstuur(brief);
  return { ok: uit.ok, melding: uit.melding, toonBrief: true, brief };
}
