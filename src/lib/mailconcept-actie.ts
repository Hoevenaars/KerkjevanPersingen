/**
 * Bewaart of verstuurt een handmatig concept. De schakelaar blijft leidend.
 */

import { besluitVoor } from './automatisering-register.ts';
import { legVerzendingVast } from './communicatie-log.ts';
import { verstuurGecontroleerd } from './mail-transport.ts';
import { getTestMailRecipient } from './testmail-adres.ts';
import { mailconceptMelding, stelMailconceptSamen } from '../platform/mailconcept.ts';
import type { MailTemplateDef } from '../platform/mailtemplates/types.ts';

export interface ConceptDossier {
  soort: 'aanvraag' | 'boeking';
  id: string;
  ontvanger: string;
  naam: string;
}

export async function verwerkMailconcept(input: {
  actie: 'mailpreview' | 'mailconcept' | 'mailverstuur';
  dossier: ConceptDossier;
  template: MailTemplateDef | null;
  onderwerp: string;
  inhoud: string;
  actorNaam: string;
  env?: Record<string, unknown>;
  bewaar?: (regel: Record<string, unknown>) => Promise<{ error: string | null }>;
}): Promise<{ ok: boolean; melding: string; preview: ReturnType<typeof stelMailconceptSamen> | null }> {
  const concept = stelMailconceptSamen({
    ontvanger: input.dossier.ontvanger,
    naam: input.dossier.naam,
    template: input.template,
    onderwerp: input.onderwerp,
    inhoud: input.inhoud,
  });
  if ('fout' in concept) return { ok: false, melding: concept.fout, preview: null };
  if (input.actie === 'mailpreview') return { ok: true, melding: 'Preview. Er is geen mail verstuurd.', preview: concept };
  if (concept.openVariabelen && input.actie === 'mailverstuur') {
    return { ok: false, melding: 'Er staan nog variabelen open. Er is geen mail verstuurd.', preview: concept };
  }
  const dedup = `handmatig:${input.dossier.soort}:${input.dossier.id}:${concept.onderwerp}`;
  if (input.actie === 'mailconcept') {
    if (input.bewaar) {
      const opgeslagen = await input.bewaar({
        [`${input.dossier.soort}_id`]: Number(input.dossier.id),
        template_sleutel: input.template?.id ?? 'vrij',
        dedup_sleutel: `${dedup}:concept`,
        status: 'concept',
        modus: 'concept',
        ontvanger_email: concept.ontvanger,
        onderwerp: concept.onderwerp,
        gepland_op: new Date().toISOString(),
        pogingen: 0,
      });
      if (opgeslagen.error) return { ok: false, melding: 'Concept niet opgeslagen. Er is geen mail verstuurd.', preview: concept };
    }
    return { ok: true, melding: 'Concept bewaard. Er is geen mail verstuurd.', preview: concept };
  }
  const env = input.env ?? process.env;
  const besluit = await besluitVoor('handmatige_template', undefined, env);
  const testadres = besluit.modus === 'test' ? await getTestMailRecipient(env) : null;
  const uit = await verstuurGecontroleerd(
    {
      sleutel: 'handmatige_template',
      naar: concept.ontvanger,
      onderwerp: concept.onderwerp,
      tekst: concept.text,
      html: concept.html,
      replyTo: concept.replyTo,
      richting: 'aanvrager',
      modus: besluit.modus,
    },
    { modus: besluit.modus, testadres, env },
  );
  if (uit.providerAangeroepen) {
    await legVerzendingVast({
      aanvraagId: input.dossier.soort === 'aanvraag' ? input.dossier.id : null,
      boekingId: input.dossier.soort === 'boeking' ? input.dossier.id : null,
      templateSleutel: input.template?.id ?? 'vrij',
      onderwerp: uit.besluit.modus === 'test' ? `[TEST] ${concept.onderwerp}` : concept.onderwerp,
      bedoeldeOntvanger: concept.ontvanger,
      werkelijkeOntvanger: uit.werkelijkeOntvanger || '',
      afzender: concept.afzender,
      replyTo: concept.replyTo,
      richting: 'uitgaand',
      status: 'verzonden',
      providerBerichtId: uit.providerBerichtId,
      test: uit.besluit.modus === 'test',
      dedupSleutel: dedup,
      handmatig: true,
    }, env);
  }
  return {
    ok: true,
    melding: mailconceptMelding(uit.besluit.modus, testadres, uit.providerAangeroepen),
    preview: concept,
  };
}
