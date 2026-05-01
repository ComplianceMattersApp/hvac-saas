-- Compliance Matters: support access foundation v1a
-- Purpose: add explicit, auditable support-access domain primitives without
-- introducing impersonation, tenant data browsing UI, or mutation-through-support.
--
-- Scope in this migration:
--   1) support_users
--   2) support_account_grants
--   3) support_access_sessions
--   4) support_access_audit_events
--
-- Security posture:
--   - RLS enabled on all support tables.
--   - No authenticated tenant-user read/write policies in this slice.
--   - Access is server-side only through explicit resolver/action boundaries.

BEGIN;

CREATE TABLE IF NOT EXISTS public.support_users (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  auth_user_id        uuid        NOT NULL,
  display_name        text        NULL,
  default_access_mode text        NOT NULL DEFAULT 'read_only',
  is_active           boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT support_users_pkey
    PRIMARY KEY (id),

  CONSTRAINT support_users_auth_user_unique
    UNIQUE (auth_user_id),

  CONSTRAINT support_users_auth_user_fk
    FOREIGN KEY (auth_user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE,

  CONSTRAINT support_users_default_access_mode_valid_chk
    CHECK (default_access_mode IN ('read_only', 'write'))
);

CREATE INDEX IF NOT EXISTS support_users_active_idx
  ON public.support_users (is_active, auth_user_id);

CREATE TABLE IF NOT EXISTS public.support_account_grants (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  support_user_id       uuid        NOT NULL,
  account_owner_user_id uuid        NOT NULL,
  access_mode           text        NOT NULL DEFAULT 'read_only',
  status                text        NOT NULL DEFAULT 'active',
  starts_at             timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NULL,
  granted_by_user_id    uuid        NULL,
  revoked_at            timestamptz NULL,
  revoked_by_user_id    uuid        NULL,
  notes                 text        NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT support_account_grants_pkey
    PRIMARY KEY (id),

  CONSTRAINT support_account_grants_grant_tuple_unique
    UNIQUE (id, support_user_id, account_owner_user_id),

  CONSTRAINT support_account_grants_support_user_fk
    FOREIGN KEY (support_user_id)
    REFERENCES public.support_users(id)
    ON DELETE CASCADE,

  CONSTRAINT support_account_grants_account_owner_fk
    FOREIGN KEY (account_owner_user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE,

  CONSTRAINT support_account_grants_granted_by_fk
    FOREIGN KEY (granted_by_user_id)
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  CONSTRAINT support_account_grants_revoked_by_fk
    FOREIGN KEY (revoked_by_user_id)
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  CONSTRAINT support_account_grants_access_mode_valid_chk
    CHECK (access_mode IN ('read_only', 'write')),

  CONSTRAINT support_account_grants_status_valid_chk
    CHECK (status IN ('active', 'inactive', 'revoked')),

  CONSTRAINT support_account_grants_expiry_window_valid_chk
    CHECK (expires_at IS NULL OR expires_at > starts_at)
);

CREATE INDEX IF NOT EXISTS support_account_grants_support_user_idx
  ON public.support_account_grants (support_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS support_account_grants_account_owner_idx
  ON public.support_account_grants (account_owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.support_access_sessions (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  support_user_id       uuid        NOT NULL,
  support_account_grant_id uuid     NOT NULL,
  account_owner_user_id uuid        NOT NULL,
  access_mode           text        NOT NULL DEFAULT 'read_only',
  status                text        NOT NULL DEFAULT 'active',
  started_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL,
  ended_at              timestamptz NULL,
  ended_reason          text        NULL,
  started_by_user_id    uuid        NULL,
  ended_by_user_id      uuid        NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT support_access_sessions_pkey
    PRIMARY KEY (id),

  CONSTRAINT support_access_sessions_support_user_fk
    FOREIGN KEY (support_user_id)
    REFERENCES public.support_users(id)
    ON DELETE CASCADE,

  CONSTRAINT support_access_sessions_support_grant_fk
    FOREIGN KEY (support_account_grant_id)
    REFERENCES public.support_account_grants(id)
    ON DELETE CASCADE,

  CONSTRAINT support_access_sessions_grant_tuple_fk
    FOREIGN KEY (support_account_grant_id, support_user_id, account_owner_user_id)
    REFERENCES public.support_account_grants(id, support_user_id, account_owner_user_id)
    ON DELETE CASCADE,

  CONSTRAINT support_access_sessions_account_owner_fk
    FOREIGN KEY (account_owner_user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE,

  CONSTRAINT support_access_sessions_started_by_fk
    FOREIGN KEY (started_by_user_id)
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  CONSTRAINT support_access_sessions_ended_by_fk
    FOREIGN KEY (ended_by_user_id)
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  CONSTRAINT support_access_sessions_access_mode_valid_chk
    CHECK (access_mode IN ('read_only', 'write')),

  CONSTRAINT support_access_sessions_status_valid_chk
    CHECK (status IN ('active', 'ended', 'expired', 'revoked')),

  CONSTRAINT support_access_sessions_expiry_valid_chk
    CHECK (expires_at > started_at),

  CONSTRAINT support_access_sessions_end_time_valid_chk
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS support_access_sessions_support_user_idx
  ON public.support_access_sessions (support_user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS support_access_sessions_account_owner_idx
  ON public.support_access_sessions (account_owner_user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS support_access_sessions_status_expiry_idx
  ON public.support_access_sessions (status, expires_at);

CREATE TABLE IF NOT EXISTS public.support_access_audit_events (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  support_user_id       uuid        NULL,
  account_owner_user_id uuid        NULL,
  support_access_session_id uuid    NULL,
  event_type            text        NOT NULL,
  outcome               text        NOT NULL DEFAULT 'info',
  reason_code           text        NULL,
  metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT support_access_audit_events_pkey
    PRIMARY KEY (id),

  CONSTRAINT support_access_audit_events_support_user_fk
    FOREIGN KEY (support_user_id)
    REFERENCES public.support_users(id)
    ON DELETE SET NULL,

  CONSTRAINT support_access_audit_events_account_owner_fk
    FOREIGN KEY (account_owner_user_id)
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  CONSTRAINT support_access_audit_events_session_fk
    FOREIGN KEY (support_access_session_id)
    REFERENCES public.support_access_sessions(id)
    ON DELETE SET NULL,

  CONSTRAINT support_access_audit_events_event_type_valid_chk
    CHECK (event_type IN ('session_started', 'session_ended', 'access_denied', 'account_viewed')),

  CONSTRAINT support_access_audit_events_outcome_valid_chk
    CHECK (outcome IN ('allowed', 'denied', 'info'))
);

CREATE INDEX IF NOT EXISTS support_access_audit_events_session_idx
  ON public.support_access_audit_events (support_access_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS support_access_audit_events_account_owner_idx
  ON public.support_access_audit_events (account_owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS support_access_audit_events_support_user_idx
  ON public.support_access_audit_events (support_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS support_access_audit_events_event_type_idx
  ON public.support_access_audit_events (event_type, created_at DESC);

ALTER TABLE public.support_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_account_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_access_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_access_audit_events ENABLE ROW LEVEL SECURITY;

-- Explicitly keep support tables out of general authenticated access in V1A.
REVOKE ALL ON TABLE public.support_users FROM PUBLIC;
REVOKE ALL ON TABLE public.support_users FROM anon;
REVOKE ALL ON TABLE public.support_users FROM authenticated;

REVOKE ALL ON TABLE public.support_account_grants FROM PUBLIC;
REVOKE ALL ON TABLE public.support_account_grants FROM anon;
REVOKE ALL ON TABLE public.support_account_grants FROM authenticated;

REVOKE ALL ON TABLE public.support_access_sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.support_access_sessions FROM anon;
REVOKE ALL ON TABLE public.support_access_sessions FROM authenticated;

REVOKE ALL ON TABLE public.support_access_audit_events FROM PUBLIC;
REVOKE ALL ON TABLE public.support_access_audit_events FROM anon;
REVOKE ALL ON TABLE public.support_access_audit_events FROM authenticated;

COMMIT;
