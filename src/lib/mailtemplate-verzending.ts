import { Resend } from 'resend';
import { toezichtBcc } from './toezicht-bcc.ts';

export async function verstuurTestMail(input: {
  naar: string;
  onderwerp: string;
  html: string;
}): Promise<{ verzonden: boolean; detail: string }> {
  const { besluitVoor } = await import('./automatisering-register.ts');
  const besluit = await besluitVoor('mailtemplate_test');
  if (!besluit.provider) {
    return { verzonden: false, detail: besluit.reden };
  }
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.CONTACT_FALLBACK_EMAIL?.trim() ?? 'Kerkje van Persingen <noreply@kerkjepersingen.nl>';
  if (!apiKey) {
    return { verzonden: false, detail: 'RESEND_API_KEY ontbreekt — inhoud lokaal gegenereerd' };
  }
  const resend = new Resend(apiKey);
  const bcc = await toezichtBcc(input.naar);
  const { error } = await resend.emails.send({
    from,
    to: input.naar,
    subject: input.onderwerp,
    html: input.html,
    headers: { 'X-Mail-Template-Test': 'true' },
    ...(bcc.length ? { bcc } : {}),
  });
  if (error) return { verzonden: false, detail: error.message };
  return { verzonden: true, detail: 'ok' };
}
