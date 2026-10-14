/**
 * Eén leesmodel over de bestaande communicatietabellen.
 * Geen tweede logsysteem.
 */

export type CommunicatieRichting = 'inkomend' | 'uitgaand' | 'systeem';

export interface TijdlijnItem {
  id: string;
  op: string;
  richting: CommunicatieRichting;
  template: string;
  onderwerp: string;
  bedoeldeOntvanger: string;
  werkelijkeOntvanger: string;
  afzender: string;
  replyTo: string;
  status: string;
  aanvraagId: string;
  boekingId: string;
  relatieId: string;
  providerBerichtId: string;
  foutmelding: string;
  bron: 'verzending' | 'job' | 'audit';
}

export interface TijdlijnBron {
  verzendingen?: readonly Record<string, unknown>[];
  jobs?: readonly Record<string, unknown>[];
  audits?: readonly Record<string, unknown>[];
}

function tekst(waarde: unknown): string {
  if (waarde == null) return '';
  return String(waarde);
}

function richtingVan(waarde: unknown, bron: TijdlijnItem['bron']): CommunicatieRichting {
  const ruw = tekst(waarde);
  if (ruw === 'inkomend' || ruw === 'uitgaand' || ruw === 'systeem') return ruw;
  return bron === 'audit' ? 'systeem' : 'uitgaand';
}

function itemVanVerzending(rij: Record<string, unknown>): TijdlijnItem {
  return {
    id: `verzending:${tekst(rij.id)}`,
    op: tekst(rij.verzonden_op || rij.gepland_op),
    richting: richtingVan(rij.richting, 'verzending'),
    template: tekst(rij.template_sleutel),
    onderwerp: tekst(rij.onderwerp),
    bedoeldeOntvanger: tekst(rij.bedoelde_ontvanger || rij.email_op_verzendmoment),
    werkelijkeOntvanger: tekst(rij.werkelijke_ontvanger || rij.email_op_verzendmoment),
    afzender: tekst(rij.afzender),
    replyTo: tekst(rij.reply_to),
    status: tekst(rij.status),
    aanvraagId: tekst(rij.aanvraag_id),
    boekingId: tekst(rij.boeking_id),
    relatieId: tekst(rij.relatie_id),
    providerBerichtId: tekst(rij.provider_bericht_id),
    foutmelding: tekst(rij.foutmelding),
    bron: 'verzending',
  };
}

function itemVanJob(rij: Record<string, unknown>): TijdlijnItem {
  return {
    id: `job:${tekst(rij.id || rij.dedup_sleutel)}`,
    op: tekst(rij.laatste_poging_op || rij.gepland_op),
    richting: 'systeem',
    template: tekst(rij.template_sleutel),
    onderwerp: tekst(rij.onderwerp),
    bedoeldeOntvanger: tekst(rij.ontvanger_email),
    werkelijkeOntvanger: tekst(rij.werkelijke_ontvanger),
    afzender: tekst(rij.afzender),
    replyTo: tekst(rij.reply_to),
    status: tekst(rij.status),
    aanvraagId: tekst(rij.aanvraag_id),
    boekingId: tekst(rij.boeking_id),
    relatieId: tekst(rij.relatie_id),
    providerBerichtId: tekst(rij.provider_bericht_id),
    foutmelding: tekst(rij.foutmelding),
    bron: 'job',
  };
}

function itemVanAudit(rij: Record<string, unknown>): TijdlijnItem {
  return {
    id: `audit:${tekst(rij.id || rij.dedup_sleutel)}`,
    op: tekst(rij.op),
    richting: 'systeem',
    template: tekst(rij.onderwerp_id),
    onderwerp: tekst(rij.actie),
    bedoeldeOntvanger: '',
    werkelijkeOntvanger: '',
    afzender: tekst(rij.actor_naam),
    replyTo: '',
    status: tekst(rij.actie),
    aanvraagId: tekst(rij.onderwerp_type) === 'aanvraag' ? tekst(rij.onderwerp_id) : '',
    boekingId: tekst(rij.onderwerp_type) === 'boeking' ? tekst(rij.onderwerp_id) : '',
    relatieId: tekst(rij.onderwerp_type) === 'relatie' ? tekst(rij.onderwerp_id) : '',
    providerBerichtId: '',
    foutmelding: tekst(rij.reden),
    bron: 'audit',
  };
}

export function hoortBijDossier(
  item: Pick<TijdlijnItem, 'aanvraagId' | 'boekingId' | 'relatieId'>,
  filter: { aanvraagId?: string; boekingId?: string; relatieId?: string },
): boolean {
  if (filter.aanvraagId && item.aanvraagId === filter.aanvraagId) return true;
  if (filter.boekingId && item.boekingId === filter.boekingId) return true;
  if (filter.relatieId && item.relatieId === filter.relatieId) return true;
  return !filter.aanvraagId && !filter.boekingId && !filter.relatieId;
}

/**
 * Verzending wint van een job met hetzelfde template binnen hetzelfde dossier,
 * zodat een gelogde send niet dubbel in de tijdlijn staat.
 */
export function tijdlijnVoor(bron: TijdlijnBron, filter: { aanvraagId?: string; boekingId?: string; relatieId?: string } = {}): TijdlijnItem[] {
  const verzendingen = (bron.verzendingen ?? []).map(itemVanVerzending).filter((item) => hoortBijDossier(item, filter));
  const bezet = new Set(verzendingen.map((item) => `${item.aanvraagId}|${item.boekingId}|${item.template}|${item.bedoeldeOntvanger}`));
  const jobs = (bron.jobs ?? [])
    .map(itemVanJob)
    .filter((item) => hoortBijDossier(item, filter))
    .filter((item) => !bezet.has(`${item.aanvraagId}|${item.boekingId}|${item.template}|${item.bedoeldeOntvanger}`));
  const audits = (bron.audits ?? [])
    .filter((rij) => ['logging_mislukt', 'geblokkeerd', 'verzonden'].includes(tekst(rij.actie)) || tekst(rij.onderwerp_type) === 'communicatie')
    .map(itemVanAudit)
    .filter((item) => hoortBijDossier(item, filter));
  return [...verzendingen, ...jobs, ...audits].sort((a, b) => b.op.localeCompare(a.op));
}

export interface Logpoging {
  gelukt: boolean;
  fout?: string;
}

/**
 * Een geslaagde provider-call wordt nooit herhaald omdat het loggen mislukt.
 * De loggingfout hoort in een aparte auditregel.
 */
export function loggingNaProvider(log: Logpoging): { opnieuwVersturen: false; audit: boolean; status: 'gelogd' | 'logging_mislukt' } {
  if (log.gelukt) return { opnieuwVersturen: false, audit: false, status: 'gelogd' };
  return { opnieuwVersturen: false, audit: true, status: 'logging_mislukt' };
}
