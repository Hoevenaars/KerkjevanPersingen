import type { APIRoute } from 'astro';
import { maakVriendAan } from '../../lib/vrienden-supabase';
import { leesVriendAanmelding } from '../../lib/vriend-aanmelding';
import { teVaak } from '../../lib/validatie';
import { ymdInAmsterdam } from '../../platform/datum';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    if (teVaak(clientAddress ?? 'onbekend')) {
      return new Response(JSON.stringify({ error: 'Te veel aanmeldingen. Probeer het later opnieuw.' }), {
        status: 429,
      });
    }

    const body = await request.json();
    const gelezen = leesVriendAanmelding(body ?? {}, ymdInAmsterdam(new Date()));
    if (!gelezen.ok) {
      return new Response(JSON.stringify({ error: gelezen.fout }), { status: 400 });
    }

    await maakVriendAan(gelezen.aanmelding);

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('Fout bij aanmelden vriend:', err);
    return new Response(JSON.stringify({ error: 'Serverfout' }), { status: 500 });
  }
};
