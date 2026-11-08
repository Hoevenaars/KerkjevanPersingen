import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * De webhook is dicht. Er wordt niets gelezen, niets geschreven en geen
 * service-role gebruikt. Een nog ingestelde Sanity-webhook krijgt 410.
 */
export const POST: APIRoute = async () => {
  return new Response('Sanity-bridge is verwijderd. Er is niets opgeslagen.', {
    status: 410,
    headers: { 'Cache-Control': 'no-store' },
  });
};
