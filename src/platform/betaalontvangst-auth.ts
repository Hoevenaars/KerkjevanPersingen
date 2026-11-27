import { createHmac, timingSafeEqual } from 'node:crypto';
import { betaalontvangstFout, type BetaalontvangstEvent } from './verhuur-financieel.ts';

/** HMAC over timestamp + punt + exacte body; replay beperkt door tijdvenster én eventledger. */
export function verifieerBetaalimport(input: { raw: string; timestamp: string | null; signature: string | null; secret: string; nuMs?: number }): boolean {
  if (input.secret.length < 32 || input.raw.length > 100_000 || !input.timestamp || !/^\d{10}$/.test(input.timestamp) || !input.signature || !/^[0-9a-f]{64}$/i.test(input.signature)) return false;
  if (Math.abs((input.nuMs ?? Date.now()) - Number(input.timestamp) * 1000) > 300_000) return false;
  const verwacht = createHmac('sha256', input.secret).update(`${input.timestamp}.${input.raw}`).digest();
  const ontvangen = Buffer.from(input.signature, 'hex');
  return ontvangen.byteLength === verwacht.byteLength && timingSafeEqual(ontvangen, verwacht);
}

export function leesBetaalimport(raw: string): { ok: true; events: BetaalontvangstEvent[] } | { ok: false; melding: string } {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { ok: false, melding: 'Ongeldige JSON.' }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, melding: 'Een events-object is vereist.' };
  const events = (parsed as { events?: unknown }).events;
  if (!Array.isArray(events) || events.length < 1 || events.length > 100) return { ok: false, melding: 'Lever 1 tot 100 ontvangsten per import aan.' };
  const gelezen: BetaalontvangstEvent[] = [];
  for (const item of events) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.bron !== 'string' || typeof item.eventId !== 'string' ||
        typeof item.betalingId !== 'number' || typeof item.bedragCent !== 'number' || typeof item.ontvangenOp !== 'string' ||
        (item.referentie != null && typeof item.referentie !== 'string')) return { ok: false, melding: 'De ontvangstvelden hebben ongeldige types.' };
    const event: BetaalontvangstEvent = { bron: item.bron, eventId: item.eventId, betalingId: item.betalingId,
      bedragCent: item.bedragCent, ontvangenOp: item.ontvangenOp, referentie: item.referentie ?? '' };
    const fout = betaalontvangstFout(event);
    if (fout) return { ok: false, melding: fout };
    gelezen.push(event);
  }
  return { ok: true, events: gelezen };
}
