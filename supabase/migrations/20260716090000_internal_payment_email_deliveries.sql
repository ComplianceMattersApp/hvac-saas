-- Durable, replay-safe internal payment-received email delivery ledger.
CREATE TABLE IF NOT EXISTS public.internal_payment_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_user_id uuid NOT NULL,
  internal_invoice_payment_id uuid NOT NULL REFERENCES public.internal_invoice_payments(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'queued' CHECK (delivery_status IN ('queued', 'sent', 'failed')),
  provider_message_id text,
  error_detail text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (internal_invoice_payment_id, recipient_email)
);

CREATE INDEX IF NOT EXISTS internal_payment_email_deliveries_owner_created_idx
  ON public.internal_payment_email_deliveries (account_owner_user_id, created_at DESC);

ALTER TABLE public.internal_payment_email_deliveries ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.internal_payment_email_deliveries IS
  'Internal payment-received email claims and outcomes. Service-role delivery only; payment truth never depends on delivery.';
