/**
 * Toegestane statusovergangen voor boekingen.
 * migratie_vastgelegd is een beschermde eindstatus: geen terugzet naar optie
 * en geen gewone omzetting naar definitief.
 * Overlap geldt alleen voor optie en definitief. Migratierecords tellen niet mee,
 * zodat historische overlap de bezetting niet breekt.
 */

export type StatusActie = 'verleng' | 'definitief' | 'annuleer' | 'afronden';

export const BESCHERMDE_MIGRATIESTATUS = ['migratie_vastgelegd', 'migratie_aanvraag'] as const;

export function isBeschermdeMigratiestatus(status: string): boolean {
  return (BESCHERMDE_MIGRATIESTATUS as readonly string[]).includes(status);
}

/** Alleen deze statussen vallen onder de normale bezettingsconstraint. */
export function statusTeltVoorOverlap(status: string): boolean {
  return status === 'optie' || status === 'definitief';
}

export function statusActieToegestaan(
  status: string,
  actie: StatusActie,
): { ok: boolean; melding: string } {
  if (actie === 'verleng') {
    if (isBeschermdeMigratiestatus(status)) {
      return {
        ok: false,
        melding: 'Verleng optie is geblokkeerd. Een vastgelegde migratieboeking gaat niet terug naar optie.',
      };
    }
    if (status !== 'optie' && status !== 'optie_verlopen') {
      return { ok: false, melding: 'Verleng optie geldt alleen voor een lopende of verlopen optie.' };
    }
    return { ok: true, melding: '' };
  }

  if (actie === 'definitief') {
    if (isBeschermdeMigratiestatus(status)) {
      return {
        ok: false,
        melding:
          'Zet definitief geldt niet voor een vastgelegde migratieboeking. Die omzetting activeert de normale overlapcontrole en gebeurt niet via deze knop.',
      };
    }
    if (status === 'definitief') return { ok: true, melding: 'al' };
    if (status === 'optie' || status === 'optie_verlopen') return { ok: true, melding: '' };
    return { ok: false, melding: 'Alleen een optie kan via deze actie definitief worden.' };
  }

  if (actie === 'annuleer') {
    if (status === 'geannuleerd') return { ok: true, melding: 'al' };
    if (status === 'afgerond' || status === 'gearchiveerd') {
      return { ok: false, melding: 'Een afgerond of gearchiveerd dossier wordt niet geannuleerd via deze actie.' };
    }
    return { ok: true, melding: '' };
  }

  if (isBeschermdeMigratiestatus(status)) {
    return {
      ok: false,
      melding: 'Dossier afronden wijzigt een vastgelegde migratieboeking niet.',
    };
  }
  if (status === 'afgerond') return { ok: true, melding: 'al' };
  if (status !== 'definitief') {
    return { ok: false, melding: 'Alleen een definitieve boeking kan worden afgerond.' };
  }
  return { ok: true, melding: '' };
}
