-- Pass 2D-D: Web Push Delivery Attempt Tracking
-- Purpose: Track best-effort web push delivery attempts tied to existing in-app notifications
-- Does not activate push sending; provides infrastructure for feature-gated delivery.

BEGIN;

-- Create notification_delivery_attempts table
CREATE TABLE IF NOT EXISTS public.notification_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id),
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id),
  push_subscription_id uuid NULL REFERENCES public.push_subscriptions(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'web_push',
  status text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  provider_status_code integer NULL,
  error_code text NULL,
  error_detail text NULL,
  
  -- Constraints
  CONSTRAINT channel_check CHECK (channel IN ('web_push')),
  CONSTRAINT status_check CHECK (status IN ('skipped', 'sent', 'failed'))
);

-- Enable RLS
ALTER TABLE public.notification_delivery_attempts ENABLE ROW LEVEL SECURITY;

-- Create indexes for query performance
CREATE INDEX idx_notification_delivery_attempts_notification_id 
  ON public.notification_delivery_attempts(notification_id);

CREATE INDEX idx_notification_delivery_attempts_account_owner 
  ON public.notification_delivery_attempts(account_owner_user_id, recipient_user_id, attempted_at DESC);

CREATE INDEX idx_notification_delivery_attempts_push_subscription_id 
  ON public.notification_delivery_attempts(push_subscription_id);

-- RLS Policies: Conservative read access (internal users only see their own attempts)
-- No DELETE policy to preserve delivery attempt audit trail
-- No INSERT/UPDATE/REPLACE from row-level; server-side functions only

CREATE POLICY notification_delivery_attempts_read_own 
  ON public.notification_delivery_attempts 
  FOR SELECT 
  USING (
    recipient_user_id = auth.uid()
    AND account_owner_user_id IN (
      SELECT account_owner_user_id 
      FROM public.internal_users 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY notification_delivery_attempts_read_admin 
  ON public.notification_delivery_attempts 
  FOR SELECT 
  USING (
    account_owner_user_id IN (
      SELECT account_owner_user_id 
      FROM public.internal_users 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

COMMIT;
