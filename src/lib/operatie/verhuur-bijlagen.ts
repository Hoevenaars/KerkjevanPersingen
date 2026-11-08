/**
 * Leest aangeleverde stukken voor het verhuurdossier met de ingelogde sessie.
 * Geen service-role. Een ontbrekende beoordelingstabel laat de rest gewoon zien.
 */

import { AANVRAAG_FOTO_BUCKET } from '../../platform/aanvraag-foto.ts';
import { INTAKE_BUCKET } from '../../platform/intake-foto.ts';
import type { StukBron, VerhuurAudit, VerhuurBeoordeling, VerhuurStuk, VerhuurVerzending } from '../../platform/verhuur-overzicht.ts';

const DOCUMENT_BUCKET = 'booking-documents';

type Fout = { message: string; code?: string } | null;
type Antwoord = { data: Record<string, unknown>[] | null; error: Fout };

interface Ketting extends PromiseLike<Antwoord> {
  eq: (kolom: string, waarde: unknown) => Ketting;
}

export interface VerhuurBijlageClient {
  from: (tabel: string) => {
    select: (kolommen: string) => Ketting;
  };
  storage?: {
    from: (bucket: string) => {
      createSignedUrl: (pad: string, seconden: number) => Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
    };
  };
}

export interface VerhuurBijlagen {
  stukken: VerhuurStuk[];
  beoordelingen: VerhuurBeoordeling[];
  verzendingen: VerhuurVerzending[];
  audit: VerhuurAudit[];
  documentUrls: Record<string, string>;
  stukkenGeladen: boolean;
  beoordelingOpslag: boolean;
}

function tekst(waarde: unknown): string {
  return waarde == null ? '' : String(waarde);
}

async function lees(client: VerhuurBijlageClient, tabel: string, kolommen: string): Promise<Antwoord> {
  try {
    return await client.from(tabel).select(kolommen);
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'laden mislukt' } };
  }
}

async function leesGefilterd(client: VerhuurBijlageClient, tabel: string, kolommen: string, filters: Record<string, string>): Promise<Antwoord> {
  try {
    let query = client.from(tabel).select(kolommen);
    for (const [kolom, waarde] of Object.entries(filters)) query = query.eq(kolom, waarde);
    return await query;
  } catch (error) {
    return { data: null, error: { message: error instanceof Error ? error.message : 'laden mislukt' } };
  }
}

async function onderteken(client: VerhuurBijlageClient, bucket: string, pad: string): Promise<string> {
  if (!pad || !client.storage) return '';
  try {
    const uit = await client.storage.from(bucket).createSignedUrl(pad, 600);
    return uit.data?.signedUrl ?? '';
  } catch {
    return '';
  }
}

export async function leesVerhuurBijlagen(
  client: VerhuurBijlageClient,
  opties: {
    aanvraagNaarBoeking: Readonly<Record<string, string>>;
    dossierBoekingId: string;
    magAudit: boolean;
  },
): Promise<VerhuurBijlagen> {
  const [fotos, intake, documenten, beoordelingen, verzendingen, templates] = await Promise.all([
    lees(client, 'aanvraag_fotos', 'id,aanvraag_id,bestandsnaam,storage_pad,aangemaakt_op'),
    lees(client, 'content_intake_bestanden', 'id,boeking_id,rol,storage_pad,aangemaakt_op'),
    lees(client, 'documenten', 'id,boeking_id,bestandsnaam,type,storage_pad'),
    lees(client, 'stuk_beoordelingen', 'boeking_id,bron,bron_id,versie,status,reden,beoordeeld_door_naam,beoordeeld_op'),
    lees(client, 'communicatie_verzendingen', 'boeking_id,template_id,status,verzonden_op,test'),
    lees(client, 'communicatie_templates', 'id,sleutel,naam'),
  ]);
  const stukkenGeladen = !fotos.error && !intake.error && !documenten.error;
  const opslagAan = !beoordelingen.error;
  const sjabloon = new Map<string, { sleutel: string; naam: string }>();
  for (const rij of templates.data ?? []) {
    sjabloon.set(tekst(rij.id), { sleutel: tekst(rij.sleutel), naam: tekst(rij.naam) });
  }
  const openDossier = opties.dossierBoekingId;
  const stukken: VerhuurStuk[] = [];
  for (const rij of fotos.data ?? []) {
    const aanvraagId = tekst(rij.aanvraag_id);
    const boekingId = opties.aanvraagNaarBoeking[aanvraagId] ?? '';
    if (!boekingId) continue;
    const pad = tekst(rij.storage_pad);
    stukken.push({
      bron: 'aanvraag_foto',
      bronId: tekst(rij.id),
      versie: pad || tekst(rij.id),
      boekingId,
      titel: tekst(rij.bestandsnaam) || 'Foto bij de aanvraag',
      soort: 'foto',
      url: openDossier === boekingId ? await onderteken(client, AANVRAAG_FOTO_BUCKET, pad) : '',
      tekst: '',
    });
  }
  for (const rij of intake.data ?? []) {
    const boekingId = tekst(rij.boeking_id);
    const pad = tekst(rij.storage_pad);
    stukken.push({
      bron: 'content_intake',
      bronId: tekst(rij.id) || pad,
      versie: pad || tekst(rij.aangemaakt_op),
      boekingId,
      titel: tekst(rij.rol) === 'hoofd' ? 'Hoofdfoto van de huurder' : 'Extra foto van de huurder',
      soort: 'foto',
      url: openDossier === boekingId ? await onderteken(client, INTAKE_BUCKET, pad) : '',
      tekst: '',
    });
  }
  const documentUrls: Record<string, string> = {};
  for (const rij of documenten.data ?? []) {
    const id = tekst(rij.id);
    const boekingId = tekst(rij.boeking_id);
    const pad = tekst(rij.storage_pad);
    if (openDossier === boekingId && pad) documentUrls[id] = await onderteken(client, DOCUMENT_BUCKET, pad);
    if (stukken.some((stuk) => stuk.bron === 'document' && stuk.bronId === id)) continue;
    stukken.push({
      bron: 'document' satisfies StukBron,
      bronId: id,
      versie: id,
      boekingId,
      titel: tekst(rij.bestandsnaam) || 'Document',
      soort: 'document',
      url: documentUrls[id] ?? '',
      tekst: '',
    });
  }
  const audit = opties.magAudit && openDossier
    ? await leesGefilterd(client, 'auditlog', 'onderwerp_id,actie,op,actor_naam,reden', {
      onderwerp_type: 'boeking',
      onderwerp_id: openDossier,
    })
    : { data: [], error: null };
  return {
    stukken,
    beoordelingen: (opslagAan ? beoordelingen.data ?? [] : []).map((rij) => ({
      boekingId: tekst(rij.boeking_id),
      bron: tekst(rij.bron),
      bronId: tekst(rij.bron_id),
      versie: tekst(rij.versie),
      status: tekst(rij.status),
      reden: tekst(rij.reden),
      door: tekst(rij.beoordeeld_door_naam),
      op: tekst(rij.beoordeeld_op),
    })),
    verzendingen: (verzendingen.data ?? []).map((rij) => {
      const sjab = sjabloon.get(tekst(rij.template_id));
      const naam = `${sjab?.sleutel ?? ''} ${sjab?.naam ?? ''}`.toLowerCase();
      return {
        boekingId: tekst(rij.boeking_id),
        status: tekst(rij.status),
        verzondenOp: tekst(rij.verzonden_op),
        test: rij.test === true,
        contract: naam.includes('contract'),
      };
    }),
    audit: (audit.data ?? []).map((rij) => ({
      boekingId: tekst(rij.onderwerp_id),
      actie: tekst(rij.actie),
      wanneer: tekst(rij.op),
      actor: tekst(rij.actor_naam),
      reden: tekst(rij.reden),
    })),
    documentUrls,
    stukkenGeladen,
    beoordelingOpslag: opslagAan,
  };
}
