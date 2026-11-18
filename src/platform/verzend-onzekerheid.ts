/** Bij onzekere provideruitkomst mag een live contractclaim NIET worden
 * teruggezet naar 'geweigerd': een timeout kan na acceptatie optreden.
 * Zonder aantoonbaar niet-aangeroepen provider is handmatige reconciliatie nodig.
 */
export function contractProviderUitkomstOnzeker(input: {
  livePakket: boolean;
  providerWierpFout: boolean;
  verzonden: boolean;
  providerAangeroepen?: boolean;
}): boolean {
  return input.livePakket && (input.providerWierpFout || (!input.verzonden && input.providerAangeroepen !== false));
}
