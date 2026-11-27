/** Eén vastgelegd bestuursbesluit voert de bestaande pakketroute uit. */
import type { Actor } from './kern.ts';
import type { DossierSessie } from './dossier-sessie.ts';
import { leesGecontroleerdMandaat } from './verhuur-mandaat.ts';
import { probeerContractAutoVoorbereiden } from './contract-autovoorbereiden.ts';
import { besluitContractViaSessie } from './contract-besluit.ts';
import { besluitVoor } from '../automatisering-register.ts';
import { verstuurGecontroleerd, type MailTransport } from '../mail-transport.ts';
import type { FlowMail } from '../../platform/documentenflow.ts';

export interface MachineResultaat { ok: boolean; melding: string; onzeker?: boolean; wachtOpMens?: boolean }

export async function verwerkContractVoorMandaat(input: {
  client: DossierSessie; aanvraagId: number; boekingId: number; actor: Actor;
  env: Record<string, unknown>; basisUrl?: string; transport?: MailTransport;
}): Promise<MachineResultaat> {
  if (input.env.VERHUUR_MACHINE !== 'true' || input.actor.type !== 'systeem' || input.actor.id !== 'system') {
    return { ok: false, melding: 'De contractmachine is niet vrijgegeven.', wachtOpMens: true };
  }
  const mandaat = await leesGecontroleerdMandaat(input.client, input.aanvraagId, input.boekingId);
  if (!mandaat.ok) return { ...mandaat, wachtOpMens: true };
  const leesVersie = async () => {
    const antwoord = await input.client.from('contractversies').select('versie,mandaat_aanvraag_versie,bestuur,afspraken')
      .eq('boeking_id', input.boekingId);
    if (antwoord.error) throw new Error('De bestaande contractversie kon niet worden gecontroleerd.');
    return (antwoord.data ?? []).reduce<Record<string, unknown> | null>((a, b) => !a || Number(b.versie) > Number(a.versie) ? b : a, null);
  };
  try {
    let versie = await leesVersie();
    if (!versie) {
      const voorbereid = await probeerContractAutoVoorbereiden(input);
      if (!voorbereid.voorbereid) return { ok: false, melding: voorbereid.melding || 'Automatische contractvoorbereiding staat uit.', wachtOpMens: true };
      versie = await leesVersie();
    }
    if (!versie || versie.mandaat_aanvraag_versie !== mandaat.mandaat.aanvraagVersie || versie.bestuur !== 'akkoord') {
      return { ok: false, melding: 'Het contract hoort niet bij het actuele bestuursmandaat. Beoordeling vereist.', wachtOpMens: true };
    }
    const actueel = await leesGecontroleerdMandaat(input.client, input.aanvraagId, input.boekingId);
    if (!actueel.ok || actueel.mandaat.aanvraagVersie !== mandaat.mandaat.aanvraagVersie) {
      return { ok: false, melding: 'Het bestuursmandaat is tijdens voorbereiding gewijzigd.', wachtOpMens: true };
    }
    const modus = await besluitVoor('handmatige_template', undefined, input.env);
    if (modus.modus !== 'aan') return { ok: false, melding: 'De bestaande contractmailpoort staat niet op Aan.', wachtOpMens: true };
    const resultaat = await besluitContractViaSessie({
      client: input.client, actor: input.actor, env: input.env, boekingId: String(input.boekingId),
      besluit: 'ja', verwachteVersie: Number(versie.versie), modus: 'aan', testadres: null,
      verstuur: async (mail: FlowMail) => {
        const uit = await verstuurGecontroleerd({ sleutel: 'handmatige_template', naar: mail.naar,
          onderwerp: mail.onderwerp, tekst: mail.tekst, html: mail.html, richting: 'aanvrager',
          bijlagen: mail.bijlagen.flatMap((deel) => deel.bytes ? [{ bestandsnaam: deel.bestandsnaam, inhoud: deel.bytes }] : []),
          eisBijlagen: true, idempotentieSleutel: mail.idempotentie, berichtsoort: mail.berichtsoort,
        }, { env: input.env, vereisteLiveModus: true, transport: input.transport });
        return { verzonden: uit.verzonden, berichtId: uit.providerBerichtId ?? null,
          providerAangeroepen: uit.providerAangeroepen, melding: uit.melding ?? '' };
      },
    });
    if (resultaat.ok) {
      const [facturen, tekeningen, documenten] = await Promise.all([
        input.client.from('facturen').select('id,provider_bericht_id,pdf_pad,pdf_sha256').eq('boeking_id', input.boekingId).eq('contract_versie', Number(versie.versie)),
        input.client.from('contract_tekeningen').select('vrijgegeven,ondertekend_op').eq('boeking_id', input.boekingId).eq('versie', Number(versie.versie)),
        input.client.from('documenten').select('type,storage_pad').eq('boeking_id', input.boekingId),
      ]);
      const nota = (facturen.data ?? []).find((f) => f.provider_bericht_id && f.pdf_pad && f.pdf_sha256);
      const compleet = !facturen.error && !tekeningen.error && !documenten.error && nota &&
        (tekeningen.data ?? []).some((t) => t.vrijgegeven === true || Boolean(t.ondertekend_op)) &&
        (documenten.data ?? []).some((d) => d.type === 'factuur' && d.storage_pad === nota.pdf_pad) &&
        (documenten.data ?? []).some((d) => d.type === 'contract' && String(d.storage_pad).endsWith(`-v${versie!.versie}.pdf`));
      if (!compleet) return { ok: false, melding: 'Contractmail is geaccepteerd maar factuur, documentregistratie of tekenlink is nog niet volledig hersteld. Niet opnieuw versturen.', onzeker: true, wachtOpMens: true };
      return resultaat;
    }
    // Een crash na provideracceptatie geeft nooit toestemming voor een nieuwe mail.
    const claims = await input.client.from('contract_verzendingen').select('status,bericht_id')
      .eq('boeking_id', input.boekingId).eq('versie', Number(versie.versie));
    const onzeker = Boolean(claims.error) || (claims.data ?? []).some((c) => c.status === 'bezig' || Boolean(c.bericht_id));
    return { ...resultaat, onzeker, wachtOpMens: onzeker };
  } catch {
    return { ok: false, melding: 'Contractverwerking onderbroken. Controleer de opgeslagen stap en verzendclaim.', onzeker: true, wachtOpMens: true };
  }
}
