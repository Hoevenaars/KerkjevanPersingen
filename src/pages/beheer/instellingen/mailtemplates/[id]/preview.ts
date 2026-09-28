export const prerender = false;

import type { APIRoute } from 'astro';
import { renderMailHtml } from '../../../../../platform/mailtemplates/render.ts';
import { laadMailtemplate } from '../../../../../platform/mailtemplates/store.ts';
import { VOORBEELD_VARIABELEN } from '../../../../../platform/mailtemplates/voorbeeld.ts';
import type { MailTemplateInhoud } from '../../../../../platform/mailtemplates/types.ts';

export const POST: APIRoute = async ({ params, request }) => {
  const id = decodeURIComponent(params.id ?? '');
  const base = await laadMailtemplate(id);
  if (!base) return new Response('Niet gevonden', { status: 404 });

  let body: Record<string, string> = {};
  try {
    body = await request.json();
  } catch {
    return new Response('Ongeldige body', { status: 400 });
  }

  const inhoud: MailTemplateInhoud = {
    onderwerp: body.onderwerp ?? base.onderwerp,
    aanhef: body.aanhef ?? base.aanhef,
    introductie: body.introductie ?? base.introductie,
    hoofdtekst: body.hoofdtekst ?? base.hoofdtekst,
    callToActionTekst: body.callToActionTekst ?? base.callToActionTekst,
    secundaireTekst: body.secundaireTekst ?? base.secundaireTekst,
    slottekst: body.slottekst ?? base.slottekst,
    ondertekening: body.ondertekening ?? base.ondertekening,
    knoppen: base.knoppen,
  };

  const html = renderMailHtml(inhoud, VOORBEELD_VARIABELEN, { voorbeeldUrl: 'https://kerkjepersingen.nl/' });
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};
