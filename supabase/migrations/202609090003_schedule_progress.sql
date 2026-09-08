create table if not exists public.app_schedule_activity (
  activity_id text primary key,
  area text,
  work_package text,
  activity_name text not null,
  chainage_from_m double precision,
  chainage_to_m double precision,
  chainage_display text,
  planned_start date,
  planned_finish date,
  remaining_duration_days double precision,
  physical_percent_complete double precision,
  total_float_days double precision,
  activity_type text,
  cost_code text,
  asset_link_enabled boolean not null default true,
  assets_used_on_completion text,
  source_revision text,
  source_file text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.app_schedule_activity enable row level security;

alter table public.app_schedule_activity
  add column if not exists pipeline_section text,
  add column if not exists crew_type text,
  add column if not exists progress_method text not null default 'MANUAL',
  add column if not exists progress_track text,
  add column if not exists planned_quantity double precision,
  add column if not exists method_locked boolean not null default false;

update public.app_schedule_activity
set pipeline_section = case
  when activity_id like 'PHW-%' or activity_name ilike 'PHW %' then 'PHW'
  when activity_id like 'PWG-%' or activity_name ilike 'PWG %' then 'PWG'
  when activity_id like 'RHF%' then 'RHF'
  when activity_id like 'OTW%' then 'OTW'
  when activity_id like 'OTG%' then 'OTG'
  when activity_id like 'PPH%' then 'PPH'
  when activity_id like 'VLV-DICL-%' and activity_name ilike 'PHW %' then 'PHW'
  when activity_id like 'VLV-DICL-%' and activity_name ilike 'PWG %' then 'PWG'
  when activity_id like 'THB-CON-%' and activity_name ilike 'PHW %' then 'PHW'
  when activity_id like 'THB-CON-%' and activity_name ilike 'PWG %' then 'PWG'
  else pipeline_section end;

update public.app_schedule_activity
set crew_type = case
  when activity_name ilike '%Trenchless Operation%' then 'trenchless'
  when (activity_id like 'PHW-DICL-%' or activity_id like 'PWG-DICL-%')
       and (activity_name ilike '%crossing%' or activity_name ilike '%BYDA%') then 'special_crossing'
  when activity_id like 'PHW-DICL-%' or activity_id like 'PWG-DICL-%' then 'standard'
  else crew_type end;

update public.app_schedule_activity
set progress_method = case
  when activity_type = 'Milestone' then 'MILESTONE'
  when activity_id in ('VLV-DICL-1130','VLV-DICL-1120','THB-CON-1080','THB-CON-1120') then 'ASSETS'
  when chainage_from_m is not null and chainage_to_m is not null
       and chainage_to_m > chainage_from_m
       and (activity_id like 'PHW-DICL-%' or activity_id like 'PWG-DICL-%') then 'METRES'
  else 'MANUAL' end,
  progress_track = case
    when chainage_from_m is not null and chainage_to_m is not null
         and chainage_to_m > chainage_from_m
         and (activity_id like 'PHW-DICL-%' or activity_id like 'PWG-DICL-%') then 'pipe'
    else progress_track end,
  planned_quantity = case
    when chainage_from_m is not null and chainage_to_m is not null and chainage_to_m > chainage_from_m
      then chainage_to_m - chainage_from_m
    else planned_quantity end
where method_locked = false;

create table if not exists public.app_eod_activity (
  id bigserial primary key,
  work_date date not null,
  pipeline_section text,
  crew_type text,
  activity_id text not null references public.app_schedule_activity(activity_id) on delete cascade,
  progress_method text not null,
  progress_track text,
  from_ch_m double precision,
  to_ch_m double precision,
  metres_today double precision,
  recorded_by text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists ix_app_eod_activity_activity_date on public.app_eod_activity(activity_id, work_date);
create index if not exists ix_app_eod_activity_section_crew_date on public.app_eod_activity(pipeline_section, crew_type, work_date);

create table if not exists public.app_schedule_activity_asset (
  activity_id text not null references public.app_schedule_activity(activity_id) on delete cascade,
  record_key text not null,
  link_source text not null default 'AUTO',
  weight double precision not null default 1,
  linked_at timestamptz not null default now(),
  primary key (activity_id, record_key)
);
create index if not exists ix_app_schedule_activity_asset_record on public.app_schedule_activity_asset(record_key);

create table if not exists public.app_eod_activity_asset (
  id bigserial primary key,
  eod_activity_id bigint references public.app_eod_activity(id) on delete set null,
  activity_id text not null references public.app_schedule_activity(activity_id) on delete cascade,
  record_key text not null,
  completion_date date,
  recorded_by text,
  created_at timestamptz not null default now(),
  unique(activity_id, record_key)
);

create table if not exists public.app_schedule_manual_progress (
  activity_id text primary key references public.app_schedule_activity(activity_id) on delete cascade,
  percent_complete double precision not null default 0,
  actual_start date,
  actual_finish date,
  status_note text,
  updated_by text,
  updated_at timestamptz not null default now(),
  check (percent_complete >= 0 and percent_complete <= 100)
);

insert into public.app_schedule_activity_asset(activity_id, record_key, link_source)
select s.activity_id, a."Record Key", 'CHAINAGE'
from public.app_schedule_activity s
join public.tblasset a
  on a."Pipeline Section" = s.pipeline_section
 and a."Chainage Start (m)" is not null
 and a."Chainage Start (m)" >= s.chainage_from_m
 and a."Chainage Start (m)" <= s.chainage_to_m
where s.progress_method = 'METRES'
  and s.chainage_from_m is not null
  and s.chainage_to_m is not null
  and coalesce(a."Register",'') not in ('Pipe','Trench Type')
on conflict (activity_id, record_key) do nothing;

insert into public.app_schedule_activity_asset(activity_id, record_key, link_source)
select s.activity_id, a."Record Key", 'ASSET_CLASS'
from public.app_schedule_activity s
join public.tblasset a on a."Pipeline Section" = s.pipeline_section
where (s.activity_id = 'VLV-DICL-1130' and a."Register" = 'Valve')
   or (s.activity_id = 'VLV-DICL-1120' and a."Register" = 'Valve')
   or (s.activity_id = 'THB-CON-1080' and a."Register" = 'Thrust Block')
   or (s.activity_id = 'THB-CON-1120' and a."Register" = 'Thrust Block')
on conflict (activity_id, record_key) do nothing;

alter table public.app_eod_activity enable row level security;
alter table public.app_schedule_activity_asset enable row level security;
alter table public.app_eod_activity_asset enable row level security;
alter table public.app_schedule_manual_progress enable row level security;
