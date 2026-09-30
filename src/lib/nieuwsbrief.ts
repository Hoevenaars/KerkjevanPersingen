/**
 * Nieuwsbriefcron. Delivery blijft geblokkeerd: dry-run op Supabase, geen Resend.
 */

import { draaiNieuwsbriefDryRun, supabaseNieuwsbrief } from './nieuwsbrief-supabase.ts';
import { supabaseVrienden } from './vrienden-supabase.ts';
import { datumVoorPreview } from './week';
import { bouwNieuwsbriefHtml } from './nieuwsbrief-html';
import { kiesActiviteitenVoorMail } from './nieuwsbrief-agenda';

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
  await draaiNieuwsbriefDryRun({ datum, vrienden: supabaseVrienden(), bron: supabaseNieuwsbrief() });
}

export async function verstuurWekelijkseNieuwsbrief(): Promise<{ verstuurd: number; gepland: number; overgeslagen: string }> {
  const uit = await draaiNieuwsbriefDryRun({ vrienden: supabaseVrienden(), bron: supabaseNieuwsbrief() });
  return { verstuurd: uit.verstuurd, gepland: uit.gepland, overgeslagen: uit.overgeslagen };
}
