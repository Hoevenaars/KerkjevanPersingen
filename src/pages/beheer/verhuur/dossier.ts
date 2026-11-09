import type { APIRoute } from 'astro';
import type { Opdracht } from '../../../lib/operatie/kern.ts';
import { actorVanSessie } from '../../../lib/operatie/runtime.ts';
import { voerDossierViaSessie } from '../../../lib/operatie/dossier-sessie.ts';
import { sessieSupabaseUitAstro } from '../../../lib/supabase.ts';
import { beheerUitResponse } from '../../../platform/beheer-gate.ts';
import { laadBeheerSnapshot, beheerSnapshotOpties } from '../../../platform/beheer-bron.ts';
import { magSchrijven } from '../../../platform/rechten.ts';
import { verhuurOverzichtAan } from '../../../platform/verhuur-vlag.ts';
import { beoordeelDossierActie, veiligeVerhuurTerug, type DossierActieBesluit } from '../../../platform/verhuur-scherm.ts';

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

function opdrachtVan(boekingId: string, besluit: Extract<DossierActieBesluit, { ok: true }>): Opdracht {
  if (besluit.soort === 'verleng') return { soort: 'verleng', boekingId };
  if (besluit.soort === 'handmatig_definitief') return { soort: 'handmatig_definitief', boekingId, reden: besluit.reden };
  if (besluit.soort === 'annuleer') return { soort: 'annuleer', boekingId, reden: besluit.reden, termijnen: besluit.termijnen };
  if (besluit.soort === 'betaling_paul') return { soort: 'betaling_paul', boekingId, keuze: besluit.keuze };
  if (besluit.soort === 'verplaats') return { soort: 'verplaats', boekingId, start: besluit.start, eind: besluit.eind };
  if (besluit.soort === 'verhuurtype') return { soort: 'verhuurtype', boekingId, verhuurtype: besluit.verhuurtype };
  if (besluit.soort === 'inhoud') return { soort: 'inhoud', boekingId, besluit: besluit.besluit, reden: besluit.reden };
  if (besluit.soort === 'contractstatus') return { soort: 'contractstatus', boekingId, status: besluit.status };
  if (besluit.soort === 'incident') return { soort: 'incident', boekingId, omschrijving: besluit.omschrijving };
  if (besluit.soort === 'incident_sluiten') return { soort: 'incident_sluiten', incidentId: besluit.incidentId };
  return { soort: 'sluit', boekingId, reden: besluit.reden };
}

/**
 * Bestaande dossieracties vanuit de verhuuragenda.
 * Alleen de sessie die geen mail en geen workflow start.
 * Betaling, stukgoedkeuring en de gastheer blijven op hun eigen pad.
 */
export const POST: APIRoute = async (context) => {
  if (!verhuurOverzichtAan()) return beheerUitResponse();

  const rechten = context.locals.beheer?.effectieveRechten ?? { isSuperAdmin: false, perModule: {} };
  const viewAs = Boolean(context.locals.beheer?.viewAs);
  const magBoeking = !viewAs && magSchrijven(rechten, 'boekingen');
  const magFinance = !viewAs && magSchrijven(rechten, 'finance');
  const magAgenda = !viewAs && magSchrijven(rechten, 'agenda');
  if (!magBoeking && !magFinance && !magAgenda) {
    return tekst(403, 'Je kunt het dossier bekijken. Wijzigen vraagt schrijfrecht. Er is niets opgeslagen.');
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

  const openIncidentIds = (snapshot.incidenten ?? [])
    .filter((item) => item.boekingId === boekingId && item.status !== 'gesloten')
    .map((item) => item.id);
  const besluit = beoordeelDossierActie({
    actie: String(formulier.get('actie') ?? ''),
    status: boeking.status,
    reden: String(formulier.get('reden') ?? ''),
    omschrijving: String(formulier.get('omschrijving') ?? ''),
    bevestig: String(formulier.get('bevestig') ?? ''),
    incidentId: String(formulier.get('incidentId') ?? ''),
    openIncidentIds,
    start: String(formulier.get('start') ?? ''),
    eind: String(formulier.get('eind') ?? ''),
    verhuurtype: String(formulier.get('verhuurtype') ?? ''),
    contractstatus: String(formulier.get('contractstatus') ?? ''),
    termijnen: String(formulier.get('termijnen') ?? ''),
  });
  if (besluit.ok && besluit.soort === 'betaling_paul' && !magFinance) {
    return tekst(403, 'Een betaling vastleggen vraagt schrijfrecht op finance. Er is niets van de bank opgehaald.');
  }
  if (besluit.ok && (besluit.soort === 'inhoud') && !magAgenda) {
    return tekst(403, 'Inhoud beoordelen vraagt schrijfrecht op de agenda. De site is niet gewijzigd.');
  }
  if (besluit.ok && besluit.soort !== 'betaling_paul' && besluit.soort !== 'inhoud' && !magBoeking) {
    return tekst(403, 'Deze dossieractie vraagt schrijfrecht op boekingen. Er is niets opgeslagen.');
  }
  if (!besluit.ok) {
    return context.redirect(terugMet(origin, bestemming, { fout: besluit.melding }));
  }
  if (snapshot.bron !== 'supabase') {
    return context.redirect(terugMet(origin, bestemming, { melding: 'Voorbeeld. Er is niets opgeslagen en er is geen mail verstuurd.' }));
  }

  const sessie = sessieSupabaseUitAstro(context);
  if (!sessie) {
    return context.redirect(terugMet(origin, bestemming, { fout: 'Geen ingelogde sessie. Er is niets gewijzigd.' }));
  }
  const uit = await voerDossierViaSessie(sessie as never, opdrachtVan(boekingId, besluit), actorVanSessie(context.locals.beheer));
  return context.redirect(terugMet(origin, bestemming, { [uit.ok ? 'melding' : 'fout']: uit.melding }));
};

export const GET: APIRoute = () => tekst(405, 'Kies de dossieractie in het dossier. Deze pagina slaat zelf niets op.');
