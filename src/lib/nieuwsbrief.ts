import { Resend } from 'resend';
import {
  getVriendenVoorVerzending,
  getNieuwsbriefVoorWeek,
  markeerNieuwsbriefVerstuurd,
  maakOfUpdateNieuwsbriefStatus,
  getAgendaOverzicht,
  getPubliekeAgenda,
  mailImageUrl,
  type NieuwsbriefContent,
  type Activiteit,
  type AgendaOverzicht,
  type VriendFrequentie,
} from './sanity';
import { datumVoorPreview } from './week';
import { mailMeta } from './nieuwsbrief-frequentie';
import { kiesActiviteitenVoorMail } from './nieuwsbrief-agenda';
import { bouwNieuwsbriefHtml } from './nieuwsbrief-html';

export { datumVoorPreview, bouwNieuwsbriefHtml, kiesActiviteitenVoorMail };

const VAN = 'Het Kerkje van Persingen <noreply@send.kerkjepersingen.nl>';
const BATCH_GROOTTE = 100;

function resendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY ?? import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY ontbreekt — nieuwsbrief niet verstuurd');
  }
  return new Resend(apiKey);
}

/** True als het cron-endpoint de aanroep moet weigeren. */
export function cronOnbevoegd(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron] CRON_SECRET ontbreekt — weigert alle aanroepen');
    return true;
  }
  return request.headers.get('authorization') !== `Bearer ${secret}`;
}

function renderMail(
  content: NieuwsbriefContent | null,
  alleActiviteiten: Activiteit[],
  agenda: AgendaOverzicht,
  uitschrijfUrl: string,
  frequentie: VriendFrequentie | undefined,
  nu = new Date(),
): string {
  const keuze = frequentie ?? 'wekelijks';
  const meta = mailMeta(keuze, nu);
  const activiteiten = kiesActiviteitenVoorMail(alleActiviteiten, agenda, keuze, nu);

  return bouwNieuwsbriefHtml(
    {
      kortNieuws: content?.kortNieuws,
      kortNieuwsFotoUrl: mailImageUrl(content?.kortNieuwsFoto, 1120, 560) ?? undefined,
      kortNieuwsFotoAlt: content?.kortNieuwsFotoAlt,
      donatieUpdate: content?.donatieUpdate,
    },
    activiteiten,
    uitschrijfUrl,
    meta,
  );
}

export async function verstuurPreview(previewAdres: string, datum = new Date()): Promise<void> {
  const resend = resendClient();
  const content = await getNieuwsbriefVoorWeek(datum);
  const agenda = await getAgendaOverzicht();
  const alleActiviteiten = await getPubliekeAgenda(50);
  const html = renderMail(
    content,
    alleActiviteiten,
    agenda,
    'https://kerkjepersingen.nl/vrienden/afmelden?token=preview',
    'wekelijks',
    datum,
  );

  const { error } = await resend.emails.send({
    from: VAN,
    to: previewAdres,
    subject: 'Concept nieuwsbrief — verstuurt vrijdagochtend tenzij aangepast',
    html,
  });
  if (error) {
    throw new Error(`Preview versturen mislukt: ${error.message}`);
  }
}

export async function verstuurWekelijkseNieuwsbrief(): Promise<{ verstuurd: number; overgeslagen: string }> {
  const nu = new Date();
  const content = await getNieuwsbriefVoorWeek(nu);

  if (content?.geannuleerd) {
    return { verstuurd: 0, overgeslagen: 'geannuleerd door bestuur' };
  }
  if (content?.verstuurd) {
    return { verstuurd: 0, overgeslagen: 'al verstuurd deze week' };
  }

  const nieuwsbriefId = await maakOfUpdateNieuwsbriefStatus(nu);
  if (!nieuwsbriefId) {
    return { verstuurd: 0, overgeslagen: 'kon verzendstatus niet vastleggen, verzending afgebroken' };
  }

  const vrienden = await getVriendenVoorVerzending(nu);
  if (vrienden.length === 0) {
    await markeerNieuwsbriefVerstuurd(nieuwsbriefId);
    return { verstuurd: 0, overgeslagen: 'geen ontvangers deze verzendronde' };
  }

  const agenda = await getAgendaOverzicht();
  const alleActiviteiten = await getPubliekeAgenda(50);
  const resend = resendClient();

  const berichten = vrienden.map((vriend) => {
    const token = encodeURIComponent(vriend.uitschrijfToken);
    const uitschrijfUrl = `https://kerkjepersingen.nl/vrienden/afmelden?token=${token}`;
    const frequentie = vriend.frequentie ?? 'wekelijks';
    const meta = mailMeta(frequentie, nu);
    return {
      from: VAN,
      to: vriend.email,
      subject: meta.onderwerp,
      html: renderMail(content, alleActiviteiten, agenda, uitschrijfUrl, frequentie, nu),
    };
  });

  for (let i = 0; i < berichten.length; i += BATCH_GROOTTE) {
    const chunk = berichten.slice(i, i + BATCH_GROOTTE);
    const { error } = await resend.batch.send(chunk);
    if (error) {
      throw new Error(`Nieuwsbrief versturen mislukt: ${error.message}`);
    }
  }

  await markeerNieuwsbriefVerstuurd(nieuwsbriefId);

  return { verstuurd: vrienden.length, overgeslagen: '' };
}
