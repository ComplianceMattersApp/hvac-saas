-- Preserve customer contact details from permit intake through customer/job creation.
BEGIN;

ALTER TABLE public.permit_requests
  ADD COLUMN IF NOT EXISTS customer_email_snapshot text NULL,
  ADD COLUMN IF NOT EXISTS customer_phone_snapshot text NULL;

COMMIT;
