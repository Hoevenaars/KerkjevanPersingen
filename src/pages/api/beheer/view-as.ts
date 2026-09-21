import type { APIRoute } from 'astro';
import { VIEW_AS_COOKIE } from '../../../platform/beheer-sessie.ts';
import { magViewAsStarten } from '../../../platform/beheer-sessie.ts';
import { schrijfViewAsAudit } from '../../../lib/beheer-gebruikers.ts';
import { maakBeheerAdminClient } from '../../../lib/supabase.ts';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const sessie = context.locals.beheer;
  if (!sessie || !magViewAsStarten(sessie.rechten)) {
    return context.redirect('/beheer/instellingen/gebruikers/');
  }

  const data = await context.request.formData();
  const actie = String(data.get('actie') ?? '');
  const doelId = String(data.get('id') ?? '');
  const admin = maakBeheerAdminClient();

  if (actie === 'stop') {
    context.cookies.delete(VIEW_AS_COOKIE, { path: '/' });
    if (admin && sessie.viewAs) {
      await schrijfViewAsAudit(admin, { id: sessie.gebruiker.id, naam: sessie.gebruiker.naam }, sessie.viewAs.id, 'VIEW_AS_ENDED');
    }
    const terug = String(data.get('next') ?? '/beheer/');
    return context.redirect(terug.startsWith('/beheer') ? terug : '/beheer/');
  }

  if (actie === 'start' && doelId && doelId !== sessie.gebruiker.id) {
    context.cookies.set(VIEW_AS_COOKIE, doelId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: context.url.protocol === 'https:',
      maxAge: 60 * 60,
    });
    if (admin) {
      await schrijfViewAsAudit(admin, { id: sessie.gebruiker.id, naam: sessie.gebruiker.naam }, doelId, 'VIEW_AS_STARTED');
    }
    return context.redirect('/beheer/');
  }

  return context.redirect('/beheer/instellingen/gebruikers/');
};
