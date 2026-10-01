/**
 * Vriendenflows op Supabase. Geen Sanity-fallback.
 * Bestaande tokens blijven staan tot iemand zich opnieuw aanmeldt na afmelden.
 */

import type { VriendFrequentie } from './nieuwsbrief-frequentie.ts';
import { ontvangtDezeVerzending } from './nieuwsbrief-frequentie.ts';
import { maakBeheerAdminClient } from './supabase.ts';

export interface Vriend {
  _id: string;
  naam?: string;
  email: string;
  actief: boolean;
  frequentie?: VriendFrequentie;
  uitschrijfToken: string;
}

export interface VriendenBron {
  zoekOpEmail(email: string): Promise<Vriend | null>;
  zoekOpToken(token: string): Promise<Vriend | null>;
  actieve(): Promise<Vriend[]>;
  maak(vriend: Vriend & { naam: string }): Promise<void>;
  heractiveer(id: string, naam: string, token: string): Promise<void>;
  deactiveer(id: string): Promise<void>;
  zetFrequentie(id: string, frequentie: VriendFrequentie): Promise<void>;
}

function token(): string {
  return crypto.randomUUID();
}

export async function maakVriendAan(input: { naam: string; email: string }, bron: VriendenBron = supabaseVrienden()): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const naam = input.naam.trim();
  const bestaand = await bron.zoekOpEmail(email);
  if (bestaand) {
    if (!bestaand.actief) await bron.heractiveer(bestaand._id, naam, token());
    return;
  }
  await bron.maak({
    _id: '',
    naam,
    email,
    actief: true,
    frequentie: 'wekelijks',
    uitschrijfToken: token(),
  });
}

export async function getActieveVrienden(bron: VriendenBron = supabaseVrienden()): Promise<Vriend[]> {
  return bron.actieve();
}

export async function getVriendenVoorVerzending(datum = new Date(), bron: VriendenBron = supabaseVrienden()): Promise<Vriend[]> {
  const vrienden = await getActieveVrienden(bron);
  return vrienden.filter((vriend) => ontvangtDezeVerzending(vriend.frequentie, datum));
}

export async function getVriendByToken(uitschrijfToken: string, bron: VriendenBron = supabaseVrienden()): Promise<Vriend | null> {
  if (!uitschrijfToken) return null;
  return bron.zoekOpToken(uitschrijfToken);
}

export async function deactiveerVriend(id: string, bron: VriendenBron = supabaseVrienden()): Promise<void> {
  await bron.deactiveer(id);
}

export async function updateVriendFrequentie(id: string, frequentie: VriendFrequentie, bron: VriendenBron = supabaseVrienden()): Promise<void> {
  await bron.zetFrequentie(id, frequentie);
}

type Rij = {
  id: number | string;
  naam: string | null;
  email: string;
  actief: boolean;
  frequentie: VriendFrequentie;
  uitschrijf_token: string;
};

function vanRij(rij: Rij): Vriend {
  return {
    _id: String(rij.id),
    naam: rij.naam ?? undefined,
    email: rij.email,
    actief: rij.actief,
    frequentie: rij.frequentie,
    uitschrijfToken: rij.uitschrijf_token,
  };
}

export function supabaseVrienden(): VriendenBron {
  const client = maakBeheerAdminClient();
  if (!client) {
    throw new Error('Supabase service-role ontbreekt. Vrienden worden niet naar Sanity geschreven.');
  }
  return {
    async zoekOpEmail(email) {
      const { data, error } = await client.from('vrienden').select('id,naam,email,actief,frequentie,uitschrijf_token').ilike('email', email).limit(1);
      if (error) throw new Error(error.message);
      const rij = (data ?? []).find((item) => item.email.toLowerCase() === email);
      return rij ? vanRij(rij) : null;
    },
    async zoekOpToken(tokenWaarde) {
      const { data, error } = await client.from('vrienden').select('id,naam,email,actief,frequentie,uitschrijf_token').eq('uitschrijf_token', tokenWaarde).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? vanRij(data) : null;
    },
    async actieve() {
      const { data, error } = await client.from('vrienden').select('id,naam,email,actief,frequentie,uitschrijf_token').eq('actief', true);
      if (error) throw new Error(error.message);
      return (data ?? []).map(vanRij);
    },
    async maak(vriend) {
      const { error } = await client.from('vrienden').insert({
        naam: vriend.naam || null,
        email: vriend.email,
        actief: true,
        frequentie: 'wekelijks',
        uitschrijf_token: vriend.uitschrijfToken,
      });
      if (error) throw new Error(error.message);
    },
    async heractiveer(id, naam, nieuwToken) {
      const { error } = await client.from('vrienden').update({
        actief: true,
        frequentie: 'wekelijks',
        naam: naam || null,
        uitschrijf_token: nieuwToken,
      }).eq('id', Number(id));
      if (error) throw new Error(error.message);
    },
    async deactiveer(id) {
      const { error } = await client.from('vrienden').update({ actief: false }).eq('id', Number(id));
      if (error) throw new Error(error.message);
    },
    async zetFrequentie(id, frequentie) {
      const { error } = await client.from('vrienden').update({ frequentie, actief: true }).eq('id', Number(id));
      if (error) throw new Error(error.message);
    },
  };
}

export function geheugenVrienden(start: Vriend[] = []): VriendenBron & { alle: () => Vriend[] } {
  const rijen = start.map((vriend) => ({ ...vriend }));
  let volg = rijen.length;
  return {
    alle: () => rijen.map((vriend) => ({ ...vriend })),
    async zoekOpEmail(email) {
      return rijen.find((vriend) => vriend.email.toLowerCase() === email) ?? null;
    },
    async zoekOpToken(tokenWaarde) {
      return rijen.find((vriend) => vriend.uitschrijfToken === tokenWaarde) ?? null;
    },
    async actieve() {
      return rijen.filter((vriend) => vriend.actief).map((vriend) => ({ ...vriend }));
    },
    async maak(vriend) {
      volg += 1;
      rijen.push({ ...vriend, _id: String(volg) });
    },
    async heractiveer(id, naam, nieuwToken) {
      const rij = rijen.find((vriend) => vriend._id === id);
      if (!rij) return;
      rij.actief = true;
      rij.frequentie = 'wekelijks';
      rij.naam = naam;
      rij.uitschrijfToken = nieuwToken;
    },
    async deactiveer(id) {
      const rij = rijen.find((vriend) => vriend._id === id);
      if (rij) rij.actief = false;
    },
    async zetFrequentie(id, frequentie) {
      const rij = rijen.find((vriend) => vriend._id === id);
      if (!rij) return;
      rij.frequentie = frequentie;
      rij.actief = true;
    },
  };
}
