import type { APIRoute } from 'astro';
import { VIEW_AS_COOKIE } from '../../platform/beheer-sessie.ts';
import { maakBeheerServerClient } from '../../lib/supabase.ts';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const supabase = maakBeheerServerClient({
    request: context.request,
    cookies: context.cookies,
  });
  await supabase?.auth.signOut();
  context.cookies.delete(VIEW_AS_COOKIE, { path: '/' });
  return context.redirect('/beheer/login');
};

export const GET: APIRoute = POST;
