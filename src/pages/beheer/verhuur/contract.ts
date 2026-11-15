import type { APIRoute } from 'astro';
import { beheerRedirect } from '../../../lib/beheer-http.ts';
import { beheerUitResponse } from '../../../platform/beheer-gate.ts';
import { laadBeheerSnapshot, beheerSnapshotOpties } from '../../../platform/beheer-bron.ts';
import { magSchrijven } from '../../../platform/rechten.ts';
import { verhuurOverzichtAan } from '../../../platform/verhuur-vlag.ts';
import { veiligeVerhuurTerug } from '../../../platform/verhuur-scherm.ts';
import { wizardAdres } from '../../../platform/verhuurder.ts';

export const prerender = false;

function tekst(status: number, melding: string): Response {
  return new Response(melding, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/**
 * Oude genereer-knop. Het contract ontstaat alleen nog in de wizard.
 */
export const POST: APIRoute = async (context) => {
  if (!verhuurOverzichtAan()) return beheerUitResponse();

  const rechten = context.locals.beheer?.effectieveRechten ?? { isSuperAdmin: false, perModule: {} };
  const viewAs = Boolean(context.locals.beheer?.viewAs);
  if (viewAs || !magSchrijven(rechten, 'boekingen')) {
    return tekst(403, 'Je kunt het dossier bekijken. Het contract vraagt schrijfrecht op boekingen. Er is niets verstuurd.');
  }

  const formulier = await context.request.formData();
  const origin = context.url.origin;
  const terug = String(formulier.get('terug') ?? '');
  const snapshot = await laadBeheerSnapshot({
    ...beheerSnapshotOpties(context),
    url: new URL(veiligeVerhuurTerug(terug, origin), origin),
  });
  const boekingId = String(formulier.get('boekingId') ?? '');
  const boeking = snapshot.boekingen.find((item) => item.id === boekingId);
  if (!boeking) return tekst(404, 'Deze boeking staat niet in het overzicht. Er is niets verstuurd.');
  const aanvraag = snapshot.aanvragen.find((item) => item.boekingId === boeking.id || item.id === boeking.aanvraagId);
  return beheerRedirect(wizardAdres({ aanvraagId: aanvraag?.id, boekingId: boeking.id }));
};

export const GET: APIRoute = () => tekst(405, 'Het contract maak je in de wizard. Deze pagina toont zelf niets.');
