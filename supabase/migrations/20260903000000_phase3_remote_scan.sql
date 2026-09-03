-- Bhejo Phase 3: Remote Scan Database Schema
-- Supabase Postgres Migration

-- 1. Scan Sessions
create table if not exists scan_sessions (
  id text primary key,
  owner_id text not null,
  public_token text not null unique,
  title text,
  status text not null default 'created' check (
    status in ('created', 'authenticated', 'uploading', 'completed', 'expired', 'locked', 'cancelled')
  ),
  otp_hash text,
  otp_salt text,
  otp_attempts integer not null default 0 check (otp_attempts >= 0 and otp_attempts <= 5),
  max_otp_attempts integer not null default 5,
  recipient_token_hash text,
  expires_at bigint not null,
  active_scan_expires_at bigint,
  created_at bigint not null,
  updated_at bigint not null,
  completed_at bigint
);

-- Indexes for efficient lookup
create index if not exists idx_scan_sessions_public_token on scan_sessions (public_token);
create index if not exists idx_scan_sessions_owner_id on scan_sessions (owner_id);
create index if not exists idx_scan_sessions_status on scan_sessions (status);

-- 2. Uploaded Pages
create table if not exists uploaded_pages (
  id text primary key,
  session_id text not null references scan_sessions (id) on delete cascade,
  page_number integer not null check (page_number >= 1 and page_number <= 50),
  storage_path text not null,
  mime_type text not null default 'image/jpeg',
  byte_size bigint not null check (byte_size > 0 and byte_size <= 10485760), -- max 10MB
  sha256_checksum text not null,
  correction_fallback boolean not null default false,
  created_at bigint not null,
  constraint uq_session_page_id unique (session_id, id),
  constraint uq_session_page_number unique (session_id, page_number)
);

create index if not exists idx_uploaded_pages_session_id on uploaded_pages (session_id);

-- Enable Row Level Security (RLS)
alter table scan_sessions enable row level security;
alter table uploaded_pages enable row level security;

-- Owner Access Policy: Owners can view and manage their own sessions
create policy "Owners can view own sessions"
  on scan_sessions for select
  using (auth.uid()::text = owner_id);

create policy "Owners can create sessions"
  on scan_sessions for insert
  with check (auth.uid()::text = owner_id);

-- Owner Page Access Policy: Owners can only view uploaded pages belonging to their own sessions
create policy "Owners can view pages of own sessions"
  on uploaded_pages for select
  using (
    exists (
      select 1 from scan_sessions
      where scan_sessions.id = uploaded_pages.session_id
        and scan_sessions.owner_id = auth.uid()::text
    )
  );

-- Service role bypasses RLS for recipient flow handled by backend route handlers
