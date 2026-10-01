/**
 * Server-side Sanity-brug. Leest Sanity alleen op verzoek en schrijft nooit terug.
 * Domeinwrites lopen via pas_sanity_bridge met de service-role.
 */

import { createClient } from '@sanity/client';
import { maakBeheerAdminClient } from './supabase.ts';
import {
  LEGE_SNAPSHOT,
  beoordeelReconciliatie,
  type BridgePlan,
  type BridgeSnapshot,
  type ReconciliatieOordeel,
  type SanityDocument,
} from '../platform/sanity-bridge.ts';

const BRIDGE_QUERY = `*[_type in ["activiteit","aanvraag","vriend","nieuwsbrief","instellingen"] && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]`;

type BeheerClient = NonNullable<ReturnType<typeof maakBeheerAdminClient>>;

export const WEBHOOK_ENDPOINT = 'https://kerkjepersingen.nl/api/bridge/sanity';
export const RECONCILIATIE_ZONDER_TOKEN =
  'Handmatige controle met Sanity is niet beschikbaar: SANITY_API_TOKEN ontbreekt.';

/** Alleen reconciliation. De webhook gebruikt SANITY_BRIDGE_SECRET, niet deze token. */
export function sanityLezenGeconfigureerd(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(String(env.SANITY_PROJECT_ID ?? '').trim() && String(env.SANITY_API_TOKEN ?? '').trim());
}

export function bridgeLeesfout(message: string): string {
  if (/invalid api key/i.test(message)) {
    return 'Supabase weigert de sleutel bij het lezen van de bridgelog (Invalid API key). Controleer SUPABASE_SERVICE_ROLE_KEY. Dit is niet SANITY_API_TOKEN.';
  }
  return message;
}

export async function leesRelevanteSanityDocumenten(): Promise<SanityDocument[] | null> {
  const projectId = process.env.SANITY_PROJECT_ID?.trim();
  const token = process.env.SANITY_API_TOKEN?.trim();
  if (!projectId || !token) return null;
  const client = createClient({
    projectId,
    dataset: process.env.SANITY_DATASET?.trim() || 'production',
    apiVersion: '2024-10-01',
    useCdn: false,
    token,
    perspective: 'published',
  });
  try {
    const documenten = await client.fetch<SanityDocument[]>(BRIDGE_QUERY);
    return documenten ?? [];
  } catch (error) {
    const tekst = error instanceof Error ? error.message : 'Sanity-lezen mislukt';
    throw new Error(`Sanity-controle mislukt: ${tekst}`);
  }
}

async function bestaat(client: BeheerClient, tabel: string, sanityId: string): Promise<boolean | null> {
  const db = client as unknown as {
    from: (naam: string) => {
      select: (kolommen: string) => {
        eq: (kolom: string, waarde: string) => {
          eq: (kolom: string, waarde: string) => {
            limit: (n: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
          };
          limit: (n: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const kolom = tabel === 'sanity_bridge_agenda' ? 'sanity_id' : 'legacy_id';
  const basis = db.from(tabel).select(kolom);
  const gefilterd = tabel === 'sanity_bridge_agenda'
    ? basis.eq(kolom, sanityId)
    : basis.eq('legacy_source', 'sanity').eq(kolom, sanityId);
  const { data, error } = await gefilterd.limit(1);
  if (error) return null;
  return (data ?? []).length > 0;
}

export async function leesBridgeSnapshot(client: BeheerClient, sanityId: string): Promise<BridgeSnapshot | null> {
  const tabellen = ['activiteit_bron', 'publieke_activiteiten', 'interne_activiteiten', 'boekingen', 'vrienden', 'nieuwsbrieven', 'aanvragen', 'sanity_bridge_agenda'] as const;
  const gevonden: Record<string, boolean> = {};
  for (const tabel of tabellen) {
    const rij = await bestaat(client, tabel, sanityId);
    if (rij === null) return null;
    gevonden[tabel] = rij;
  }
  const hashrij = await (client as unknown as {
    from: (naam: string) => {
      select: (kolommen: string) => {
        eq: (kolom: string, waarde: string) => {
          order: (kolom: string, opties: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: { source_hash: string | null }[] | null; error: { message: string } | null }>;
          };
        };
      };
    };
  }).from('bridge_sync_log').select('source_hash').eq('sanity_document_id', sanityId).order('received_at', { ascending: false }).limit(1);
  if (hashrij.error) return null;
  return {
    ...LEGE_SNAPSHOT,
    hash: hashrij.data?.[0]?.source_hash ?? null,
    heeftBron: gevonden.activiteit_bron,
    heeftPubliek: gevonden.publieke_activiteiten,
    heeftIntern: gevonden.interne_activiteiten,
    heeftBoeking: gevonden.boekingen,
    heeftVriend: gevonden.vrienden,
    heeftNieuwsbrief: gevonden.nieuwsbrieven,
    heeftAanvraag: gevonden.aanvragen,
    heeftShadow: gevonden.sanity_bridge_agenda,
  };
}

export interface ControleRij {
  sanityId: string;
  documentType: string;
  oordeel: ReconciliatieOordeel;
  toelichting: string | null;
}

export async function controleerSanitySynchronisatie(client: BeheerClient): Promise<ControleRij[] | null> {
  const documenten = await leesRelevanteSanityDocumenten();
  if (!documenten) return null;
  const rijen: ControleRij[] = [];
  for (const document of documenten) {
    const id = String(document._id ?? '');
    const snapshot = await leesBridgeSnapshot(client, id);
    if (!snapshot) {
      rijen.push({ sanityId: id, documentType: String(document._type ?? ''), oordeel: 'error', toelichting: 'snapshot mislukt' });
      continue;
    }
    const beoordeling = beoordeelReconciliatie(document, snapshot);
    rijen.push({
      sanityId: id,
      documentType: beoordeling.plan.documentType,
      oordeel: beoordeling.oordeel,
      toelichting: beoordeling.plan.error,
    });
  }
  return rijen;
}

export async function verwerkAfwijkendeDocumenten(client: BeheerClient): Promise<{ verwerkt: number; overgeslagen: number; fout: string | null }> {
  const documenten = await leesRelevanteSanityDocumenten();
  if (!documenten) return { verwerkt: 0, overgeslagen: 0, fout: 'Sanity-lezen niet geconfigureerd' };
  let verwerkt = 0;
  let overgeslagen = 0;
  for (const document of documenten) {
    const id = String(document._id ?? '');
    const snapshot = await leesBridgeSnapshot(client, id);
    if (!snapshot) return { verwerkt, overgeslagen, fout: `snapshot mislukt voor ${id}` };
    const beoordeling = beoordeelReconciliatie(document, snapshot);
    if (beoordeling.oordeel !== 'ontbrekend' && beoordeling.oordeel !== 'afwijkend') {
      overgeslagen += 1;
      continue;
    }
    const fout = await pasBridgePlan(client, beoordeling.plan);
    if (fout) return { verwerkt, overgeslagen, fout };
    verwerkt += 1;
  }
  return { verwerkt, overgeslagen, fout: null };
}

export async function pasBridgePlan(client: BeheerClient, plan: BridgePlan): Promise<string | null> {
  const { error } = await client.rpc('pas_sanity_bridge' as never, {
    p_stappen: plan.stappen,
    p_log: {
      sanityId: plan.sanityId,
      documentType: plan.documentType,
      action: plan.action,
      status: plan.status,
      targetTable: plan.targetTable,
      targetId: plan.targetId,
      error: plan.error,
      sourceUpdatedAt: plan.sourceUpdatedAt,
      sourceHash: plan.sourceHash,
    },
  } as never);
  return error?.message ?? null;
}
