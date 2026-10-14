import { verstuurGecontroleerd } from './mail-transport.ts';
import { MailGeblokkeerd } from '../platform/automatisering.ts';

/**
 * Testknop van een template.
 * Het ingevoerde adres is hoogstens de bedoelde ontvanger in het log.
 * De provider krijgt alleen het centrale testmailadres, en alleen als de schakelaar op Test staat.
 */
export async function verstuurTestMail(input: {
  naar: string;
  onderwerp: string;
  html: string;
  text: string;
  templateId?: string;
}): Promise<{ verzonden: boolean; detail: string; werkelijk?: string }> {
  try {
    const uit = await verstuurGecontroleerd({
      sleutel: 'mailtemplate_test',
      naar: input.naar,
      onderwerp: input.onderwerp,
      tekst: input.text,
      html: input.html,
      templateId: input.templateId,
      richting: 'aanvrager',
      bedoeldeOntvanger: input.naar,
    });
    if (!uit.providerAangeroepen) {
      return { verzonden: false, detail: uit.melding || uit.besluit.reden };
    }
    return { verzonden: true, detail: 'ok', werkelijk: uit.werkelijkeOntvanger };
  } catch (error) {
    if (error instanceof MailGeblokkeerd) return { verzonden: false, detail: error.message };
    return { verzonden: false, detail: error instanceof Error ? error.message : 'verzenden mislukt' };
  }
}
