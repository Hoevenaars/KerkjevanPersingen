import type { MailTemplateInhoud, MailVariabelenMap } from './types.ts';
import { maakActieToken, type MailActieSoort } from './actie.ts';

const PINE = '#4A5235';
const BRICK = '#9C4A2F';
const CREAM = '#FAF8F3';
const INK = '#1A1A1A';
const INK_SOFT = '#4A4A44';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
      html.push('<p style="margin:0 0 16px;line-height:1.6;">&nbsp;</p>');
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
  return delen.map((d) => vervangVariabelen(d, vars)).join('\n\n');
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

export function renderMailHtml(
  inhoud: MailTemplateInhoud,
  vars: MailVariabelenMap,
  opties: {
    voorbeeldUrl?: string;
    actieUrls?: Record<string, string>;
    boekingId?: string;
    templateId?: string;
    siteOrigin?: string;
  } = {},
): string {
  const onderwerp = onderwerpUitTemplate(inhoud, vars);
  const aanhef = vervangVariabelen(inhoud.aanhef, vars);
  const intro = vervangVariabelen(inhoud.introductie, vars);
  const hoofd = markdownNaarHtml(vervangVariabelen(inhoud.hoofdtekst, vars));
  const slot = vervangVariabelen(inhoud.slottekst, vars);
  const ondertekening = vervangVariabelen(inhoud.ondertekening, vars).replace(/\n/g, '<br />');

  const knoppen: string[] = [];
  const primair = inhoud.callToActionTekst?.trim();
  if (primair) {
    const href = opties.actieUrls?.primary ?? opties.voorbeeldUrl ?? '#';
    knoppen.push(knopHtml(vervangVariabelen(primair, vars), href));
  }
  for (const kn of inhoud.knoppen ?? []) {
    if (primair && kn.label === primair) continue;
    let href = opties.actieUrls?.[kn.actie] ?? opties.voorbeeldUrl ?? '#';
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
    knoppen.push(knopHtml(vervangVariabelen(kn.label, vars), href, kn.actie !== 'link'));
  }

  const secundair = inhoud.secundaireTekst?.trim();
  const secHtml = secundair
    ? `<p style="margin:16px 0 0;font-size:14px;color:${INK_SOFT};">${escapeHtml(vervangVariabelen(secundair, vars))}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(onderwerp)}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e8e2d6;">
          <tr>
            <td style="padding:28px 32px 8px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${PINE};">
              Kerkje van Persingen
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 32px;font-family:'Work Sans',Helvetica,Arial,sans-serif;font-size:16px;color:${INK};">
              ${aanhef ? `<p style="margin:0 0 16px;line-height:1.6;">${inline(aanhef)}</p>` : ''}
              ${intro ? `<p style="margin:0 0 16px;line-height:1.6;color:${INK_SOFT};">${inline(intro)}</p>` : ''}
              ${hoofd}
              ${slot ? `<p style="margin:16px 0 0;line-height:1.6;color:${INK_SOFT};">${inline(slot)}</p>` : ''}
              ${knoppen.length ? `<div style="margin:28px 0 8px;">${knoppen.join('')}</div>` : ''}
              ${secHtml}
              ${
                ondertekening
                  ? `<p style="margin:28px 0 0;line-height:1.55;color:${INK_SOFT};">${
                      aanhef ? 'Met vriendelijke groet,<br />' : ''
                    }<span style="color:${INK};">${ondertekening}</span></p>`
                  : ''
              }
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function knopHtml(label: string, href: string, secundair = false): string {
  const bg = secundair ? '#ffffff' : BRICK;
  const color = secundair ? BRICK : '#ffffff';
  const border = secundair ? `1px solid ${BRICK}` : 'none';
  return `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 12px 12px 0;padding:12px 20px;background:${bg};color:${color};border:${border};border-radius:4px;text-decoration:none;font-weight:600;font-size:15px;">${escapeHtml(label)}</a>`;
}
