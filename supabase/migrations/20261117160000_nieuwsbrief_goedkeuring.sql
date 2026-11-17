-- Een week gaat pas de deur uit nadat iemand hem in beheer heeft goedgekeurd.

alter table public.nieuwsbrieven
  add column if not exists goedgekeurd boolean not null default false,
  add column if not exists goedgekeurd_op timestamptz;

comment on column public.nieuwsbrieven.goedgekeurd is
  'De vrijdagverzending stuurt deze week alleen als dit waar is.';

comment on column public.nieuwsbrieven.goedgekeurd_op is
  'Moment van de goedkeuring in beheer.';
