-- EveryStep FieldWorks: remove stale sender-side workshare update RLS policy.
-- Context: the original P1-B migration was applied before the sender update policy was removed.

BEGIN;

DROP POLICY IF EXISTS account_workshare_connections_update_sender_admin_owner_scope
  ON public.account_workshare_connections;

COMMIT;
