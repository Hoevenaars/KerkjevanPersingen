/**
 * Nieuwsbriefcron. Delivery blijft geblokkeerd: dry-run op Supabase, geen Resend.
 */

import { draaiNieuwsbriefDryRun, supabaseNieuwsbrief } from './nieuwsbrief-supabase.ts';
import { supabaseVrienden } from './vrienden-supabase.ts';
import { datumVoorPreview } from './week.ts';
import { bouwNieuwsbriefHtml } from './nieuwsbrief-html.ts';
import { kiesActiviteitenVoorMail } from './nieuwsbrief-agenda.ts';

export { datumVoorPreview, bouwNieuwsbriefHtml, kiesActiviteitenVoorMail };

/** True als het cron-endpoint de aanroep moet weigeren. */
export function cronOnbevoegd(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron] CRON_SECRET ontbreekt — weigert alle aanroepen');
    return true;
  }
  return request.headers.get('authorization') !== `Bearer ${secret}`;
}

export async function verstuurPreview(_previewAdres: string, datum = new Date()): Promise<void> {
  const { besluitVoor } = await import('./automatisering-register.ts');
  const besluit = await besluitVoor('nieuwsbrief');
  if (!besluit.provider) return;
  await draaiNieuwsbriefDryRun({ datum, vrienden: supabaseVrienden(), bron: supabaseNieuwsbrief() });
}

export async function verstuurWekelijkseNieuwsbrief(): Promise<{ verstuurd: number; gepland: number; overgeslagen: string }> {
  const { besluitVoor } = await import('./automatisering-register.ts');
  const besluit = await besluitVoor('nieuwsbrief');
  if (besluit.modus === 'dry-run') {
    const uit = await draaiNieuwsbriefDryRun({ vrienden: supabaseVrienden(), bron: supabaseNieuwsbrief() });
    return { verstuurd: 0, gepland: uit.gepland, overgeslagen: 'dry-run' };
  }
  if (besluit.modus !== 'test' && besluit.modus !== 'aan') {
    return { verstuurd: 0, gepland: 0, overgeslagen: `geblokkeerd: ${besluit.reden}` };
  }
  const { planNieuwsbrief } = await import('../platform/nieuwsbrief-keten.ts');
  const { getTestMailRecipient } = await import('./testmail-adres.ts');
  const { verstuurGecontroleerd } = await import('./mail-transport.ts');
  const testadres = besluit.modus === 'test' ? await getTestMailRecipient() : null;
  const vrienden = besluit.modus === 'aan' ? await supabaseVrienden().actieve() : [];
  const plan = planNieuwsbrief({
    modus: besluit.modus,
    editieId: 'huidige-week',
    ontvangers: vrienden.map((vriend) => ({ id: vriend._id, email: vriend.email, actief: vriend.actief })),
    alVerzonden: new Set(),
    testadres,
  });
  if (plan.geblokkeerd || plan.providerAanroepen === 0) {
    return { verstuurd: 0, gepland: plan.bedoeldeAantal, overgeslagen: plan.reden };
  }
  const { nieuwsbriefEnvelop } = await import('./nieuwsbrief-html.ts');
  const { mailMeta } = await import('./nieuwsbrief-frequentie.ts');
  const meta = mailMeta('wekelijks', new Date());
  const doelen = besluit.modus === 'test'
    ? [{ email: plan.werkelijkeOntvangers[0] ?? '', token: 'acceptatietest' }]
    : vrienden
        .filter((vriend) => plan.werkelijkeOntvangers.includes(vriend.email))
        .map((vriend) => ({ email: vriend.email, token: vriend.uitschrijfToken }));
  let verstuurd = 0;
  for (const doel of doelen) {
    const brief = nieuwsbriefEnvelop(
      null,
      [],
      `https://kerkjepersingen.nl/vrienden/afmelden?token=${encodeURIComponent(doel.token)}`,
      meta,
    );
    const uit = await verstuurGecontroleerd(
      {
        sleutel: 'nieuwsbrief',
        naar: doel.email,
        onderwerp: brief.subject,
        tekst: brief.text,
        html: brief.html,
        replyTo: brief.replyTo,
        modus: besluit.modus,
      },
      { modus: besluit.modus, testadres },
    );
    if (uit.providerAangeroepen) verstuurd += 1;
  }
  return { verstuurd, gepland: plan.bedoeldeAantal, overgeslagen: plan.reden };
}
