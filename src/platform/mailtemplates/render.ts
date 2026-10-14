import type { MailTemplateInhoud, MailVariabelenMap } from './types.ts';
import { maakActieToken, type MailActieSoort } from './actie.ts';
import { kerkjeMail, type KerkjeMailCta } from '../../lib/kerkje-mail.ts';

const INK = '#1A1A1A';
const INK_SOFT = '#4A4A44';
const PINE = '#4A5235';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function leesbarePlatteTekst(tekst: string): string {
  return tekst.replace(/\*\*(.+?)\*\*/g, '$1').replace(/[ \t]+$/gm, '');
}

function vervangVariabelen(tekst: string, vars: MailVariabelenMap): string {
  return tekst.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const waarde = vars[key as keyof MailVariabelenMap];
    return waarde ?? `{{${key}}}`;
  });
}

function markdownNaarHtml(tekst: string): string {
  const regels = tekst.split('\n');
  const html: string[] = [];
  let inList = false;

  for (const regel of regels) {
    const trimmed = regel.trim();
    if (!trimmed) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      continue;
    }
    if (trimmed.startsWith('## ')) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      html.push(
        `<h3 style="margin:24px 0 8px;font-family:Georgia,serif;font-size:18px;color:${PINE};">${inline(trimmed.slice(3))}</h3>`,
      );
      continue;
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      if (!inList) {
        html.push(`<ul style="margin:0 0 16px;padding-left:20px;color:${INK_SOFT};">`);
        inList = true;
      }
      html.push(`<li style="margin:0 0 6px;line-height:1.55;">${inline(trimmed.replace(/^[-•]\s*/, ''))}</li>`);
      continue;
    }
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
    html.push(`<p style="margin:0 0 14px;line-height:1.6;color:${INK_SOFT};">${inline(trimmed)}</p>`);
  }
  if (inList) html.push('</ul>');
  return html.join('\n');
}

function inline(tekst: string): string {
  let s = escapeHtml(tekst);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong style="color:' + INK + ';">$1</strong>');
  return s;
}

export function plainTekstUitTemplate(inhoud: MailTemplateInhoud, vars: MailVariabelenMap): string {
  const delen = [
    inhoud.aanhef,
    inhoud.introductie,
    inhoud.hoofdtekst,
    inhoud.slottekst,
    inhoud.ondertekening,
  ].filter(Boolean);
  return delen.map((d) => leesbarePlatteTekst(vervangVariabelen(d, vars))).join('\n\n');
}

export function onderwerpUitTemplate(inhoud: Pick<MailTemplateInhoud, 'onderwerp'>, vars: MailVariabelenMap): string {
  return vervangVariabelen(inhoud.onderwerp, vars);
}

const ACTIE_KNOP_NAAR_SOORT: Record<string, MailActieSoort> = {
  goedkeuren: 'goedkeuren',
  meer_info: 'meer_info',
  afwijzen: 'afwijzen',
  content_goedkeuren: 'content_goedkeuren',
  content_aanpassen: 'content_aanpassen',
  gastheer_ja: 'gastheer_ja',
  gastheer_nee: 'gastheer_nee',
  post_ok: 'post_ok',
  post_melding: 'post_melding',
};

export interface MailRenderOpties {
  voorbeeldUrl?: string;
  actieUrls?: Record<string, string>;
  boekingId?: string;
  templateId?: string;
  siteOrigin?: string;
}

/** Zelfde kaart als de verzending. De beheerpreview roept dit aan. */
export function renderMailBericht(
  inhoud: MailTemplateInhoud,
  vars: MailVariabelenMap,
  opties: MailRenderOpties = {},
): { html: string; text: string } {
  const onderwerp = onderwerpUitTemplate(inhoud, vars);
  const hoofdBron = vervangVariabelen(inhoud.hoofdtekst, vars);
  const knoppen = ctaVoor(inhoud, vars, opties);
  const bericht = kerkjeMail({
    titel: onderwerp,
    aanhef: vervangVariabelen(inhoud.aanhef, vars),
    introductie: vervangVariabelen(inhoud.introductie, vars),
    hoofdtekst: leesbarePlatteTekst(hoofdBron),
    hoofdHtml: markdownNaarHtml(hoofdBron),
    slot: vervangVariabelen(inhoud.slottekst, vars),
    ondertekening: vervangVariabelen(inhoud.ondertekening, vars),
    secundair: vervangVariabelen(inhoud.secundaireTekst, vars),
    cta: knoppen,
  });
  return bericht;
}

export function renderMailHtml(
  inhoud: MailTemplateInhoud,
  vars: MailVariabelenMap,
  opties: MailRenderOpties = {},
): string {
  return renderMailBericht(inhoud, vars, opties).html;
}

function ctaVoor(
  inhoud: MailTemplateInhoud,
  vars: MailVariabelenMap,
  opties: MailRenderOpties,
): KerkjeMailCta[] {
  const knoppen: KerkjeMailCta[] = [];
  const primair = inhoud.callToActionTekst?.trim();
  const fallback = opties.voorbeeldUrl || 'https://kerkjepersingen.nl/';
  if (primair) {
    knoppen.push({
      label: vervangVariabelen(primair, vars),
      href: opties.actieUrls?.primary ?? fallback,
    });
  }
  for (const kn of inhoud.knoppen ?? []) {
    if (primair && kn.label === primair) continue;
    let href = opties.actieUrls?.[kn.actie] ?? fallback;
    const soort = ACTIE_KNOP_NAAR_SOORT[kn.actie];
    if (soort && opties.boekingId && opties.templateId) {
      const origin = opties.siteOrigin ?? 'https://kerkjepersingen.nl';
      const token = maakActieToken({
        actie: soort,
        boekingId: opties.boekingId,
        templateId: opties.templateId,
      });
      href = `${origin}/beheer/mail/bevestigen/?token=${encodeURIComponent(token)}`;
    }
    knoppen.push({
      label: vervangVariabelen(kn.label, vars),
      href,
      secundair: kn.actie !== 'link' && Boolean(primair),
    });
  }
  return knoppen;
}
