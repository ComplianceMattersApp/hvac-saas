-- Add missing performance indexes identified in query audit.
-- These tables are frequently filtered by account_owner_user_id (and related
-- columns) without a supporting index, causing sequential scans.

-- 1. contractors filtered by owner (unfiltered query confirmed
--    in audit, 319+ eq patterns app-wide)
CREATE INDEX IF NOT EXISTS idx_contractors_owner_user_id
  ON contractors(owner_user_id);

-- 2. account_settings filtered by account owner
CREATE INDEX IF NOT EXISTS idx_account_settings_account_owner_user_id
  ON account_settings(account_owner_user_id);

-- 3. internal_users filtered by account owner and active status
CREATE INDEX IF NOT EXISTS idx_internal_users_account_owner_active
  ON internal_users(account_owner_user_id, is_active);

-- 4. sms_provider_configurations filtered by account owner
CREATE INDEX IF NOT EXISTS idx_sms_provider_configurations_account_owner
  ON sms_provider_configurations(account_owner_user_id);

-- 5. push_subscriptions filtered by account owner and active status
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_account_owner_active
  ON push_subscriptions(account_owner_user_id, is_active);

-- 6. internal_invoice_line_items join pattern
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id
  ON internal_invoice_line_items(invoice_id);
