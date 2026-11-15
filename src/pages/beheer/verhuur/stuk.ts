import type { APIRoute } from 'astro';
import { actorVanSessie } from '../../../lib/operatie/runtime.ts';
import { bewaarStukBeoordeling, leesStukBeoordelingen } from '../../../lib/operatie/stuk-beoordeling-sessie.ts';
import { lijstIntake } from '../../../lib/intake-opslag.ts';
import { sessieSupabaseUitAstro } from '../../../lib/supabase.ts';
import { beheerUitResponse } from '../../../platform/beheer-gate.ts';
import { laadBeheerSnapshot, beheerSnapshotOpties } from '../../../platform/beheer-bron.ts';
import { magSchrijven } from '../../../platform/rechten.ts';
import { beoordeelStukActie, verwachtStuk } from '../../../platform/stuk-beoordeling.ts';
import { verhuurOverzichtAan } from '../../../platform/verhuur-vlag.ts';
import { inhoudVoorBeoordeling, veiligeVerhuurTerug } from '../../../platform/verhuur-scherm.ts';

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
 * Bewaart goedkeuren of afkeuren van één onderdeel.
 * De ingelogde sessie schrijft de versie, de reden en de beoordelaar.
 * Publicatie, betaling, contract en mail blijven onaangeroerd.
 */
export const POST: APIRoute = async (context) => {
  if (!verhuurOverzichtAan()) return beheerUitResponse();

  const rechten = context.locals.beheer?.effectieveRechten ?? { isSuperAdmin: false, perModule: {} };
  const viewAs = Boolean(context.locals.beheer?.viewAs);
  if (viewAs || !magSchrijven(rechten, 'boekingen')) {
    return tekst(403, 'Je kunt het onderdeel bekijken. Beoordelen vraagt schrijfrecht op boekingen. Er is niets opgeslagen.');
  }

  const formulier = await context.request.formData();
  const terug = String(formulier.get('terug') ?? '');
  const origin = context.url.origin;
  const terugPad = veiligeVerhuurTerug(terug, origin);
  const snapshot = await laadBeheerSnapshot({
    ...beheerSnapshotOpties(context),
    url: new URL(terugPad, origin),
  });
  const boekingId = String(formulier.get('boekingId') ?? '');
  const boeking = snapshot.boekingen.find((item) => item.id === boekingId);
  const doel = terugMet(origin, terug, {});
  const metDossier = new URL(doel, origin);
  if (boeking) metDossier.searchParams.set('dossier', boekingId);
  const bestemming = metDossier.pathname + metDossier.search;
  if (!boeking) {
    return context.redirect(terugMet(origin, bestemming, { fout: 'Deze boeking staat niet in het overzicht. Er is niets gewijzigd.' }));
  }

  const activiteit = snapshot.agenda.find((item) => item.boekingId === boeking.id && item.tabel !== 'activiteit_bron') ?? null;
  const inhoud = inhoudVoorBeoordeling(activiteit);
  const documentIds = snapshot.documenten.filter((item) => item.boekingId === boeking.id).map((item) => item.id);
  const intakePaden = snapshot.bron === 'supabase'
    ? (await lijstIntake(boeking.id).catch(() => [])).map((bestand) => bestand.pad)
    : [];
  const stukType = String(formulier.get('stukType') ?? '');
  const stukId = String(formulier.get('stukId') ?? '');
  const verwacht = verwachtStuk({
    stukType,
    stukId,
    activiteitId: inhoud.activiteitId,
    inhoudVersie: inhoud.versie,
    heeftTekst: inhoud.heeftTekst,
    heeftFoto: inhoud.heeftFoto,
    documentIds,
    intakePaden,
  });
  const boekingNummer = Number(boeking.id);
  const sessie = sessieSupabaseUitAstro(context);
  if (snapshot.bron === 'supabase' && !sessie) {
    return context.redirect(terugMet(origin, bestemming, { fout: 'Geen ingelogde sessie. Er is niets gewijzigd.' }));
  }
  const gelezen = snapshot.bron === 'supabase' && sessie
    ? await leesStukBeoordelingen(sessie as never, boekingNummer)
    : { ok: true as const, rijen: [] };
  if (!gelezen.ok) {
    return context.redirect(terugMet(origin, bestemming, { fout: `${gelezen.melding} Er is niets gewijzigd.` }));
  }
  const besluit = beoordeelStukActie({
    besluit: String(formulier.get('besluit') ?? ''),
    stukType,
    stukId,
    versie: String(formulier.get('versie') ?? ''),
    reden: String(formulier.get('reden') ?? ''),
    verwacht,
    alBeoordeeld: gelezen.rijen.some(
      (rij) => verwacht && rij.stukType === verwacht.stukType && rij.stukId === verwacht.stukId && rij.versie === verwacht.versie,
    ),
  });
  if (!besluit.ok) {
    return context.redirect(terugMet(origin, bestemming, { fout: besluit.melding }));
  }
  if (snapshot.bron !== 'supabase' || !sessie) {
    return context.redirect(terugMet(origin, bestemming, { melding: 'Voorbeeld. Er is niets opgeslagen en er is geen mail verstuurd.' }));
  }

  const actor = actorVanSessie(context.locals.beheer);
  const uit = await bewaarStukBeoordeling(
    sessie as never,
    {
      boekingId: boekingNummer,
      stukType: besluit.sleutel.stukType,
      stukId: besluit.sleutel.stukId,
      versie: besluit.sleutel.versie,
      status: besluit.status,
      reden: besluit.reden,
    },
    { id: actor.id, naam: actor.naam, type: actor.type },
  );
  return context.redirect(terugMet(origin, bestemming, { [uit.ok ? 'melding' : 'fout']: uit.melding }));
};

export const GET: APIRoute = () => tekst(405, 'Keur het onderdeel in het dossier. Deze pagina slaat zelf niets op.');
