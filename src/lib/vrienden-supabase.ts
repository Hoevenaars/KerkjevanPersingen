/**
 * Vriendenflows op Supabase.
 * Bestaande tokens blijven staan tot iemand zich opnieuw aanmeldt na afmelden.
 */

import type { VriendFrequentie } from './nieuwsbrief-frequentie.ts';
import { ontvangtDezeVerzending } from './nieuwsbrief-frequentie.ts';
import { maakBeheerAdminClient } from './supabase.ts';
import { volledigeNaam, type VriendAanmelding } from './vriend-aanmelding.ts';

export interface Vriend {
  _id: string;
  naam?: string;
  voornaam?: string;
  achternaam?: string;
  telefoon?: string | null;
  geboortedatum?: string | null;
  email: string;
  actief: boolean;
  frequentie?: VriendFrequentie;
  uitschrijfToken: string;
}

interface VriendBijwerking {
  naam: string;
  voornaam: string;
  achternaam: string;
  telefoon: string | null;
  geboortedatum: string | null;
  heractiveer: boolean;
  token: string;
}

export interface VriendenBron {
  zoekOpEmail(email: string): Promise<Vriend | null>;
  zoekOpToken(token: string): Promise<Vriend | null>;
  actieve(): Promise<Vriend[]>;
  maak(vriend: Vriend & { naam: string }): Promise<void>;
  werkBij(id: string, bijwerking: VriendBijwerking): Promise<void>;
  deactiveer(id: string): Promise<void>;
  zetFrequentie(id: string, frequentie: VriendFrequentie): Promise<void>;
}

function token(): string {
  return crypto.randomUUID();
}

export async function maakVriendAan(input: VriendAanmelding, bron: VriendenBron = supabaseVrienden()): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const gegevens = {
    naam: volledigeNaam(input),
    voornaam: input.voornaam.trim(),
    achternaam: input.achternaam.trim(),
    telefoon: input.telefoon,
    geboortedatum: input.geboortedatum,
  };
  const bestaand = await bron.zoekOpEmail(email);
  if (bestaand) {
    await bron.werkBij(bestaand._id, {
      ...gegevens,
      heractiveer: !bestaand.actief,
      token: bestaand.actief ? bestaand.uitschrijfToken : token(),
    });
    return;
  }
  await bron.maak({
    _id: '',
    ...gegevens,
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
    throw new Error('Supabase service-role ontbreekt. De vriend is niet opgeslagen.');
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
        voornaam: vriend.voornaam || null,
        achternaam: vriend.achternaam || null,
        telefoon: vriend.telefoon || null,
        geboortedatum: vriend.geboortedatum || null,
        toestemming_op: new Date().toISOString(),
        email: vriend.email,
        actief: true,
        frequentie: 'wekelijks',
        uitschrijf_token: vriend.uitschrijfToken,
      });
      if (error) throw new Error(error.message);
    },
    async werkBij(id, bijwerking) {
      const { error } = await client.from('vrienden').update({
        naam: bijwerking.naam || null,
        voornaam: bijwerking.voornaam || null,
        achternaam: bijwerking.achternaam || null,
        telefoon: bijwerking.telefoon,
        geboortedatum: bijwerking.geboortedatum,
        toestemming_op: new Date().toISOString(),
        ...(bijwerking.heractiveer
          ? { actief: true, frequentie: 'wekelijks' as const, uitschrijf_token: bijwerking.token }
          : {}),
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
    async werkBij(id, bijwerking) {
      const rij = rijen.find((vriend) => vriend._id === id);
      if (!rij) return;
      rij.naam = bijwerking.naam;
      rij.voornaam = bijwerking.voornaam;
      rij.achternaam = bijwerking.achternaam;
      rij.telefoon = bijwerking.telefoon;
      rij.geboortedatum = bijwerking.geboortedatum;
      if (bijwerking.heractiveer) {
        rij.actief = true;
        rij.frequentie = 'wekelijks';
        rij.uitschrijfToken = bijwerking.token;
      }
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
