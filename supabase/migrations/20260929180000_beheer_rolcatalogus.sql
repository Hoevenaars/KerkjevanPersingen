-- Rollen los van accounts: een naam plus een rechtenmatrix.
-- Nieuwe namen mogen op een profiel; de vaste lijst hans/nelleke/paul vervalt.

create table if not exists public.beheer_rollen (
  slug text primary key,
  naam text not null,
  aangemaakt_op timestamptz not null default now(),
  constraint beheer_rollen_slug_vorm check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40),
  constraint beheer_rollen_naam check (char_length(btrim(naam)) between 1 and 40)
);

create table if not exists public.beheer_rol_rechten (
  rol_slug text not null references public.beheer_rollen (slug) on delete cascade,
  module_sleutel text not null,
  niveau text not null check (niveau in ('verborgen', 'lezen', 'schrijven')),
  primary key (rol_slug, module_sleutel)
);

alter table public.beheer_rollen enable row level security;
alter table public.beheer_rol_rechten enable row level security;

alter table public.profielen drop constraint if exists profielen_functie_bekend;

alter table public.profielen drop constraint if exists profielen_functie_slug;

alter table public.profielen
  add constraint profielen_functie_slug
  check (
    functie is null
    or (functie ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(functie) <= 40)
  );

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
  if v_functie is not null and v_functie !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
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

insert into public.beheer_rollen (slug, naam)
values ('hans', 'Hans'), ('nelleke', 'Nelleke'), ('paul', 'Paul')
on conflict (slug) do nothing;

insert into public.beheer_rol_rechten (rol_slug, module_sleutel, niveau)
select r.slug, m.sleutel, case when m.sleutel = 'dashboard' then 'lezen' else 'verborgen' end
from public.beheer_rollen r
cross join (
  values
    ('dashboard'),
    ('aanvragen'),
    ('boekingen'),
    ('kalender'),
    ('agenda'),
    ('planning'),
    ('relaties'),
    ('finance'),
    ('vrienden'),
    ('nieuwsbrief'),
    ('templates'),
    ('gebruikers'),
    ('instellingen')
) as m(sleutel)
on conflict (rol_slug, module_sleutel) do nothing;
