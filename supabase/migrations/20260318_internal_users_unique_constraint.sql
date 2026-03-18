-- Add UNIQUE constraint to prevent duplicate internal users
-- This is required for stability and prevents race conditions during concurrent invites

ALTER TABLE public.internal_users
ADD CONSTRAINT internal_users_account_owner_user_unique 
UNIQUE(account_owner_user_id, user_id)
DEFERRABLE INITIALLY DEFERRED;
