-- EveryStep FieldWorks: refund + dispute state on internal_invoice_payments
-- Purpose: instrument money LEAVING. Payment-in was fully handled (charge.succeeded,
-- checkout.session.completed); refunds and disputes had no inbound path at all, so a
-- refund issued from the Stripe dashboard left the invoice showing paid forever.
-- Additive only. No change to existing payment truth or to payment_status semantics.
--
-- Why dispute state is NOT a payment_status value: a dispute is not an outcome. Funds
-- are held while the case is open and the payment may still end up valid, so it must
-- not collapse into 'reversed'. Only a LOST dispute reverses the payment, which is
-- what the existing 'reversed' status already means.

BEGIN;

ALTER TABLE public.internal_invoice_payments
  ADD COLUMN IF NOT EXISTS stripe_refunded_amount_cents integer NULL,
  ADD COLUMN IF NOT EXISTS dispute_status text NULL
    CHECK (dispute_status IN ('open', 'won', 'lost')),
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS dispute_resolved_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS stripe_dispute_id text NULL,
  ADD COLUMN IF NOT EXISTS dispute_reason text NULL;

COMMENT ON COLUMN public.internal_invoice_payments.stripe_refunded_amount_cents IS
  'Amount Stripe reports refunded on this charge. Equal to amount_cents means a full refund, which auto-reverses the payment. A smaller value is a PARTIAL refund: the payment stays recorded and an operator resolves the allocation by hand.';
COMMENT ON COLUMN public.internal_invoice_payments.dispute_status IS
  'open = chargeback filed, funds held, outcome unknown (payment stays recorded); won = resolved in our favour; lost = funds gone, and the payment is reversed alongside this.';
COMMENT ON COLUMN public.internal_invoice_payments.stripe_dispute_id IS
  'Stripe Dispute id, so a later dispute.closed event resolves the same row it opened.';

-- Attention-center lookups: the small set of payments needing a human.
CREATE INDEX IF NOT EXISTS internal_invoice_payments_open_dispute_idx
  ON public.internal_invoice_payments (account_owner_user_id)
  WHERE dispute_status IS NOT NULL AND dispute_status <> 'won';

CREATE INDEX IF NOT EXISTS internal_invoice_payments_partial_refund_idx
  ON public.internal_invoice_payments (account_owner_user_id)
  WHERE stripe_refunded_amount_cents IS NOT NULL AND payment_status = 'recorded';

COMMIT;
