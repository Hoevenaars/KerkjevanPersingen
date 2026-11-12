import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Deze route sloeg vroeger een vriend op zodra er een e-mailadres binnenkwam.
 * Dat is een open deur voor scripts. Aanmelden gaat alleen via het formulier
 * op /vrienden/aanmelden/, dat een ondertekend bewijs en een cookie eist.
 */
export const POST: APIRoute = () => {
  return new Response(
    JSON.stringify({ error: 'Aanmelden gaat via het formulier op /vrienden/aanmelden/.' }),
    {
      status: 403,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    },
  );
};
