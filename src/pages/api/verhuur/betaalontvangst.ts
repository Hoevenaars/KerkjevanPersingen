import type { APIRoute } from 'astro';
import { verifieerBetaalimport, leesBetaalimport } from '../../../platform/betaalontvangst-auth.ts';
import { maakBeheerAdminClient } from '../../../lib/supabase.ts';
import { verwerkBetaalontvangst } from '../../../lib/operatie/verhuur-betaalontvangst.ts';
import type { DossierSessie } from '../../../lib/operatie/dossier-sessie.ts';
import type { Actor } from '../../../lib/operatie/kern.ts';

export const prerender = false;
const antwoord = (status: number, payload: unknown) => new Response(JSON.stringify(payload), { status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** Providerneutrale ingang. Een adapter koppelt externe transacties expliciet aan betalingId. */
export const POST: APIRoute = async ({ request }) => {
  if (process.env.VERHUUR_MACHINE !== 'true') return antwoord(503, { ok: false, melding: 'Ontvangstverwerking is niet vrijgegeven.' });
  const secret = process.env.VERHUUR_BETALING_WEBHOOK_SECRET ?? '';
  if (secret.length < 32) return antwoord(503, { ok: false, melding: 'Ontvangstbron is niet geconfigureerd.' });
  const lengte = Number(request.headers.get('content-length') ?? 0);
  if (lengte > 100_000) return antwoord(413, { ok: false });
  const raw = await request.text();
  if (raw.length > 100_000) return antwoord(413, { ok: false });
  if (!verifieerBetaalimport({ raw, timestamp: request.headers.get('x-verhuur-timestamp'), signature: request.headers.get('x-verhuur-signature'), secret })) {
    return antwoord(401, { ok: false, melding: 'Ongeldige bronverificatie.' });
  }
  const importData = leesBetaalimport(raw);
  if (!importData.ok) return antwoord(400, importData);
  const client = maakBeheerAdminClient(process.env) as unknown as DossierSessie | null;
  if (!client) return antwoord(503, { ok: false, melding: 'Ontvangstregistratie is niet beschikbaar.' });
  const actor: Actor = { type: 'systeem', id: 'system', naam: 'Geverifieerde betaalimport',
    rechten: { isSuperAdmin: false, perModule: { finance: 'schrijven', boekingen: 'schrijven', aanvragen: 'schrijven', instellingen: 'schrijven' } } };
  const resultaten = [];
  for (const event of importData.events) {
    try {
      resultaten.push({ bron: event.bron, eventId: event.eventId, ...await verwerkBetaalontvangst({ client, event, actor }) });
    } catch {
      resultaten.push({ bron: event.bron, eventId: event.eventId, ok: false, melding: 'Registratie onderbroken; herhaal dezelfde ontvangst-id.' });
    }
  }
  const ok = resultaten.every((r) => r.ok);
  return antwoord(ok ? 200 : 207, { ok, resultaten });
};
