
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "aanvragen": {
                  Row: {
                    "aantal_personen": string | null,"adres": string | null,"afwijsreden": string | null,"akkoord_voorwaarden": boolean | null,"beoordeling_deadline": string | null,"binnengekomen_op": string,"boeking_id": number | null,"eerder_geexposeerd": string | null,"eind_datum": string | null,"email": string,"id": number,"informatie_ontvangen_op": string | null,"informatievraag": string | null,"legacy_id": string | null,"legacy_source": string | null,"mede_exposanten": string | null,"naam": string,"raw_sanity": Json | null,"relatie_id": number | null,"start_datum": string | null,"status": Database["public"]['Enums']["aanvraag_status"],"telefoon": string | null,"toelichting": string | null,"verhuurtype_sleutel": string | null,"website": string | null,"zoek": unknown
                  }
                  Insert: {
                    "aantal_personen"?: string | null,"adres"?: string | null,"afwijsreden"?: string | null,"akkoord_voorwaarden"?: boolean | null,"beoordeling_deadline"?: string | null,"binnengekomen_op"?: string,"boeking_id"?: number | null,"eerder_geexposeerd"?: string | null,"eind_datum"?: string | null,"email": string,"id"?: never,"informatie_ontvangen_op"?: string | null,"informatievraag"?: string | null,"legacy_id"?: string | null,"legacy_source"?: string | null,"mede_exposanten"?: string | null,"naam": string,"raw_sanity"?: Json | null,"relatie_id"?: number | null,"start_datum"?: string | null,"status"?: Database["public"]['Enums']["aanvraag_status"],"telefoon"?: string | null,"toelichting"?: string | null,"verhuurtype_sleutel"?: string | null,"website"?: string | null,"zoek"?: never
                  }
                  Update: {
                    "aantal_personen"?: string | null,"adres"?: string | null,"afwijsreden"?: string | null,"akkoord_voorwaarden"?: boolean | null,"beoordeling_deadline"?: string | null,"binnengekomen_op"?: string,"boeking_id"?: number | null,"eerder_geexposeerd"?: string | null,"eind_datum"?: string | null,"email"?: string,"id"?: never,"informatie_ontvangen_op"?: string | null,"informatievraag"?: string | null,"legacy_id"?: string | null,"legacy_source"?: string | null,"mede_exposanten"?: string | null,"naam"?: string,"raw_sanity"?: Json | null,"relatie_id"?: number | null,"start_datum"?: string | null,"status"?: Database["public"]['Enums']["aanvraag_status"],"telefoon"?: string | null,"toelichting"?: string | null,"verhuurtype_sleutel"?: string | null,"website"?: string | null,"zoek"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "aanvragen_boeking_id_fkey"
      columns: ["boeking_id"]
isOneToOne: false
      referencedRelation: "boekingen"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "aanvragen_relatie_id_fkey"
      columns: ["relatie_id"]
isOneToOne: false
      referencedRelation: "relaties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "aanvragen_verhuurtype_sleutel_fkey"
      columns: ["verhuurtype_sleutel"]
isOneToOne: false
      referencedRelation: "verhuurtypen"
      referencedColumns: ["sleutel"]
    }
                  ]
                },"auditlog": {
                  Row: {
                    "actie": string,"actor_id": string | null,"actor_naam": string | null,"actor_type": string | null,"dedup_sleutel": string | null,"details": Json | null,"id": number,"naar": string | null,"onderwerp_id": string | null,"onderwerp_type": string,"op": string,"reden": string | null,"van": string | null
                  }
                  Insert: {
                    "actie": string,"actor_id"?: string | null,"actor_naam"?: string | null,"actor_type"?: string | null,"dedup_sleutel"?: string | null,"details"?: Json | null,"id"?: never,"naar"?: string | null,"onderwerp_id"?: string | null,"onderwerp_type": string,"op"?: string,"reden"?: string | null,"van"?: string | null
                  }
                  Update: {
                    "actie"?: string,"actor_id"?: string | null,"actor_naam"?: string | null,"actor_type"?: string | null,"dedup_sleutel"?: string | null,"details"?: Json | null,"id"?: never,"naar"?: string | null,"onderwerp_id"?: string | null,"onderwerp_type"?: string,"op"?: string,"reden"?: string | null,"van"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "auditlog_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profielen"
      referencedColumns: ["id"]
    }
                  ]
                },"betalingen": {
                  Row: {
                    "aangemaakt_op": string,"bedrag": number,"boeking_id": number,"id": number,"ontvangen_op": string | null,"referentie": string | null,"soort": string,"status": string,"vervaldatum": string | null
                  }
                  Insert: {
                    "aangemaakt_op"?: string,"bedrag": number,"boeking_id": number,"id"?: never,"ontvangen_op"?: string | null,"referentie"?: string | null,"soort": string,"status": string,"vervaldatum"?: string | null
                  }
                  Update: {
                    "aangemaakt_op"?: string,"bedrag"?: number,"boeking_id"?: number,"id"?: never,"ontvangen_op"?: string | null,"referentie"?: string | null,"soort"?: string,"status"?: string,"vervaldatum"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "betalingen_boeking_id_fkey"
      columns: ["boeking_id"]
isOneToOne: false
      referencedRelation: "boekingen"
      referencedColumns: ["id"]
    }
                  ]
                },"boeking_ontvangers": {
                  Row: {
                    "boeking_id": number,"id": number,"relatie_id": number,"rol": string,"toegevoegd_op": string,"verwijderd_op": string | null
                  }
                  Insert: {
                    "boeking_id": number,"id"?: never,"relatie_id": number,"rol"?: string,"toegevoegd_op"?: string,"verwijderd_op"?: string | null
                  }
                  Update: {
                    "boeking_id"?: number,"id"?: never,"relatie_id"?: number,"rol"?: string,"toegevoegd_op"?: string,"verwijderd_op"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "boeking_ontvangers_boeking_id_fkey"
      columns: ["boeking_id"]
isOneToOne: false
      referencedRelation: "boekingen"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "boeking_ontvangers_relatie_id_fkey"
      columns: ["relatie_id"]
isOneToOne: false
      referencedRelation: "relaties"
      referencedColumns: ["id"]
    }
                  ]
                },"boekingen": {
                  Row: {
                    "aanbetaling_bedrag": number | null,"aanbetaling_ontvangen": boolean,"aanbetaling_ontvangen_op": string | null,"aanbetaling_override_reden": string | null,"aanbetaling_standaard": number | null,"aangemaakt_op": string,"aantal_personen": string | null,"aanvraag_id": number | null,"akkoord_voorwaarden": boolean | null,"bijgewerkt_op": string,"contactpersoon_relatie_id": number | null,"eerder_geexposeerd": string | null,"eind_datum": string,"gastheer_relatie_id": number | null,"huurder_adres_snapshot": string | null,"huurder_email_snapshot": string | null,"huurder_naam_snapshot": string | null,"huurder_relatie_id": number | null,"huurder_telefoon_snapshot": string | null,"id": number,"interne_notities": string | null,"interne_titel": string,"legacy_id": string | null,"legacy_source": string | null,"legacy_zichtbaarheid": string | null,"mede_exposanten": string | null,"nummer": string | null,"optie_aangemaakt_op": string | null,"optie_einddatum": string | null,"optietermijn_dagen": number | null,"raw_sanity": Json | null,"start_datum": string,"status": Database["public"]['Enums']["boeking_status"],"tarief_bedrag": number | null,"tarief_geldig_vanaf": string | null,"tarief_prijstype": Database["public"]['Enums']["prijstype"] | null,"tarief_vastgelegd_op": string | null,"toelichting": string | null,"verhuurtype_sleutel": string | null,"website": string | null,"zoek": unknown
                  }
                  Insert: {
                    "aanbetaling_bedrag"?: number | null,"aanbetaling_ontvangen"?: boolean,"aanbetaling_ontvangen_op"?: string | null,"aanbetaling_override_reden"?: string | null,"aanbetaling_standaard"?: number | null,"aangemaakt_op"?: string,"aantal_personen"?: string | null,"aanvraag_id"?: number | null,"akkoord_voorwaarden"?: boolean | null,"bijgewerkt_op"?: string,"contactpersoon_relatie_id"?: number | null,"eerder_geexposeerd"?: string | null,"eind_datum": string,"gastheer_relatie_id"?: number | null,"huurder_adres_snapshot"?: string | null,"huurder_email_snapshot"?: string | null,"huurder_naam_snapshot"?: string | null,"huurder_relatie_id"?: number | null,"huurder_telefoon_snapshot"?: string | null,"id"?: never,"interne_notities"?: string | null,"interne_titel": string,"legacy_id"?: string | null,"legacy_source"?: string | null,"legacy_zichtbaarheid"?: string | null,"mede_exposanten"?: string | null,"nummer"?: string | null,"optie_aangemaakt_op"?: string | null,"optie_einddatum"?: string | null,"optietermijn_dagen"?: number | null,"raw_sanity"?: Json | null,"start_datum": string,"status"?: Database["public"]['Enums']["boeking_status"],"tarief_bedrag"?: number | null,"tarief_geldig_vanaf"?: string | null,"tarief_prijstype"?: Database["public"]['Enums']["prijstype"] | null,"tarief_vastgelegd_op"?: string | null,"toelichting"?: string | null,"verhuurtype_sleutel"?: string | null,"website"?: string | null,"zoek"?: never
                  }
                  Update: {
                    "aanbetaling_bedrag"?: number | null,"aanbetaling_ontvangen"?: boolean,"aanbetaling_ontvangen_op"?: string | null,"aanbetaling_override_reden"?: string | null,"aanbetaling_standaard"?: number | null,"aangemaakt_op"?: string,"aantal_personen"?: string | null,"aanvraag_id"?: number | null,"akkoord_voorwaarden"?: boolean | null,"bijgewerkt_op"?: string,"contactpersoon_relatie_id"?: number | null,"eerder_geexposeerd"?: string | null,"eind_datum"?: string,"gastheer_relatie_id"?: number | null,"huurder_adres_snapshot"?: string | null,"huurder_email_snapshot"?: string | null,"huurder_naam_snapshot"?: string | null,"huurder_relatie_id"?: number | null,"huurder_telefoon_snapshot"?: string | null,"id"?: never,"interne_notities"?: string | null,"interne_titel"?: string,"legacy_id"?: string | null,"legacy_source"?: string | null,"legacy_zichtbaarheid"?: string | null,"mede_exposanten"?: string | null,"nummer"?: string | null,"optie_aangemaakt_op"?: string | null,"optie_einddatum"?: string | null,"optietermijn_dagen"?: number | null,"raw_sanity"?: Json | null,"start_datum"?: string,"status"?: Database["public"]['Enums']["boeking_status"],"tarief_bedrag"?: number | null,"tarief_geldig_vanaf"?: string | null,"tarief_prijstype"?: Database["public"]['Enums']["prijstype"] | null,"tarief_vastgelegd_op"?: string | null,"toelichting"?: string | null,"verhuurtype_sleutel"?: string | null,"website"?: string | null,"zoek"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "boekingen_aanvraag_id_fkey"
      columns: ["aanvraag_id"]
isOneToOne: false
      referencedRelation: "aanvragen"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "boekingen_contactpersoon_relatie_id_fkey"
      columns: ["contactpersoon_relatie_id"]
isOneToOne: false
      referencedRelation: "relaties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "boekingen_gastheer_relatie_id_fkey"
      columns: ["gastheer_relatie_id"]
isOneToOne: false
      referencedRelation: "relaties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "boekingen_huurder_relatie_id_fkey"
      columns: ["huurder_relatie_id"]
isOneToOne: false
      referencedRelation: "relaties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "boekingen_verhuurtype_sleutel_fkey"
      columns: ["verhuurtype_sleutel"]
isOneToOne: false
      referencedRelation: "verhuurtypen"
      referencedColumns: ["sleutel"]
    }
                  ]
                },"bronnen": {
                  Row: {
                    "datatype": string,"schrijvende_bron": Database["public"]['Enums']["schrijvende_bron"],"toelichting": string | null
                  }
                  Insert: {
                    "datatype": string,"schrijvende_bron"?: Database["public"]['Enums']["schrijvende_bron"],"toelichting"?: string | null
                  }
                  Update: {
                    "datatype"?: string,"schrijvende_bron"?: Database["public"]['Enums']["schrijvende_bron"],"toelichting"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"communicatie_jobs": {
                  Row: {
                    "aanvraag_id": number | null,"boeking_id": number | null,"dedup_sleutel": string | null,"foutmelding": string | null,"gepland_op": string | null,"id": number,"laatste_poging_op": string | null,"modus": string | null,"onderwerp": string | null,"ontvanger_email": string | null,"pogingen": number,"relatie_id": number | null,"status": Database["public"]['Enums']["communicatie_status"],"template_id": number,"template_sleutel": string | null
                  }
                  Insert: {
                    "aanvraag_id"?: number | null,"boeking_id"?: number | null,"dedup_sleutel"?: string | null,"foutmelding"?: string | null,"gepland_op"?: string | null,"id"?: never,"laatste_poging_op"?: string | null,"modus"?: string | null,"onderwerp"?: string | null,"ontvanger_email"?: string | null,"pogingen"?: number,"relatie_id"?: number | null,"status"?: Database["public"]['Enums']["communicatie_status"],"template_id": number,"template_sleutel"?: string | null
                  }
                  Update: {
                    "aanvraag_id"?: number | null,"boeking_id"?: number | null,"dedup_sleutel"?: string | null,"foutmelding"?: string | null,"gepland_op"?: string | null,"id"?: never,"laatste_poging_op"?: string | null,"modus"?: string | null,"onderwerp"?: string | null,"ontvanger_email"?: string | null,"pogingen"?: number,"relatie_id"?: number | null,"status"?: Database["public"]['Enums']["communicatie_status"],"template_id"?: number,"template_sleutel"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "communicatie_jobs_aanvraag_id_fkey"
      columns: ["aanvraag_id"]
isOneToOne: false
      referencedRelation: "aanvragen"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "communicatie_jobs_boeking_id_fkey"
      columns: ["boeking_id"]
isOneToOne: false
      referencedRelation: "boekingen"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "communicatie_jobs_relatie_id_fkey"
      columns: ["relatie_id"]
isOneToOne: false
      referencedRelation: "relaties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "communicatie_jobs_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "communicatie_templates"
      referencedColumns: ["id"]
    }
                  ]
                },"communicatie_pogingen": {
                  Row: {
                    "foutmelding": string | null,"id": number,"job_id": number,"op": string,"poging": number,"status": Database["public"]['Enums']["communicatie_status"]
                  }
                  Insert: {
                    "foutmelding"?: string | null,"id"?: never,"job_id": number,"op"?: string,"poging": number,"status": Database["public"]['Enums']["communicatie_status"]
                  }
                  Update: {
                    "foutmelding"?: string | null,"id"?: never,"job_id"?: number,"op"?: string,"poging"?: number,"status"?: Database["public"]['Enums']["communicatie_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "communicatie_pogingen_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "communicatie_jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"communicatie_template_versies": {
                  Row: {
                    "id": number,"inhoud": string,"onderwerp": string,"template_id": number,"vastgelegd_op": string,"versie": number
                  }
                  Insert: {
                    "id"?: never,"inhoud": string,"onderwerp": string,"template_id": number,"vastgelegd_op"?: string,"versie": number
                  }
                  Update: {
                    "id"?: never,"inhoud"?: string,"onderwerp"?: string,"template_id"?: number,"vastgelegd_op"?: string,"versie"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "communicatie_template_versies_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "communicatie_templates"
      referencedColumns: ["id"]
    }
                  ]
                },"communicatie_templates": {
                  Row: {
                    "actief": boolean,"huidige_versie": number,"id": number,"naam": string,"nieuwe_ontvanger_actie": Database["public"]['Enums']["nieuwe_ontvanger_actie"],"ontvanger_rol": string,"sleutel": string,"termijn_eenheid": string | null,"termijn_waarde": number | null,"trigger_soort": string,"verhuurtype_sleutel": string | null,"verzendwijze": Database["public"]['Enums']["verzendwijze"]
                  }
                  Insert: {
                    "actief"?: boolean,"huidige_versie"?: number,"id"?: never,"naam": string,"nieuwe_ontvanger_actie"?: Database["public"]['Enums']["nieuwe_ontvanger_actie"],"ontvanger_rol"?: string,"sleutel": string,"termijn_eenheid"?: string | null,"termijn_waarde"?: number | null,"trigger_soort"?: string,"verhuurtype_sleutel"?: string | null,"verzendwijze"?: Database["public"]['Enums']["verzendwijze"]
                  }
                  Update: {
                    "actief"?: boolean,"huidige_versie"?: number,"id"?: never,"naam"?: string,"nieuwe_ontvanger_actie"?: Database["public"]['Enums']["nieuwe_ontvanger_actie"],"ontvanger_rol"?: string,"sleutel"?: string,"termijn_eenheid"?: string | null,"termijn_waarde"?: number | null,"trigger_soort"?: string,"verhuurtype_sleutel"?: string | null,"verzendwijze"?: Database["public"]['Enums']["verzendwijze"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "communicatie_templates_verhuurtype_sleutel_fkey"
      columns: ["verhuurtype_sleutel"]
isOneToOne: false
      referencedRelation: "verhuurtypen"
      referencedColumns: ["sleutel"]
    }
                  ]
                },"communicatie_verzendingen": {
                  Row: {
                    "boeking_id": number | null,"email_op_verzendmoment": string | null,"foutmelding": string | null,"gebruiker_id": string | null,"gepland_op": string | null,"handmatig": boolean,"id": number,"relatie_id": number | null,"status": Database["public"]['Enums']["communicatie_status"],"template_id": number | null,"template_versie": number | null,"test": boolean,"verzonden_op": string | null
                  }
                  Insert: {
                    "boeking_id"?: number | null,"email_op_verzendmoment"?: string | null,"foutmelding"?: string | null,"gebruiker_id"?: string | null,"gepland_op"?: string | null,"handmatig"?: boolean,"id"?: never,"relatie_id"?: number | null,"status": Database["public"]['Enums']["communicatie_status"],"template_id"?: number | null,"template_versie"?: number | null,"test"?: boolean,"verzonden_op"?: string | null
                  }
                  Update: {
                    "boeking_id"?: number | null,"email_op_verzendmoment"?: string | null,"foutmelding"?: string | null,"gebruiker_id"?: string | null,"gepland_op"?: string | null,"handmatig"?: boolean,"id"?: never,"relatie_id"?: number | null,"status"?: Database["public"]['Enums']["communicatie_status"],"template_id"?: number | null,"template_versie"?: number | null,"test"?: boolean,"verzonden_op"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "communicatie_verzendingen_boeking_id_fkey"
      columns: ["boeking_id"]
isOneToOne: false
      referencedRelation: "boekingen"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "communicatie_verzendingen_gebruiker_id_fkey"
      columns: ["gebruiker_id"]
isOneToOne: false
      referencedRelation: "profielen"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "communicatie_verzendingen_relatie_id_fkey"
      columns: ["relatie_id"]
isOneToOne: false
      referencedRelation: "relaties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "communicatie_verzendingen_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "communicatie_templates"
      referencedColumns: ["id"]
    }
                  ]
                },"documenten": {
                  Row: {
                    "bestandsnaam": string,"boeking_id": number,"geupload_door": string | null,"geupload_op": string,"grootte_bytes": number | null,"id": number,"mime_type": string | null,"storage_pad": string,"type": Database["public"]['Enums']["document_type"]
                  }
                  Insert: {
                    "bestandsnaam": string,"boeking_id": number,"geupload_door"?: string | null,"geupload_op"?: string,"grootte_bytes"?: number | null,"id"?: never,"mime_type"?: string | null,"storage_pad": string,"type"?: Database["public"]['Enums']["document_type"]
                  }
                  Update: {
                    "bestandsnaam"?: string,"boeking_id"?: number,"geupload_door"?: string | null,"geupload_op"?: string,"grootte_bytes"?: number | null,"id"?: never,"mime_type"?: string | null,"storage_pad"?: string,"type"?: Database["public"]['Enums']["document_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "documenten_boeking_id_fkey"
      columns: ["boeking_id"]
isOneToOne: false
      referencedRelation: "boekingen"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documenten_geupload_door_fkey"
      columns: ["geupload_door"]
isOneToOne: false
      referencedRelation: "profielen"
      referencedColumns: ["id"]
    }
                  ]
                },"gebruikersrechten": {
                  Row: {
                    "id": number,"module_sleutel": string,"niveau": Database["public"]['Enums']["rechtniveau"],"profiel_id": string
                  }
                  Insert: {
                    "id"?: never,"module_sleutel": string,"niveau"?: Database["public"]['Enums']["rechtniveau"],"profiel_id": string
                  }
                  Update: {
                    "id"?: never,"module_sleutel"?: string,"niveau"?: Database["public"]['Enums']["rechtniveau"],"profiel_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "gebruikersrechten_module_sleutel_fkey"
      columns: ["module_sleutel"]
isOneToOne: false
      referencedRelation: "modules"
      referencedColumns: ["sleutel"]
    },{
      foreignKeyName: "gebruikersrechten_profiel_id_fkey"
      columns: ["profiel_id"]
isOneToOne: false
      referencedRelation: "profielen"
      referencedColumns: ["id"]
    }
                  ]
                },"incidenten": {
                  Row: {
                    "boeking_id": number,"gemeld_door": string | null,"gemeld_op": string,"gesloten_op": string | null,"id": number,"omschrijving": string,"status": string
                  }
                  Insert: {
                    "boeking_id": number,"gemeld_door"?: string | null,"gemeld_op"?: string,"gesloten_op"?: string | null,"id"?: never,"omschrijving": string,"status"?: string
                  }
                  Update: {
                    "boeking_id"?: number,"gemeld_door"?: string | null,"gemeld_op"?: string,"gesloten_op"?: string | null,"id"?: never,"omschrijving"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "incidenten_boeking_id_fkey"
      columns: ["boeking_id"]
isOneToOne: false
      referencedRelation: "boekingen"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "incidenten_gemeld_door_fkey"
      columns: ["gemeld_door"]
isOneToOne: false
      referencedRelation: "profielen"
      referencedColumns: ["id"]
    }
                  ]
                },"instellingen": {
                  Row: {
                    "bijgewerkt_op": string,"groep": string,"sleutel": string,"toelichting": string | null,"waarde": NonNullable<Json>
                  }
                  Insert: {
                    "bijgewerkt_op"?: string,"groep": string,"sleutel": string,"toelichting"?: string | null,"waarde": NonNullable<Json>
                  }
                  Update: {
                    "bijgewerkt_op"?: string,"groep"?: string,"sleutel"?: string,"toelichting"?: string | null,"waarde"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"interne_activiteiten": {
                  Row: {
                    "blokkeert_verhuurkalender": boolean,"eind_datum": string,"id": number,"legacy_id": string | null,"legacy_source": string | null,"notities": string | null,"raw_sanity": Json | null,"start_datum": string,"titel": string
                  }
                  Insert: {
                    "blokkeert_verhuurkalender"?: boolean,"eind_datum": string,"id"?: never,"legacy_id"?: string | null,"legacy_source"?: string | null,"notities"?: string | null,"raw_sanity"?: Json | null,"start_datum": string,"titel": string
                  }
                  Update: {
                    "blokkeert_verhuurkalender"?: boolean,"eind_datum"?: string,"id"?: never,"legacy_id"?: string | null,"legacy_source"?: string | null,"notities"?: string | null,"raw_sanity"?: Json | null,"start_datum"?: string,"titel"?: string
                  }
                  Relationships: [
                    
                  ]
                },"modules": {
                  Row: {
                    "naam": string,"sleutel": string,"volgorde": number
                  }
                  Insert: {
                    "naam": string,"sleutel": string,"volgorde": number
                  }
                  Update: {
                    "naam"?: string,"sleutel"?: string,"volgorde"?: number
                  }
                  Relationships: [
                    
                  ]
                },"nieuwsbrief_verzendingen": {
                  Row: {
                    "email_op_verzendmoment": string | null,"foutmelding": string | null,"id": number,"nieuwsbrief_id": number,"status": Database["public"]['Enums']["communicatie_status"],"test": boolean,"verzonden_op": string | null,"vriend_id": number | null
                  }
                  Insert: {
                    "email_op_verzendmoment"?: string | null,"foutmelding"?: string | null,"id"?: never,"nieuwsbrief_id": number,"status": Database["public"]['Enums']["communicatie_status"],"test"?: boolean,"verzonden_op"?: string | null,"vriend_id"?: number | null
                  }
                  Update: {
                    "email_op_verzendmoment"?: string | null,"foutmelding"?: string | null,"id"?: never,"nieuwsbrief_id"?: number,"status"?: Database["public"]['Enums']["communicatie_status"],"test"?: boolean,"verzonden_op"?: string | null,"vriend_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "nieuwsbrief_verzendingen_nieuwsbrief_id_fkey"
      columns: ["nieuwsbrief_id"]
isOneToOne: false
      referencedRelation: "nieuwsbrieven"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "nieuwsbrief_verzendingen_vriend_id_fkey"
      columns: ["vriend_id"]
isOneToOne: false
      referencedRelation: "vrienden"
      referencedColumns: ["id"]
    }
                  ]
                },"nieuwsbrieven": {
                  Row: {
                    "donatie_update": string | null,"foto_alt": string | null,"foto_pad": string | null,"id": number,"kort_nieuws": string | null,"legacy_id": string | null,"legacy_source": string | null,"overgeslagen": boolean,"verstuurd": boolean,"verstuurd_op": string | null,"week_maandag": string
                  }
                  Insert: {
                    "donatie_update"?: string | null,"foto_alt"?: string | null,"foto_pad"?: string | null,"id"?: never,"kort_nieuws"?: string | null,"legacy_id"?: string | null,"legacy_source"?: string | null,"overgeslagen"?: boolean,"verstuurd"?: boolean,"verstuurd_op"?: string | null,"week_maandag": string
                  }
                  Update: {
                    "donatie_update"?: string | null,"foto_alt"?: string | null,"foto_pad"?: string | null,"id"?: never,"kort_nieuws"?: string | null,"legacy_id"?: string | null,"legacy_source"?: string | null,"overgeslagen"?: boolean,"verstuurd"?: boolean,"verstuurd_op"?: string | null,"week_maandag"?: string
                  }
                  Relationships: [
                    
                  ]
                },"page_views": {
                  Row: {
                    "created_at": string,"device_type": string,"id": number,"locale": string,"page_key": string,"path": string,"referrer_host": string | null
                  }
                  Insert: {
                    "created_at"?: string,"device_type": string,"id"?: never,"locale": string,"page_key": string,"path": string,"referrer_host"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"device_type"?: string,"id"?: never,"locale"?: string,"page_key"?: string,"path"?: string,"referrer_host"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"profielen": {
                  Row: {
                    "aangemaakt_op": string,"actief": boolean,"bijgewerkt_op": string,"email": string,"functie": string | null,"id": string,"is_super_admin": boolean,"last_active_at": string | null,"naam": string,"status": Database["public"]['Enums']["account_status"]
                  }
                  Insert: {
                    "aangemaakt_op"?: string,"actief"?: boolean,"bijgewerkt_op"?: string,"email": string,"functie"?: string | null,"id": string,"is_super_admin"?: boolean,"last_active_at"?: string | null,"naam": string,"status"?: Database["public"]['Enums']["account_status"]
                  }
                  Update: {
                    "aangemaakt_op"?: string,"actief"?: boolean,"bijgewerkt_op"?: string,"email"?: string,"functie"?: string | null,"id"?: string,"is_super_admin"?: boolean,"last_active_at"?: string | null,"naam"?: string,"status"?: Database["public"]['Enums']["account_status"]
                  }
                  Relationships: [
                    
                  ]
                },"publieke_activiteiten": {
                  Row: {
                    "beoordeling_toelichting": string | null,"boeking_id": number | null,"eind_datum": string,"foto_alt": string | null,"foto_pad": string | null,"gepubliceerd": boolean,"gepubliceerd_op": string | null,"goedgekeurd_door": string | null,"goedgekeurd_op": string | null,"id": number,"ingediend_op": string | null,"inhoud_status": Database["public"]['Enums']["inhoud_status"],"inhoud_versie": number,"legacy_id": string | null,"legacy_source": string | null,"omschrijving": string | null,"openingstijden": Json | null,"praktische_informatie": string | null,"publicatie_trigger": Database["public"]['Enums']["publicatie_trigger"],"raw_sanity": Json | null,"slug": string | null,"start_datum": string,"titel": string | null,"website": string | null
                  }
                  Insert: {
                    "beoordeling_toelichting"?: string | null,"boeking_id"?: number | null,"eind_datum": string,"foto_alt"?: string | null,"foto_pad"?: string | null,"gepubliceerd"?: boolean,"gepubliceerd_op"?: string | null,"goedgekeurd_door"?: string | null,"goedgekeurd_op"?: string | null,"id"?: never,"ingediend_op"?: string | null,"inhoud_status"?: Database["public"]['Enums']["inhoud_status"],"inhoud_versie"?: number,"legacy_id"?: string | null,"legacy_source"?: string | null,"omschrijving"?: string | null,"openingstijden"?: Json | null,"praktische_informatie"?: string | null,"publicatie_trigger"?: Database["public"]['Enums']["publicatie_trigger"],"raw_sanity"?: Json | null,"slug"?: string | null,"start_datum": string,"titel"?: string | null,"website"?: string | null
                  }
                  Update: {
                    "beoordeling_toelichting"?: string | null,"boeking_id"?: number | null,"eind_datum"?: string,"foto_alt"?: string | null,"foto_pad"?: string | null,"gepubliceerd"?: boolean,"gepubliceerd_op"?: string | null,"goedgekeurd_door"?: string | null,"goedgekeurd_op"?: string | null,"id"?: never,"ingediend_op"?: string | null,"inhoud_status"?: Database["public"]['Enums']["inhoud_status"],"inhoud_versie"?: number,"legacy_id"?: string | null,"legacy_source"?: string | null,"omschrijving"?: string | null,"openingstijden"?: Json | null,"praktische_informatie"?: string | null,"publicatie_trigger"?: Database["public"]['Enums']["publicatie_trigger"],"raw_sanity"?: Json | null,"slug"?: string | null,"start_datum"?: string,"titel"?: string | null,"website"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "publieke_activiteiten_boeking_id_fkey"
      columns: ["boeking_id"]
isOneToOne: false
      referencedRelation: "boekingen"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "publieke_activiteiten_goedgekeurd_door_fkey"
      columns: ["goedgekeurd_door"]
isOneToOne: false
      referencedRelation: "profielen"
      referencedColumns: ["id"]
    }
                  ]
                },"relatie_rollen": {
                  Row: {
                    "relatie_id": number,"rol": string
                  }
                  Insert: {
                    "relatie_id": number,"rol": string
                  }
                  Update: {
                    "relatie_id"?: number,"rol"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "relatie_rollen_relatie_id_fkey"
      columns: ["relatie_id"]
isOneToOne: false
      referencedRelation: "relaties"
      referencedColumns: ["id"]
    }
                  ]
                },"relaties": {
                  Row: {
                    "aangemaakt_op": string,"adres": string | null,"bijgewerkt_op": string,"email": string | null,"id": number,"legacy_id": string | null,"legacy_source": string | null,"naam": string,"notities": string | null,"op_reservelijst": boolean,"telefoon": string | null,"zoek": unknown
                  }
                  Insert: {
                    "aangemaakt_op"?: string,"adres"?: string | null,"bijgewerkt_op"?: string,"email"?: string | null,"id"?: never,"legacy_id"?: string | null,"legacy_source"?: string | null,"naam": string,"notities"?: string | null,"op_reservelijst"?: boolean,"telefoon"?: string | null,"zoek"?: never
                  }
                  Update: {
                    "aangemaakt_op"?: string,"adres"?: string | null,"bijgewerkt_op"?: string,"email"?: string | null,"id"?: never,"legacy_id"?: string | null,"legacy_source"?: string | null,"naam"?: string,"notities"?: string | null,"op_reservelijst"?: boolean,"telefoon"?: string | null,"zoek"?: never
                  }
                  Relationships: [
                    
                  ]
                },"tarieven": {
                  Row: {
                    "bedrag": number | null,"geldig_tot": string | null,"geldig_vanaf": string,"id": number,"prijstype": Database["public"]['Enums']["prijstype"],"toelichting": string | null,"verhuurtype_sleutel": string
                  }
                  Insert: {
                    "bedrag"?: number | null,"geldig_tot"?: string | null,"geldig_vanaf": string,"id"?: never,"prijstype": Database["public"]['Enums']["prijstype"],"toelichting"?: string | null,"verhuurtype_sleutel": string
                  }
                  Update: {
                    "bedrag"?: number | null,"geldig_tot"?: string | null,"geldig_vanaf"?: string,"id"?: never,"prijstype"?: Database["public"]['Enums']["prijstype"],"toelichting"?: string | null,"verhuurtype_sleutel"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tarieven_verhuurtype_sleutel_fkey"
      columns: ["verhuurtype_sleutel"]
isOneToOne: false
      referencedRelation: "verhuurtypen"
      referencedColumns: ["sleutel"]
    }
                  ]
                },"toegangstokens": {
                  Row: {
                    "aangemaakt_op": string,"aanvraag_id": number | null,"boeking_id": number | null,"doel": string,"gebruikt_op": string | null,"id": number,"ingetrokken_op": string | null,"token_hash": string,"verloopt_op": string
                  }
                  Insert: {
                    "aangemaakt_op"?: string,"aanvraag_id"?: number | null,"boeking_id"?: number | null,"doel": string,"gebruikt_op"?: string | null,"id"?: never,"ingetrokken_op"?: string | null,"token_hash": string,"verloopt_op": string
                  }
                  Update: {
                    "aangemaakt_op"?: string,"aanvraag_id"?: number | null,"boeking_id"?: number | null,"doel"?: string,"gebruikt_op"?: string | null,"id"?: never,"ingetrokken_op"?: string | null,"token_hash"?: string,"verloopt_op"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "toegangstokens_aanvraag_id_fkey"
      columns: ["aanvraag_id"]
isOneToOne: false
      referencedRelation: "aanvragen"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "toegangstokens_boeking_id_fkey"
      columns: ["boeking_id"]
isOneToOne: false
      referencedRelation: "boekingen"
      referencedColumns: ["id"]
    }
                  ]
                },"verhuurtypen": {
                  Row: {
                    "actief": boolean,"dagregel": Database["public"]['Enums']["dagregel"],"naam": string,"sleutel": string,"volgorde": number
                  }
                  Insert: {
                    "actief"?: boolean,"dagregel": Database["public"]['Enums']["dagregel"],"naam": string,"sleutel": string,"volgorde"?: number
                  }
                  Update: {
                    "actief"?: boolean,"dagregel"?: Database["public"]['Enums']["dagregel"],"naam"?: string,"sleutel"?: string,"volgorde"?: number
                  }
                  Relationships: [
                    
                  ]
                },"vrienden": {
                  Row: {
                    "aangemeld_op": string,"actief": boolean,"email": string,"frequentie": Database["public"]['Enums']["vriend_frequentie"],"id": number,"legacy_id": string | null,"legacy_source": string | null,"naam": string | null,"uitschrijf_token": string
                  }
                  Insert: {
                    "aangemeld_op"?: string,"actief"?: boolean,"email": string,"frequentie"?: Database["public"]['Enums']["vriend_frequentie"],"id"?: never,"legacy_id"?: string | null,"legacy_source"?: string | null,"naam"?: string | null,"uitschrijf_token": string
                  }
                  Update: {
                    "aangemeld_op"?: string,"actief"?: boolean,"email"?: string,"frequentie"?: Database["public"]['Enums']["vriend_frequentie"],"id"?: never,"legacy_id"?: string | null,"legacy_source"?: string | null,"naam"?: string | null,"uitschrijf_token"?: string
                  }
                  Relationships: [
                    
                  ]
                },"workflow_taken": {
                  Row: {
                    "aangemaakt_op": string,"aanvraag_id": number | null,"afgerond_op": string | null,"bijgewerkt_op": string,"boeking_id": number | null,"deadline": string | null,"dedup_sleutel": string,"eigenaar_profiel_id": string | null,"eigenaar_type": string,"id": number,"prioriteit": number,"status": string,"taak_type": string,"toelichting": string | null
                  }
                  Insert: {
                    "aangemaakt_op"?: string,"aanvraag_id"?: number | null,"afgerond_op"?: string | null,"bijgewerkt_op"?: string,"boeking_id"?: number | null,"deadline"?: string | null,"dedup_sleutel": string,"eigenaar_profiel_id"?: string | null,"eigenaar_type": string,"id"?: never,"prioriteit"?: number,"status"?: string,"taak_type": string,"toelichting"?: string | null
                  }
                  Update: {
                    "aangemaakt_op"?: string,"aanvraag_id"?: number | null,"afgerond_op"?: string | null,"bijgewerkt_op"?: string,"boeking_id"?: number | null,"deadline"?: string | null,"dedup_sleutel"?: string,"eigenaar_profiel_id"?: string | null,"eigenaar_type"?: string,"id"?: never,"prioriteit"?: number,"status"?: string,"taak_type"?: string,"toelichting"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "workflow_taken_aanvraag_id_fkey"
      columns: ["aanvraag_id"]
isOneToOne: false
      referencedRelation: "aanvragen"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workflow_taken_boeking_id_fkey"
      columns: ["boeking_id"]
isOneToOne: false
      referencedRelation: "boekingen"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workflow_taken_eigenaar_profiel_id_fkey"
      columns: ["eigenaar_profiel_id"]
isOneToOne: false
      referencedRelation: "profielen"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "v_publieke_agenda": {
                  Row: {
                    "eind_datum": string | null,"foto_alt": string | null,"foto_pad": string | null,"id": number | null,"omschrijving": string | null,"openingstijden": Json | null,"slug": string | null,"start_datum": string | null,"titel": string | null,"website": string | null
                  }
                  Insert: {
                           "eind_datum"?: string | null,"foto_alt"?: string | null,"foto_pad"?: string | null,"id"?: number | null,"omschrijving"?: string | null,"openingstijden"?: Json | null,"slug"?: string | null,"start_datum"?: string | null,"titel"?: string | null,"website"?: string | null
                         }
                        Update: {
                           "eind_datum"?: string | null,"foto_alt"?: string | null,"foto_pad"?: string | null,"id"?: number | null,"omschrijving"?: string | null,"openingstijden"?: Json | null,"slug"?: string | null,"start_datum"?: string | null,"titel"?: string | null,"website"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"v_publieke_bezetting": {
                  Row: {
                    "dag": string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "importeer_sanity_batch":
{ Args: { "p_batch": Json }; Returns: Json
                           },
"pas_continuiteit_mutaties":
{ Args: { "p_mutaties": Json }; Returns: Json
                           }
          }
          Enums: {
            "aanvraag_status": "nieuw"|"in_behandeling"|"goedgekeurd"|"afgewezen"|"gesloten"|"wacht_op_aanvrager","account_status": "invited"|"active"|"disabled","boeking_status": "optie"|"optie_verlopen"|"definitief"|"afgewezen"|"geannuleerd"|"afgerond"|"gearchiveerd"|"migratie_aanvraag"|"migratie_vastgelegd","communicatie_status": "gepland"|"concept"|"wachtrij"|"verzonden"|"fout"|"geannuleerd","dagregel": "expositie_weekend"|"doordeweeks"|"elke_dag","document_type": "contract"|"getekend_contract"|"factuur"|"overig","inhoud_status": "niet_vereist"|"niet_gestart"|"gevraagd"|"ingediend"|"wijziging_gevraagd"|"goedgekeurd","nieuwe_ontvanger_actie": "direct_alsnog"|"als_concept"|"niet_meer","prijstype": "vast"|"vanaf"|"op_aanvraag","publicatie_trigger": "zodra_content_compleet"|"uiterlijk_1_maand"|"uiterlijk_2_maanden"|"uiterlijk_3_maanden"|"uiterlijk_6_maanden"|"uiterlijk_9_maanden"|"uiterlijk_12_maanden"|"niet_publiceren","rechtniveau": "verborgen"|"lezen"|"schrijven","schrijvende_bron": "sanity"|"beheer","verzendwijze": "automatisch"|"concept"|"handmatig","vriend_frequentie": "wekelijks"|"tweewekelijks"|"maandelijks"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "aanvraag_status": ["nieuw", "in_behandeling", "goedgekeurd", "afgewezen", "gesloten", "wacht_op_aanvrager"],"account_status": ["invited", "active", "disabled"],"boeking_status": ["optie", "optie_verlopen", "definitief", "afgewezen", "geannuleerd", "afgerond", "gearchiveerd", "migratie_aanvraag", "migratie_vastgelegd"],"communicatie_status": ["gepland", "concept", "wachtrij", "verzonden", "fout", "geannuleerd"],"dagregel": ["expositie_weekend", "doordeweeks", "elke_dag"],"document_type": ["contract", "getekend_contract", "factuur", "overig"],"inhoud_status": ["niet_vereist", "niet_gestart", "gevraagd", "ingediend", "wijziging_gevraagd", "goedgekeurd"],"nieuwe_ontvanger_actie": ["direct_alsnog", "als_concept", "niet_meer"],"prijstype": ["vast", "vanaf", "op_aanvraag"],"publicatie_trigger": ["zodra_content_compleet", "uiterlijk_1_maand", "uiterlijk_2_maanden", "uiterlijk_3_maanden", "uiterlijk_6_maanden", "uiterlijk_9_maanden", "uiterlijk_12_maanden", "niet_publiceren"],"rechtniveau": ["verborgen", "lezen", "schrijven"],"schrijvende_bron": ["sanity", "beheer"],"verzendwijze": ["automatisch", "concept", "handmatig"],"vriend_frequentie": ["wekelijks", "tweewekelijks", "maandelijks"]
          }
        }
} as const

