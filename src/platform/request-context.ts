/**
 * Requestcontext zodat pagina en layout dezelfde Supabase-snapshot delen.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { SupabaseLeesClient } from './beheer-supabase-lees.ts';

interface RequestContext {
  client: SupabaseLeesClient | null;
  snapshot: Promise<unknown> | null;
}

const opslag = new AsyncLocalStorage<RequestContext>();

export function metRequestContext<T>(fn: () => Promise<T>): Promise<T> {
  return opslag.run({ client: null, snapshot: null }, fn);
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
