-- Compliance Matters: Time Clock V1B schema/settings foundation
-- Purpose: add dormant account/user settings gates and dedicated internal-user
-- time-entry truth table with account-scoped RLS.
-- Non-goals: no UI routes, no runtime clock actions, no payroll/overtime logic,
-- no contractor/customer portal access, no job_events timecard ownership.

BEGIN;

ALTER TABLE public.account_settings
  ADD COLUMN IF NOT EXISTS time_clock_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.internal_users
  ADD COLUMN IF NOT EXISTS time_tracking_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.internal_user_time_entries (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_owner_user_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  internal_user_id      uuid        NOT NULL REFERENCES public.internal_users(user_id) ON DELETE RESTRICT,

  status                text        NOT NULL,
  clock_in_at           timestamptz NOT NULL,
  lunch_start_at        timestamptz NULL,
  lunch_end_at          timestamptz NULL,
  clock_out_at          timestamptz NULL,

  adjusted_by_user_id   uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  adjusted_at           timestamptz NULL,
  adjustment_reason     text        NULL,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT internal_user_time_entries_status_valid_chk
    CHECK (status IN ('open', 'on_lunch', 'closed', 'needs_review', 'voided')),

  CONSTRAINT internal_user_time_entries_closed_requires_clock_out_chk
    CHECK (status <> 'closed' OR clock_out_at IS NOT NULL),

  CONSTRAINT internal_user_time_entries_on_lunch_requires_start_no_end_chk
    CHECK (
      status <> 'on_lunch'
      OR (
        lunch_start_at IS NOT NULL
        AND lunch_end_at IS NULL
        AND clock_out_at IS NULL
      )
    ),

  CONSTRAINT internal_user_time_entries_lunch_end_requires_start_chk
    CHECK (lunch_end_at IS NULL OR lunch_start_at IS NOT NULL),

  CONSTRAINT internal_user_time_entries_adjustment_reason_required_chk
    CHECK (
      (adjusted_at IS NULL AND adjusted_by_user_id IS NULL)
      OR length(btrim(coalesce(adjustment_reason, ''))) > 0
    )
);

CREATE INDEX IF NOT EXISTS internal_user_time_entries_account_status_clock_in_idx
  ON public.internal_user_time_entries (account_owner_user_id, status, clock_in_at DESC);

CREATE INDEX IF NOT EXISTS internal_user_time_entries_user_clock_in_idx
  ON public.internal_user_time_entries (internal_user_id, clock_in_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS internal_user_time_entries_single_active_uidx
  ON public.internal_user_time_entries (internal_user_id)
  WHERE status IN ('open', 'on_lunch');

DROP TRIGGER IF EXISTS internal_user_time_entries_set_updated_at
  ON public.internal_user_time_entries;

CREATE TRIGGER internal_user_time_entries_set_updated_at
BEFORE UPDATE ON public.internal_user_time_entries
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.assert_internal_user_time_entry_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  scoped_account_owner_user_id uuid;
BEGIN
  SELECT iu.account_owner_user_id
  INTO scoped_account_owner_user_id
  FROM public.internal_users iu
  WHERE iu.user_id = NEW.internal_user_id
  LIMIT 1;

  IF scoped_account_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'internal_user not found for time entry scope check'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.account_owner_user_id IS DISTINCT FROM scoped_account_owner_user_id THEN
    RAISE EXCEPTION 'internal_user_time_entries account scope mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS internal_user_time_entries_assert_scope
  ON public.internal_user_time_entries;

CREATE TRIGGER internal_user_time_entries_assert_scope
BEFORE INSERT OR UPDATE ON public.internal_user_time_entries
FOR EACH ROW
EXECUTE FUNCTION public.assert_internal_user_time_entry_scope();

ALTER TABLE public.internal_user_time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_user_time_entries_select_account_scope
  ON public.internal_user_time_entries;
DROP POLICY IF EXISTS internal_user_time_entries_insert_account_scope
  ON public.internal_user_time_entries;
DROP POLICY IF EXISTS internal_user_time_entries_update_account_scope
  ON public.internal_user_time_entries;

CREATE POLICY internal_user_time_entries_select_account_scope
ON public.internal_user_time_entries
FOR SELECT
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

CREATE POLICY internal_user_time_entries_insert_account_scope
ON public.internal_user_time_entries
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

CREATE POLICY internal_user_time_entries_update_account_scope
ON public.internal_user_time_entries
FOR UPDATE
TO authenticated
USING (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
)
WITH CHECK (
  public.current_internal_account_owner_id() IS NOT NULL
  AND account_owner_user_id = public.current_internal_account_owner_id()
);

-- No DELETE policy in V1B.

COMMIT;
