-- Add read state tracking to notifications
-- Allows internal users to mark notifications as read
-- Minimal additive change: nullable timestamp

ALTER TABLE IF EXISTS "public"."notifications"
  ADD COLUMN IF NOT EXISTS "read_at" timestamptz DEFAULT NULL;

-- Index for efficient querying of unread notifications
CREATE INDEX IF NOT EXISTS notifications_read_at_idx
  ON public.notifications (read_at)
  WHERE read_at IS NULL;
