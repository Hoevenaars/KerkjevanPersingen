-- Benoemde rollen Hans, Nelleke en Paul.
-- Operationeel, finance en planning vervallen. Bestaande waarden worden leeggezet.

update public.profielen
set functie = null
where functie is not null
  and functie not in ('hans', 'nelleke', 'paul');

alter table public.profielen
  drop constraint if exists profielen_functie_bekend;

alter table public.profielen
  add constraint profielen_functie_bekend
  check (functie is null or functie in ('hans', 'nelleke', 'paul'));

create or replace function app.maak_profiel_voor_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_naam text;
  v_functie text;
begin
  v_naam := nullif(trim(coalesce(new.raw_user_meta_data->>'naam', '')), '');
  if v_naam is null then
    v_naam := split_part(coalesce(new.email, 'gebruiker'), '@', 1);
  end if;
  v_functie := nullif(trim(coalesce(new.raw_user_meta_data->>'functie', '')), '');
  if v_functie is not null and v_functie not in ('hans', 'nelleke', 'paul') then
    v_functie := null;
  end if;

  insert into public.profielen (id, email, naam, functie, status, is_super_admin, actief)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    v_naam,
    v_functie,
    'invited',
    false,
    false
  )
  on conflict (id) do update
    set email = excluded.email
    where public.profielen.email is distinct from excluded.email;
  return new;
end;
$$;
