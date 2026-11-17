-- Goedkeuren van een contractversie zette bestuur op akkoord.
-- Die trigger draaide als de ingelogde gebruiker. Die rol heeft geen
-- usage op schema app, dus de aanroep van app.heeft_recht stopte met
-- 42501 (permission denied for schema app). Een update die het bestuur
-- niet wijzigde ging wel door. RLS-beleid roept dezelfde functie aan
-- via een al opgeslagen functie-oid en heeft dit probleem niet.
-- De functie wordt security definer, net als andere beheercontroles
-- die app.heeft_recht aanroepen. Alleen een trigger mag haar gebruiken.

create or replace function public.contractversie_bewaak_bestuur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.bestuur in ('akkoord', 'terug') and (
    new.bestuur is distinct from old.bestuur
    or new.bestuur_actor is distinct from old.bestuur_actor
    or new.bestuur_op is distinct from old.bestuur_op
  ) then
    if not app.heeft_recht('instellingen', 'schrijven') then
      raise exception 'bestuursakkoord vereist schrijfrecht op instellingen';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.contractversie_bewaak_bestuur() from public, anon;
grant execute on function public.contractversie_bewaak_bestuur() to authenticated, service_role;
