/**
 * Verstuurt goedgekeurde expositiecontent via de centrale maildispatcher.
 * Uit: geen provider. Test: alleen het centrale testmailadres.
 */

import { besluitVoor } from './automatisering-register.ts';
import { verstuurGecontroleerd, type MailTransport } from './mail-transport.ts';
import { maakBeheerAdminClient } from './supabase.ts';
import { lijstIntake } from './intake-opslag.ts';
import {
  SOCIAL_MEDIA_SLEUTEL,
  SOCIAL_MEDIA_EMAIL_SLEUTEL,
  contentIsGoedgekeurd,
  leesSocialMediaEmail,
  planSocialMediaVerzending,
  socialMediaDedup,
} from '../platform/social-media-content.ts';
import { tekstUitInstelling } from '../platform/testmail.ts';
import type { Verzendbesluit } from '../platform/automatisering.ts';

const FOTO_LINK_SECONDEN = 7 * 24 * 60 * 60;

type LeesClient = {
  from: (tabel: string) => {
    select: (kolommen: string) => {
      eq: (kolom: string, waarde: unknown) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }> & {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
    insert: (rij: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
};

export interface SocialVerzendOpties {
  env?: Record<string, unknown>;
  transport?: MailTransport;
  basisUrl?: string;
  fotos?: readonly { label: string; url: string }[];
  testadres?: string | null;
  /** Testpad: sla de database over en gebruik deze inhoud. */
  inhoud?: {
    boekingId: string;
    versie: number;
    goedgekeurd: boolean;
    soort: string;
    titel: string;
    start: string;
    eind?: string;
    exposanten: string;
    korteTekst: string;
    langeTekst: string;
    ontvanger: string;
    alVerstuurd: boolean;
  };
  besluit?: Verzendbesluit;
}

export interface SocialVerzendUitkomst {
  providerAangeroepen: boolean;
  verzonden: boolean;
  reden: string;
  bedoeldeOntvanger: string;
  werkelijkeOntvanger?: string;
  dedup: string;
}

function tekst(waarde: unknown): string {
  return waarde == null ? '' : String(waarde);
}

export async function verstuurSocialMediaInhoud(
  inhoud: NonNullable<SocialVerzendOpties['inhoud']>,
  opties: SocialVerzendOpties = {},
): Promise<SocialVerzendUitkomst> {
  const env = opties.env ?? process.env;
  const besluit = opties.besluit ?? await besluitVoor(SOCIAL_MEDIA_SLEUTEL, undefined, env);
  const basis = (opties.basisUrl ?? 'https://kerkjepersingen.nl').replace(/\/$/, '');
  const fotos = besluit.provider && inhoud.goedgekeurd && !inhoud.alVerstuurd
    ? (opties.fotos ?? [])
    : [];
  const plan = planSocialMediaVerzending({
    ...inhoud,
    fotos,
    beheerUrl: `${basis}/beheer/boekingen/${encodeURIComponent(inhoud.boekingId)}/`,
  }, besluit);
  if (!plan.versturen || !plan.bericht) {
    return {
      providerAangeroepen: false,
      verzonden: false,
      reden: plan.reden,
      bedoeldeOntvanger: plan.bedoeldeOntvanger,
      dedup: plan.dedup,
    };
  }
  const uit = await verstuurGecontroleerd(plan.bericht, {
    env,
    transport: opties.transport,
    testadres: opties.testadres,
    register: opties.besluit ? [stubRegister(opties.besluit)] : undefined,
  });
  return {
    providerAangeroepen: uit.providerAangeroepen,
    verzonden: uit.verzonden,
    reden: uit.melding || plan.reden,
    bedoeldeOntvanger: plan.bedoeldeOntvanger,
    werkelijkeOntvanger: uit.werkelijkeOntvanger,
    dedup: plan.dedup,
  };
}

function stubRegister(besluit: Verzendbesluit) {
  return {
    sleutel: SOCIAL_MEDIA_SLEUTEL,
    naam: 'Social media content',
    omschrijving: '',
    categorie: 'automatisering' as const,
    status: besluit.status === 'onbekend' ? 'uit' as const : besluit.status === 'actief' ? 'actief' as const : besluit.status,
    mailcategorie: 'automatisering',
    trigger: '',
    actieveTrigger: true,
    ontvangerstype: '',
    risicovol: true,
    laatsteRun: null,
    laatsteResultaat: null,
    gewijzigdDoor: null,
    gewijzigdOp: null,
  };
}

export async function verstuurSocialMediaNaGoedkeuring(
  boekingId: string,
  opties: SocialVerzendOpties = {},
): Promise<SocialVerzendUitkomst> {
  const env = opties.env ?? process.env;
  const leeg = socialMediaDedup(boekingId, 0);
  if (opties.inhoud) return verstuurSocialMediaInhoud(opties.inhoud, opties);
  const client = maakBeheerAdminClient(env) as unknown as LeesClient | null;
  if (!client) {
    return { providerAangeroepen: false, verzonden: false, reden: 'Geen database. Er is niets verzonden.', bedoeldeOntvanger: '', dedup: leeg };
  }
  const besluit = opties.besluit ?? await besluitVoor(SOCIAL_MEDIA_SLEUTEL, undefined, env);
  const publiek = await client
    .from('publieke_activiteiten')
    .select('titel,start_datum,eind_datum,exposanten,korte_omschrijving,volledige_omschrijving,omschrijving,inhoud_status,contentstatus,inhoud_versie')
    .eq('boeking_id', Number(boekingId))
    .maybeSingle();
  if (publiek.error || !publiek.data) {
    return { providerAangeroepen: false, verzonden: false, reden: 'Geen contentdossier. Er is niets verzonden.', bedoeldeOntvanger: '', dedup: leeg };
  }
  const rij = publiek.data;
  const versie = Number(rij.inhoud_versie ?? 0);
  const sleutel = socialMediaDedup(boekingId, versie);
  const goedgekeurd = contentIsGoedgekeurd({ inhoudStatus: tekst(rij.inhoud_status), contentstatus: tekst(rij.contentstatus) });
  if (!goedgekeurd || !besluit.provider) {
    return verstuurSocialMediaInhoud({
      boekingId,
      versie,
      goedgekeurd,
      soort: 'expositie',
      titel: tekst(rij.titel),
      start: tekst(rij.start_datum),
      eind: tekst(rij.eind_datum),
      exposanten: tekst(rij.exposanten),
      korteTekst: tekst(rij.korte_omschrijving),
      langeTekst: tekst(rij.volledige_omschrijving),
      ontvanger: '',
      alVerstuurd: false,
    }, { ...opties, besluit, fotos: [] });
  }
  const boeking = await client.from('boekingen').select('verhuurtype_sleutel').eq('id', Number(boekingId)).maybeSingle();
  const instelling = await client.from('instellingen').select('waarde').eq('sleutel', SOCIAL_MEDIA_EMAIL_SLEUTEL).maybeSingle();
  const eerder = await client.from('auditlog').select('id').eq('dedup_sleutel', sleutel);
  if (eerder.error) {
    return { providerAangeroepen: false, verzonden: false, reden: 'Deduplicatie kon niet worden gelezen. Er is niets verzonden.', bedoeldeOntvanger: '', dedup: sleutel };
  }
  const ruwAdres = tekstUitInstelling(instelling.data?.waarde);
  const adres = leesSocialMediaEmail(ruwAdres);
  const fotos = opties.fotos ?? (await lijstIntake(boekingId, env, FOTO_LINK_SECONDEN))
    .filter((foto) => foto.url)
    .map((foto) => ({ label: foto.rol === 'hoofd' ? 'Hoofdafbeelding' : 'Foto', url: foto.url }));
  const uit = await verstuurSocialMediaInhoud({
    boekingId,
    versie,
    goedgekeurd: true,
    soort: tekst(boeking.data?.verhuurtype_sleutel) || 'expositie',
    titel: tekst(rij.titel),
    start: tekst(rij.start_datum),
    eind: tekst(rij.eind_datum),
    exposanten: tekst(rij.exposanten),
    korteTekst: tekst(rij.korte_omschrijving) || tekst(rij.omschrijving),
    langeTekst: tekst(rij.volledige_omschrijving),
    ontvanger: adres.ok ? adres.adres : ruwAdres,
    alVerstuurd: (eerder.data ?? []).length > 0,
  }, { ...opties, besluit, fotos });
  if (uit.providerAangeroepen) {
    await client.from('auditlog').insert({
      actor_type: 'systeem',
      actor_naam: 'social-media',
      onderwerp_type: 'boeking',
      onderwerp_id: boekingId,
      actie: 'social_media_verstuurd',
      van: '',
      naar: uit.bedoeldeOntvanger,
      reden: uit.werkelijkeOntvanger ? `werkelijk:${uit.werkelijkeOntvanger}` : uit.reden,
      dedup_sleutel: uit.dedup,
    });
  }
  return uit;
}
