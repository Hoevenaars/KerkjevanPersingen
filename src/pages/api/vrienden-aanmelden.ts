import type { APIRoute } from 'astro';
import { maakVriendAan } from '../../lib/sanity';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { naam, email } = await request.json();

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Ongeldig e-mailadres' }), { status: 400 });
    }

    await maakVriendAan({ naam: naam ?? '', email: email.toLowerCase().trim() });

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('Fout bij aanmelden vriend:', err);
    return new Response(JSON.stringify({ error: 'Serverfout' }), { status: 500 });
  }
};
