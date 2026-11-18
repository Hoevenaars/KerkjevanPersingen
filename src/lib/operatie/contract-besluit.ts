/**
 * Twee bestuursbesluiten, zonder een nieuwe contract- of mailroute.
 * - Nee: dezelfde bestaande documentenflow zet de versie terug voor correctie.
 * - Ja: dezelfde bestaande documentenflow legt akkoord vast en verstuurt het
 *   contract + PDF + tekenlink; nooit een extra/parallelle mailservice.
 *
 * Eerst een read-only preflight. Bij een fout wordt geen bestuursakkoord gezet.
 * Als de mailprovider faalt NA het akkoord blijft de goedkeuring bewaard en
 * verschijnt opnieuw de (herstelbare) verzendactie in het bestaande dossier.
 */
import { maakContractPdf } from '../../platform/contract-pakket.ts';
import { magBestuurBesluiten, magContractBeheren, voerFlowUit, type FlowContext } from '../../platform/documentenflow.ts';
import { ymdInAmsterdam } from '../../platform/datum.ts';
import { documentenflowAan } from '../../platform/documentenflow-vlag.ts';
import { leesContractSjabloon } from '../contract-sjabloon-opslag.ts';
import { leesDocumentenDossier, pasDocumentenflowToe } from './documentenflow-sessie.ts';
import { bekijkFactuurConcept, factuurpakketAan } from './factuur-sessie.ts';

type FlowInvoer = Omit<Parameters<typeof pasDocumentenflowToe>[0], 'actie'>;
type Resultaat = { ok: boolean; melding: string };

type BestuursInvoer = FlowInvoer & {
  besluit: 'ja' | 'nee';
  verwachteVersie: number;
  toelichting?: string;
};

/** Een onverwachte fout mag nooit tot een blinde tweede verzendpoging leiden. */
export async function besluitContractViaSessie(input: BestuursInvoer): Promise<Resultaat> {
  try {
    return await verwerkContractbesluit(input);
  } catch {
    console.error('Onverwachte fout bij een bestuursbesluit over een contract. Controleer de verzendstatus.');
    return {
      ok: false,
      melding: 'De contractafhandeling is onderbroken. Controleer de actuele contract- en verzendstatus voordat je opnieuw klikt. Er is niet bevestigd dat de mail is verstuurd.',
    };
  }
}

async function verwerkContractbesluit(input: BestuursInvoer): Promise<Resultaat> {
  const { client, actor, boekingId, verwachteVersie } = input;
  if (!client) return { ok: false, melding: 'Geen actieve beheersessie. Er is niets gewijzigd.' };
  if (!magBestuurBesluiten(actor.rechten ?? { isSuperAdmin: false, perModule: {} })) {
    return { ok: false, melding: 'Geen recht om een contract namens het bestuur te beoordelen.' };
  }
  if (!Number.isSafeInteger(verwachteVersie) || verwachteVersie < 1) {
    return { ok: false, melding: 'Het contract heeft geen geldig versienummer. Vernieuw het dossier.' };
  }
  const gelezen = await leesDocumentenDossier(client, boekingId, input.promotieAanwezig);
  if (!gelezen.ok) return gelezen;
  const huidig = gelezen.lading.context.versies.reduce((hoogste, versie) =>
    !hoogste || versie.versie > hoogste.versie ? versie : hoogste, null as typeof gelezen.lading.context.versies[number] | null);
  if (!huidig || huidig.versie !== verwachteVersie) {
    return { ok: false, melding: 'Er bestaat inmiddels een andere contractversie. Vernieuw het dossier. Er is niets gewijzigd.' };
  }
  if (!huidig.bestuurVerplicht) {
    return { ok: false, melding: 'Deze contractversie heeft geen bestuursbesluit nodig.' };
  }
  if (input.besluit === 'ja' && !magContractBeheren(actor.rechten ?? { isSuperAdmin: false, perModule: {} })) {
    return { ok: false, melding: 'Geen recht om dit contract te verzenden. Er is niets gewijzigd.' };
  }
  const context: FlowContext = {
    ...gelezen.lading.context,
    nu: new Date().toISOString(),
    vandaag: ymdInAmsterdam(new Date()),
    actorNaam: actor.naam,
    rechten: actor.rechten ?? { isSuperAdmin: false, perModule: {} },
    modus: input.modus,
    testadres: input.testadres,
  };
  const eerderVerzonden = huidig.verzendingen.some((verzending) =>
    (verzending.soort === 'contract' || verzending.soort === 'herhaling') && verzending.status === 'verzonden');

  if (input.besluit === 'nee') {
    if (eerderVerzonden || huidig.verzendingen.some((v) => v.status === 'bezig' && v.soort === 'contract')) {
      return { ok: false, melding: 'Deze versie is al verzonden of de verzending loopt. Maak voor wijzigingen een nieuwe versie.' };
    }
    if (huidig.bestuur === 'terug') return { ok: true, melding: 'Deze versie staat al terug voor aanpassing. Er is niets verstuurd.' };
    const actie = { soort: 'terug' as const, toelichting: input.toelichting?.trim() ?? '' };
    const plan = voerFlowUit(actie, context);
    if (!plan.ok) return plan;
    return pasDocumentenflowToe({ ...input, actie, verwachteVersie });
  }

  if (eerderVerzonden) return { ok: true, melding: 'Deze contractversie is al naar de mailprovider verstuurd. Er is niets dubbel verzonden.' };
  if (!documentenflowAan(input.env)) {
    return { ok: false, melding: 'De documentenflow staat uit. Er is niets goedgekeurd of verzonden.' };
  }
  if (input.modus !== 'aan') {
    return { ok: false, melding: 'De mailschakelaar staat niet op Aan. Het contract is niet goedgekeurd en niet verzonden.' };
  }
  // Bij het nieuwe tweede Ja mag nooit ongemerkt de oude mail met één PDF
  // vertrekken. De afspraak met het bestuur is uitdrukkelijk drie bijlagen.
  if (!factuurpakketAan(input.env)) {
    return { ok: false, melding: 'Het driedelige contractpakket staat nog niet aan. Geen bestuursakkoord opgeslagen en geen e-mail verstuurd.' };
  }

  // Controle van de twee bestaande stappen, voordat de database wordt gewijzigd.
  const akkoord = voerFlowUit({ soort: 'akkoord' }, context);
  if (!akkoord.ok) return akkoord;
  const poging = crypto.randomUUID();
  const verzenden = voerFlowUit({ soort: 'verzend', proef: false, poging }, {
    ...context, versies: akkoord.versies,
  });
  if (!verzenden.ok) return verzenden;
  if (!verzenden.mail) {
    return { ok: false, melding: 'Er staat al een contractverzending open. Controleer eerst de bestaande verzendstatus.' };
  }

  // PDF/sjabloon vooraf controleren, om een akkoord zonder bruikbare bijlage te voorkomen.
  const sjabloon = await leesContractSjabloon();
  if (sjabloon.fout) return { ok: false, melding: sjabloon.fout };
  const pdf = await maakContractPdf({
    tekst: huidig.tekst,
    voorwaardenTekst: huidig.voorwaardenTekst,
    huisregelsTekst: huidig.huisregelsTekst,
    plattegrondTekst: huidig.plattegrondTekst,
    soort: context.bron.soort,
  }, `${huidig.contractnummer}.pdf`, huidig.contractnummer, sjabloon.bytes);
  if (!pdf.ok) return pdf;
  if (factuurpakketAan(input.env)) {
    const factuurConcept = await bekijkFactuurConcept(client, context, huidig);
    if (!factuurConcept.ok) return factuurConcept;
  }

  if (huidig.bestuur !== 'akkoord') {
    const bijgewerkt = await pasDocumentenflowToe({ ...input, actie: { soort: 'akkoord' }, verwachteVersie });
    if (!bijgewerkt.ok) return bijgewerkt;
  }
  const verstuurd = await pasDocumentenflowToe({
    ...input, actie: { soort: 'verzend', proef: false, poging }, verwachteVersie,
  });
  if (!verstuurd.ok) {
    return {
      ok: false,
      melding: `Het bestuursakkoord is vastgelegd, maar het contract is nog niet bevestigd als verzonden: ${verstuurd.melding}`,
    };
  }
  return { ok: true, melding: 'Het contract is goedgekeurd en door de mailprovider geaccepteerd, inclusief documenten en tekenlink. Aflevering bij de huurder is nog niet bevestigd.' };
}
