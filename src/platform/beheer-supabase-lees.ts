/**
 * Alleen-lezen snapshot voor /beheer?bron=supabase.
 * Lege queryresultaten blijven leeg. Een fout wordt niet aangevuld met voorbeelddata of Sanity.
 */

import { contentstatusVanSanity, type Publicatiestatus } from '../lib/agenda-zichtbaarheid.ts';
import type { BeheerSnapshot } from './beheer-bron.ts';
import type { DemoActiviteit, DemoInstellingen, DemoTemplate } from './demo-data.ts';

export interface SupabaseLeesClient {
  from(tabel: string): {
    select(kolommen: string): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
  };
}

export type PeriodeKlasse = 'verleden' | 'lopend' | 'komend';

export interface BeheerBetaling {
  id: string;
  boekingId: string;
  soort: string;
  bedrag: number;
  status: string;
  vervaldatum: string;
  ontvangenOp: string;
}

export interface BeheerToewijzing {
  id: string;
  boekingId: string;
  relatieId: string;
  relatieNaam: string;
  type: string;
  datum: string | null;
}

const LEEG_INSTELLINGEN: DemoInstellingen = {
  optietermijn: 0,
  betaaltermijn: 0,
  aanbetaling: 0,
  contractbeheerder: '',
  openingVan: '',
  openingTot: '',
  ontvangstAdres: '',
  extraOntvangstAdres: '',
  penningmeesterAdres: '',
};

export function periodeKlasse(start: string, eind: string, vandaag: string): PeriodeKlasse {
  if (eind < vandaag) return 'verleden';
  if (start > vandaag) return 'komend';
  return 'lopend';
}

export function supabaseFoutSnapshot(detail: string): BeheerSnapshot {
  return {
    bron: 'supabase',
    banner: `Supabase-fout: ${detail}`,
    reden: 'De Supabase-testmodus toont geen voorbeelddata en valt niet terug op Sanity.',
    aanvragen: [],
    boekingen: [],
    agenda: [],
    intern: [],
    relaties: [],
    gastheren: [],
    vrienden: [],
    nieuwsbrieven: [],
    templates: [],
    instellingen: { ...LEEG_INSTELLINGEN },
    communicatie: [],
    documenten: [],
    migratie: null,
    betalingen: [],
    toewijzingen: [],
    fout: detail,
    alleenLezen: true,
    instellingenHerkomst: 'leeg',
  };
}

function tekst(waarde: unknown): string {
  return waarde == null ? '' : String(waarde);
}

function publicatiestatusVan(waarde: unknown): Publicatiestatus | null {
  const status = tekst(waarde);
  if (status === 'publiek' || status === 'bezet' || status === 'verborgen') return status;
  return null;
}

function tekstlijst(waarde: unknown): string[] {
  return Array.isArray(waarde) ? waarde.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

function rijen(data: unknown[] | null): Record<string, unknown>[] {
  return (data ?? []) as Record<string, unknown>[];
}

async function lees(client: SupabaseLeesClient, tabel: string, kolommen: string): Promise<Record<string, unknown>[]> {
  const antwoord = await client.from(tabel).select(kolommen);
  if (antwoord.error) throw new Error(`${tabel}: ${antwoord.error.message}`);
  return rijen(antwoord.data);
}

function jsonTekst(waarde: unknown): string {
  if (typeof waarde === 'string') {
    const schoon = waarde.trim();
    if (schoon.startsWith('"') && schoon.endsWith('"')) {
      try {
        const parsed = JSON.parse(schoon);
        return typeof parsed === 'string' ? parsed : schoon;
      } catch {
        return schoon;
      }
    }
    return schoon;
  }
  return tekst(waarde);
}

function instellingenUit(rijenIn: Record<string, unknown>[]): DemoInstellingen {
  const map = new Map(rijenIn.map((rij) => [tekst(rij.sleutel), rij.waarde]));
  const opening = map.get('expositie_openingstijden');
  let van = '';
  let tot = '';
  if (typeof opening === 'string') {
    try {
      const parsed = JSON.parse(opening) as { van?: string; tot?: string };
      van = parsed.van ?? '';
      tot = parsed.tot ?? '';
    } catch {
      van = '';
      tot = '';
    }
  } else if (opening && typeof opening === 'object') {
    const parsed = opening as { van?: string; tot?: string };
    van = parsed.van ?? '';
    tot = parsed.tot ?? '';
  }
  const getal = (sleutel: string): number => {
    const ruw = map.get(sleutel);
    const waarde = typeof ruw === 'number' ? ruw : Number(jsonTekst(ruw));
    return Number.isFinite(waarde) ? waarde : 0;
  };
  return {
    optietermijn: getal('optietermijn_dagen'),
    betaaltermijn: getal('betaaltermijn_dagen'),
    aanbetaling: getal('aanbetaling_standaard'),
    contractbeheerder: jsonTekst(map.get('contractbeheerder')),
    openingVan: van,
    openingTot: tot,
    ontvangstAdres: jsonTekst(map.get('ontvangst_adres')),
    extraOntvangstAdres: jsonTekst(map.get('extra_ontvangst_adres')),
    penningmeesterAdres: jsonTekst(map.get('penningmeester_adres')),
  };
}

export async function leesSupabaseBeheer(
  client: SupabaseLeesClient,
  opties: { vandaag: string; testmodus: boolean },
): Promise<BeheerSnapshot> {
  const [relatieRijen, rolRijen, boekingRijen, betalingRijen, internRijen, toeRijen, vriendRijen, nieuwsRijen, documentRijen, templateRijen, instellingRijen, agendaRijen, aanvraagRijen, jobRijen, tariefRijen, bronRijen] = await Promise.all([
    lees(client, 'relaties', 'id,naam,email,telefoon,adres,op_reservelijst'),
    lees(client, 'relatie_rollen', 'relatie_id,rol'),
    lees(client, 'boekingen', 'id,nummer,status,verhuurtype_sleutel,interne_titel,start_datum,eind_datum,huurder_relatie_id,gastheer_relatie_id,huurder_naam_snapshot,huurder_email_snapshot,tarief_bedrag,aanbetaling_ontvangen,interne_notities'),
    lees(client, 'betalingen', 'id,boeking_id,soort,bedrag,status,vervaldatum,ontvangen_op'),
    lees(client, 'interne_activiteiten', 'id,titel,start_datum,eind_datum,blokkeert_verhuurkalender'),
    lees(client, 'gastbegeleider_toewijzingen', 'id,boeking_id,relatie_id,datum,type'),
    lees(client, 'vrienden', 'id,naam,email,actief,frequentie'),
    lees(client, 'nieuwsbrieven', 'id,week_maandag,kort_nieuws,donatie_update,overgeslagen,verstuurd'),
    lees(client, 'documenten', 'id,boeking_id,bestandsnaam,type,geupload_op'),
    lees(client, 'communicatie_templates', 'id,sleutel,naam,verhuurtype_sleutel,trigger_soort,termijn_waarde,termijn_eenheid,verzendwijze,ontvanger_rol'),
    lees(client, 'instellingen', 'sleutel,waarde'),
    lees(client, 'publieke_activiteiten', 'id,boeking_id,titel,slug,start_datum,eind_datum,gepubliceerd,inhoud_status,omschrijving,korte_omschrijving,volledige_omschrijving,zichtbaarheid,contentstatus,levenscyclus,publicatie_trigger,foto_pad,praktische_informatie,exposanten,annuleringsreden,geannuleerd_op,geannuleerd_door,legacy_id,aanvullende_afbeeldingen'),
    lees(client, 'aanvragen', 'id,status,naam,email,telefoon,adres,verhuurtype_sleutel,start_datum,eind_datum,aantal_personen,toelichting,binnengekomen_op,website,boeking_id,afwijsreden,relatie_id'),
    lees(client, 'communicatie_jobs', 'id,boeking_id,template_sleutel,status,gepland_op,ontvanger_email'),
    lees(client, 'tarieven', 'id,verhuurtype_sleutel,prijstype,bedrag,geldig_vanaf,geldig_tot,toelichting'),
    lees(client, 'activiteit_bron', 'id,legacy_id,zichtbaarheid,soort,titel,interne_titel,slug,start_datum,eind_datum,publicatie_trigger,content_status,contentstatus,levenscyclus'),
  ]);

  const rollenPerRelatie = new Map<string, string[]>();
  for (const rij of rolRijen) {
    const id = tekst(rij.relatie_id);
    const lijst = rollenPerRelatie.get(id) ?? [];
    lijst.push(tekst(rij.rol));
    rollenPerRelatie.set(id, lijst);
  }
  const relaties = relatieRijen.map((rij) => ({
    id: tekst(rij.id),
    naam: tekst(rij.naam),
    email: tekst(rij.email),
    telefoon: tekst(rij.telefoon),
    rollen: rollenPerRelatie.get(tekst(rij.id)) ?? [],
    reservelijst: Boolean(rij.op_reservelijst),
  }));
  const relatieNaam = new Map(relaties.map((relatie) => [relatie.id, relatie.naam]));

  const betalingen: BeheerBetaling[] = betalingRijen.map((rij) => ({
    id: tekst(rij.id),
    boekingId: tekst(rij.boeking_id),
    soort: tekst(rij.soort),
    bedrag: Number(rij.bedrag ?? 0),
    status: tekst(rij.status),
    vervaldatum: tekst(rij.vervaldatum),
    ontvangenOp: tekst(rij.ontvangen_op).slice(0, 10),
  }));

  const toewijzingen: BeheerToewijzing[] = toeRijen.map((rij) => ({
    id: tekst(rij.id),
    boekingId: tekst(rij.boeking_id),
    relatieId: tekst(rij.relatie_id),
    relatieNaam: relatieNaam.get(tekst(rij.relatie_id)) ?? tekst(rij.relatie_id),
    type: tekst(rij.type),
    datum: rij.datum == null || tekst(rij.datum) === '' ? null : tekst(rij.datum),
  }));

  const gastheerIds = new Set<string>();
  for (const rij of boekingRijen) {
    if (rij.gastheer_relatie_id != null) gastheerIds.add(tekst(rij.gastheer_relatie_id));
  }
  for (const toe of toewijzingen) gastheerIds.add(toe.relatieId);

  const boekingen = boekingRijen.map((rij) => {
    const id = tekst(rij.id);
    const relatieId = rij.huurder_relatie_id == null ? '' : tekst(rij.huurder_relatie_id);
    const tarief = rij.tarief_bedrag == null || tekst(rij.tarief_bedrag) === '' ? '' : Number(rij.tarief_bedrag).toFixed(2);
    return {
      id,
      nummer: tekst(rij.nummer) || id,
      status: tekst(rij.status) as BeheerSnapshot['boekingen'][number]['status'],
      interneTitel: tekst(rij.interne_titel),
      soort: tekst(rij.verhuurtype_sleutel),
      start: tekst(rij.start_datum),
      eind: tekst(rij.eind_datum),
      huurder: tekst(rij.huurder_naam_snapshot) || relatieNaam.get(relatieId) || '',
      email: tekst(rij.huurder_email_snapshot),
      tarief,
      aanbetaling: '',
      aanbetalingBinnen: Boolean(rij.aanbetaling_ontvangen),
      publiek: false,
      notities: tekst(rij.interne_notities),
      relatieId,
      gastheerId: rij.gastheer_relatie_id == null ? undefined : tekst(rij.gastheer_relatie_id),
      periode: periodeKlasse(tekst(rij.start_datum), tekst(rij.eind_datum), opties.vandaag),
    };
  });

  const templates: DemoTemplate[] = templateRijen.map((rij) => ({
    id: tekst(rij.sleutel || rij.id),
    naam: tekst(rij.naam),
    verhuurtype: tekst(rij.verhuurtype_sleutel) || 'alle',
    trigger: tekst(rij.trigger_soort),
    termijn: [rij.termijn_waarde, rij.termijn_eenheid].filter((deel) => deel != null && tekst(deel) !== '').map((deel) => tekst(deel)).join(' '),
    verzendwijze: (tekst(rij.verzendwijze) || 'concept') as DemoTemplate['verzendwijze'],
    ontvanger: tekst(rij.ontvanger_rol),
    onderwerp: '',
    inhoud: '',
  }));

  const banner = opties.testmodus
    ? 'Beheer leest Supabase, zonder terugval naar Sanity of voorbeelddata. CONTENT_BRON blijft sanity. Er gaat geen mail uit.'
    : 'Supabase is de operationele bron. Sanity en de productiesite worden niet vanuit deze leesactie beschreven.';

  return {
    bron: 'supabase',
    banner,
    reden: opties.testmodus
      ? 'Normale /beheer-runtime op Supabase. CONTENT_BRON is niet gewijzigd.'
      : 'CONTENT_BRON is supabase.',
    aanvragen: aanvraagRijen.map((rij) => ({
      id: tekst(rij.id),
      status: tekst(rij.status) as BeheerSnapshot['aanvragen'][number]['status'],
      naam: tekst(rij.naam),
      email: tekst(rij.email),
      telefoon: tekst(rij.telefoon),
      adres: tekst(rij.adres),
      soort: tekst(rij.verhuurtype_sleutel),
      start: tekst(rij.start_datum),
      eind: tekst(rij.eind_datum),
      personen: tekst(rij.aantal_personen),
      toelichting: tekst(rij.toelichting),
      binnengekomen: tekst(rij.binnengekomen_op).slice(0, 10),
      website: tekst(rij.website),
      boekingId: rij.boeking_id == null ? undefined : tekst(rij.boeking_id),
      afwijsreden: tekst(rij.afwijsreden),
      relatieId: rij.relatie_id == null ? undefined : tekst(rij.relatie_id),
    })),
    boekingen,
    agenda: [
      ...agendaRijen.map((rij) => ({
        id: tekst(rij.boeking_id || rij.id),
        activiteitId: tekst(rij.id),
        tabel: 'publieke_activiteiten' as const,
        boekingId: tekst(rij.boeking_id) || undefined,
        titel: tekst(rij.titel),
        slug: tekst(rij.slug),
        start: tekst(rij.start_datum),
        eind: tekst(rij.eind_datum),
        status: rij.gepubliceerd ? 'online' as const : 'mist_content' as const,
        omschrijving: tekst(rij.omschrijving),
        soort: tekst(boekingen.find((boeking) => boeking.id === tekst(rij.boeking_id))?.soort),
        publicatiestatus: publicatiestatusVan(rij.zichtbaarheid),
        contentstatus: tekst(rij.contentstatus) || null,
        levenscyclus: tekst(rij.levenscyclus) === 'geannuleerd' ? 'geannuleerd' as const : 'actief' as const,
        annuleringsreden: tekst(rij.annuleringsreden),
        geannuleerdOp: tekst(rij.geannuleerd_op),
        geannuleerdDoor: tekst(rij.geannuleerd_door),
        trigger: tekst(rij.publicatie_trigger) || null,
        fotoPad: tekst(rij.foto_pad),
        korteOmschrijving: tekst(rij.korte_omschrijving),
        volledigeOmschrijving: tekst(rij.volledige_omschrijving),
        exposanten: tekst(rij.exposanten),
        praktisch: tekst(rij.praktische_informatie),
        aanvullende: tekstlijst(rij.aanvullende_afbeeldingen),
        legacyId: tekst(rij.legacy_id),
        bronLabel: tekst(rij.legacy_id) ? 'Sanity/bridge' : 'lokaal beheer',
      })),
      ...bronRijen
        .filter((rij) => !agendaRijen.some((publiek) => tekst(publiek.legacy_id) && tekst(publiek.legacy_id) === tekst(rij.legacy_id)))
        .map((rij): DemoActiviteit => ({
          id: `bron:${tekst(rij.id)}`,
          activiteitId: tekst(rij.id),
          tabel: 'activiteit_bron',
          titel: tekst(rij.titel || rij.interne_titel),
          slug: tekst(rij.slug),
          start: tekst(rij.start_datum),
          eind: tekst(rij.eind_datum),
          status: 'concept',
          omschrijving: '',
          soort: tekst(rij.soort),
          publicatiestatus: publicatiestatusVan(rij.zichtbaarheid),
          contentstatus: tekst(rij.contentstatus) || contentstatusVanSanity(rij.content_status),
          levenscyclus: tekst(rij.levenscyclus) === 'geannuleerd' ? 'geannuleerd' : 'actief',
          trigger: tekst(rij.publicatie_trigger) || null,
          legacyId: tekst(rij.legacy_id),
          bronLabel: 'Sanity/bridge',
        })),
    ],
    intern: internRijen.map((rij) => ({
      id: tekst(rij.id),
      titel: tekst(rij.titel),
      start: tekst(rij.start_datum),
      eind: tekst(rij.eind_datum),
      blokkeert: Boolean(rij.blokkeert_verhuurkalender),
    })),
    relaties,
    gastheren: relaties
      .filter((relatie) => gastheerIds.has(relatie.id))
      .map((relatie) => ({
        id: relatie.id,
        naam: relatie.naam,
        email: relatie.email,
        telefoon: relatie.telefoon,
        actief: true,
      })),
    vrienden: vriendRijen.map((rij) => ({
      id: tekst(rij.id),
      naam: tekst(rij.naam),
      email: tekst(rij.email),
      actief: Boolean(rij.actief),
      frequentie: (tekst(rij.frequentie) || 'wekelijks') as 'wekelijks' | 'tweewekelijks' | 'maandelijks',
    })),
    nieuwsbrieven: nieuwsRijen.map((rij) => ({
      id: tekst(rij.id),
      week: tekst(rij.week_maandag),
      kortNieuws: tekst(rij.kort_nieuws),
      donatieUpdate: tekst(rij.donatie_update),
      overgeslagen: Boolean(rij.overgeslagen),
      verstuurd: Boolean(rij.verstuurd),
    })),
    templates,
    instellingen: instellingenUit(instellingRijen),
    communicatie: jobRijen.map((rij) => ({
      id: tekst(rij.id),
      boekingId: tekst(rij.boeking_id),
      template: tekst(rij.template_sleutel),
      status: tekst(rij.status),
      wanneer: tekst(rij.gepland_op).slice(0, 10),
      ontvanger: tekst(rij.ontvanger_email),
    })),
    documenten: documentRijen.map((rij) => ({
      id: tekst(rij.id),
      boekingId: tekst(rij.boeking_id),
      naam: tekst(rij.bestandsnaam),
      soort: tekst(rij.type),
      datum: tekst(rij.geupload_op).slice(0, 10),
    })),
    migratie: null,
    betalingen,
    toewijzingen,
    fout: null,
    alleenLezen: opties.testmodus,
    instellingenHerkomst: 'supabase',
    tarieven: tariefRijen.map((rij) => ({
      verhuurtype: tekst(rij.verhuurtype_sleutel),
      prijstype: tekst(rij.prijstype),
      bedrag: rij.bedrag == null || tekst(rij.bedrag) === '' ? null : Number(rij.bedrag),
      geldigVanaf: tekst(rij.geldig_vanaf),
      geldigTot: rij.geldig_tot == null || tekst(rij.geldig_tot) === '' ? null : tekst(rij.geldig_tot),
      toelichting: tekst(rij.toelichting),
    })),
  };
}
