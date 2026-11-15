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
    return {
      ok: true,
      melding: 'Dit is een leesversie. Het contractpakket met PDF maakt u in het aanvraagdossier. Er is niets opgeslagen en er is geen mail verstuurd.',
      toonBrief: true,
      brief: vers,
    };
  }
  const tekst = input.tekst.trim() || vers.tekst;
  const onderwerp = input.onderwerp.trim() || vers.onderwerp;
  return {
    ok: false,
    melding: 'Een contractmail zonder het PDF-contractpakket wordt niet verstuurd. Gebruik het contract in het aanvraagdossier.',
    toonBrief: true,
    brief: { onderwerp, tekst },
  };
}
