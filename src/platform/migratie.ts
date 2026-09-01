/**
 * Sanity → beheerplatform: veldmapping (FO §71–§72).
 *
 * Alles meenemen, inclusief ongebruikte velden. Opschoning gebeurt later.
 * Elke rij krijgt legacy_source = 'sanity' en legacy_id = Sanity _id.
 */

export interface Veldmapping {
  sanityType: string;
  sanityVeld: string;
  doelTabel: string;
  doelVeld: string;
  opmerking?: string;
}

export const SANITY_MAPPING: readonly Veldmapping[] = [
  { sanityType: 'aanvraag', sanityVeld: '_id', doelTabel: 'aanvragen', doelVeld: 'legacy_id' },
  { sanityType: 'aanvraag', sanityVeld: 'binnengekomenOp', doelTabel: 'aanvragen', doelVeld: 'binnengekomen_op' },
  { sanityType: 'aanvraag', sanityVeld: 'status', doelTabel: 'aanvragen', doelVeld: 'status', opmerking: 'ja→goedgekeurd, nee→afgewezen, nieuw blijft nieuw' },
  { sanityType: 'aanvraag', sanityVeld: 'afwijsreden', doelTabel: 'aanvragen', doelVeld: 'afwijsreden' },
  { sanityType: 'aanvraag', sanityVeld: 'naam', doelTabel: 'aanvragen', doelVeld: 'naam' },
  { sanityType: 'aanvraag', sanityVeld: 'email', doelTabel: 'aanvragen', doelVeld: 'email' },
  { sanityType: 'aanvraag', sanityVeld: 'telefoon', doelTabel: 'aanvragen', doelVeld: 'telefoon' },
  { sanityType: 'aanvraag', sanityVeld: 'adres', doelTabel: 'aanvragen', doelVeld: 'adres' },
  { sanityType: 'aanvraag', sanityVeld: 'soort', doelTabel: 'aanvragen', doelVeld: 'verhuurtype_sleutel' },
  { sanityType: 'aanvraag', sanityVeld: 'datum', doelTabel: 'aanvragen', doelVeld: 'start_datum' },
  { sanityType: 'aanvraag', sanityVeld: 'datumTot', doelTabel: 'aanvragen', doelVeld: 'eind_datum' },
  { sanityType: 'aanvraag', sanityVeld: 'personen', doelTabel: 'aanvragen', doelVeld: 'aantal_personen' },
  { sanityType: 'aanvraag', sanityVeld: 'toelichting', doelTabel: 'aanvragen', doelVeld: 'toelichting' },
  { sanityType: 'aanvraag', sanityVeld: 'website', doelTabel: 'aanvragen', doelVeld: 'website' },
  { sanityType: 'aanvraag', sanityVeld: 'eerderGeexposeerd', doelTabel: 'aanvragen', doelVeld: 'eerder_geexposeerd' },
  { sanityType: 'aanvraag', sanityVeld: 'medeExposanten', doelTabel: 'aanvragen', doelVeld: 'mede_exposanten' },
  { sanityType: 'aanvraag', sanityVeld: 'boeking', doelTabel: 'aanvragen', doelVeld: 'boeking_id' },

  { sanityType: 'activiteit', sanityVeld: '_id', doelTabel: 'boekingen', doelVeld: 'legacy_id' },
  { sanityType: 'activiteit', sanityVeld: 'interneTitel', doelTabel: 'boekingen', doelVeld: 'interne_titel' },
  { sanityType: 'activiteit', sanityVeld: 'huurderNaam', doelTabel: 'boekingen', doelVeld: 'huurder_naam_snapshot' },
  { sanityType: 'activiteit', sanityVeld: 'huurderEmail', doelTabel: 'boekingen', doelVeld: 'huurder_email_snapshot' },
  { sanityType: 'activiteit', sanityVeld: 'huurderTelefoon', doelTabel: 'boekingen', doelVeld: 'huurder_telefoon_snapshot' },
  { sanityType: 'activiteit', sanityVeld: 'huurderAdres', doelTabel: 'boekingen', doelVeld: 'huurder_adres_snapshot' },
  { sanityType: 'activiteit', sanityVeld: 'aantalPersonen', doelTabel: 'boekingen', doelVeld: 'aantal_personen' },
  { sanityType: 'activiteit', sanityVeld: 'toelichtingAanvrager', doelTabel: 'boekingen', doelVeld: 'toelichting' },
  { sanityType: 'activiteit', sanityVeld: 'website', doelTabel: 'boekingen', doelVeld: 'website' },
  { sanityType: 'activiteit', sanityVeld: 'eerderGeexposeerd', doelTabel: 'boekingen', doelVeld: 'eerder_geexposeerd' },
  { sanityType: 'activiteit', sanityVeld: 'medeExposanten', doelTabel: 'boekingen', doelVeld: 'mede_exposanten' },
  { sanityType: 'activiteit', sanityVeld: 'akkoordVoorwaarden', doelTabel: 'boekingen', doelVeld: 'akkoord_voorwaarden' },
  { sanityType: 'activiteit', sanityVeld: 'start', doelTabel: 'boekingen', doelVeld: 'start_datum' },
  { sanityType: 'activiteit', sanityVeld: 'eind', doelTabel: 'boekingen', doelVeld: 'eind_datum' },
  { sanityType: 'activiteit', sanityVeld: 'soort', doelTabel: 'boekingen', doelVeld: 'verhuurtype_sleutel' },
  { sanityType: 'activiteit', sanityVeld: 'boekingStatus', doelTabel: 'boekingen', doelVeld: 'status', opmerking: 'aanvraag/vastgelegd → migratie-specifiek; optie/definitief/geannuleerd 1-op-1' },
  { sanityType: 'activiteit', sanityVeld: 'tariefBedrag', doelTabel: 'boekingen', doelVeld: 'tarief_bedrag' },
  { sanityType: 'activiteit', sanityVeld: 'aanbetalingBinnen', doelTabel: 'boekingen', doelVeld: 'aanbetaling_ontvangen' },
  { sanityType: 'activiteit', sanityVeld: 'zichtbaarheid', doelTabel: 'boekingen', doelVeld: 'legacy_zichtbaarheid' },
  { sanityType: 'activiteit', sanityVeld: 'publiekeTitel', doelTabel: 'publieke_activiteiten', doelVeld: 'titel' },
  { sanityType: 'activiteit', sanityVeld: 'omschrijving', doelTabel: 'publieke_activiteiten', doelVeld: 'omschrijving' },
  { sanityType: 'activiteit', sanityVeld: 'slug', doelTabel: 'publieke_activiteiten', doelVeld: 'slug' },
  { sanityType: 'activiteit', sanityVeld: 'foto', doelTabel: 'publieke_activiteiten', doelVeld: 'foto_legacy' },
  { sanityType: 'activiteit', sanityVeld: 'fotoAlt', doelTabel: 'publieke_activiteiten', doelVeld: 'foto_alt' },
  { sanityType: 'activiteit', sanityVeld: 'toonVanafMaanden', doelTabel: 'publieke_activiteiten', doelVeld: 'publicatie_trigger' },
  { sanityType: 'activiteit', sanityVeld: 'soort=blokkade', doelTabel: 'interne_activiteiten', doelVeld: '(split)', opmerking: 'Blokkades worden interne activiteiten; blokkeert_verhuurkalender volgt legacy zichtbaarheid' },

  { sanityType: 'persoon', sanityVeld: '_id', doelTabel: 'relaties', doelVeld: 'legacy_id' },
  { sanityType: 'persoon', sanityVeld: 'naam', doelTabel: 'relaties', doelVeld: 'naam' },
  { sanityType: 'persoon', sanityVeld: 'email', doelTabel: 'relaties', doelVeld: 'email' },
  { sanityType: 'persoon', sanityVeld: 'telefoon', doelTabel: 'relaties', doelVeld: 'telefoon' },
  { sanityType: 'persoon', sanityVeld: 'rollen', doelTabel: 'relatie_rollen', doelVeld: 'rol' },
  { sanityType: 'persoon', sanityVeld: 'opReservelijst', doelTabel: 'relaties', doelVeld: 'op_reservelijst' },
  { sanityType: 'persoon', sanityVeld: 'notities', doelTabel: 'relaties', doelVeld: 'notities' },

  { sanityType: 'vriend', sanityVeld: '_id', doelTabel: 'vrienden', doelVeld: 'legacy_id' },
  { sanityType: 'vriend', sanityVeld: 'naam', doelTabel: 'vrienden', doelVeld: 'naam' },
  { sanityType: 'vriend', sanityVeld: 'email', doelTabel: 'vrienden', doelVeld: 'email' },
  { sanityType: 'vriend', sanityVeld: 'actief', doelTabel: 'vrienden', doelVeld: 'actief' },
  { sanityType: 'vriend', sanityVeld: 'frequentie', doelTabel: 'vrienden', doelVeld: 'frequentie' },
  { sanityType: 'vriend', sanityVeld: 'uitschrijfToken', doelTabel: 'vrienden', doelVeld: 'uitschrijf_token' },
  { sanityType: 'vriend', sanityVeld: 'aangemeldOp', doelTabel: 'vrienden', doelVeld: 'aangemeld_op' },

  { sanityType: 'nieuwsbrief', sanityVeld: '_id', doelTabel: 'nieuwsbrieven', doelVeld: 'legacy_id' },
  { sanityType: 'nieuwsbrief', sanityVeld: 'week', doelTabel: 'nieuwsbrieven', doelVeld: 'week_maandag' },
  { sanityType: 'nieuwsbrief', sanityVeld: 'kortNieuws', doelTabel: 'nieuwsbrieven', doelVeld: 'kort_nieuws' },
  { sanityType: 'nieuwsbrief', sanityVeld: 'kortNieuwsFoto', doelTabel: 'nieuwsbrieven', doelVeld: 'foto_legacy' },
  { sanityType: 'nieuwsbrief', sanityVeld: 'kortNieuwsFotoAlt', doelTabel: 'nieuwsbrieven', doelVeld: 'foto_alt' },
  { sanityType: 'nieuwsbrief', sanityVeld: 'donatieUpdate', doelTabel: 'nieuwsbrieven', doelVeld: 'donatie_update' },
  { sanityType: 'nieuwsbrief', sanityVeld: 'geannuleerd', doelTabel: 'nieuwsbrieven', doelVeld: 'overgeslagen' },
  { sanityType: 'nieuwsbrief', sanityVeld: 'verstuurd', doelTabel: 'nieuwsbrieven', doelVeld: 'verstuurd' },

  { sanityType: 'instellingen', sanityVeld: 'ontvangstAdres', doelTabel: 'instellingen', doelVeld: 'ontvangst_adres' },
  { sanityType: 'instellingen', sanityVeld: 'extraOntvangstAdres', doelTabel: 'instellingen', doelVeld: 'extra_ontvangst_adres' },
  { sanityType: 'instellingen', sanityVeld: 'penningmeesterAdres', doelTabel: 'instellingen', doelVeld: 'penningmeester_adres' },
  { sanityType: 'instellingen', sanityVeld: 'aanbetalingTermijnDagen', doelTabel: 'instellingen', doelVeld: 'aanbetaling_termijn_dagen' },
  { sanityType: 'instellingen', sanityVeld: 'contentVerzoekMaandenVooraf', doelTabel: 'instellingen', doelVeld: 'content_verzoek_maanden_vooraf' },
  { sanityType: 'instellingen', sanityVeld: 'googleReviewUrl', doelTabel: 'instellingen', doelVeld: 'google_review_url' },
  { sanityType: 'instellingen', sanityVeld: 'tarieven', doelTabel: 'tarieven', doelVeld: '(rijen)', opmerking: 'Wordt versieerbaar uitgesplitst; initiële 2029-tarieven staan al in seed' },
  { sanityType: 'instellingen', sanityVeld: 'mail*', doelTabel: 'communicatie_templates', doelVeld: 'inhoud', opmerking: 'Elke mailtekst wordt een templateversie' },
];

export function mappingVoorType(sanityType: string): Veldmapping[] {
  return SANITY_MAPPING.filter((rij) => rij.sanityType === sanityType);
}

export function sanityAanvraagStatus(status: string): 'nieuw' | 'goedgekeurd' | 'afgewezen' {
  if (status === 'ja') return 'goedgekeurd';
  if (status === 'nee') return 'afgewezen';
  return 'nieuw';
}

export function sanityBoekingStatus(status: string | undefined): string {
  switch (status) {
    case 'optie':
      return 'optie';
    case 'definitief':
      return 'definitief';
    case 'geannuleerd':
      return 'geannuleerd';
    case 'aanvraag':
      return 'migratie_aanvraag';
    case 'vastgelegd':
    default:
      return 'migratie_vastgelegd';
  }
}
