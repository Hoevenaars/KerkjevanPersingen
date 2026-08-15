import type { APIRoute } from 'astro';
import { verstuurPreview } from '../../../lib/nieuwsbrief';

export const prerender = false;

const PREVIEW_ADRES = 'JOUW_EIGEN_ADRES@voorbeeld.nl'; // <-- vul hier je eigen e-mailadres in
const DOEL_UUR = 16;
const DOEL_MINUUT = 0;
const TOLERANTIE_MINUTEN = 20; // vangt kleine cron-jitter op

function isJuisteMoment(): boolean {
  const nu = new Date();
  const nlTijd = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(nu);

  const uur = Number(nlTijd.find((p) => p.type === 'hour')?.value ?? -1);
  const minuut = Number(nlTijd.find((p) => p.type === 'minute')?.value ?? -1);

  const doelInMinuten = DOEL_UUR * 60 + DOEL_MINUUT;
  const nuInMinuten = uur * 60 + minuut;

  return Math.abs(nuInMinuten - doelInMinuten) <= TOLERANTIE_MINUTEN;
}

export const GET: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isJuisteMoment()) {
    return new Response(JSON.stringify({ ok: true, actie: 'overgeslagen, niet het juiste moment' }), { status: 200 });
  }

  try {
    await verstuurPreview(PREVIEW_ADRES);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('Fout bij nieuwsbrief-preview:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
};
