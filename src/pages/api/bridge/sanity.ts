import type { APIRoute } from 'astro';
import { leesBridgeSnapshot, pasBridgePlan } from '../../../lib/sanity-bridge-sync.ts';
import { maakBeheerAdminClient } from '../../../lib/supabase.ts';
import { normaliseerEvent, planBridge, webhookGeheimGeldig } from '../../../platform/sanity-bridge.ts';

export const prerender = false;

const treffers = new Map<string, number[]>();

function binnenLimiet(ip: string, nu = Date.now()): boolean {
  const recent = (treffers.get(ip) ?? []).filter((tijdstip) => nu - tijdstip < 60_000);
  if (recent.length >= 30) {
    treffers.set(ip, recent);
    return false;
  }
  recent.push(nu);
  treffers.set(ip, recent);
  return true;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!binnenLimiet(clientAddress ?? 'onbekend')) {
    return new Response('Te veel verzoeken', { status: 429 });
  }
  const raw = await request.text();
  const geheim = process.env.SANITY_BRIDGE_SECRET?.trim() ?? '';
  const header = request.headers.get('sanity-webhook-signature') ?? request.headers.get('authorization');
  if (!webhookGeheimGeldig(header, raw, geheim)) {
    return new Response('Unauthorized', { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('Ongeldige JSON', { status: 400 });
  }
  const event = normaliseerEvent(body, request.headers.get('sanity-operation'));
  if (!event || !event.document._id) return new Response('Onvolledig document', { status: 400 });

  const client = maakBeheerAdminClient();
  if (!client) return new Response('Supabase service-role ontbreekt', { status: 503 });
  const snapshot = await leesBridgeSnapshot(client, String(event.document._id));
  if (!snapshot) return new Response('Snapshot mislukt', { status: 500 });
  const plan = planBridge(event.action, event.document, snapshot);
  const fout = await pasBridgePlan(client, plan);
  if (fout) return new Response(fout, { status: 500 });
  return new Response(JSON.stringify({ status: plan.status, mail: plan.mail, workflow: plan.workflow }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
