-- Gastbegeleider hoort bij de boeking. datum blijft leeg wanneer de bron
-- alleen de periode noemt. Een datum wordt alleen gevuld als de bron
-- expliciet één kalenderdag aangeeft.

alter table public.gastbegeleider_toewijzingen
  alter column datum drop not null;

alter table public.gastbegeleider_toewijzingen
  drop constraint if exists gastbegeleider_slot_uniek;

do $$ begin
  alter table public.gastbegeleider_toewijzingen
    add constraint gastbegeleider_boeking_relatie_type_uniek
    unique (boeking_id, relatie_id, type);
exception when duplicate_object or duplicate_table then null;
end $$;

comment on table public.gastbegeleider_toewijzingen is
  'Gastbegeleider op boekingsniveau. datum is alleen gevuld bij een expliciete enkele dag. Bronwaarde x wordt niet opgeslagen.';

comment on column public.gastbegeleider_toewijzingen.datum is
  'Leeg als de bron alleen de boekingsperiode noemt. Gevuld alleen bij één expliciete kalenderdag.';
