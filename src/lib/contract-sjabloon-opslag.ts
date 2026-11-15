/**
 * Het contractsjabloon staat in de documentenbucket.
 * Lukt die upload niet, dan staat dezelfde PDF in instellingen.
 * Zonder beide blijft het meegeleverde sjabloon de uitvoer,
 * tot iemand het sjabloon bewust verwijdert.
 */

import { readFileSync } from 'node:fs';
import { leesbareSupabaseFout, maakBeheerAdminClient } from './supabase.ts';
import { leesSjabloonVelden } from '../platform/documenten/pdf-sjabloon.ts';

export const CONTRACT_SJABLOON_BUCKET = 'booking-documents';
export const CONTRACT_SJABLOON_PAD = 'sjablonen/huurovereenkomst.pdf';
const PDF_SLEUTEL = 'contractsjabloon_pdf';
const BRON_SLEUTEL = 'contractsjabloon_bron';

const MAX_BYTES = 5_000_000;
const GEBUNDELD = new URL('../platform/documenten/sjablonen/huurovereenkomst.pdf', import.meta.url);

type OpslagFout = { message: string } | null;

interface Emmer {
  download(pad: string): Promise<{ data: Blob | null; error: OpslagFout }>;
  upload(pad: string, body: Blob, opties: { contentType: string; upsert: boolean }): Promise<{ error: OpslagFout }>;
  remove(paden: string[]): Promise<{ error: OpslagFout }>;
}

interface Instellingen {
  select(kolommen: string): {
    eq(kolom: string, waarde: string): {
      maybeSingle(): Promise<{ data: { waarde: unknown } | null; error: OpslagFout }>;
    };
  };
  upsert(rij: Record<string, unknown>, opties: { onConflict: string }): Promise<{ error: OpslagFout }>;
  delete(): {
    eq(kolom: string, waarde: string): Promise<{ error: OpslagFout }>;
  };
}

export interface SjabloonClient {
  storage: { from(bucket: string): Emmer };
  from(tabel: string): Instellingen;
}

export interface SjabloonStand {
  bytes: Uint8Array | null;
  fout: string | null;
}

function clientUit(env?: Record<string, unknown>): SjabloonClient | null {
  return maakBeheerAdminClient(env) as unknown as SjabloonClient | null;
}

function clients(env: Record<string, unknown>, extra?: SjabloonClient | null): SjabloonClient[] {
  const lijst = [clientUit(env), extra ?? null].filter((client): client is SjabloonClient => Boolean(client?.storage?.from));
  return [...new Set(lijst)];
}

function ontbreekt(bericht: string): boolean {
  return /not found|404|nosuch|does not exist/i.test(bericht);
}

function meldingVan(fout: unknown, fallback: string): string {
  const tekst = leesbareSupabaseFout(fout, '').replace(/\s+/g, ' ').trim();
  if (!tekst) return fallback;
  return `${fallback} ${tekst.slice(0, 220)}`;
}

export function gebundeldContractSjabloon(): Uint8Array | null {
  try {
    const bytes = new Uint8Array(readFileSync(GEBUNDELD));
    return controleerContractSjabloon(bytes) ? null : bytes;
  } catch {
    return null;
  }
}

export function controleerContractSjabloon(bytes: Uint8Array): string | null {
  if (bytes.byteLength < 800) return 'Het bestand is te klein voor een PDF-sjabloon.';
  if (bytes.byteLength > MAX_BYTES) return 'Het sjabloon is groter dan 5 MB.';
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') return 'Het bestand is geen PDF.';
  const staart = Buffer.from(bytes.subarray(Math.max(0, bytes.byteLength - 1024))).toString('latin1');
  if (!staart.includes('%%EOF')) return 'Het bestand is geen volledige PDF.';
  return null;
}

function pdfUitWaarde(waarde: unknown): Uint8Array | null {
  if (!waarde || typeof waarde !== 'object' || !('pdf' in waarde)) return null;
  const pdf = waarde.pdf;
  if (typeof pdf !== 'string' || pdf.length < 100) return null;
  const bytes = new Uint8Array(Buffer.from(pdf, 'base64'));
  return controleerContractSjabloon(bytes) ? null : bytes;
}

async function leesWaarde(client: SjabloonClient, sleutel: string): Promise<unknown | undefined> {
  if (typeof client.from !== 'function') return undefined;
  const antwoord = await client.from('instellingen').select('waarde').eq('sleutel', sleutel).maybeSingle();
  if (antwoord.error || !antwoord.data) return undefined;
  return antwoord.data.waarde;
}

async function zetBron(client: SjabloonClient, bron: 'bewaard' | 'geen'): Promise<OpslagFout> {
  const antwoord = await client.from('instellingen').upsert({
    sleutel: BRON_SLEUTEL,
    groep: 'documenten',
    waarde: { bron },
    toelichting: 'Of het contractsjabloon gebruikt wordt.',
  }, { onConflict: 'sleutel' });
  return antwoord.error;
}

async function bewaarPdfRij(client: SjabloonClient, bytes: Uint8Array): Promise<OpslagFout> {
  const antwoord = await client.from('instellingen').upsert({
    sleutel: PDF_SLEUTEL,
    groep: 'documenten',
    waarde: { pdf: Buffer.from(bytes).toString('base64') },
    toelichting: 'PDF-sjabloon van de huurovereenkomst.',
  }, { onConflict: 'sleutel' });
  return antwoord.error;
}

async function wisPdfRij(client: SjabloonClient): Promise<void> {
  if (typeof client.from !== 'function') return;
  await client.from('instellingen').delete().eq('sleutel', PDF_SLEUTEL);
}

function pdfBody(bytes: Uint8Array): Blob {
  return new Blob([bytes], { type: 'application/pdf' });
}

async function uploadNaarBucket(client: SjabloonClient, bytes: Uint8Array): Promise<OpslagFout> {
  const emmer = client.storage.from(CONTRACT_SJABLOON_BUCKET);
  const opties = { contentType: 'application/pdf', upsert: true };
  const eerste = await emmer.upload(CONTRACT_SJABLOON_PAD, pdfBody(bytes), opties);
  if (!eerste.error) return null;
  if (!/already exists|duplicate/i.test(eerste.error.message)) return eerste.error;
  await emmer.remove([CONTRACT_SJABLOON_PAD]);
  const opnieuw = await emmer.upload(CONTRACT_SJABLOON_PAD, pdfBody(bytes), opties);
  return opnieuw.error;
}

export async function leesContractSjabloon(
  env: Record<string, unknown> = process.env,
  extra?: SjabloonClient | null,
): Promise<SjabloonStand> {
  const lijst = clients(env, extra);
  let uitgezet = false;
  for (const client of lijst) {
    const rij = pdfUitWaarde(await leesWaarde(client, PDF_SLEUTEL));
    if (rij) return { bytes: rij, fout: null };
    const bron = await leesWaarde(client, BRON_SLEUTEL);
    if (bron && typeof bron === 'object' && 'bron' in bron && bron.bron === 'geen') uitgezet = true;
  }
  let leesfout = false;
  for (const client of lijst) {
    const { data, error } = await client.storage.from(CONTRACT_SJABLOON_BUCKET).download(CONTRACT_SJABLOON_PAD);
    if (error) {
      if (!ontbreekt(error.message)) leesfout = true;
      continue;
    }
    if (!data) continue;
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (!controleerContractSjabloon(bytes)) return { bytes, fout: null };
    leesfout = true;
  }
  if (uitgezet) return { bytes: null, fout: null };
  const gebundeld = gebundeldContractSjabloon();
  if (gebundeld) return { bytes: gebundeld, fout: null };
  if (leesfout) return { bytes: null, fout: 'Het contractsjabloon is niet gelezen. Er is geen PDF gemaakt.' };
  return { bytes: null, fout: null };
}

export async function bewaarContractSjabloon(
  bytes: Uint8Array,
  env: Record<string, unknown> = process.env,
  extra?: SjabloonClient | null,
): Promise<{ ok: true; bekende: string[]; onbekend: string[] } | { ok: false; melding: string }> {
  const vorm = controleerContractSjabloon(bytes);
  if (vorm) return { ok: false, melding: vorm };
  const gelezen = await leesSjabloonVelden(bytes);
  if (gelezen.fout) return { ok: false, melding: gelezen.fout };
  const lijst = clients(env, extra);
  if (lijst.length === 0) return { ok: false, melding: 'Geen databaseclient. Er is niets opgeslagen.' };

  let bucketFout: OpslagFout = { message: '' };
  let bucketOk = false;
  for (const client of lijst) {
    bucketFout = await uploadNaarBucket(client, bytes);
    if (!bucketFout) {
      bucketOk = true;
      break;
    }
  }

  let rijFout: OpslagFout = { message: '' };
  let rijOk = false;
  for (const client of lijst) {
    if (typeof client.from !== 'function') continue;
    rijFout = await bewaarPdfRij(client, bytes);
    if (rijFout) continue;
    rijFout = await zetBron(client, 'bewaard');
    if (!rijFout) {
      rijOk = true;
      break;
    }
  }

  if (bucketOk && !rijOk) {
    for (const client of lijst) await wisPdfRij(client);
  }
  if (bucketOk || rijOk) return { ok: true, bekende: gelezen.bekende, onbekend: gelezen.onbekend };
  const bucketTekst = meldingVan(bucketFout, 'Het sjabloon is niet opgeslagen.');
  const rijTekst = meldingVan(rijFout, '');
  return { ok: false, melding: rijTekst ? `${bucketTekst} ${rijTekst}` : bucketTekst };
}

export async function verwijderContractSjabloon(
  env: Record<string, unknown> = process.env,
  extra?: SjabloonClient | null,
): Promise<{ ok: true } | { ok: false; melding: string }> {
  const lijst = clients(env, extra);
  if (lijst.length === 0) return { ok: false, melding: 'Geen databaseclient. Er is niets verwijderd.' };
  let wegFout: OpslagFout = null;
  for (const client of lijst) {
    const weg = await client.storage.from(CONTRACT_SJABLOON_BUCKET).remove([CONTRACT_SJABLOON_PAD]);
    if (!weg.error || ontbreekt(weg.error.message)) {
      wegFout = null;
      break;
    }
    wegFout = weg.error;
  }
  if (wegFout) return { ok: false, melding: meldingVan(wegFout, 'Het sjabloon is niet verwijderd.') };
  let bronFout: OpslagFout = { message: '' };
  let bronOk = false;
  for (const client of lijst) {
    if (typeof client.from !== 'function') continue;
    await wisPdfRij(client);
    bronFout = await zetBron(client, 'geen');
    if (!bronFout) {
      bronOk = true;
      break;
    }
  }
  if (!bronOk) return { ok: false, melding: meldingVan(bronFout, 'Het sjabloon is niet verwijderd.') };
  return { ok: true };
}
