/**
 * Bevestiging na een geslaagde handmatige boeking.
 * De mail gaat pas daarna weg, één keer per ontvanger, periode en template.
 */

import { bevestigingVoor, mailDedup, type HandmatigeBoeking } from '../../platform/handmatige-boeking.ts';
import { bewaakUitgaandeMail } from '../../platform/mailguard.ts';
import { standaardTemplate } from '../../platform/mailtemplates/catalog.ts';
import { metReservering } from '../../platform/mailtemplates/definitief-mail.ts';
import { onderwerpUitTemplate, plainTekstUitTemplate, renderMailBericht } from '../../platform/mailtemplates/render.ts';
import { magAutomatiseringUitvoeren, type Automatisering } from '../../platform/automatisering.ts';
import { laadAutomatiseringsregister } from '../automatisering-register.ts';
import { CONTRACTBEHEER_EMAIL, VAN_ADRES } from '../mail-adressen.ts';
import { verstuurGecontroleerd } from '../mail-transport.ts';
import { legVerzendingVast } from '../communicatie-log.ts';
import type { DossierSessie } from './dossier-sessie.ts';

export async function verstuurHandmatigeBevestiging(
  client: DossierSessie,
  boeking: HandmatigeBoeking,
  koppeling: { boekingId?: string; aanvraagId?: string },
  env: Record<string, unknown> = process.env,
): Promise<string> {
  const bevestiging = bevestigingVoor(boeking);
  if (!bevestiging) return 'Er is geen bevestigingsmail verstuurd.';
  const dedup = mailDedup(boeking, bevestiging.templateId);
  const bestaand = await client.from('communicatie_jobs').select('id,status').eq('dedup_sleutel', dedup).maybeSingle();
  const status = String(bestaand.data?.status ?? '');
  if (status === 'verzonden' || status === 'wachtrij') {
    return 'De bevestigingsmail was al verzonden en is niet opnieuw verstuurd.';
  }
  const claim = await client.from('communicatie_jobs').insert({
    boeking_id: nummer(koppeling.boekingId),
    aanvraag_id: nummer(koppeling.aanvraagId),
    template_sleutel: bevestiging.templateId,
    dedup_sleutel: dedup,
    status: 'wachtrij',
    modus: 'handmatig',
    gepland_op: new Date().toISOString(),
    ontvanger_email: boeking.email,
    onderwerp: bevestiging.naam,
    pogingen: 0,
  }).select('id').maybeSingle();
  if (claim.error?.code === '23505') {
    return 'De bevestigingsmail was al verzonden en is niet opnieuw verstuurd.';
  }
  if (claim.error || claim.data?.id == null) {
    return 'De boeking is opgeslagen. De bevestiging is niet verzonden.';
  }
  const jobId = claim.data?.id;

  const guard = bewaakUitgaandeMail(env, boeking.email);
  if (!guard.toegestaan || !guard.naar) {
    await zetJob(client, jobId, { status: 'geblokkeerd', foutmelding: 'Dit adres is in deze omgeving geblokkeerd.' });
    return 'De boeking is opgeslagen. De bevestigingsmail is in deze omgeving niet verzonden.';
  }

  const template = standaardTemplate(bevestiging.templateId);
  const basis = {
    voornaam: boeking.naam.split(' ')[0] || boeking.naam,
    naam: boeking.naam,
    datum: boeking.start,
    activiteitstype: boeking.verhuurtype,
    activiteitnaam: boeking.titel,
    tijd: '',
  };
  const vars = bevestiging.templateId === 'booking_confirmed'
    ? metReservering(basis, { start: boeking.start, eind: boeking.eind, titel: boeking.titel, soort: boeking.verhuurtype, tijdVan: boeking.tijdVan, tijdTot: boeking.tijdTot, heleDag: boeking.heleDag })
    : basis;
  const onderwerp = template ? onderwerpUitTemplate(template, vars) : bevestiging.naam;
  const gerenderd = template ? renderMailBericht(template, vars, { voorbeeldUrl: 'https://kerkjepersingen.nl/', templateId: template.id }) : null;
  const tekst = gerenderd && bevestiging.templateId === 'booking_confirmed' ? gerenderd.text : template ? plainTekstUitTemplate(template, vars) : bevestiging.pastBij;
  const html = gerenderd?.html;
  const register = await registerVoorExplicieteKeuze(bevestiging.automatieSleutel, env);
  try {
    const uit = await verstuurGecontroleerd(
      {
        sleutel: bevestiging.automatieSleutel,
        naar: guard.naar,
        onderwerp: `${guard.onderwerpPrefix}${onderwerp}`,
        tekst,
        html,
        templateId: bevestiging.templateId,
        aanvragerEmail: boeking.email,
        aanvragerNaam: boeking.naam,
        richting: 'aanvrager',
        replyTo: CONTRACTBEHEER_EMAIL,
        idempotentieSleutel: dedup,
      },
      { register, env },
    );
    if (!uit.verzonden) {
      await zetJob(client, jobId, { status: 'fout', foutmelding: uit.melding ?? uit.besluit.reden });
      return `De boeking is opgeslagen. De bevestiging is niet verzonden: ${uit.melding || uit.besluit.reden}.`;
    }
    await zetJob(client, jobId, { status: 'verzonden', onderwerp: uit.besluit ? `${guard.onderwerpPrefix}${onderwerp}` : onderwerp, foutmelding: '' });
    await legVerzendingVast({
      aanvraagId: koppeling.aanvraagId ?? null,
      boekingId: koppeling.boekingId ?? null,
      templateSleutel: bevestiging.templateId,
      onderwerp: `${guard.onderwerpPrefix}${onderwerp}`,
      bedoeldeOntvanger: boeking.email,
      werkelijkeOntvanger: uit.werkelijkeOntvanger || guard.naar,
      afzender: VAN_ADRES,
      replyTo: CONTRACTBEHEER_EMAIL,
      richting: 'uitgaand',
      status: 'verzonden',
      providerBerichtId: uit.providerBerichtId,
      test: uit.besluit.modus === 'test',
      dedupSleutel: dedup,
      handmatig: true,
    }, env, client as never);
    return `Bevestiging "${bevestiging.naam}" verzonden naar ${boeking.email}.`;
  } catch (error) {
    const melding = error instanceof Error ? error.message : 'verzenden mislukt';
    await zetJob(client, jobId, { status: 'fout', foutmelding: melding });
    return `De boeking is opgeslagen. De bevestiging is niet verzonden: ${melding}.`;
  }
}

async function registerVoorExplicieteKeuze(sleutel: string, env: Record<string, unknown>): Promise<readonly Automatisering[]> {
  const bron = await laadAutomatiseringsregister(env);
  const besluit = magAutomatiseringUitvoeren(sleutel, bron);
  if (besluit.modus === 'test') return bron;
  return bron.map((item) => (item.sleutel === sleutel ? { ...item, status: 'actief' as const } : item));
}

function nummer(waarde: string | undefined): number | null {
  if (!waarde || !/^\d+$/.test(waarde)) return null;
  return Number(waarde);
}

async function zetJob(client: DossierSessie, id: unknown, velden: Record<string, unknown>): Promise<void> {
  if (id == null || id === '') return;
  await client.from('communicatie_jobs').update(velden).eq('id', id);
}
