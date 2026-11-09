import type { APIRoute } from 'astro';
import { actorVanSessie } from '../../../lib/operatie/runtime.ts';
import { voerDossierViaSessie } from '../../../lib/operatie/dossier-sessie.ts';
import { sessieSupabaseUitAstro } from '../../../lib/supabase.ts';
import { beheerUitResponse } from '../../../platform/beheer-gate.ts';
import { laadBeheerSnapshot, beheerSnapshotOpties } from '../../../platform/beheer-bron.ts';
import { magSchrijven } from '../../../platform/rechten.ts';
import { verhuurOverzichtAan } from '../../../platform/verhuur-vlag.ts';
import { beoordeelGastheerActie, gastheerOverlapNamen, veiligeVerhuurTerug } from '../../../platform/verhuur-scherm.ts';

export const prerender = false;

function tekst(status: number, melding: string): Response {
  return new Response(melding, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

function terugMet(origin: string, terug: string, extra: { fout?: string; melding?: string }): string {
  const url = new URL(veiligeVerhuurTerug(terug, origin), origin);
  url.searchParams.delete('fout');
  url.searchParams.delete('melding');
  if (extra.fout) url.searchParams.set('fout', extra.fout.slice(0, 240));
  if (extra.melding) url.searchParams.set('melding', extra.melding.slice(0, 240));
  return url.pathname + url.search;
}

/**
 * Aparte schrijfactie voor de bestaande gastheerkoppeling.
 * De vlag VERHUUR_OVERZICHT opent alleen het scherm. Zij geeft geen schrijfrecht.
 * Er gaat geen mail uit: de actie roept alleen koppelGastheerViaSessie aan.
 */
export const POST: APIRoute = async (context) => {
  if (!verhuurOverzichtAan()) return beheerUitResponse();

  const rechten = context.locals.beheer?.effectieveRechten ?? { isSuperAdmin: false, perModule: {} };
  const viewAs = Boolean(context.locals.beheer?.viewAs);
  if (viewAs || !magSchrijven(rechten, 'boekingen')) {
    return tekst(403, 'Je kunt de gastheer bekijken. Wijzigen vraagt schrijfrecht op boekingen. Er is niets opgeslagen.');
  }

  const formulier = await context.request.formData();
  const actie = String(formulier.get('actie') ?? '');
  const terug = String(formulier.get('terug') ?? '');
  const origin = context.url.origin;
  if (actie !== 'gastheer') {
    return tekst(405, 'Deze actie wijzigt alleen een gastheer. Er is niets opgeslagen.');
  }

  const terugPad = veiligeVerhuurTerug(terug, origin);
  const snapshot = await laadBeheerSnapshot({
    ...beheerSnapshotOpties(context),
    url: new URL(terugPad, origin),
  });
  const boekingId = String(formulier.get('boekingId') ?? '');
  const boeking = snapshot.boekingen.find((item) => item.id === boekingId);
  if (!boeking) {
    return context.redirect(terugMet(origin, terug, { fout: 'Deze boeking staat niet in het overzicht. Er is niets gewijzigd.' }));
  }

  const gekozenId = String(formulier.get('gastheerId') ?? '');
  const besluit = beoordeelGastheerActie({
    actie,
    gekozenId,
    huidigeId: boeking.gastheerId ?? '',
    bevestig: String(formulier.get('bevestig') ?? ''),
    overlapNamen: gastheerOverlapNamen({
      boekingId,
      gastheerId: gekozenId,
      boekingen: snapshot.boekingen,
    }),
  });
  const doel = terugMet(origin, terug, {});
  const metDossier = new URL(doel, origin);
  metDossier.searchParams.set('dossier', boekingId);
  const bestemming = metDossier.pathname + metDossier.search;
  if (!besluit.ok) {
    return context.redirect(terugMet(origin, bestemming, { fout: besluit.melding }));
  }
  if (snapshot.bron !== 'supabase') {
    return context.redirect(terugMet(origin, bestemming, { melding: 'Voorbeeld. De gastheer is niet opgeslagen.' }));
  }

  const sessie = sessieSupabaseUitAstro(context);
  if (!sessie) {
    return context.redirect(terugMet(origin, bestemming, { fout: 'Geen ingelogde sessie. Er is niets gewijzigd.' }));
  }
  const uit = await voerDossierViaSessie(
    sessie as never,
    { soort: 'gastheer', boekingId, gastheerId: besluit.gastheerId },
    actorVanSessie(context.locals.beheer),
  );
  return context.redirect(terugMet(origin, bestemming, { [uit.ok ? 'melding' : 'fout']: uit.melding }));
};

export const GET: APIRoute = () => tekst(405, 'Kies de gastheer in het dossier. Deze pagina slaat zelf niets op.');
