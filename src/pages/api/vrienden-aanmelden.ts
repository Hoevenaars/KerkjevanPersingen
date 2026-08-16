import type { APIRoute } from 'astro';
import { maakVriendAan } from '../../lib/sanity';
import { teVaak } from '../../lib/validatie';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    if (teVaak(clientAddress ?? 'onbekend')) {
      return new Response(JSON.stringify({ error: 'Te veel aanmeldingen. Probeer het later opnieuw.' }), {
        status: 429,
      });
    }

    const { naam, email } = await request.json();

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Ongeldig e-mailadres' }), { status: 400 });
    }

    const schoneNaam = typeof naam === 'string' ? naam.trim().slice(0, 120) : '';

    await maakVriendAan({ naam: schoneNaam, email: email.toLowerCase().trim() });

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('Fout bij aanmelden vriend:', err);
    return new Response(JSON.stringify({ error: 'Serverfout' }), { status: 500 });
  }
};
