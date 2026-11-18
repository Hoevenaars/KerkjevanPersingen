/**
 * Verstuurt de planningmail pas nadat beoordeelVerzending dat toestaat.
 * Periode kiezen, het voorbeeld en opslaan komen hier niet langs.
 */

import { CONTRACTBEHEER_EMAIL } from './mail-adressen.ts';
import { verstuurGecontroleerd, type MailTransport } from './mail-transport.ts';
import { besluitVoor } from './automatisering-register.ts';
import type { Automatisering } from '../platform/automatisering.ts';
import {
  PLANNING_MAIL_SLEUTEL,
  beoordeelVerzending,
  renderPlanningMail,
  snapshotVan,
  type PlanningMailBundel,
  type PlanningMailOpslag,
  type PlanningMailStatus,
} from '../platform/planning-mail.ts';

const VERLOPEN_NA_MS = 15 * 60 * 1000;

export interface PlanningMailUitkomst {
  ok: boolean;
  verstuurd: boolean;
  verzendingId: string;
  melding: string;
}

export async function verstuurPlanningMail(input: {
  bevestig: boolean;
  token: string;
  opnieuw: boolean;
  voorbeelddata: boolean;
  alleenLezen: boolean;
  magSchrijven: boolean;
  periodeFout: string | null;
  bundel: PlanningMailBundel | null;
  actor: { id?: string; naam: string };
  env?: Record<string, unknown>;
  opslag: PlanningMailOpslag;
  transport?: MailTransport;
  register?: readonly Automatisering[];
  nu?: Date;
}): Promise<PlanningMailUitkomst> {
  const bundel = input.bundel;
  let laatste: { status: PlanningMailStatus } | null = null;
  if (bundel) {
    try {
      laatste = await input.opslag.laatsteAfgerond(bundel.hash);
    } catch {
      return { ok: false, verstuurd: false, verzendingId: '', melding: 'De verzendhistorie is niet bereikbaar. Er is geen e-mail verstuurd.' };
    }
  }
  const env = input.env ?? process.env;
  const besluit = await besluitVoor(PLANNING_MAIL_SLEUTEL, input.register, env);
  const oordeel = beoordeelVerzending({
    bevestig: input.bevestig,
    token: input.token,
    opnieuw: input.opnieuw,
    voorbeelddata: input.voorbeelddata,
    alleenLezen: input.alleenLezen,
    magSchrijven: input.magSchrijven,
    periodeFout: input.periodeFout,
    ontvangers: bundel?.ontvangers.length ?? 0,
    laatsteAfgerond: laatste,
    besluitProvider: besluit.provider,
    besluitModus: besluit.modus,
    besluitReden: besluit.reden,
  });
  if (!oordeel.stuur || !bundel) {
    return { ok: false, verstuurd: false, verzendingId: '', melding: oordeel.stuur ? 'Er is geen planning om te versturen.' : oordeel.melding };
  }

  const nu = input.nu ?? new Date();
  await input.opslag.sluitVerlopenBezig(new Date(nu.getTime() - VERLOPEN_NA_MS).toISOString()).catch(() => undefined);
  const actorId = input.actor.id && /^[0-9a-f-]{36}$/i.test(input.actor.id) ? input.actor.id : null;
  const claim = await input.opslag.claim({
    token: input.token,
    van: bundel.van,
    tot: bundel.tot,
    gestartDoorId: actorId,
    gestartDoorNaam: input.actor.naam || 'Beheer',
    hash: bundel.hash,
    snapshot: snapshotVan(bundel),
    ontvangers: bundel.ontvangers,
  });
  if (claim.soort === 'al-gestart') {
    return {
      ok: true,
      verstuurd: false,
      verzendingId: claim.id,
      melding: 'Deze verzending was al gestart. Er is geen tweede e-mail verstuurd.',
    };
  }
  if (claim.soort === 'loopt-al') {
    return {
      ok: false,
      verstuurd: false,
      verzendingId: '',
      melding: 'Er loopt al een verzending van deze planning. Er is geen tweede e-mail gestart.',
    };
  }
  if (claim.soort === 'niet-beschikbaar') {
    return { ok: false, verstuurd: false, verzendingId: '', melding: claim.melding };
  }

  let gelukt = 0;
  let mislukt = 0;
  for (const ontvanger of bundel.ontvangers) {
    const brief = renderPlanningMail(bundel, ontvanger);
    try {
      const uit = await verstuurGecontroleerd(
        {
          sleutel: PLANNING_MAIL_SLEUTEL,
          naar: ontvanger.email,
          onderwerp: brief.onderwerp,
          tekst: brief.tekst,
          html: brief.html,
          replyTo: CONTRACTBEHEER_EMAIL,
          richting: 'aanvrager',
          modus: oordeel.modus,
          bedoeldeOntvanger: ontvanger.email,
          idempotentieSleutel: `planning-mail/${claim.id}/${ontvanger.email}`,
          berichtsoort: 'geen_betaling',
        },
        { modus: oordeel.modus, env, transport: input.transport, register: input.register },
      );
      if (!uit.providerAangeroepen) {
        mislukt += 1;
        await input.opslag.zetOntvanger(claim.id, ontvanger.email, {
          status: 'fout',
          foutmelding: uit.melding || 'Niet verstuurd',
          providerBerichtId: '',
        }).catch(() => undefined);
        continue;
      }
      gelukt += 1;
      await input.opslag.zetOntvanger(claim.id, ontvanger.email, {
        status: 'verzonden',
        foutmelding: '',
        providerBerichtId: uit.providerBerichtId || '',
      }).catch(() => undefined);
    } catch (error) {
      mislukt += 1;
      const fout = error instanceof Error ? error.message : 'Verzenden mislukt';
      await input.opslag.zetOntvanger(claim.id, ontvanger.email, {
        status: 'fout',
        foutmelding: fout,
        providerBerichtId: '',
      }).catch(() => undefined);
    }
  }

  const status: PlanningMailStatus = gelukt === 0 ? 'mislukt' : mislukt === 0 ? 'verzonden' : 'deels';
  const toelichting = oordeel.modus === 'test'
    ? `Testmodus: ${gelukt} van ${bundel.ontvangers.length} naar het testadres gestuurd.`
    : `${gelukt} van ${bundel.ontvangers.length} verzonden.`;
  await input.opslag.rondAf(claim.id, {
    status,
    gelukt,
    toelichting,
    verzondenOp: nu.toISOString(),
  }).catch(() => undefined);

  if (gelukt === 0) {
    return { ok: false, verstuurd: false, verzendingId: claim.id, melding: 'Geen enkele e-mail is verstuurd. Probeer het later opnieuw.' };
  }
  const testzin = oordeel.modus === 'test' ? ' Testmodus: de mail ging naar het testadres, niet naar de gastbegeleiders.' : '';
  return {
    ok: mislukt === 0,
    verstuurd: true,
    verzendingId: claim.id,
    melding: `De planning is verstuurd naar ${gelukt} van ${bundel.ontvangers.length} gastbegeleiders.${testzin}`,
  };
}
