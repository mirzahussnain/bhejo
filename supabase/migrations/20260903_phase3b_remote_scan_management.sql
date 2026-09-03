-- Bhejo Phase 3B: Remote Scan Management & Dashboard Migration
-- Run this in Supabase SQL editor to support session history, activity tracking, notifications, and device metadata.

-- 1. Extend scan_sessions table
ALTER TABLE scan_sessions
ADD COLUMN IF NOT EXISTS configured_expiry_hours INTEGER DEFAULT 24,
ADD COLUMN IF NOT EXISTS connected_device JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_activity_at BIGINT DEFAULT NULL;

-- 2. Create session_activities table
CREATE TABLE IF NOT EXISTS session_activities (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES scan_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_activities_session_created 
ON session_activities(session_id, created_at ASC);

-- 3. Create owner_notifications table
CREATE TABLE IF NOT EXISTS owner_notifications (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES scan_sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 0,
  device_display TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL,
  read_at BIGINT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_owner_notifications_owner_created 
ON owner_notifications(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_owner_notifications_unread
ON owner_notifications(owner_id, is_read)
WHERE is_read = FALSE;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE session_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_notifications ENABLE ROW LEVEL SECURITY;

-- Owner Access Policy: Owners can only view activities of their own sessions
CREATE POLICY "Owners can view activities of own sessions"
  ON session_activities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM scan_sessions
      WHERE scan_sessions.id = session_activities.session_id
        AND scan_sessions.owner_id = auth.uid()::text
    )
  );

-- Owner Access Policy: Owners can view and update their own notifications
CREATE POLICY "Owners can view own notifications"
  ON owner_notifications FOR SELECT
  USING (auth.uid()::text = owner_id);

CREATE POLICY "Owners can update own notifications"
  ON owner_notifications FOR UPDATE
  USING (auth.uid()::text = owner_id);
