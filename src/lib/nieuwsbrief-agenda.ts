import {
  formatDatumBereik,
  mailImageUrl,
  type Activiteit,
  type AgendaOverzicht,
  type VriendFrequentie,
} from './sanity';
import {
  activiteitRaaktWeekend,
  komendWeekend,
  kopAgendaBlok,
} from './week';
import { filterActiviteitenInPeriode } from './nieuwsbrief-frequentie';
import { SFEER_URL, type NieuwsbriefActiviteitBlok } from './nieuwsbrief-html';

function kiesActiviteit(
  agenda: AgendaOverzicht,
  nu = new Date(),
): {activiteit: Activiteit | null; kop: string} {
  const weekend = komendWeekend(nu);
  const kandidaten = [agenda.vandaag, agenda.volgende, agenda.daarna].filter(
    (item): item is Activiteit => Boolean(item),
  );
  const ditWeekend = kandidaten.find((item) =>
    activiteitRaaktWeekend(item.start, item.eind, weekend),
  );
  if (ditWeekend) return {activiteit: ditWeekend, kop: kopAgendaBlok(true)};
  const volgende = agenda.vandaag ?? agenda.volgende;
  return {activiteit: volgende ?? null, kop: volgende ? kopAgendaBlok(false) : kopAgendaBlok(true)};
}

function naarActiviteitBlok(activiteit: Activiteit, kop: string): NieuwsbriefActiviteitBlok {
  const cmsFoto = mailImageUrl(activiteit.foto, 1120, 560);
  return {
    titel: activiteit.publiekeTitel || activiteit.interneTitel,
    datumTekst: formatDatumBereik(activiteit),
    omschrijving: activiteit.omschrijving?.slice(0, 155),
    fotoUrl: cmsFoto ?? SFEER_URL,
    fotoAlt: activiteit.fotoAlt || 'Het kerkje van Persingen in de Ooijpolder',
    agendaUrl: activiteit.slug
      ? `https://kerkjepersingen.nl/agenda/${activiteit.slug}/`
      : 'https://kerkjepersingen.nl/agenda/',
    kop,
    isExpositie: activiteit.soort === 'expositie',
  };
}

/** Kiest activiteiten voor de mail, afgestemd op de ontvangstfrequentie. */
export function kiesActiviteitenVoorMail(
  alleActiviteiten: Activiteit[],
  agenda: AgendaOverzicht,
  frequentie: VriendFrequentie | undefined,
  nu = new Date(),
): NieuwsbriefActiviteitBlok[] {
  const keuze = frequentie ?? 'wekelijks';

  if (keuze === 'wekelijks') {
    const {activiteit, kop} = kiesActiviteit(agenda, nu);
    return activiteit ? [naarActiviteitBlok(activiteit, kop)] : [];
  }

  const periode = filterActiviteitenInPeriode(alleActiviteiten, keuze, nu);
  return periode.map((activiteit) => naarActiviteitBlok(activiteit, ''));
}
