-- EveryStep FieldWorks: QuickBooks item mapping columns (Slice 01 — QBO correctness)
-- Purpose: let each pricebook item post to its own QuickBooks item, with an
-- account-level default for everything unmapped. Additive only.
--
-- Why this exists: every EveryStep invoice line used to post against a single
-- QBO item found by the bare name 'Services'. Tenants whose QuickBooks file
-- already had an hours-based item called "Services" got every line booked
-- against it, so quantities rendered as hours. Mapping is per pricebook item,
-- with an account default, and an app-owned 'EveryStep Services' fallback.
--
-- The cached *_name columns are display labels only. QuickBooks item names are
-- editable there, so the id is the sole authoritative reference; the name
-- exists so the admin UI can show what was mapped without a QBO round-trip.
--
-- Non-goals: no auto-creation of one QBO item per pricebook item, no rewrite of
-- already-synced invoices, no tax mapping (Slice 02), no RLS change — both
-- tables are already account-owner scoped.

BEGIN;

ALTER TABLE public.pricebook_items
  ADD COLUMN IF NOT EXISTS qbo_item_id text NULL,
  ADD COLUMN IF NOT EXISTS qbo_item_name text NULL;

COMMENT ON COLUMN public.pricebook_items.qbo_item_id IS
  'QuickBooks Item.Id this pricebook item posts to. NULL = fall through to the account default, then the app-owned EveryStep Services item.';
COMMENT ON COLUMN public.pricebook_items.qbo_item_name IS
  'Cached QuickBooks item display name for the admin UI. NOT authoritative — the id is. May be stale if the item was renamed in QuickBooks.';

ALTER TABLE public.qbo_connections
  ADD COLUMN IF NOT EXISTS default_qbo_item_id text NULL,
  ADD COLUMN IF NOT EXISTS default_qbo_item_name text NULL;

COMMENT ON COLUMN public.qbo_connections.default_qbo_item_id IS
  'Account-level QuickBooks Item.Id for invoice lines with no pricebook mapping. NULL = use the app-owned EveryStep Services item.';
COMMENT ON COLUMN public.qbo_connections.default_qbo_item_name IS
  'Cached QuickBooks item display name for the admin UI. NOT authoritative — the id is.';

-- No new index: the only read path filters by (account_owner_user_id, id IN …),
-- which the primary key and the existing owner indexes already serve. A partial
-- index on qbo_item_id would never be chosen for it.

COMMIT;
