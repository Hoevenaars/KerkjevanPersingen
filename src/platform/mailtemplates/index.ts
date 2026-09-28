export * from './types.ts';
export * from './catalog.ts';
export * from './meta.ts';
export * from './render.ts';
export * from './voorbeeld.ts';
export * from './store.ts';
export * from './workflow.ts';
export * from './actie.ts';

import type { DemoTemplate } from '../demo-data.ts';
import type { MailTemplateDef } from './types.ts';

export function mailtemplateNaarDemo(t: MailTemplateDef): DemoTemplate {
  const termijn =
    t.trigger.offsetWaarde != null && t.trigger.offsetEenheid
      ? `${t.trigger.offsetWaarde} ${t.trigger.offsetEenheid}`
      : '—';
  return {
    id: t.id,
    naam: t.naam,
    verhuurtype: t.categorie,
    trigger: t.trigger.beschrijving,
    termijn,
    verzendwijze:
      t.verzendwijze === 'automatisch'
        ? 'automatisch'
        : t.verzendwijze === 'handmatig'
          ? 'handmatig'
          : 'concept',
    ontvanger: t.ontvanger,
    onderwerp: t.onderwerp,
    inhoud: [t.aanhef, t.hoofdtekst, t.slottekst].filter(Boolean).join('\n\n'),
  };
}

export function mailtemplatesNaarDemo(templates: MailTemplateDef[]): DemoTemplate[] {
  return templates.map(mailtemplateNaarDemo);
}
