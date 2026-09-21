import type { APIRoute } from 'astro';
import { maakBeheerServerClient } from '../../../lib/supabase.ts';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const code = context.url.searchParams.get('code');
  const tokenHash = context.url.searchParams.get('token_hash');
  const type = context.url.searchParams.get('type');
  const next = context.url.searchParams.get('next') || '/beheer/wachtwoord';
  const veiligNext = next.startsWith('/beheer') && !next.startsWith('//') ? next : '/beheer/wachtwoord';

  const supabase = maakBeheerServerClient({
    request: context.request,
    cookies: context.cookies,
  });
  if (!supabase) {
    return context.redirect('/beheer/login?fout=ontbreekt');
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return context.redirect('/beheer/login?fout=ongeldig');
    return context.redirect(veiligNext);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'invite' | 'email' | 'recovery' | 'email_change' | 'signup',
    });
    if (error) return context.redirect('/beheer/login?fout=ongeldig');
    return context.redirect(veiligNext);
  }

  return context.redirect('/beheer/login?fout=ongeldig');
};
