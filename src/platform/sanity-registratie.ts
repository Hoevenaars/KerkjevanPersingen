/**
 * Requestcontext voor de Supabase-testmodus.
 * Buiten een registratie is noteer een no-op, zodat de publieke site niets bijhoudt.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { SupabaseLeesClient } from './beheer-supabase-lees.ts';

export interface SanityOproep {
  plek: string;
}

interface RequestContext {
  oproepen: SanityOproep[];
  client: SupabaseLeesClient | null;
  snapshot: Promise<unknown> | null;
}

const opslag = new AsyncLocalStorage<RequestContext>();

export function metSanityRegistratie<T>(fn: () => Promise<T>): Promise<T> {
  return opslag.run({ oproepen: [], client: null, snapshot: null }, fn);
}

export function noteerSanityOproep(plek: string): void {
  opslag.getStore()?.oproepen.push({ plek });
}

export function leesSanityOproepen(): SanityOproep[] {
  return [...(opslag.getStore()?.oproepen ?? [])];
}

export function koppelSupabaseClient(client: SupabaseLeesClient | null): void {
  const context = opslag.getStore();
  if (context) context.client = client;
}

export function gekoppeldeSupabaseClient(): SupabaseLeesClient | null {
  return opslag.getStore()?.client ?? null;
}

export function leesRequestSnapshot<T>(): Promise<T> | null {
  return (opslag.getStore()?.snapshot as Promise<T> | null | undefined) ?? null;
}

export function bewaarRequestSnapshot(snapshot: Promise<unknown>): void {
  const context = opslag.getStore();
  if (context && !context.snapshot) context.snapshot = snapshot;
}
