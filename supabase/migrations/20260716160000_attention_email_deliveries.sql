BEGIN;
CREATE TABLE IF NOT EXISTS public.attention_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_fingerprint text NOT NULL,
  recipient_email text NOT NULL,
  item_count integer NOT NULL CHECK (item_count > 0),
  delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending','sent','failed')),
  provider_message_id text NULL,
  error_detail text NULL,
  sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_owner_user_id, snapshot_fingerprint)
);
CREATE INDEX IF NOT EXISTS attention_email_deliveries_owner_created_idx ON public.attention_email_deliveries(account_owner_user_id, created_at DESC);
ALTER TABLE public.attention_email_deliveries ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.attention_email_deliveries IS 'Deduplicated owner-facing email delivery ledger for Needs Attention snapshots.';
COMMIT;
