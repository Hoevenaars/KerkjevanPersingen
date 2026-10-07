import { bouwResendInhoud, verstuurMetResend } from './mail-transport.ts';
import { MailGeblokkeerd } from '../platform/automatisering.ts';
import { toezichtBcc } from './toezicht-bcc.ts';

export async function verstuurTestMail(input: {
  naar: string;
  onderwerp: string;
  html: string;
  templateId?: string;
}): Promise<{ verzonden: boolean; detail: string }> {
  const { besluitVoor } = await import('./automatisering-register.ts');
  const besluit = await besluitVoor('mailtemplate_test');
  if (!besluit.provider) {
    return { verzonden: false, detail: besluit.reden };
  }
  if (!process.env.RESEND_API_KEY?.trim()) {
    return { verzonden: false, detail: 'RESEND_API_KEY ontbreekt — inhoud lokaal gegenereerd' };
  }
  const bcc = await toezichtBcc(input.naar);
  const inhoud = bouwResendInhoud({
    naar: input.naar,
    onderwerp: input.onderwerp,
    html: input.html,
    templateId: input.templateId,
    bcc,
    headers: { 'X-Mail-Template-Test': 'true' },
  });
  try {
    await verstuurMetResend(inhoud);
  } catch (error) {
    if (error instanceof MailGeblokkeerd) return { verzonden: false, detail: error.message };
    return { verzonden: false, detail: error instanceof Error ? error.message : 'verzenden mislukt' };
  }
  return { verzonden: true, detail: 'ok' };
}
