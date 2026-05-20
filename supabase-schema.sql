-- Run this in your Supabase SQL editor to create the required tables.

-- Journal entries
create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text,
  content text not null,
  entry_date date not null default current_date,
  created_at timestamptz default now()
);

-- Add entry_date to existing tables (no-op if column already exists)
alter table journal_entries add column if not exists entry_date date not null default current_date;
alter table journal_entries enable row level security;
create policy "Users own their journal entries"
  on journal_entries for all using (auth.uid() = user_id);

-- Skills
create table if not exists skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  category text not null default 'Other',
  level int not null default 3 check (level between 1 and 5),
  created_at timestamptz default now()
);
alter table skills enable row level security;
create policy "Users own their skills"
  on skills for all using (auth.uid() = user_id);

-- CV storage (one row per user, upserted on each upload)
create table if not exists user_cv (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  cv_text          text not null,
  filename         text not null,
  uploaded_at      timestamptz default now(),
  newly_added      jsonb default '[]',
  already_existed  jsonb default '[]'
);
alter table user_cv enable row level security;
create policy "Users own their CV"
  on user_cv for all using (auth.uid() = user_id);

-- Add source column to skills (null = manual/legacy, 'cv' = from CV scan, 'journal' = from journal)
alter table skills add column if not exists source text;

-- Per-role cache: { "lawyer": { analysis, questions, readiness }, ... }
-- Replaces the old single-role columns (interview_analysis, interview_questions, analysis_role, readiness_score)
alter table user_preferences add column if not exists role_data jsonb default '{}';

-- Job requirements for the current target role (stored server-side so all devices share identical data).
-- Eliminates the per-device localStorage divergence that caused different gap % on mobile vs desktop.
alter table user_preferences add column if not exists job_requirements jsonb;

-- Past experiences
create table if not exists experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  company text not null,
  title text not null,
  start_date date not null,
  end_date date,
  description text,
  created_at timestamptz default now()
);
alter table experiences enable row level security;
create policy "Users own their experiences"
  on experiences for all using (auth.uid() = user_id);

-- Live simulation sessions
create table if not exists simulation_sessions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users(id) on delete cascade not null,
  target_role           text,
  questions_and_answers jsonb not null,
  overall_score         int,
  final_report          jsonb,
  created_at            timestamptz default now()
);
alter table simulation_sessions enable row level security;
create policy "Users own their simulation sessions"
  on simulation_sessions for all using (auth.uid() = user_id);

-- Interview practice sessions
create table if not exists interview_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  target_role text,
  question    text not null,
  user_answer text not null,
  score       int,
  feedback    jsonb,
  created_at  timestamptz default now()
);
alter table interview_sessions enable row level security;
create policy "Users own their interview sessions"
  on interview_sessions for all using (auth.uid() = user_id);

-- User preferences (target role, etc.)
create table if not exists user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  target_role text,
  updated_at timestamptz default now()
);
alter table user_preferences enable row level security;
create policy "Users own their preferences"
  on user_preferences for all using (auth.uid() = user_id);
