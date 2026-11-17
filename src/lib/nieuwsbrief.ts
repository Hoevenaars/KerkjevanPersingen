/**
 * Nieuwsbriefcron.
 * Uit stuurt niets. Test gaat naar het testmailadres.
 * Aan stuurt de weekinhoud en de agenda naar de vrienden van deze ronde.
 */

import { bereidNieuwsbrief, draaiNieuwsbriefDryRun, supabaseNieuwsbrief, vulNieuwsbriefConcepten, type NieuwsbriefBron } from './nieuwsbrief-supabase.ts';
import { supabaseVrienden, type VriendenBron } from './vrienden-supabase.ts';
import { datumVoorPreview } from './week.ts';
import { bouwNieuwsbriefHtml } from './nieuwsbrief-html.ts';
import { kiesActiviteitenVoorMail } from './nieuwsbrief-agenda.ts';
import type { Automatisering } from '../platform/automatisering.ts';
import type { MailTransport } from './mail-transport.ts';

export { datumVoorPreview, bouwNieuwsbriefHtml, kiesActiviteitenVoorMail, vulNieuwsbriefConcepten };

/** True als het cron-endpoint de aanroep moet weigeren. */
export function cronOnbevoegd(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron] CRON_SECRET ontbreekt — weigert alle aanroepen');
    return true;
  }
  return request.headers.get('authorization') !== `Bearer ${secret}`;
}

export interface NieuwsbriefLoopOpties {
  register?: readonly Automatisering[];
  datum?: Date;
  vrienden?: VriendenBron;
  bron?: NieuwsbriefBron;
  transport?: MailTransport;
  testadres?: string | null;
}

/** Donderdagpreview: alleen de brief opbouwen. Geen provider en geen verzendregistratie. */
export async function verstuurPreview(
  _previewAdres: string,
  datum = new Date(),
  opties: NieuwsbriefLoopOpties = {},
): Promise<{ verstuurd: 0; onderwerp: string; tekst: string; overgeslagen: string }> {
  const voorbereid = await bereidNieuwsbrief({
    datum,
    vrienden: opties.vrienden ?? supabaseVrienden(),
    bron: opties.bron ?? supabaseNieuwsbrief(),
  });
  if (voorbereid.stoppen || !voorbereid.voorbeeld) {
    return { verstuurd: 0, onderwerp: '', tekst: '', overgeslagen: voorbereid.stoppen ?? 'geen voorbeeld' };
  }
  return {
    verstuurd: 0,
    onderwerp: voorbereid.voorbeeld.subject,
    tekst: voorbereid.voorbeeld.text,
    overgeslagen: 'dry-run, geen mail',
  };
}

export async function verstuurWekelijkseNieuwsbrief(opties: NieuwsbriefLoopOpties = {}): Promise<{ verstuurd: number; gepland: number; overgeslagen: string }> {
  const { besluitVoor } = await import('./automatisering-register.ts');
  const besluit = await besluitVoor('nieuwsbrief', opties.register);
  if (besluit.modus !== 'test' && besluit.modus !== 'aan' && besluit.modus !== 'dry-run') {
    return { verstuurd: 0, gepland: 0, overgeslagen: `geblokkeerd: ${besluit.reden}` };
  }
  const vrienden = opties.vrienden ?? supabaseVrienden();
  const bron = opties.bron ?? supabaseNieuwsbrief();
  const voorbereiden = {
    datum: opties.datum,
    vrienden,
    bron,
    maakIndienOntbreekt: false as const,
    eisDoorlooptijd: true as const,
    eisActiviteit: true as const,
  };
  if (besluit.modus === 'dry-run') {
    const uit = await draaiNieuwsbriefDryRun(voorbereiden);
    return { verstuurd: 0, gepland: uit.gepland, overgeslagen: uit.template ? 'dry-run' : uit.overgeslagen };
  }
  const voorbereid = await bereidNieuwsbrief(voorbereiden);
  if (voorbereid.stoppen || !voorbereid.week || !voorbereid.template) {
    return { verstuurd: 0, gepland: 0, overgeslagen: voorbereid.stoppen ?? 'geen editie' };
  }
  if (voorbereid.brieven.length === 0) {
    return { verstuurd: 0, gepland: 0, overgeslagen: 'geen ontvangers deze verzendronde' };
  }
  const { planNieuwsbrief, dedupNieuwsbrief } = await import('../platform/nieuwsbrief-keten.ts');
  const { getTestMailRecipient } = await import('./testmail-adres.ts');
  const { verstuurGecontroleerd } = await import('./mail-transport.ts');
  const testadres = opties.testadres !== undefined
    ? opties.testadres
    : besluit.modus === 'test'
      ? await getTestMailRecipient()
      : null;
  const al = await bron.alLiveVerzonden(voorbereid.week.id);
  const plan = planNieuwsbrief({
    modus: besluit.modus,
    editieId: voorbereid.week.id,
    ontvangers: voorbereid.brieven.map((brief) => ({ id: brief.vriend._id, email: brief.vriend.email, actief: brief.vriend.actief })),
    alVerzonden: new Set([...al].map((email) => dedupNieuwsbrief(voorbereid.week!.id, email))),
    testadres,
    batchMax: voorbereid.brieven.length,
  });
  if (plan.geblokkeerd || plan.providerAanroepen === 0) {
    return { verstuurd: 0, gepland: plan.bedoeldeAantal, overgeslagen: plan.reden };
  }
  const gekozen = besluit.modus === 'test'
    ? voorbereid.brieven.slice(0, 1)
    : voorbereid.brieven.filter((brief) => plan.werkelijkeOntvangers.includes(brief.vriend.email));
  let verstuurd = 0;
  for (const brief of gekozen) {
    const uit = await verstuurGecontroleerd(
      {
        sleutel: 'nieuwsbrief',
        naar: brief.vriend.email,
        onderwerp: brief.subject,
        tekst: brief.text,
        html: brief.html,
        replyTo: brief.replyTo,
        modus: besluit.modus,
        idempotentieSleutel: dedupNieuwsbrief(voorbereid.week.id, brief.vriend.email),
      },
      { modus: besluit.modus, testadres, transport: opties.transport, register: opties.register },
    );
    if (!uit.providerAangeroepen) continue;
    verstuurd += 1;
    await bron.legVast({
      nieuwsbriefId: voorbereid.week.id,
      vriendId: brief.vriend._id,
      email: brief.vriend.email,
      test: besluit.modus === 'test',
      status: besluit.modus === 'test' ? 'concept' : 'verzonden',
      templateSleutel: voorbereid.template.sleutel,
    });
  }
  if (besluit.modus === 'aan' && verstuurd > 0 && plan.resterend === 0) {
    await bron.markeerVerstuurd(voorbereid.week.id);
  }
  return { verstuurd, gepland: plan.bedoeldeAantal, overgeslagen: plan.reden };
}
