/**
 * De live Sanity-dump is uit de applicatie gehaald.
 * Migratiecontroles gebruiken alleen nog een lokaal fixturebestand.
 */

import type { SanityDump } from '../platform/migratie-transform.ts';

export function sanityBeheerGeconfigureerd(_env: Record<string, unknown> = {}): boolean {
  return false;
}

export async function haalSanityDump(_env: Record<string, unknown> = {}): Promise<SanityDump> {
  throw new Error('Sanity is geen runtimebron. Deze flow leest en schrijft alleen Supabase.');
}
