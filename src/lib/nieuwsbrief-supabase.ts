/**
 * Nieuwsbriefverzending op Supabase met geblokkeerde maildelivery.
 * Dry-run bepaalt ontvangers, kiest de template en legt testverzendingen vast.
 */

import type { Activiteit, AgendaOverzicht } from './sanity';
import { maandagVanWeekIso } from './week.ts';
import { mailMeta } from './nieuwsbrief-frequentie.ts';
import { bouwNieuwsbriefHtml } from './nieuwsbrief-html.ts';
import { kiesActiviteitenVoorMail } from './nieuwsbrief-agenda.ts';
import { directeFotoUrl } from './agenda-zichtbaarheid.ts';
import type { Vriend, VriendenBron } from './vrienden-supabase.ts';
import { getVriendenVoorVerzending } from './vrienden-supabase.ts';
import { maakBeheerAdminClient } from './supabase.ts';

export interface NieuwsbriefWeek {
  id: string;
  week: string;
  kortNieuws?: string;
  fotoPad?: string;
  fotoAlt?: string;
  donatieUpdate?: string;
  geannuleerd: boolean;
  verstuurd: boolean;
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
  status: 'concept';
  templateSleutel: string;
}

export interface NieuwsbriefBron {
  week(maandag: string): Promise<NieuwsbriefWeek | null>;
  maakWeek(maandag: string): Promise<NieuwsbriefWeek>;
  template(sleutel: string): Promise<NieuwsbriefTemplate | null>;
  legVast(verzending: Verzending): Promise<void>;
  agenda(): Promise<{ activiteiten: Activiteit[]; overzicht: AgendaOverzicht }>;
}

export interface DroogResultaat {
  verstuurd: number;
  gepland: number;
  overgeslagen: string;
  template: NieuwsbriefTemplate | null;
  ontvangers: string[];
  verzendingen: number;
}

export async function draaiNieuwsbriefDryRun(opties: {
  datum?: Date;
  vrienden: VriendenBron;
  bron: NieuwsbriefBron;
  templateSleutel?: string;
}): Promise<DroogResultaat> {
  const datum = opties.datum ?? new Date();
  const sleutel = opties.templateSleutel ?? 'nieuwsbrief_week';
  const maandag = maandagVanWeekIso(datum);
  let week = await opties.bron.week(maandag);
  if (week?.geannuleerd) {
    return { verstuurd: 0, gepland: 0, overgeslagen: 'geannuleerd door bestuur', template: null, ontvangers: [], verzendingen: 0 };
  }
  if (week?.verstuurd) {
    return { verstuurd: 0, gepland: 0, overgeslagen: 'al verstuurd deze week', template: null, ontvangers: [], verzendingen: 0 };
  }
  if (!week) week = await opties.bron.maakWeek(maandag);

  const ontvangers = await getVriendenVoorVerzending(datum, opties.vrienden);
  const gekozen = (await opties.bron.template(sleutel)) ?? {
    sleutel,
    onderwerp: mailMeta('wekelijks', datum).onderwerp,
    bron: 'ingebouwd' as const,
  };
  const agenda = await opties.bron.agenda();
  for (const vriend of ontvangers) {
    const html = htmlVoor(week, vriend, agenda.activiteiten, agenda.overzicht, datum);
    if (!html.includes(vriend.uitschrijfToken) && !html.includes(encodeURIComponent(vriend.uitschrijfToken))) {
      throw new Error('Nieuwsbrief mist het afmeldtoken.');
    }
    await opties.bron.legVast({
      nieuwsbriefId: week.id,
      vriendId: vriend._id,
      email: vriend.email,
      test: true,
      status: 'concept',
      templateSleutel: gekozen.sleutel,
    });
  }
  return {
    verstuurd: 0,
    gepland: ontvangers.length,
    overgeslagen: ontvangers.length === 0 ? 'geen ontvangers deze verzendronde' : 'dry-run, geen mail',
    template: gekozen,
    ontvangers: ontvangers.map((vriend) => vriend.email),
    verzendingen: ontvangers.length,
  };
}

function htmlVoor(
  week: NieuwsbriefWeek,
  vriend: Vriend,
  activiteiten: Activiteit[],
  agenda: AgendaOverzicht,
  datum: Date,
): string {
  const frequentie = vriend.frequentie ?? 'wekelijks';
  const meta = mailMeta(frequentie, datum);
  const blokken = kiesActiviteitenVoorMail(activiteiten, agenda, frequentie, datum);
  const foto = directeFotoUrl(week.fotoPad);
  return bouwNieuwsbriefHtml(
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

export function supabaseNieuwsbrief(): NieuwsbriefBron {
  const client = maakBeheerAdminClient();
  if (!client) throw new Error('Supabase service-role ontbreekt. De nieuwsbrief leest Sanity niet.');
  return {
    async week(maandag) {
      const { data, error } = await client.from('nieuwsbrieven').select('id,week_maandag,kort_nieuws,foto_pad,foto_alt,donatie_update,overgeslagen,verstuurd').eq('week_maandag', maandag).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        id: String(data.id),
        week: data.week_maandag,
        kortNieuws: data.kort_nieuws ?? undefined,
        fotoPad: data.foto_pad ?? undefined,
        fotoAlt: data.foto_alt ?? undefined,
        donatieUpdate: data.donatie_update ?? undefined,
        geannuleerd: data.overgeslagen,
        verstuurd: data.verstuurd,
      };
    },
    async maakWeek(maandag) {
      const { data, error } = await client.from('nieuwsbrieven').insert({ week_maandag: maandag, overgeslagen: false, verstuurd: false }).select('id,week_maandag').single();
      if (error) throw new Error(error.message);
      return { id: String(data.id), week: data.week_maandag, geannuleerd: false, verstuurd: false };
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
        test: true,
        status: 'concept',
      });
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
    async maakWeek(maandag) {
      volg += 1;
      const week: NieuwsbriefWeek = { id: String(volg), week: maandag, geannuleerd: false, verstuurd: false };
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
  };
}
