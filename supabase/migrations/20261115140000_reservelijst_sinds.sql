-- Datum waarop een relatie op de reservelijst is gezet.
-- Wie er al op stond, houdt een lege datum: die is niet achteraf te reconstrueren.

alter table public.relaties
  add column if not exists reservelijst_sinds timestamptz;

comment on column public.relaties.reservelijst_sinds is
  'Moment waarop op_reservelijst aan ging. Leeg zolang iemand er niet op staat, of als dat vóór deze kolom al zo was.';

create index if not exists relaties_reservelijst_idx
  on public.relaties (reservelijst_sinds)
  where op_reservelijst;

create or replace function public.zet_reservelijst_sinds()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.op_reservelijst is true then
    if tg_op = 'INSERT' or old.op_reservelijst is distinct from true then
      new.reservelijst_sinds := coalesce(new.reservelijst_sinds, now());
    end if;
  else
    new.reservelijst_sinds := null;
  end if;
  return new;
end;
$$;

drop trigger if exists zet_reservelijst_sinds on public.relaties;
create trigger zet_reservelijst_sinds
  before insert or update on public.relaties
  for each row
  execute function public.zet_reservelijst_sinds();
