import type { APIRoute } from 'astro';
import { leesResendGebeurtenis, verifieerResendHandtekening } from '../../../lib/nieuwsbrief-bereik.ts';
import { noteerNieuwsbriefGebeurtenis } from '../../../lib/nieuwsbrief-bereik-opslag.ts';
import { maakBeheerAdminClient } from '../../../lib/supabase.ts';

export const prerender = false;

function header(request: Request, naam: string): string | null {
  return request.headers.get(naam) ?? request.headers.get(naam.replace('svix-', 'webhook-'));
}

/** Resend meldt of een vriend de nieuwsbrief opende of de agenda-activiteit aanklikte. */
export const POST: APIRoute = async ({ request }) => {
  const payload = await request.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim() ?? '';
  if (!secret) {
    console.error('[nieuwsbrief] RESEND_WEBHOOK_SECRET ontbreekt');
    return new Response('niet geconfigureerd', { status: 503 });
  }
  const geldig = verifieerResendHandtekening({
    payload,
    id: header(request, 'svix-id'),
    timestamp: header(request, 'svix-timestamp'),
    signature: header(request, 'svix-signature'),
    secret,
  });
  if (!geldig) return new Response('ongeldig', { status: 400 });

  let body: unknown;
  try {
    body = JSON.parse(payload);
  } catch {
    return new Response('ongeldig', { status: 400 });
  }
  const gebeurtenis = leesResendGebeurtenis(body);
  if (!gebeurtenis) return new Response('ok');

  const admin = maakBeheerAdminClient();
  if (!admin) return new Response('niet geconfigureerd', { status: 503 });
  try {
    const uit = await noteerNieuwsbriefGebeurtenis(admin, gebeurtenis, new Date());
    if (uit === 'onbekend' && gebeurtenis.vanOns) return new Response('nog niet vastgelegd', { status: 503 });
  } catch {
    console.error('[nieuwsbrief] bereik niet bijgewerkt', gebeurtenis.emailId);
    return new Response('mislukt', { status: 500 });
  }
  return new Response('ok');
};
