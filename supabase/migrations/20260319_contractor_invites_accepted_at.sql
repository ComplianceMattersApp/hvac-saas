-- Add accepted_at column to contractor_invites.
-- Used by the contractor onboarding acceptance flow to record when an invite
-- was accepted. Intentionally not NOT NULL — historical rows have no value.

alter table public.contractor_invites
  add column if not exists accepted_at timestamp with time zone;
