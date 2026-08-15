import { Resend } from 'resend';
import {
  getActieveVrienden,
  getNieuwsbriefVoorWeek,
  markeerNieuwsbriefVerstuurd,
  getAgendaOverzicht, // bestaat al, gebruikt door de homepage
  type NieuwsbriefContent,
} from './sanity';

const VAN = 'Het Kerkje van Persingen <noreply@send.kerkjepersingen.nl>';
const PINE = '#4A5235';
const BRICK = '#9C4A2F';
const CREAM_DEEP = '#F1EBDD';
const INK = '#1A1A1A';
const INK_SOFT = '#4A4A44';

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderKortNieuws(tekst?: string): string {
  if (!tekst?.trim()) return '';
  return `
    <tr>
      <td style="padding:28px 32px 0;">
        <div style="color:${BRICK}; font-size:12px; letter-spacing:0.1em; text-transform:uppercase; font-weight:bold; margin-bottom:8px;">
          Kort nieuws
        </div>
        <p style="color:${INK}; font-size:15px; line-height:1.6; margin:0;">
          ${escape(tekst).replace(/\n/g, '<br />')}
        </p>
      </td>
    </tr>`;
}

function renderDonatieUpdate(tekst?: string): string {
  if (!tekst?.trim()) return '';
  return `
    <tr>
      <td style="padding:20px 32px 0;">
        <div style="border-left:3px solid ${PINE}; padding-left:16px;">
          <div style="color:${PINE}; font-size:12px; letter-spacing:0.1em; text-transform:uppercase; font-weight:bold; margin-bottom:6px;">
            Dankzij jullie steun
          </div>
          <p style="color:${INK}; font-size:15px; line-height:1.6; margin:0;">
            ${escape(tekst).replace(/\n/g, '<br />')}
          </p>
        </div>
      </td>
    </tr>`;
}

function renderWeekendBlok(agenda: { titel: string; datumTekst: string; omschrijving: string } | null): string {
  if (!agenda) {
    return `
      <tr>
        <td style="padding:20px 32px 0;">
          <p style="color:${INK_SOFT}; font-size:15px; line-height:1.6;">
            Er is deze week geen activiteit gepland. Bekijk de volledige agenda voor komende data.
          </p>
        </td>
      </tr>`;
  }
  return `
    <tr>
      <td style="padding:20px 32px 0;">
        <div style="background:${CREAM_DEEP}; border-radius:8px; padding:24px;">
          <div style="color:${BRICK}; font-size:12px; letter-spacing:0.1em; text-transform:uppercase; font-weight:bold; margin-bottom:8px;">
            Dit weekend
          </div>
          <div style="color:${INK}; font-size:20px; font-family:Georgia,serif; margin-bottom:6px;">
            ${escape(agenda.titel)}
          </div>
          <p style="color:${INK_SOFT}; font-size:14px; line-height:1.6; margin:0 0 14px;">
            ${escape(agenda.datumTekst)}. ${escape(agenda.omschrijving)}
          </p>
          <a href="https://kerkjepersingen.nl/agenda/"
             style="display:inline-block; background:${BRICK}; color:#ffffff; text-decoration:none;
                    padding:10px 20px; border-radius:6px; font-size:14px; font-family:Georgia,serif;">
            Bekijk de volledige agenda
          </a>
        </div>
      </td>
    </tr>`;
}

function renderMail(content: NieuwsbriefContent | null, agenda: any, uitschrijfUrl: string): string {
  return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8" /></head>
<body style="margin:0; padding:0; background:${CREAM_DEEP}; font-family:Georgia,serif;">
  <div style="max-width:560px; margin:0 auto; padding:32px 16px;">
    <table role="presentation" width="100%" style="border-collapse:collapse; background:#ffffff; border-radius:8px; overflow:hidden;">
      <tr>
        <td style="background:${PINE}; padding:24px 32px; text-align:center;">
          <div style="color:#ffffff; font-size:13px; letter-spacing:0.12em; text-transform:uppercase; opacity:0.85;">
            Vrienden van het kerkje
          </div>
          <div style="color:#ffffff; font-size:24px; font-family:Georgia,serif; margin-top:6px;">
            Deze week in Persingen
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 32px 8px;">
          <p style="color:${INK}; font-size:16px; line-height:1.6; margin:0;">
            Beste vriend van het kerkje,
          </p>
        </td>
      </tr>
      ${renderWeekendBlok(agenda)}
      ${renderKortNieuws(content?.kortNieuws)}
      ${renderDonatieUpdate(content?.donatieUpdate)}
      <tr>
        <td style="padding:28px 32px 0; text-align:center;">
          <a href="https://kerkjepersingen.nl/steun-ons/"
             style="display:inline-block; border:1.5px solid ${PINE}; color:${PINE}; text-decoration:none;
                    padding:10px 24px; border-radius:6px; font-size:14px; font-family:Georgia,serif;">
            Steun het kerkje
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:32px; margin-top:20px;">
          <hr style="border:none; border-top:1px solid #E5DCC8; margin:0 0 20px;" />
          <p style="color:#8A8A82; font-size:12px; line-height:1.6; margin:0; text-align:center;">
            Stichting Het Kerkje van Persingen · Persingensestraat 7, 6575 JA Persingen<br />
            Je ontvangt deze mail omdat je je hebt aangemeld als vriend van het kerkje.<br />
            <a href="${uitschrijfUrl}" style="color:#8A8A82;">Uitschrijven</a>
          </p>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

export async function verstuurPreview(previewAdres: string): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const nu = new Date();
  const content = await getNieuwsbriefVoorWeek(nu);
  const agenda = await getAgendaOverzicht();

  const html = renderMail(content, agenda, 'https://kerkjepersingen.nl/vrienden/afmelden?token=preview');

  await resend.emails.send({
    from: VAN,
    to: previewAdres,
    subject: `Concept nieuwsbrief — verstuurt vrijdag 10:30 tenzij aangepast`,
    html,
  });
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

  const vrienden = await getActieveVrienden();
  if (vrienden.length === 0) {
    return { verstuurd: 0, overgeslagen: 'geen actieve vrienden' };
  }

  const agenda = await getAgendaOverzicht();
  const resend = new Resend(process.env.RESEND_API_KEY);

  for (const vriend of vrienden) {
    const uitschrijfUrl = `https://kerkjepersingen.nl/vrienden/afmelden?token=${vriend.uitschrijfToken}`;
    const html = renderMail(content, agenda, uitschrijfUrl);
    await resend.emails.send({
      from: VAN,
      to: vriend.email,
      subject: 'Deze week in Persingen',
      html,
    });
  }

  if (content?._id) {
    await markeerNieuwsbriefVerstuurd(content._id);
  }

  return { verstuurd: vrienden.length, overgeslagen: '' };
}
