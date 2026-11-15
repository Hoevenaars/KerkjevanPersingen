/**
 * Verstuurt de geplande testmails. Elke call dwingt modus test af.
 */

import type { Automatisering } from '../platform/automatisering.ts';
import {
  planAutomatiseringTestmails,
  type TestmailBronnen,
  type TestmailResultaat,
} from '../platform/automatisering-testmail.ts';
import { STANDAARD_MAILTEMPLATES } from '../platform/mailtemplates/catalog.ts';
import { verstuurGecontroleerd, type MailTransport } from './mail-transport.ts';
import { mailMeta } from './nieuwsbrief-frequentie.ts';
import { nieuwsbriefEnvelop } from './nieuwsbrief-html.ts';

function nieuwsbriefVoorTest(): TestmailBronnen['nieuwsbrief'] {
  const meta = mailMeta('wekelijks', new Date());
  return nieuwsbriefEnvelop(
    null,
    [],
    'https://kerkjepersingen.nl/vrienden/afmelden?token=acceptatietest',
    meta,
  );
}

export async function verstuurAutomatiseringTestmails(input: {
  register: readonly Automatisering[];
  testadres: string | null;
  templates?: TestmailBronnen['templates'];
  transport?: MailTransport;
  env?: Record<string, unknown>;
  nieuwsbrief?: TestmailBronnen['nieuwsbrief'];
}): Promise<TestmailResultaat[]> {
  const plannen = planAutomatiseringTestmails(input.register, {
    templates: input.templates ?? STANDAARD_MAILTEMPLATES,
    testadres: input.testadres,
    nieuwsbrief: input.nieuwsbrief === undefined ? nieuwsbriefVoorTest() : input.nieuwsbrief,
  });
  const uit: TestmailResultaat[] = [];
  for (const plan of plannen) {
    if (!plan.versturen || !plan.bericht) {
      uit.push({
        sleutel: plan.sleutel,
        naam: plan.naam,
        verzonden: false,
        overgeslagen: plan.overgeslagen,
        reden: plan.reden,
      });
      continue;
    }
    const item = input.register.find((kandidaat) => kandidaat.sleutel === plan.sleutel);
    if (!item || item.status !== 'test') {
      uit.push({
        sleutel: plan.sleutel,
        naam: plan.naam,
        verzonden: false,
        overgeslagen: true,
        reden: 'staat niet op test',
      });
      continue;
    }
    try {
      const verstuurd = await verstuurGecontroleerd(plan.bericht, {
        register: input.register,
        transport: input.transport,
        modus: 'test',
        testadres: input.testadres,
        env: input.env,
      });
      uit.push({
        sleutel: plan.sleutel,
        naam: plan.naam,
        verzonden: verstuurd.providerAangeroepen,
        overgeslagen: false,
        reden: verstuurd.providerAangeroepen ? 'verstuurd' : verstuurd.melding || verstuurd.besluit.reden,
      });
    } catch (error) {
      uit.push({
        sleutel: plan.sleutel,
        naam: plan.naam,
        verzonden: false,
        overgeslagen: false,
        reden: error instanceof Error ? error.message : 'verzenden mislukt',
      });
    }
  }
  return uit;
}
