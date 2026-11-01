-- Korte geldigheid en een eenmalige tokenwissel voor werkfoto's.
-- Een gesloten token wordt niet opnieuw gezet. Bestaande aanvragen blijven staan.

alter table public.aanvragen
  add column if not exists foto_upload_geldig_tot timestamptz;

create or replace function public.zet_foto_upload_termijn()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.foto_upload_token is null then
    new.foto_upload_geldig_tot := null;
  elsif new.foto_upload_geldig_tot is null or new.foto_upload_geldig_tot <= now() then
    new.foto_upload_geldig_tot := now() + interval '20 minutes';
  end if;
  return new;
end;
$$;

drop trigger if exists aanvragen_foto_upload_termijn on public.aanvragen;
create trigger aanvragen_foto_upload_termijn
  before insert or update of foto_upload_token, foto_upload_geldig_tot
  on public.aanvragen
  for each row
  execute function public.zet_foto_upload_termijn();

revoke all on function public.zet_foto_upload_termijn() from public, anon, authenticated;

create or replace function public.aanvraag_foto_pad_toegestaan(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_token uuid;
begin
  if p_name !~ '^aanvragen/[0-9]+/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(jpg|png|webp)$' then
    return false;
  end if;
  v_id := split_part(p_name, '/', 2)::bigint;
  v_token := split_part(p_name, '/', 3)::uuid;
  if not exists (
    select 1 from public.aanvragen
    where id = v_id
      and foto_upload_token = v_token
      and foto_upload_geldig_tot > now()
  ) then
    return false;
  end if;
  if (select count(*) from public.aanvraag_fotos where aanvraag_id = v_id) >= 8 then
    return false;
  end if;
  return true;
end;
$$;

create or replace function public.registreer_aanvraag_foto(
  p_aanvraag_id bigint,
  p_token uuid,
  p_pad text,
  p_naam text,
  p_mime text,
  p_bytes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ext text;
begin
  if not exists (
    select 1 from public.aanvragen
    where id = p_aanvraag_id
      and foto_upload_token = p_token
      and foto_upload_geldig_tot > now()
  ) then
    return jsonb_build_object('ok', false, 'fout', 'Deze upload is niet meer open.');
  end if;
  if p_mime = 'image/jpeg' then
    v_ext := 'jpg';
  elsif p_mime = 'image/png' then
    v_ext := 'png';
  elsif p_mime = 'image/webp' then
    v_ext := 'webp';
  else
    return jsonb_build_object('ok', false, 'fout', 'Gebruik een JPG, PNG of WebP.');
  end if;
  if p_bytes is null or p_bytes <= 0 or p_bytes > 8000000 then
    return jsonb_build_object('ok', false, 'fout', 'Een foto mag maximaal 8 MB zijn.');
  end if;
  if p_pad is distinct from (
    'aanvragen/' || p_aanvraag_id::text || '/' || lower(p_token::text) || '/' || split_part(p_pad, '/', 4)
  ) or p_pad !~ ('\.' || v_ext || '$')
    or p_pad !~ '^aanvragen/[0-9]+/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(jpg|png|webp)$' then
    return jsonb_build_object('ok', false, 'fout', 'De foto hoort niet bij deze aanvraag.');
  end if;
  if (select count(*) from public.aanvraag_fotos where aanvraag_id = p_aanvraag_id) >= 8 then
    return jsonb_build_object('ok', false, 'fout', 'Je kunt maximaal 8 foto''s toevoegen.');
  end if;
  insert into public.aanvraag_fotos (aanvraag_id, bestandsnaam, storage_pad, mime_type, bytes)
  values (
    p_aanvraag_id,
    left(coalesce(nullif(btrim(p_naam), ''), 'foto'), 120),
    p_pad,
    p_mime,
    p_bytes
  );
  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'fout', 'Deze foto is al gekoppeld.');
end;
$$;

create or replace function public.lees_aanvraag_foto_upload(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_aantal integer;
begin
  if (
    select count(*) from public.aanvragen
    where foto_upload_token = p_token
      and foto_upload_geldig_tot > now()
  ) <> 1 then
    return jsonb_build_object('ok', false);
  end if;
  select id into v_id
  from public.aanvragen
  where foto_upload_token = p_token
    and foto_upload_geldig_tot > now();
  select count(*)::integer into v_aantal
  from public.aanvraag_fotos
  where aanvraag_id = v_id;
  return jsonb_build_object(
    'ok', true,
    'aanvraag_id', v_id,
    'aantal', v_aantal,
    'resterend', greatest(0, 8 - v_aantal)
  );
end;
$$;

create or replace function public.vernieuw_aanvraag_foto_upload(p_aanvraag_id bigint, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nieuw uuid := gen_random_uuid();
  v_aantal integer;
begin
  update public.aanvragen
  set foto_upload_token = v_nieuw,
      foto_upload_geldig_tot = now() + interval '20 minutes'
  where id = p_aanvraag_id
    and foto_upload_token = p_token
    and foto_upload_geldig_tot > now();
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  select count(*)::integer into v_aantal
  from public.aanvraag_fotos
  where aanvraag_id = p_aanvraag_id;
  return jsonb_build_object(
    'ok', true,
    'token', v_nieuw,
    'aantal', v_aantal,
    'resterend', greatest(0, 8 - v_aantal)
  );
end;
$$;

revoke all on function public.lees_aanvraag_foto_upload(uuid) from public;
grant execute on function public.lees_aanvraag_foto_upload(uuid) to anon, authenticated, service_role;

revoke all on function public.vernieuw_aanvraag_foto_upload(bigint, uuid) from public;
grant execute on function public.vernieuw_aanvraag_foto_upload(bigint, uuid) to anon, authenticated, service_role;
