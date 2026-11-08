/**
 * Vaste pagina's die in de Astro-bron staan.
 * Geen editor: de tekst wijzigt alleen met de site zelf.
 */

export const VASTE_WEBSITEPAGINAS = [
  { titel: 'Home', pad: '/' },
  { titel: 'Het kerkje', pad: '/het-kerkje/' },
  { titel: 'Geschiedenis', pad: '/het-kerkje/geschiedenis/' },
  { titel: 'Omgeving', pad: '/het-kerkje/omgeving/' },
  { titel: 'Verhuur', pad: '/verhuur/' },
  { titel: 'Aanvraagformulier', pad: '/verhuur/aanvragen/' },
  { titel: 'Voorwaarden', pad: '/verhuur/voorwaarden/' },
  { titel: 'Agenda', pad: '/agenda/' },
  { titel: 'Contact', pad: '/contact/' },
  { titel: 'Organisatie', pad: '/organisatie/' },
  { titel: 'Steun ons', pad: '/steun-ons/' },
  { titel: 'Privacyverklaring', pad: '/privacyverklaring/' },
] as const;
