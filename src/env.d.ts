/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    beheer?: import('./platform/beheer-sessie').BeheerSessie;
    supabaseCookies?: Headers;
  }
}
