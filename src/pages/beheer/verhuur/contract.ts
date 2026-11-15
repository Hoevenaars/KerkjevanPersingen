import type { APIRoute } from 'astro';
import { verwerkContractActie, type ContractOpslag } from '../../../lib/contract-actie.ts';
import { verwerkMailconcept } from '../../../lib/mailconcept-actie.ts';
import { actorVanSessie } from '../../../lib/operatie/runtime.ts';
import { sessieSupabaseUitAstro } from '../../../lib/supabase.ts';
import { beheerRedirect } from '../../../lib/beheer-http.ts';
import { beheerUitResponse } from '../../../platform/beheer-gate.ts';
import { laadBeheerSnapshot, beheerSnapshotOpties, omgevingsRecord } from '../../../platform/beheer-bron.ts';
import { contractBronUitBoeking } from '../../../platform/contract-brief.ts';
import { magSchrijven } from '../../../platform/rechten.ts';
import { verhuurOverzichtAan } from '../../../platform/verhuur-vlag.ts';
import { veiligeVerhuurTerug } from '../../../platform/verhuur-scherm.ts';

export const prerender = false;

function tekst(status: number, melding: string): Response {
  return new Response(melding, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

function terugMet(origin: string, terug: string, extra: { fout?: string; melding?: string; contract?: boolean }): string {
  const url = new URL(veiligeVerhuurTerug(terug, origin), origin);
  url.searchParams.delete('fout');
  url.searchParams.delete('melding');
  if (extra.contract) url.searchParams.set('contract', '1');
  else url.searchParams.delete('contract');
  if (extra.fout) url.searchParams.set('fout', extra.fout.slice(0, 400));
  if (extra.melding) url.searchParams.set('melding', extra.melding.slice(0, 400));
  return url.pathname + url.search;
}

/**
 * Genereer het contract, laat het in het dossier lezen, en verstuur die tekst.
 * De schakelaar handmatige_template blijft bepalen of er een provider-call is.
 */
export const POST: APIRoute = async (context) => {
  if (!verhuurOverzichtAan()) return beheerUitResponse();

  const rechten = context.locals.beheer?.effectieveRechten ?? { isSuperAdmin: false, perModule: {} };
  const viewAs = Boolean(context.locals.beheer?.viewAs);
  if (viewAs || !magSchrijven(rechten, 'boekingen')) {
    return tekst(403, 'Je kunt het dossier bekijken. Het contract vraagt schrijfrecht op boekingen. Er is niets verstuurd.');
  }

  const formulier = await context.request.formData();
  const actie = String(formulier.get('actie') ?? '');
  if (actie !== 'contract_genereer' && actie !== 'contract_verstuur') {
    return tekst(400, 'Kies genereer of verstuur. Er is niets gewijzigd.');
  }
  const origin = context.url.origin;
  const terug = String(formulier.get('terug') ?? '');
  const snapshot = await laadBeheerSnapshot({
    ...beheerSnapshotOpties(context),
    url: new URL(veiligeVerhuurTerug(terug, origin), origin),
  });
  const boekingId = String(formulier.get('boekingId') ?? '');
  const boeking = snapshot.boekingen.find((item) => item.id === boekingId);
  const metDossier = new URL(veiligeVerhuurTerug(terug, origin), origin);
  if (boeking) metDossier.searchParams.set('dossier', boekingId);
  const basis = metDossier.pathname + metDossier.search;
  if (!boeking) {
    return beheerRedirect(terugMet(origin, basis, { fout: 'Deze boeking staat niet in het overzicht. Er is niets verstuurd.' }));
  }
  const relatie = snapshot.relaties.find((item) => item.id === boeking.relatieId) ?? null;
  const bron = contractBronUitBoeking(boeking, relatie
    ? { naam: relatie.naam, email: relatie.email, telefoon: relatie.telefoon, adres: relatie.adres ?? '' }
    : null);
  const demo = snapshot.bron !== 'supabase' || Boolean(snapshot.alleenLezen);
  const sessie = sessieSupabaseUitAstro(context);
  try {
    const uit = await verwerkContractActie({
      actie,
      bron,
      bestaandeContracten: snapshot.documenten.filter((item) => item.boekingId === boeking.id && item.soort === 'contract').length,
      tekst: String(formulier.get('mailInhoud') ?? ''),
      onderwerp: String(formulier.get('mailOnderwerp') ?? ''),
      demo,
      opslag: demo ? null : (sessie as ContractOpslag | null),
      gebruikerId: context.locals.beheer?.gebruiker.id ?? null,
      verstuur: async (brief) => {
        const antwoord = await verwerkMailconcept({
          actie: 'mailverstuur',
          dossier: { soort: 'boeking', id: boeking.id, ontvanger: bron.email, naam: bron.huurder },
          template: null,
          onderwerp: brief.onderwerp,
          inhoud: brief.tekst,
          actorNaam: actorVanSessie(context.locals.beheer).naam,
          brief: true,
          env: omgevingsRecord(),
        });
        return { ok: antwoord.ok, melding: antwoord.melding };
      },
    });
    return beheerRedirect(terugMet(origin, basis, {
      contract: uit.toonBrief,
      [uit.ok ? 'melding' : 'fout']: uit.melding,
    }));
  } catch (error) {
    const melding = error instanceof Error ? error.message : 'Versturen mislukt.';
    return beheerRedirect(terugMet(origin, basis, { contract: true, fout: melding }));
  }
};

export const GET: APIRoute = () => tekst(405, 'Genereer het contract in het dossier. Deze pagina toont zelf niets.');
