/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    beheer?: import('./platform/beheer-sessie').BeheerSessie;
    supabase?: import('./platform/beheer-supabase-lees').SupabaseLeesClient;
    supabaseCookies?: Headers;
  }
}
