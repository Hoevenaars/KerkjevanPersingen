/**
 * Nieuwsbriefverzending op Supabase met geblokkeerde maildelivery.
 * Dry-run bepaalt ontvangers, kiest de template en legt testverzendingen vast.
 */

import type { Activiteit, AgendaOverzicht } from './content.ts';
import { maandagVanWeekIso } from './week.ts';
import { mailMeta } from './nieuwsbrief-frequentie.ts';
import { nieuwsbriefEnvelop, NIEUWSBRIEF_REPLY_TO } from './nieuwsbrief-html.ts';
import { kiesActiviteitenVoorMail } from './nieuwsbrief-agenda.ts';
import { directeFotoUrl } from './agenda-zichtbaarheid.ts';
import type { Vriend, VriendenBron } from './vrienden-supabase.ts';
import { getVriendenVoorVerzending } from './vrienden-supabase.ts';
import { maakBeheerAdminClient } from './supabase.ts';
import {
  conceptIsOpTijd,
  conceptMaandagen,
  kortNieuwsVoorConcept,
  type ConceptBron,
} from './nieuwsbrief-concepten.ts';
import { ymdInAmsterdam } from '../platform/datum.ts';
import { WINTERSTOP_TEKST } from './winterstop.ts';

export interface NieuwsbriefWeek {
  id: string;
  week: string;
  kortNieuws?: string;
  fotoPad?: string;
  fotoAlt?: string;
  donatieUpdate?: string;
  geannuleerd: boolean;
  verstuurd: boolean;
  /** Datum waarop het concept is geopend, YYYY-MM-DD of ISO. */
  aangemaaktOp?: string;
}

export interface WeekConcept {
  kortNieuws?: string;
  aangemaaktOp?: string;
}

export interface NieuwsbriefTemplate {
  sleutel: string;
  onderwerp: string;
  bron: 'supabase' | 'ingebouwd';
}

export interface Verzending {
  nieuwsbriefId: string;
  vriendId: string;
  email: string;
  test: boolean;
  status: 'concept' | 'verzonden' | 'fout';
  templateSleutel: string;
}

export type NieuwsbriefStop =
  | 'geannuleerd door bestuur'
  | 'al verstuurd deze week'
  | 'geen concept'
  | 'doorlooptijd nog niet gehaald'
  | null;

export interface NieuwsbriefBron {
  week(maandag: string): Promise<NieuwsbriefWeek | null>;
  maakWeek(maandag: string, extra?: WeekConcept): Promise<NieuwsbriefWeek>;
  template(sleutel: string): Promise<NieuwsbriefTemplate | null>;
  legVast(verzending: Verzending): Promise<void>;
  agenda(): Promise<{ activiteiten: Activiteit[]; overzicht: AgendaOverzicht }>;
  alLiveVerzonden(nieuwsbriefId: string): Promise<ReadonlySet<string>>;
  markeerVerstuurd(id: string): Promise<void>;
  conceptBronnen?: () => Promise<ConceptBron[]>;
}

export interface KlaargezetteBrief {
  vriend: Vriend;
  html: string;
  text: string;
  replyTo: string;
  subject: string;
}

export interface VoorbereideNieuwsbrief {
  stoppen: NieuwsbriefStop;
  week: NieuwsbriefWeek | null;
  template: NieuwsbriefTemplate | null;
  brieven: KlaargezetteBrief[];
  voorbeeld: { html: string; text: string; replyTo: string; subject: string } | null;
}

export interface DroogResultaat {
  verstuurd: number;
  gepland: number;
  overgeslagen: string;
  template: NieuwsbriefTemplate | null;
  ontvangers: string[];
  verzendingen: number;
}

export async function bereidNieuwsbrief(opties: {
  datum?: Date;
  vrienden: VriendenBron;
  bron: NieuwsbriefBron;
  templateSleutel?: string;
  /** Verzenden maakt geen week aan. Een ontbrekend concept blijft concept. */
  maakIndienOntbreekt?: boolean;
  /** Verzenden eist dat het concept de doorlooptijd van vier weken heeft gehad. */
  eisDoorlooptijd?: boolean;
}): Promise<VoorbereideNieuwsbrief> {
  const datum = opties.datum ?? new Date();
  const sleutel = opties.templateSleutel ?? 'nieuwsbrief_week';
  const maandag = maandagVanWeekIso(datum);
  let week = await opties.bron.week(maandag);
  if (week?.geannuleerd) return { stoppen: 'geannuleerd door bestuur', week: null, template: null, brieven: [], voorbeeld: null };
  if (week?.verstuurd) return { stoppen: 'al verstuurd deze week', week, template: null, brieven: [], voorbeeld: null };
  if (!week) {
    if (opties.maakIndienOntbreekt === false) {
      return { stoppen: 'geen concept', week: null, template: null, brieven: [], voorbeeld: null };
    }
    week = await opties.bron.maakWeek(maandag);
  }
  if (opties.eisDoorlooptijd && !conceptIsOpTijd(week.aangemaaktOp, week.week)) {
    return { stoppen: 'doorlooptijd nog niet gehaald', week, template: null, brieven: [], voorbeeld: null };
  }

  const ontvangers = await getVriendenVoorVerzending(datum, opties.vrienden);
  const gekozen = (await opties.bron.template(sleutel)) ?? {
    sleutel,
    onderwerp: mailMeta('wekelijks', datum).onderwerp,
    bron: 'ingebouwd' as const,
  };
  const agenda = await opties.bron.agenda();
  const brieven: KlaargezetteBrief[] = [];
  for (const vriend of ontvangers) {
    const brief = briefVoor(week, vriend, agenda.activiteiten, agenda.overzicht, datum);
    if (brief.replyTo !== NIEUWSBRIEF_REPLY_TO) {
      throw new Error('Nieuwsbrief mist het vaste Reply-To-adres.');
    }
    if (!brief.text.includes(vriend.uitschrijfToken) && !brief.text.includes(encodeURIComponent(vriend.uitschrijfToken))) {
      throw new Error('Nieuwsbrieftekst mist het afmeldtoken.');
    }
    if (!brief.html.includes(vriend.uitschrijfToken) && !brief.html.includes(encodeURIComponent(vriend.uitschrijfToken))) {
      throw new Error('Nieuwsbrief mist het afmeldtoken.');
    }
    brieven.push({ vriend, ...brief });
  }
  const voorbeeld = briefVoor(
    week,
    { _id: 'preview', email: 'preview@kerkjepersingen.nl', actief: true, frequentie: 'wekelijks', uitschrijfToken: 'preview' },
    agenda.activiteiten,
    agenda.overzicht,
    datum,
  );
  return { stoppen: null, week, template: gekozen, brieven, voorbeeld };
}

export async function draaiNieuwsbriefDryRun(opties: {
  datum?: Date;
  vrienden: VriendenBron;
  bron: NieuwsbriefBron;
  templateSleutel?: string;
}): Promise<DroogResultaat> {
  const voorbereid = await bereidNieuwsbrief(opties);
  if (voorbereid.stoppen || !voorbereid.week || !voorbereid.template) {
    return {
      verstuurd: 0,
      gepland: 0,
      overgeslagen: voorbereid.stoppen ?? 'geen editie',
      template: null,
      ontvangers: [],
      verzendingen: 0,
    };
  }
  for (const brief of voorbereid.brieven) {
    await opties.bron.legVast({
      nieuwsbriefId: voorbereid.week.id,
      vriendId: brief.vriend._id,
      email: brief.vriend.email,
      test: true,
      status: 'concept',
      templateSleutel: voorbereid.template.sleutel,
    });
  }
  return {
    verstuurd: 0,
    gepland: voorbereid.brieven.length,
    overgeslagen: voorbereid.brieven.length === 0 ? 'geen ontvangers deze verzendronde' : 'dry-run, geen mail',
    template: voorbereid.template,
    ontvangers: voorbereid.brieven.map((brief) => brief.vriend.email),
    verzendingen: voorbereid.brieven.length,
  };
}

function briefVoor(
  week: NieuwsbriefWeek,
  vriend: Vriend,
  activiteiten: Activiteit[],
  agenda: AgendaOverzicht,
  datum: Date,
) {
  const frequentie = vriend.frequentie ?? 'wekelijks';
  const meta = mailMeta(frequentie, datum);
  const blokken = kiesActiviteitenVoorMail(activiteiten, agenda, frequentie, datum);
  const foto = directeFotoUrl(week.fotoPad);
  return nieuwsbriefEnvelop(
    {
      kortNieuws: week.kortNieuws,
      kortNieuwsFotoUrl: foto ?? undefined,
      kortNieuwsFotoAlt: week.fotoAlt,
      donatieUpdate: week.donatieUpdate,
    },
    blokken,
    `https://kerkjepersingen.nl/vrienden/afmelden?token=${encodeURIComponent(vriend.uitschrijfToken)}`,
    meta,
  );
}

function weekUitRij(data: {
  id: number;
  week_maandag: string;
  kort_nieuws?: string | null;
  foto_pad?: string | null;
  foto_alt?: string | null;
  donatie_update?: string | null;
  overgeslagen: boolean;
  verstuurd: boolean;
  aangemaakt_op?: string | null;
}): NieuwsbriefWeek {
  return {
    id: String(data.id),
    week: data.week_maandag,
    kortNieuws: data.kort_nieuws ?? undefined,
    fotoPad: data.foto_pad ?? undefined,
    fotoAlt: data.foto_alt ?? undefined,
    donatieUpdate: data.donatie_update ?? undefined,
    geannuleerd: data.overgeslagen,
    verstuurd: data.verstuurd,
    aangemaaktOp: data.aangemaakt_op ?? undefined,
  };
}

function tekstVanRij(rij: Record<string, unknown>, sleutel: string): string {
  const waarde = rij[sleutel];
  return typeof waarde === 'string' ? waarde : '';
}

async function conceptBronnenUitSupabase(client: NonNullable<ReturnType<typeof maakBeheerAdminClient>>): Promise<ConceptBron[]> {
  const los = client as unknown as {
    from(tabel: string): {
      select(kolommen: string): PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
    };
  };
  const [publiek, intern] = await Promise.all([
    los.from('publieke_activiteiten').select('titel,start_datum,eind_datum,korte_omschrijving,omschrijving,gepubliceerd,zichtbaarheid,levenscyclus'),
    los.from('interne_activiteiten').select('titel,start_datum,eind_datum'),
  ]);
  if (publiek.error) throw new Error(publiek.error.message);
  if (intern.error) throw new Error(intern.error.message);
  const exposities: ConceptBron[] = (publiek.data ?? [])
    .filter((rij) => rij.gepubliceerd === true && rij.zichtbaarheid === 'publiek' && rij.levenscyclus !== 'geannuleerd')
    .map((rij) => ({
      titel: tekstVanRij(rij, 'titel').trim(),
      start: tekstVanRij(rij, 'start_datum'),
      eind: tekstVanRij(rij, 'eind_datum') || tekstVanRij(rij, 'start_datum'),
      tekst: (tekstVanRij(rij, 'korte_omschrijving') || tekstVanRij(rij, 'omschrijving')).trim(),
      winterstop: false,
    }));
  const winter: ConceptBron[] = (intern.data ?? [])
    .filter((rij) => tekstVanRij(rij, 'titel').trim().toLowerCase() === 'winterstop')
    .map((rij) => ({
      titel: 'Winterstop',
      start: tekstVanRij(rij, 'start_datum'),
      eind: tekstVanRij(rij, 'eind_datum') || tekstVanRij(rij, 'start_datum'),
      tekst: WINTERSTOP_TEKST,
      winterstop: true,
    }));
  return [...exposities, ...winter];
}

/** Opent ontbrekende concepten van deze week t/m vier weken verder. Bestaande tekst blijft staan. */
export async function vulNieuwsbriefConcepten(opties: {
  datum?: Date;
  bron?: NieuwsbriefBron;
  activiteiten?: readonly ConceptBron[];
} = {}): Promise<{ weken: string[]; nieuw: string[] }> {
  const datum = opties.datum ?? new Date();
  const bron = opties.bron ?? supabaseNieuwsbrief();
  const activiteiten = opties.activiteiten ?? (await bron.conceptBronnen?.()) ?? [];
  const vandaag = ymdInAmsterdam(datum);
  const weken = conceptMaandagen(vandaag);
  const nieuw: string[] = [];
  for (const maandag of weken) {
    const bestaand = await bron.week(maandag);
    if (bestaand) continue;
    const kortNieuws = kortNieuwsVoorConcept(maandag, activiteiten);
    await bron.maakWeek(maandag, { kortNieuws: kortNieuws || undefined, aangemaaktOp: vandaag });
    nieuw.push(maandag);
  }
  return { weken, nieuw };
}

export function supabaseNieuwsbrief(): NieuwsbriefBron {
  const client = maakBeheerAdminClient();
  if (!client) throw new Error('Supabase service-role ontbreekt. De nieuwsbrief kan niet worden gelezen.');
  return {
    async week(maandag) {
      const { data, error } = await client.from('nieuwsbrieven').select('id,week_maandag,kort_nieuws,foto_pad,foto_alt,donatie_update,overgeslagen,verstuurd,aangemaakt_op').eq('week_maandag', maandag).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return weekUitRij(data);
    },
    async maakWeek(maandag, extra) {
      const rij: { week_maandag: string; overgeslagen: boolean; verstuurd: boolean; kort_nieuws?: string; aangemaakt_op?: string } = {
        week_maandag: maandag,
        overgeslagen: false,
        verstuurd: false,
      };
      if (extra?.kortNieuws) rij.kort_nieuws = extra.kortNieuws;
      if (extra?.aangemaaktOp) rij.aangemaakt_op = `${extra.aangemaaktOp.slice(0, 10)}T12:00:00.000Z`;
      const { data, error } = await client.from('nieuwsbrieven').insert(rij).select('id,week_maandag,kort_nieuws,foto_pad,foto_alt,donatie_update,overgeslagen,verstuurd,aangemaakt_op').single();
      if (error) throw new Error(error.message);
      return weekUitRij(data);
    },
    async conceptBronnen() {
      return conceptBronnenUitSupabase(client);
    },
    async template(sleutel) {
      const { data, error } = await client.rpc('huidige_template', { p_sleutel: sleutel });
      if (error) throw new Error(error.message);
      const rij = Array.isArray(data) ? data[0] : data;
      if (!rij || typeof rij !== 'object' || !('onderwerp' in rij)) return null;
      return { sleutel, onderwerp: String((rij as { onderwerp?: string }).onderwerp ?? ''), bron: 'supabase' };
    },
    async legVast(verzending) {
      const { error } = await client.from('nieuwsbrief_verzendingen').insert({
        nieuwsbrief_id: Number(verzending.nieuwsbriefId),
        vriend_id: Number(verzending.vriendId),
        email_op_verzendmoment: verzending.email,
        test: verzending.test,
        status: verzending.status,
        verzonden_op: verzending.status === 'verzonden' ? new Date().toISOString() : null,
      });
      if (error) throw new Error(error.message);
    },
    async alLiveVerzonden(nieuwsbriefId) {
      const { data, error } = await client
        .from('nieuwsbrief_verzendingen')
        .select('email_op_verzendmoment')
        .eq('nieuwsbrief_id', Number(nieuwsbriefId))
        .eq('test', false)
        .eq('status', 'verzonden');
      if (error) throw new Error(error.message);
      return new Set((data ?? []).map((rij) => String(rij.email_op_verzendmoment ?? '').trim().toLowerCase()).filter(Boolean));
    },
    async markeerVerstuurd(id) {
      const { error } = await client
        .from('nieuwsbrieven')
        .update({ verstuurd: true, verstuurd_op: new Date().toISOString() })
        .eq('id', Number(id));
      if (error) throw new Error(error.message);
    },
    async agenda() {
      const { publiekeActiviteiten } = await import('./operatie/runtime.ts');
      const activiteiten = await publiekeActiviteiten();
      const vandaag = new Date().toISOString().slice(0, 10);
      const lopend = activiteiten.find((item) => item.start.slice(0, 10) <= vandaag && (item.eind ?? item.start).slice(0, 10) >= vandaag) ?? null;
      const toekomst = activiteiten.filter((item) => item.start.slice(0, 10) > vandaag);
      return { activiteiten, overzicht: { vandaag: lopend, volgende: toekomst[0] ?? null, daarna: toekomst[1] ?? null } };
    },
  };
}

export function geheugenNieuwsbrief(start?: { template?: NieuwsbriefTemplate }): NieuwsbriefBron & { verzendingen: Verzending[]; weken: NieuwsbriefWeek[] } {
  const weken: NieuwsbriefWeek[] = [];
  const verzendingen: Verzending[] = [];
  let volg = 0;
  return {
    weken,
    verzendingen,
    async week(maandag) {
      return weken.find((item) => item.week === maandag) ?? null;
    },
    async maakWeek(maandag, extra) {
      volg += 1;
      const week: NieuwsbriefWeek = {
        id: String(volg),
        week: maandag,
        kortNieuws: extra?.kortNieuws,
        geannuleerd: false,
        verstuurd: false,
        aangemaaktOp: extra?.aangemaaktOp ?? new Date().toISOString(),
      };
      weken.push(week);
      return week;
    },
    async template() {
      return start?.template ?? null;
    },
    async legVast(verzending) {
      verzendingen.push(verzending);
    },
    async agenda() {
      return { activiteiten: [], overzicht: { vandaag: null, volgende: null, daarna: null } };
    },
    async alLiveVerzonden(nieuwsbriefId) {
      return new Set(
        verzendingen
          .filter((item) => item.nieuwsbriefId === nieuwsbriefId && !item.test && item.status === 'verzonden')
          .map((item) => item.email.trim().toLowerCase()),
      );
    },
    async markeerVerstuurd(id) {
      const week = weken.find((item) => item.id === id);
      if (week) week.verstuurd = true;
    },
  };
}
