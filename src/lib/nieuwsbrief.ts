import { Resend } from 'resend';
import {
  getVriendenVoorVerzending,
  getNieuwsbriefVoorWeek,
  markeerNieuwsbriefVerstuurd,
  maakOfUpdateNieuwsbriefStatus,
  getAgendaOverzicht,
  formatDatumBereik,
  mailImageUrl,
  type NieuwsbriefContent,
  type Activiteit,
  type AgendaOverzicht,
} from './sanity';
import { activiteitRaaktWeekend, datumVoorPreview, komendWeekend, kopAgendaBlok } from './week';
import {
  bouwNieuwsbriefHtml,
  SFEER_URL,
  type NieuwsbriefActiviteitBlok,
} from './nieuwsbrief-html';

export { datumVoorPreview, bouwNieuwsbriefHtml };

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

function kiesActiviteit(
  agenda: AgendaOverzicht,
  nu = new Date(),
): {activiteit: Activiteit | null; kop: string} {
  const weekend = komendWeekend(nu);
  const kandidaten = [agenda.vandaag, agenda.volgende, agenda.daarna].filter(
    (item): item is Activiteit => Boolean(item),
  );
  const ditWeekend = kandidaten.find((item) =>
    activiteitRaaktWeekend(item.start, item.eind, weekend),
  );
  if (ditWeekend) return {activiteit: ditWeekend, kop: kopAgendaBlok(true)};
  const volgende = agenda.vandaag ?? agenda.volgende;
  return {activiteit: volgende ?? null, kop: volgende ? kopAgendaBlok(false) : kopAgendaBlok(true)};
}

function naarActiviteitBlok(activiteit: Activiteit, kop: string): NieuwsbriefActiviteitBlok {
  const cmsFoto = mailImageUrl(activiteit.foto, 1120, 560);
  return {
    titel: activiteit.publiekeTitel || activiteit.interneTitel,
    datumTekst: formatDatumBereik(activiteit),
    omschrijving: activiteit.omschrijving?.slice(0, 155),
    fotoUrl: cmsFoto ?? SFEER_URL,
    fotoAlt: activiteit.fotoAlt || 'Het kerkje van Persingen in de Ooijpolder',
    agendaUrl: activiteit.slug
      ? `https://kerkjepersingen.nl/agenda/${activiteit.slug}/`
      : 'https://kerkjepersingen.nl/agenda/',
    kop,
    isExpositie: activiteit.soort === 'expositie',
  };
}

function renderMail(
  content: NieuwsbriefContent | null,
  agenda: AgendaOverzicht,
  uitschrijfUrl: string,
  nu = new Date(),
): string {
  const {activiteit, kop} = kiesActiviteit(agenda, nu);
  const blok = activiteit ? naarActiviteitBlok(activiteit, kop) : null;
  return bouwNieuwsbriefHtml(
    {
      kortNieuws: content?.kortNieuws,
      kortNieuwsFotoUrl: mailImageUrl(content?.kortNieuwsFoto, 1120, 560) ?? undefined,
      kortNieuwsFotoAlt: content?.kortNieuwsFotoAlt,
      donatieUpdate: content?.donatieUpdate,
    },
    blok,
    uitschrijfUrl,
  );
}

export async function verstuurPreview(previewAdres: string, datum = new Date()): Promise<void> {
  const resend = resendClient();
  const content = await getNieuwsbriefVoorWeek(datum);
  const agenda = await getAgendaOverzicht();
  const html = renderMail(
    content,
    agenda,
    'https://kerkjepersingen.nl/vrienden/afmelden?token=preview',
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

  // Ook zonder ingevuld nieuwsbrief-document moet dedup werken: anders zou een
  // handmatige herhaal-aanroep (of een zeldzame dubbele cron) dezelfde mail
  // twee keer kunnen sturen.
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
  const resend = resendClient();

  const berichten = vrienden.map((vriend) => {
    const token = encodeURIComponent(vriend.uitschrijfToken);
    const uitschrijfUrl = `https://kerkjepersingen.nl/vrienden/afmelden?token=${token}`;
    return {
      from: VAN,
      to: vriend.email,
      subject: 'Deze week in Persingen',
      html: renderMail(content, agenda, uitschrijfUrl, nu),
    };
  });

  // Eén batch-call i.p.v. een loop: op Vercel Hobby is de functietijd beperkt,
  // en sequentieel versturen naar tientallen adressen loopt daarop vast.
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
