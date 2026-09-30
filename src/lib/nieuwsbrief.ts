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
  if (!besluit.provider) {
    return { verstuurd: 0, gepland: 0, overgeslagen: `geblokkeerd: ${besluit.reden}` };
  }
  const uit = await draaiNieuwsbriefDryRun({ vrienden: supabaseVrienden(), bron: supabaseNieuwsbrief() });
  return { verstuurd: uit.verstuurd, gepland: uit.gepland, overgeslagen: uit.overgeslagen };
}
