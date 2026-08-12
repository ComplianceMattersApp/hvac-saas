# SLICE 01 — QuickBooks Online Correctness

You are a senior engineer working in the EveryStep FieldWorks repo (`hvac-saas`). This
slice fixes two defects in the QuickBooks Online (QBO) invoice/payment sync. Read this
whole document before writing code. Every design decision is already made — your job is
faithful implementation, tests, and honest reporting.

---

## 1. What this app is (orientation)

- **Product:** EveryStep FieldWorks — multi-tenant field-service SaaS for California
  ECC/HERS compliance raters (primary) and HVAC service companies. Legal entity:
  Compliance Matters CA.
- **Stack:** Next.js 16 App Router + React 19, TypeScript, Supabase (Postgres + RLS),
  Tailwind v4. Nearly all mutations are **server actions** (`lib/actions/*`,
  per-route `actions.ts`) — there are only ~12 API routes. Route auth gate lives in
  root `proxy.ts` (Next 16's middleware), default-deny.
- **Tenancy:** every table is scoped by `account_owner_user_id uuid` referencing
  `auth.users(id)`, enforced by RLS. There is no companies table. Never write a query
  that isn't scoped to the account owner.
- **Schema source of truth:** `supabase/migrations/` (160+ files). Root
  `prod_schema.sql` is stale — do not trust it. Migrations are **additive by default**;
  use `IF NOT EXISTS` idioms; never destructive changes.
- **Money:** invoice domain stores integer cents (`*_cents`); `pricebook_items`
  stores dollars `numeric(10,2)`. Do not mix them up.
- **Environment rules (`ENVIRONMENT_RULES.md`):** prod Supabase project is
  `ComplianceMatters` (`ornrnvxtwwtulohqwxop`); sandbox is `CMTest`
  (`kvpesjdukqwwlgpkzfjm`). **Never `supabase db push` to prod.** Write migration
  files only; the owner applies them.
- **Tests:** Vitest — `npm run test`. QBO tests live in `lib/qbo/__tests__/` and are
  good style references (`qbo-sync.test.ts`, `qbo-void-sync.test.ts`,
  `qbo-api-client.test.ts`). Lint: `npm run lint`. Build: `npm run build`.

## 2. Standing repo rules that bind this slice

1. **Sync must never throw.** A QBO failure degrades to `qbo_sync_status='error'`
   with a stored message; it never breaks invoice issuance or the calling action.
   (Existing hard rule — see `lib/qbo/qbo-sync.ts`.)
2. **Never trust a 2xx.** A successful HTTP response is not proof the record landed
   in QBO. This lane exists because a void drifted for six days on exactly that
   assumption. The reference implementation of the correct pattern is
   `lib/qbo/qbo-void-sync.ts` + closeout doc
   `docs/ACTIVE/Payment_Controls_Hardening_Closeout_2026-08-09.md` ("an unverified
   success is worse than a recorded failure").
3. **Do not add new columns to shared SELECT constants** (e.g. the
   `INTERNAL_INVOICE_SELECT` pattern). A lagging migration would turn one missing
   column into an app-wide 42703. Read new columns through a dedicated helper that
   degrades to null — copy the pattern in `lib/qbo/qbo-void-state.ts`.
4. **Known QBO API traps** (hard-won, do not rediscover): the void query param is
   `?operation=void`, never `?operate=void` — QBO silently ignores unknown params.
   Never include `Line` in a void body (it becomes a full update that rewrites the
   invoice). Re-read the live `SyncToken` before any sparse update; stored tokens go
   stale the moment a payment posts (error 5010).
5. UI changes must match existing idioms in the surface you touch (server actions +
   form posts, `SubmitButton`, flash banners). No new client-side data libraries.

## 3. Problem A — every invoice line posts to one QBO item ("Qty shows as hours")

### Root cause (verified)

`lib/qbo/qbo-api-client.ts` → `findOrCreateQboServicesItem()` (~line 244) runs
`select * from Item where Name = 'Services'` and reuses whatever it finds. Every
invoice line is then posted against that single item in `buildInvoiceBody()`
(~line 333): `SalesItemLineDetail: { ItemRef: {value: servicesItemRef}, Qty, UnitPrice }`.

Because it *finds before creating*, tenants with a pre-existing QBO item named
"Services" (commonly an hours-based service item) get every EveryStep line posted
against it — which is why quantities render as hours in the owner's QBO file.
`lib/qbo/qbo-sync.ts` resolves `servicesItemRef` once per run (~lines 335, 414) and
threads it through `buildInvoiceInput()`.

Relevant line-item data already available in `internal_invoice_line_items`:
`quantity`, `unit_price`, `line_subtotal`, `item_name_snapshot`,
`description_snapshot`, `source_pricebook_item_id` (nullable — see migration
`20260427153000_internal_invoice_line_items_pricebook_provenance_v1.sql`), and
`source_job_id`. `pricebook_items` (migration `20260427120000_pricebook_items_v1.sql`)
has `item_name`, `item_type` (`service|material|diagnostic|adjustment`),
`unit_label`, `default_unit_price`, `is_active`.

### Design (decided — implement as written)

**A1. Schema (one additive migration):**
- `pricebook_items`: add `qbo_item_id text NULL`, `qbo_item_name text NULL`
  (cached display name; not authoritative).
- `qbo_connections`: add `default_qbo_item_id text NULL`,
  `default_qbo_item_name text NULL`.
- No RLS changes needed (both tables already tenant-scoped). Timestamped filename
  following the existing `YYYYMMDDHHMMSS_description.sql` convention.

**A2. Per-line item resolution in sync** (replace the single `servicesItemRef`):
1. If the line's `source_pricebook_item_id` resolves to a pricebook item with a
   non-null `qbo_item_id` → use it.
2. Else if the connection's `default_qbo_item_id` is set → use it.
3. Else → find-or-create the app-owned fallback item named **`EveryStep Services`**
   (Type `Service`, first income account — same creation logic as today but the new
   name). **Stop matching bare `"Services"`; that collision is the bug.** Keep the
   existing behavior of resolving the fallback once per sync run; per-line pricebook
   lookups should be batched (one query for all `source_pricebook_item_id`s on the
   invoice), not N+1.
- If a mapped `qbo_item_id` turns out invalid at QBO (deleted/inactive → the create
  call fails), degrade per rule 2: record `qbo_sync_status='error'` with a message
  naming the offending item mapping. Do not silently fall back — a silent fallback
  hides a books-mapping problem.

**A3. Admin UI (minimal, additive):**
- In the QBO admin surface (where connect/disconnect + sync settings live — locate it
  under `app/ops/admin/**`; follow its existing form idiom): a "Default QuickBooks
  item" selector. Populate options server-side from QBO
  (`select Id, Name from Item where Active = true` — Service and NonInventory types
  are both acceptable), only when a connection exists. Saving stores id + name.
  Include a "None (use EveryStep Services)" option that nulls both columns.
- In the pricebook item edit form (`app/ops/admin/pricebook/**`): an optional
  "QuickBooks item" selector with the same option source, rendered only when QBO is
  connected. Empty selection nulls the mapping.
- If the QBO item list fetch fails, render the form with the selector disabled and a
  plain inline note — never block the rest of the form (rule 1 applies to reads too).

**A4. Explicitly not in scope:** retroactively rewriting already-synced invoices;
auto-creating one QBO item per pricebook item; tax mapping (that is Slice 02);
touching estimates.

## 4. Problem B — invoice and payment sync trust a 2xx

### Current state (verified)

`createQboInvoice` / `updateQboInvoice` (`lib/qbo/qbo-api-client.ts`) and the payment
push (`lib/qbo/qbo-payment-sync.ts`) record success from the write response alone.
There is no read-back anywhere in `qbo-sync.ts` or `qbo-payment-sync.ts`. The void
lane (`qbo-void-sync.ts`) already implements the correct pattern: write, then re-read
the entity and record success **only when QBO's own state confirms the outcome**;
otherwise record `error` with the observed values.

### Design (decided — implement as written)

**B1. Invoice sync verify-after-write.** After a create/update 2xx, re-read the
invoice by Id and confirm: it exists, `DocNumber` matches what we sent, and
`TotalAmt` equals the expected total within $0.01. Only then set
`qbo_sync_status='synced'`. On mismatch or failed read-back: `qbo_sync_status='error'`
with a message containing observed DocNumber/TotalAmt vs expected. Per the closeout
doc's ordering lesson: a false *negative* merely retries on the next sweep; a false
*positive* retires the row and hides drift — when in doubt, record error.

**B2. Payment sync verify-after-write.** Same shape: after pushing a payment,
re-read it by Id and confirm `TotalAmt` matches and its `Line` links the expected
QBO invoice id before recording the payment's sync status as synced; otherwise error
with observed values.

**B3. Read-back failure ≠ write failure.** If the write succeeded but the verify read
errors (network, token), record `error` with a message that distinguishes
"unverified — read-back failed" from "verified mismatch". Both are retryable states;
neither may be recorded as synced. Ensure the retry path (the existing sweep /
auto-sync entry points in `qbo-auto-sync.ts` / `qbo-payment-auto-sync.ts`) treats
these rows as candidates — verify against the candidate queries, and note in your
report if `update` (vs create) on retry needs the live SyncToken re-read (rule 4).

## 5. Acceptance criteria

- [ ] Migration adds the four columns; nothing destructive; file follows naming
      convention; no changes pushed to any database by you.
- [ ] A synced invoice whose lines have mapped pricebook items posts each line to its
      mapped QBO ItemRef (unit test asserting per-line ItemRefs in the request body).
- [ ] An unmapped line with no account default posts to `EveryStep Services`, and the
      literal query for bare `Services` no longer exists in the codebase.
- [ ] Invalid mapped item → `qbo_sync_status='error'`, sync does not throw, message
      names the mapping.
- [ ] Invoice sync records `synced` only after a confirming read-back (tests for:
      happy path; TotalAmt mismatch → error with observed values; read-back network
      failure → error marked unverified).
- [ ] Payment sync equivalently verified (same three test shapes).
- [ ] New columns are read via dedicated helpers, not added to shared SELECTs.
- [ ] Admin UIs render and save; selector disabled state on QBO fetch failure.
- [ ] `npm run test`, `npm run lint`, `npm run build` all pass. Match the mocking
      style of the existing `lib/qbo/__tests__` suite.

## 6. Deliverable / report back

Work on a branch named `slice-01-qbo-correctness`. Small, descriptive commits.
Do not open a PR unless the owner asks. When done, report:

1. Files changed (grouped: migration / sync engine / api client / UI / tests).
2. Full test run output (including the pre-existing suite — call out anything that
   was already failing before your changes rather than silently fixing or skipping).
3. Any place you had to deviate from this spec, and why.
4. A short manual QA script the owner can run against the QBO **sandbox** company:
   connect, map a pricebook item, issue a small invoice with quantity 3, confirm in
   QBO that Qty shows 3 against the mapped item; then break something (rename the
   mapped item in QBO) and confirm the app records an error instead of a false sync.
5. Open questions for the next slice (Slice 02 sales tax will build on this file's
   line-item surface).
