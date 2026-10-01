-- Centrale aan/uit/test-schakelaar voor mail. Geen wijziging van historische domeindata.

create table if not exists public.automatiseringen (
  sleutel text primary key,
  naam text not null,
  omschrijving text not null,
  categorie text not null check (categorie in ('transactioneel', 'automatisering', 'handmatig')),
  status text not null check (status in ('actief', 'test', 'uit')),
  mailcategorie text not null,
  trigger_tekst text not null,
  ontvangerstype text not null,
  risicovol boolean not null default true,
  laatste_run timestamptz,
  laatste_resultaat text,
  gewijzigd_door text,
  gewijzigd_op timestamptz
);

create table if not exists public.automatisering_audit (
  id bigint generated always as identity primary key,
  automatisering_sleutel text not null references public.automatiseringen (sleutel),
  oude_status text not null,
  nieuwe_status text not null,
  gebruiker text not null,
  tijdstip timestamptz not null default now()
);

alter table public.automatiseringen enable row level security;
alter table public.automatisering_audit enable row level security;
revoke all on table public.automatiseringen from anon, authenticated;
revoke all on table public.automatisering_audit from anon, authenticated;

create or replace function public.zet_automatisering_status(
  p_sleutel text,
  p_status text,
  p_gebruiker text
) returns void
language plpgsql
set search_path = public
as $$
declare
  oud text;
begin
  if p_status not in ('actief', 'test', 'uit') then
    raise exception 'onbekende status';
  end if;
  select status into oud from public.automatiseringen where sleutel = p_sleutel for update;
  if oud is null then
    raise exception 'onbekende automatisering';
  end if;
  if oud = p_status then
    return;
  end if;
  update public.automatiseringen
    set status = p_status,
        gewijzigd_door = p_gebruiker,
        gewijzigd_op = now()
    where sleutel = p_sleutel;
  insert into public.automatisering_audit (automatisering_sleutel, oude_status, nieuwe_status, gebruiker)
  values (p_sleutel, oud, p_status, p_gebruiker);
end;
$$;

revoke all on function public.zet_automatisering_status(text, text, text) from public, anon, authenticated;
grant execute on function public.zet_automatisering_status(text, text, text) to service_role;

insert into public.automatiseringen
  (sleutel, naam, omschrijving, categorie, status, mailcategorie, trigger_tekst, ontvangerstype, risicovol)
values
  ('contact_bestuur', 'Contact naar bestuur', 'Notificatie naar het bestuur bij een contactbericht. De contactpagina heeft geen verzendformulier; de schakelaar staat klaar en staat verzenden toe.', 'transactioneel', 'actief', 'transactioneel', 'Contactbericht', 'Bestuur', false),
  ('aanvraag_bestuur', 'Nieuwe verhuuraanvraag naar bestuur', 'Notificatie naar het bestuur zodra een verhuuraanvraag is opgeslagen. De bevestiging aan de huurder hoort hier niet bij.', 'transactioneel', 'actief', 'transactioneel', 'Verhuuraanvraag opgeslagen', 'Bestuur', false),
  ('aanvraag_bevestiging', 'Bevestiging aan de aanvrager', 'Template booking_request_received. Gaat niet mee met de bestuursnotificatie.', 'automatisering', 'uit', 'automatisering', 'Nieuwe aanvraag', 'Huurder', true),
  ('workflow', 'Workflowcron', 'Dagelijkse planner op /api/cron/workflow. Historische boekingen kunnen anders alsnog mail starten.', 'automatisering', 'uit', 'automatisering', 'Cron 06:00', 'Huurder, gastheer, bestuur', true),
  ('nieuwsbrief', 'Nieuwsbrief', 'Wekelijkse vriendenmail en de previewcron.', 'automatisering', 'uit', 'automatisering', 'Cron vrijdag / donderdag-preview', 'Vrienden', true),
  ('betaalherinnering', 'Betaalherinneringen', 'Betalingsherinnering, laatste herinnering en interne escalatie bij een open betaling.', 'automatisering', 'uit', 'automatisering', 'Workflow bij open betaling', 'Huurder en finance', true),
  ('statusmail_huurder', 'Statusmail naar huurder', 'Goedkeuring, afwijzing, meer informatie, definitief en annulering.', 'automatisering', 'uit', 'automatisering', 'Boekings- of aanvraagstatus', 'Huurder', true),
  ('content_herinnering', 'Content en opvolging', 'Verzoek om tekst of foto, reminders en interne escalatie als content ontbreekt.', 'automatisering', 'uit', 'automatisering', 'Weken voor de activiteit', 'Huurder en bestuur', true),
  ('herinnering', 'Praktische en dagherinnering', 'Praktische informatie en de mail kort voor de activiteit.', 'automatisering', 'uit', 'automatisering', 'Dagen of weken voor de activiteit', 'Huurder', true),
  ('gastheer_mail', 'Gastheercommunicatie', 'Beschikbaarheid, bevestiging, praktische informatie en afloopcheck.', 'automatisering', 'uit', 'automatisering', 'Planning of workflow', 'Gastheer en planning', true),
  ('nazorg', 'Nazorg en review', 'Bedank- en reviewmail na afloop.', 'automatisering', 'uit', 'automatisering', 'Na de activiteit', 'Huurder', true),
  ('reservelijst_mail', 'Reservelijst', 'Bericht bij een vrijgekomen expositieweekend. Blijft handmatig en staat uit.', 'handmatig', 'uit', 'handmatig', 'Weekend vrijgegeven', 'Reservelijst', true),
  ('handmatige_template', 'Losse template uit beheer', 'Contractbegeleiding en andere templates zonder automatische caller.', 'handmatig', 'uit', 'handmatig', 'Handmatige beheeractie', 'Huurder', true),
  ('mailtemplate_test', 'Testmail van een template', 'De testknop bij een mailtemplate. Testmodus doet geen provider-call.', 'handmatig', 'test', 'handmatig', 'Knop Testmail', 'Ingevoerd adres', true),
  ('gebruiker_uitnodiging', 'Uitnodiging beheeraccount', 'Supabase Auth-mail bij uitnodigen of opnieuw versturen. Geen Resend-template.', 'handmatig', 'uit', 'handmatig', 'Knop Uitnodigen of Opnieuw', 'Beheerder', true)
on conflict (sleutel) do nothing;
