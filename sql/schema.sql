-- ============================================================
-- VBT (Vélocité / Charge) profiling tool — dedicated tables
-- Applied to the Supabase project "maximechel's Project"
-- (mqibmkulgrrofvodxyia). Prefixed vbt_ so it never touches the
-- existing coaching/invoicing tables (clients, cycles, sessions,
-- factures...).
--
-- This file is a reference copy of the migration already applied
-- to the database via the Supabase MCP tools. You do NOT need to
-- run it again unless you are recreating the project from scratch
-- (e.g. in a brand new Supabase project).
-- ============================================================

-- 1. Athletes tested with the VBT tool
create table if not exists public.vbt_athletes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid(),
  client_id uuid null references public.clients(id) on delete set null,
  first_name text not null,
  last_name text not null,
  birth_date date null,
  height_cm numeric null,
  weight_kg numeric null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.vbt_athletes is 'Athletes profiled with the load-velocity (VBT) tool. Optionally linked to an existing coaching client via client_id.';

-- 2. Reference minimal-velocity-threshold (MVT) defaults per exercise, editable by the coach
create table if not exists public.vbt_exercise_defaults (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid(),
  name text not null,
  mvt_default numeric not null,
  aliases text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (coach_id, name)
);

comment on table public.vbt_exercise_defaults is 'Per-exercise default minimal velocity threshold (MVT, m/s) used to estimate 1RM from the load-velocity profile.';

-- 3. One load-velocity profiling test session (one athlete, one exercise, one date)
create table if not exists public.vbt_sessions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid(),
  athlete_id uuid not null references public.vbt_athletes(id) on delete cascade,
  exercise text not null,
  session_date date not null,
  bodyweight_kg numeric null,
  mvt_used numeric not null,
  source text not null default 'import',
  raw_csv_filename text null,
  results jsonb null,
  notes text null,
  created_at timestamptz not null default now()
);

comment on table public.vbt_sessions is 'One load-velocity profiling test (CR VITRUVE report). results caches the computed profile (1RM, V0, L0, max power, training zones...).';

-- 4. Individual set/load points within a session
create table if not exists public.vbt_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.vbt_sessions(id) on delete cascade,
  set_number int not null,
  load_kg numeric not null,
  mcv_ms numeric not null,
  peak_velocity_ms numeric null,
  rom_cm numeric null,
  power_w numeric null,
  duration_ms numeric null,
  time_to_peak_ms numeric null,
  acceleration_index numeric null,
  reps int not null default 1,
  created_at timestamptz not null default now(),
  unique (session_id, set_number)
);

comment on table public.vbt_sets is 'Individual load/velocity data point (one barbell set) belonging to a vbt_sessions row.';

-- Helpful indexes
create index if not exists vbt_athletes_coach_id_idx on public.vbt_athletes (coach_id);
create index if not exists vbt_sessions_coach_id_idx on public.vbt_sessions (coach_id);
create index if not exists vbt_sessions_athlete_id_idx on public.vbt_sessions (athlete_id);
create index if not exists vbt_sets_session_id_idx on public.vbt_sets (session_id);

-- ============================================================
-- Row Level Security — every coach only ever sees their own rows
-- ============================================================
alter table public.vbt_athletes enable row level security;
alter table public.vbt_exercise_defaults enable row level security;
alter table public.vbt_sessions enable row level security;
alter table public.vbt_sets enable row level security;

create policy "vbt_athletes_owner_all" on public.vbt_athletes
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

create policy "vbt_exercise_defaults_owner_all" on public.vbt_exercise_defaults
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

create policy "vbt_sessions_owner_all" on public.vbt_sessions
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

create policy "vbt_sets_owner_all" on public.vbt_sets
  for all using (
    exists (select 1 from public.vbt_sessions s where s.id = vbt_sets.session_id and s.coach_id = auth.uid())
  ) with check (
    exists (select 1 from public.vbt_sessions s where s.id = vbt_sets.session_id and s.coach_id = auth.uid())
  );
