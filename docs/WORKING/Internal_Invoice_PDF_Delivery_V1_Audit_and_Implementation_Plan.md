# Internal Invoice PDF Delivery V1 — Audit and Implementation Plan

Status: Implementation complete; controlled authenticated/provider smoke pending
Date: 2026-07-19  
Scope: Audit and planning only; no application, schema, dependency, environment, or production changes

## 1. Authority and scope

The requested `docs/ACTIVE/Active Spine V4.0 Current.md` is retired and redirects to `docs/PROJECT_TRUTH.md` for stable product truth and `docs/CURRENT_ROADMAP.md` for active sequencing. This audit therefore treated those two files as controlling authority and also reviewed the requested release, financial-ledger, financial-access, and invoice closeout documents.

Locked boundaries for this lane:

- `internal_invoices` and `internal_invoice_line_items` remain frozen billed/commercial truth.
- `internal_invoice_payments` and its existing allocation/projection helpers remain collected-payment truth.
- Stripe remains the payment rail; PDF work must not create or alter payment truth.
- QBO remains optional downstream accounting synchronization.
- PDF creation is presentation and delivery behavior only. It must not alter job, closeout, work-item, invoice-charge, payment, Stripe, or QBO state.
- Internal account scope and invoice financial capabilities must be enforced server-side. Contractor and public invoice surfaces are out of scope.
- V1 generates in memory on demand and stores neither PDF bytes nor a PDF artifact.

## 2. Current architecture map

### 2.1 Internal invoice workspace and print surface

- Canonical internal workspace: `app/jobs/[id]/invoice/page.tsx`.
- Current CTA: `Print / Save PDF`, linking to `/jobs/{jobId}/invoice/print?invoice_id={invoiceId}` in a new tab.
- Print route: `app/jobs/[id]/invoice/print/page.tsx`.
- Browser toolbar: `app/jobs/[id]/invoice/print/PrintToolbar.tsx`; it calls `window.print()` and tells the user to use the browser print dialog.
- The print route is a React Server Component using ordinary HTML/Tailwind print styles. It renders the invoice document, not the premium email shell.
- The route authenticates with Supabase, resolves the actor with `resolveJobDetailActor`, rejects contractor actors by redirecting to the contractor portal, verifies the job through `loadScopedInternalJobDetailReadBoundary`, verifies internal-invoicing billing mode, and validates any requested invoice against both job and `account_owner_user_id`.
- It reads the invoice with `resolveInternalInvoiceById` / `resolveInternalInvoiceByJobId`, payments with `resolveInvoiceCollectedPaymentLedger`, tenant branding with `resolveOperationalTenantIdentity`, job/customer/location fields, and billing/service address formatters.
- Document mapping and JSX are currently embedded in the route. Currency/date/status formatting is also local, so the print page is visually canonical but not yet a reusable document component or view model.

### 2.2 Canonical invoice and payment reads

- `lib/business/internal-invoice.ts` owns the normalized invoice record, line-item record, scoped invoice fetches, and family reads. Invoice fetches load line items ordered by `sort_order`, then `created_at`.
- Totals are stored invoice truth (`subtotal_cents`, `total_cents`) and line snapshots are billed truth. The PDF must consume these values and must not recalculate commercial totals.
- `lib/business/internal-invoice-payments.ts` owns collected-payment ledger and summary logic (`amountPaidCents`, `balanceDueCents`, payment status). This is already used by both print and email.
- `lib/business/internal-invoice-address-rendering.ts` owns billing and service-address display lines.
- `lib/utils/display-references.ts` owns the customer-facing invoice reference fallback behavior.
- The current model has no canonical `due_date` field and no explicit tax field in `InternalInvoiceRecord`. `total_cents - subtotal_cents` must not be labeled tax without a separately proven canonical tax contract. V1 should display only fields supported by current truth unless a later approved model lane adds those facts.

### 2.3 Send, resend, template, and payment link

- Initial send action: `sendInternalInvoiceEmailFromForm` in `lib/actions/internal-invoice-actions.ts`.
- Resend is not a second action. The same action detects prior successful history and marks a later attempt as `resent`.
- Compound draft issue-and-send action: `issueAndSendInternalInvoiceFromForm` in the same module. It performs issue mutation, then calls the shared delivery helper.
- Shared delivery core: `deliverInternalInvoiceEmailForContext`. This is the single integration seam for normal send, resend, and compound issue/send.
- Premium HTML/text builders live in `lib/actions/internal-invoice-actions.ts` (`buildInternalInvoiceEmailBody`, `buildInternalInvoiceEmailText`, and `buildInternalInvoiceEmailForContext`). The exact email can be previewed at `app/jobs/[id]/invoice/email-preview/page.tsx` inside `CustomerEmailFrame.tsx`.
- Payment links are created by the existing `createTenantInvoicePaymentLink` path only for eligible issued invoices. Link generation failure currently degrades to no payment link; PDF work must not change that established behavior.
- Recipient, subject, HTML, text, branding, payment link, and send/resend distinction are already centralized and should remain unchanged apart from an optional small attachment sentence.

### 2.4 Provider abstraction and attachment support

- Provider wrapper: `lib/email/sendEmail.ts`.
- Provider: Resend (`resend` package, currently `^6.10.0`).
- The wrapper currently accepts only `to`, `subject`, `html`, and optional `text`; application-level attachment support is absent.
- The installed Resend SDK supports an `attachments` array with filename plus buffer/base64 content. Official Resend documentation states a 40 MB total email limit after Base64 encoding. The implementation should pass an in-memory buffer and never use a public or stored file URL.
- The provider extension should add a small provider-neutral attachment type (`filename`, `content`, `contentType`) and translate it only in `sendEmail.ts`. PDF callers should not construct Resend-specific payloads.

### 2.5 Delivery history and observability

- Invoice email attempts use existing `notifications` rows with `channel = email` and `notification_type = internal_invoice_email`; there is no dedicated internal-invoice-delivery table.
- `notifications.payload` is JSONB and already records invoice ID/number, recipient, attempt kind/number, provider name/message ID, and safe error detail.
- `lib/business/internal-invoice-delivery.ts` normalizes these rows for the workspace delivery-history UI.
- Delivery presently follows queued → sent/failed. A queued row is created before the provider call; provider failure marks it failed and writes `internal_invoice_email_failed`; provider success marks it sent and records send/resend history.
- Existing payload metadata can safely add `pdf_attached`, `attachment_filename`, `attachment_mime_type`, optional byte size, and a safe failure classification. No PDF binary, base64 body, signed URL, or temp path belongs in metadata.
- Historical rows without attachment facts already normalize safely and must continue to render without a PDF badge.

### 2.6 Branding and logo resolution

- `lib/email/operational-tenant-branding.ts` resolves tenant display name, support email/phone, and logo through the canonical business-profile boundary.
- `lib/business/internal-business-profile.ts` resolves stored logo references and signed URLs. Logo resolution already fails safely to `null`.
- HTML email and print use the resolved URL directly. A server PDF renderer needs bounded logo-byte loading because an external URL cannot be assumed to render synchronously. Failure must fall back to the tenant display name and must not fail an otherwise valid invoice unless the renderer itself cannot produce the document.

### 2.7 Access control

- `loadInternalInvoiceContext` requires an active internal actor, checks the job with `loadScopedInternalJobForMutation`, checks internal-invoicing entitlement/billing mode, loads the selected invoice, and rejects a job/account mismatch before send work.
- Send/preview use the field-invoice send capability helper (`requireFieldInvoiceSendAccessOrRedirect`), which preserves authorized field-billing capability behavior as well as owner/admin/billing authority.
- General financial authority is centralized in `lib/auth/financial-access.ts`: structural owner or active `admin`/`billing`, with matching account scope.
- The download route should reuse the same actor, job, invoice, entitlement, and capability boundaries rather than relying on UI visibility. It must be a Node-only internal route and must not reuse contractor/public print or signed payment routes.

## 3. PDF capability and strategy comparison

No production PDF generator is declared in `package.json`. No `pdfkit`, `pdf-lib`, `@react-pdf/renderer`, Puppeteer, or Chromium dependency is installed. Playwright references are limited to ad hoc smoke scripts/transitive metadata and are not an application runtime capability.

| Strategy | Fidelity / reuse | Runtime and dependency | Multi-page / fonts / logos | Testability and maintenance | Decision |
| --- | --- | --- | --- | --- | --- |
| Server-side HTML-to-PDF using existing print page | Highest initial visual fidelity to current HTML | Requires Chromium/Playwright/Puppeteer or an external conversion service; heavy cold start and deployment complexity on Vercel | Browser pagination is capable but print CSS, executable packaging, remote logo timing, and browser headers need careful control | End-to-end heavy and more fragile; expands operational/security surface | Reject for V1 |
| Programmatic low-level PDF (`pdfkit` or `pdf-lib`) | Reuses data but duplicates most document layout; weak direct reuse of current React/Tailwind view | Node-compatible and relatively direct | Possible, but table wrapping, repeated headers, page breaks, and long-content layout become custom code | Byte output is easy to test; long-term layout maintenance is high | Viable fallback, not preferred |
| Shared invoice-document view model + `@react-pdf/renderer` document component | Shares all canonical mapping with print; PDF presentation remains purpose-built but close to React composition | Server/Node renderer, MIT license, current package exposes TypeScript types; adds a non-browser PDF dependency and transitive layout engine | Built-in page wrapping, fixed elements, text wrapping, image support, and page-break controls fit long invoices | Pure view-model tests plus deterministic render-to-buffer tests; clearer separation than hand-drawn coordinates | Selected |
| Shared view model + existing PDF capability | Best if present | None exists | N/A | N/A | Not available |

Selected strategy: extract one canonical invoice-document view model, keep the existing print HTML as a presentation surface backed by that model, and add a server-only `@react-pdf/renderer` document/render helper. This is the smallest dependable approach that handles long and multi-page invoices without introducing a headless browser or a second invoice calculation path.

Proposed new dependency after approval: `@react-pdf/renderer` (current audit version 4.5.1, MIT, 13 direct dependencies per npm metadata). Before installation, confirm its resolved React 19/Node compatibility in this repository and inspect the lockfile diff. If that validation fails, stop and reassess PDFKit rather than adding browser automation.

## 4. Runtime and performance posture

- Next.js route handlers use the Node runtime by default, but the PDF download route and renderer should explicitly declare/assume Node runtime and never Edge runtime.
- Generate only for an explicit download or inside send/resend. Do not import the renderer into the workspace page's normal render path; keep it behind server-only modules/dynamic boundaries if bundling requires it.
- Render to an in-memory buffer. No filesystem, storage bucket, persistent artifact, public URL, or PDF preload is required.
- Fetch logo bytes at most once per generation with a short timeout, content-type/size validation, and safe fallback. Avoid unbounded remote reads.
- Reject unexpectedly large output before provider submission and preserve Resend's 40 MB encoded-email limit with a much smaller application guard appropriate to invoice documents.
- Log only safe stage, invoice/account IDs internally, duration, byte count, and error class. Never log PDF/base64 contents or full provider payloads.

## 5. Schema decision

No schema change is required or recommended. `notifications.payload` and existing invoice event metadata can store all required attachment facts. Any discovery during implementation that invalidates this must trigger a new approval gate before a migration is created.

## 6. Proposed implementation files by slice

Exact names may be adjusted to repository conventions during implementation, but scope should remain narrow.

### Slice B — document foundation

- Add `lib/business/internal-invoice-document.ts`: canonical document view-model types, filename sanitization, and mapping from already-scoped invoice/job/payment/tenant inputs.
- Add `lib/pdf/internal-invoice-pdf.tsx`: server-only React PDF document and buffer/attachment builder.
- Add focused tests under `lib/business/__tests__/` and `lib/pdf/__tests__/`.
- Refactor `app/jobs/[id]/invoice/print/page.tsx` to consume the shared document view model while preserving its route and browser print behavior.

### Slice C — download

- Add `app/jobs/[id]/invoice/pdf/route.ts` (or the repository-consistent internal route name) with explicit auth, account scope, invoice capability, and Node runtime.
- Add `Download PDF` to `app/jobs/[id]/invoice/page.tsx`; retain the existing print route and relabel its action to `Print Invoice` if approved.
- Add route/wiring and scope-hardening tests.

### Slice D — email attachment

- Extend `lib/email/sendEmail.ts` with provider-neutral attachment input and Resend translation.
- In `deliverInternalInvoiceEmailForContext`, build the PDF attachment before provider send and pass exactly one PDF attachment for both first send and resend.
- Keep the premium HTML/text and payment-link code unchanged.
- Add provider payload, initial send, resend, compound issue/send, failure, and access-order tests.

### Slice E — history and observability

- Extend notification payload writes and `lib/business/internal-invoice-delivery.ts` normalization with attachment facts.
- Add a small `PDF attached` indicator to existing workspace history only.
- Store no binary/base64 content.

### Slice F — validation and closeout

- Focused PDF, email delivery, send/resend, scope-hardening, financial-access, and workspace wiring tests.
- TypeScript, relevant ESLint, `git diff --check`, and the prompt's manual content/download/email/security matrix.
- Update this plan with evidence, risks, commits, and closeout. Do not push without approval.

## 7. Test plan

- View model: canonical fields, frozen line items/totals, payment summary, missing optional fields, safe branding fallback, long content, no internal IDs in customer-facing fields, and no email-shell fields.
- Filename: normal reference, unsafe characters, whitespace/control characters, length cap, Unicode posture, missing reference fallback without exposing UUIDs.
- Renderer: `%PDF-` signature, non-empty output, many lines/multiple pages, long descriptions, missing logo, logo failure, no provider call.
- Download: authenticated same-account success; invoice/job mismatch and cross-account denial before renderer; contractor/unauthenticated denial; missing invoice; headers; renderer failure; no mutations/provider calls.
- Provider: attachment bytes and filename delivered through the abstraction; HTML/text preserved; provider errors propagated.
- Send/resend: one current PDF per attempt; correct attempt kind; attachment generated before provider call; generation failure prevents provider call and successful history; provider rejection remains failed; success records provider message ID and attachment metadata; payment link remains in HTML/text.
- Compatibility: historical delivery rows without attachment fields; existing print route; issue-only action; payment, Stripe, QBO, closeout, and job mutation boundaries.

Existing test conventions to extend include `lib/actions/__tests__/internal-invoice-scope-hardening.test.ts`, `internal-invoice-issue-and-send-actions.test.ts`, `internal-invoice-email-payment-link.test.ts`, `lib/email/__tests__/sendEmail.test.ts`, `lib/auth/__tests__/financial-access.test.ts`, business invoice/payment tests, and invoice workspace wiring tests under `lib/jobs/__tests__` and `app/jobs/[id]/invoice/__tests__`.

## 8. Risks and mitigations

- **Shared-view drift:** the current print JSX embeds mapping. Extract mapping first and test both consumers against it; do not attempt pixel-identical cross-renderer CSS reuse.
- **Logo fetch/runtime fragility:** bounded server fetch and display-name fallback; never make a remote logo a hidden send dependency.
- **React PDF compatibility/bundle size:** validate with a minimal render test and production build before deeper work; inspect dependency lock diff; keep renderer server-only.
- **Long tables/totals clipping:** repeated table header, non-wrapping totals block, controlled row wrapping, and explicit long/multi-page fixtures.
- **Issue-and-send partial state:** the existing compound action issues before delivery. A PDF/provider failure can therefore leave an honestly issued-but-unsent invoice, matching current provider-failure posture. Do not roll back invoice truth; show failed communication and retain resend.
- **Queued row on generation failure:** attachment generation should occur as the send precondition. Record an honest failed attempt (not queued/sent) through the existing notification/event model without calling the provider.
- **MIME inference:** maintain `application/pdf` in the domain attachment and metadata; validate PDF signature/filename before translating to Resend, whose attachment API accepts filename/content and derives transport MIME behavior.
- **No canonical due date/tax:** do not invent either. This is a product-model mismatch with the requested ideal document fields and is explicitly deferred unless separately approved.

## 9. Material deviations or conflicts with the request

1. The requested Active Spine is retired; current authority is `PROJECT_TRUTH.md` plus `CURRENT_ROADMAP.md`.
2. The repository currently calls the product EveryStep JobWorks, not EveryStep FieldWorks.
3. The existing internal invoice model has no due-date field and no explicit tax field. The PDF cannot truthfully show those as separate facts in V1 without a separate approved model change.
4. The workspace copy already says “send the invoice PDF,” but current sends do not attach a PDF. This is misleading current UI copy and should become true in Slice D.
5. Provider support exists in Resend, but the local abstraction does not expose it.
6. No permanent artifact or schema is needed.

## 10. Slice tracker

| Slice | Status | Gate / closeout |
| --- | --- | --- |
| A — repository and architecture audit | Complete | Stop for owner review; documentation-only change |
| B — canonical PDF document foundation | Complete | Shared model, renderer, print reuse, and focused validation complete; stop for owner review |
| C — download route and workspace action | Complete | Authenticated scoped route, workspace CTA, and focused validation complete |
| D — send/resend attachment | Complete | Shared delivery helper and provider abstraction now require one current PDF |
| E — history and observability | Complete | Existing payload metadata and compact backward-compatible UI indicator implemented |
| F — quality, smoke, docs, closeout | Complete for automated/local-safe scope | Controlled authenticated download and provider-backed recipient smoke remain operator-gated |

## 11. Slice A closeout

- Files changed: this working plan only.
- Application behavior changed: none.
- Schema/dependencies/environment/production changed: none.
- Validation: repository/document/code search and architecture trace; `git diff --check` to be recorded after this file is created.
- Remaining gate: owner approval of the shared view-model + `@react-pdf/renderer` strategy and proposed dependency before Slice B.

## 12. Slice B closeout

Date: 2026-07-19

### What changed

- Added `@react-pdf/renderer` 4.5.1 as the approved production dependency. The resolved package declares React 19 peer compatibility and all added React PDF packages in the lockfile are MIT-licensed.
- Added `lib/business/internal-invoice-document.ts` as the shared presentation boundary for invoice identity, billing recipient, service location, tenant branding, frozen line items/totals, collected-payment summary, balance, notes, currency/date labels, and safe PDF filenames.
- Added `lib/pdf/internal-invoice-pdf.tsx` as an in-memory, Node/server PDF renderer and provider-neutral attachment builder.
- Refactored the existing internal browser print route to consume the shared document model while preserving the route, toolbar, selected-invoice behavior, and existing print HTML.
- Updated the existing print wiring test to assert the new shared-model boundary instead of private mapping statements that intentionally moved out of the route.

### PDF behavior established

- Valid `%PDF-` byte buffers with US Letter layout.
- Repeating invoice header, table header, support footer, and deliberate page count.
- Long-description wrapping, row integrity, multi-page flow, and totals kept together.
- Tenant name/logo posture with bounded logo fetching: PNG/JPEG only, 3-second timeout, 2 MB maximum, and safe business-name fallback.
- Invoice-only document content. No premium email shell, payment button, provider call, storage write, or public URL.
- Filename format `Invoice-{invoice_number}.pdf` with Unicode normalization, unsafe/control-character removal, trailing-dot/space cleanup, and a 100-character invoice-number cap.

### Boundaries preserved

- No schema, Supabase, RLS, environment, Stripe, payment, allocation, job, closeout, QBO, portal, email-send, or provider behavior changed.
- Totals and balances come from the existing canonical invoice/payment inputs; the document model performs formatting only.
- No due date or explicit tax was invented because neither is canonical in the current invoice model.
- No PDF bytes, base64 bodies, artifacts, or paths are persisted.

### Validation

- Focused Vitest: 4 files, 20 tests passed, including canonical mapping, filename sanitization, missing optional fields, valid PDF signature, 45-line multi-page rendering, existing address behavior, and print-route wiring.
- `npx.cmd tsc --noEmit`: passed.
- Targeted ESLint: passed with no errors; one pre-existing/intentional `next/no-img-element` warning remains in the browser print page because it renders the signed tenant logo URL directly.
- Production `npm audit --omit=dev`: no advisory is attributed to `@react-pdf/renderer` or its subtree. Existing production advisories remain in Next, Nodemailer, Resend/Svix/UUID, PostCSS, and `ws`; they were not changed because dependency remediation is outside this slice.
- `git diff --check`: recorded in final Slice B verification.

### Remaining risks

- Real tenant logo rendering and visual page-break quality still require the later local/manual smoke matrix.
- The renderer is not yet reachable from a route or email flow; that is intentional until Slice C and Slice D approval.
- The current application dependency audit has unrelated existing advisories that should be handled in a separate dependency-maintenance lane.

### Next gate

Stop for owner review. Slice C may add the authenticated, same-account `Download PDF` route and workspace CTA only after approval.

## 13. Slice C closeout

Date: 2026-07-19

### What changed

- Added `GET /jobs/{jobId}/invoice/pdf?invoice_id={invoiceId}` at `app/jobs/[id]/invoice/pdf/route.ts`.
- Added a persistent `Download PDF` action to the internal invoice workspace and retained the existing browser print surface as `Print Invoice`.
- Added focused download-route and workspace-wiring tests.

### Access and failure posture

- The route is explicitly Node runtime, dynamic, private/no-store, and internal-only.
- Active internal authentication is required before account/invoice reads; unauthenticated requests receive 401 and non-internal/contractor/inactive actors receive 403.
- Same-account job scope is verified before invoice loading or PDF mapping/rendering.
- The selected invoice must match both the requested job and authenticated actor's `account_owner_user_id`; mismatches and missing records return the same safe 404 response.
- The account must retain `internal_invoicing` billing mode.
- Renderer failures return a safe actionable 500 response. Logs contain only account/job/invoice identifiers, stage, and error class—never PDF bytes or customer document content.

### Response contract

- `Content-Type: application/pdf`
- `Content-Disposition: attachment; filename="Invoice-{safe invoice number}.pdf"`
- Correct content length, `X-Content-Type-Options: nosniff`, and private no-store caching.
- PDF generation occurs only after the explicit request and creates no email/provider call or persistent artifact.

### Boundaries preserved

- Existing print route remains functional and linked.
- No invoice, line-item, payment, allocation, Stripe, job, closeout, event, notification, provider, QBO, portal, schema, storage, or environment mutation was added.
- Download access matches the existing internal invoice workspace read posture and does not expose the contractor printable route or signed public payment route.

### Validation

- Slice B/C focused run: 5 files, 22 tests passed.
- Scope/access regression run: 3 files, 99 tests passed (`internal-invoice-scope-hardening`, `financial-access`, and `field-billing-access`).
- `npx.cmd tsc --noEmit`: passed.
- Targeted ESLint for the new route and tests: passed.
- The full pre-existing invoice workspace file still reports its known `no-explicit-any` lint findings outside the two-link CTA edit; the CTA itself is covered by source-wiring tests.
- `git diff --check`: to be recorded immediately before commit.

### Remaining risks and next gate

- Manual authenticated browser download/open/visual smoke remains part of the later smoke matrix.
- Email remains unchanged and does not yet include the PDF.
- Stop for owner review. Slice D may extend the provider abstraction and shared send/resend flow only after approval.

## 14. Slice D closeout

Date: 2026-07-19

### What changed

- Extended `lib/email/sendEmail.ts` with a provider-neutral in-memory attachment contract (`filename`, `content`, `contentType`) and contained Resend translation inside the provider wrapper.
- Reused the canonical invoice-document model from the existing email build context, including the already scoped service-location label, current tenant branding, frozen invoice/line data, and current collected-payment summary.
- Integrated `buildInternalInvoicePdfAttachment` into the existing shared `deliverInternalInvoiceEmailForContext` path. Initial send, resend, and compound issue/send therefore use one implementation and each generate one current PDF.
- Added provider payload, initial attachment, resend regeneration, compound issue/send attachment, PDF-generation failure, and existing provider-failure coverage.

### Send and failure posture

- The PDF attachment is generated before the Resend provider call.
- The existing premium HTML body, text fallback, subject, recipient behavior, payment link/button, branding, and send/resend distinction remain intact.
- PDF-generation failure prevents the provider call, creates a failed—not sent—communication attempt, writes the existing failed invoice event with `pdf_generation_failed` classification, and returns the existing visible failure banner.
- Renderer exception details are not persisted; the stored internal error is the safe `Invoice PDF generation failed.` message.
- Provider rejection continues to mark the queued attempt failed and never records sent success.
- Compound issue/send retains existing truth: issue mutation occurs before communication delivery. A later PDF/provider failure leaves an honestly issued but unsent invoice available for retry; it does not roll back or falsify invoice state.

### Provider behavior

- Resend receives exactly one attachment with an in-memory Buffer and sanitized `.pdf` filename. Resend infers transport MIME from the PDF filename; the provider-neutral domain object retains `application/pdf` for validation and Slice E metadata.
- Existing callers without attachments remain backward compatible.
- No public URL, local filesystem path, storage object, PDF base64 metadata, or provider-specific type leaks into invoice business code.

### Boundaries preserved

- No schema, storage, RLS, environment, invoice-total, payment, allocation, Stripe, job, closeout, QBO, portal, SMS, automatic-send, or scheduling behavior changed.
- Cross-account denial still occurs before PDF generation and provider calls through the existing scoped send context; the 72-test invoice scope-hardening suite remains green.

### Validation

- Focused/regression Vitest: 6 files, 99 tests passed, covering provider abstraction, HTML/text/payment link preservation, initial send, resend, compound issue/send, generation failure, provider failure, canonical model, renderer, and scope hardening.
- `npx.cmd tsc --noEmit`: passed.
- Targeted ESLint for clean touched provider/model files: passed.
- The two pre-existing large invoice action test files retain their existing `no-explicit-any` lint findings in fixture plumbing; no new lint category was introduced.
- `git diff --check`: to be recorded immediately before commit.

### Remaining work and next gate

- Attachment facts are not yet projected into normalized delivery-history records or shown as `PDF attached`; that is Slice E.
- Manual provider-backed email/attachment smoke remains part of Slice F and must not send a real customer email without controlled smoke authorization.
- Stop for owner review. Slice E may add attachment metadata to existing notification/event payloads and a small backward-compatible history indicator after approval.

## 15. Slice E closeout

Date: 2026-07-19

### What changed

- Extended existing `notifications.payload` writes with safe attachment facts: `pdf_attached`, `attachment_filename`, `attachment_mime_type`, and `attachment_byte_size`.
- Added safe `failure_classification` values for `pdf_generation_failed` and `provider_delivery_failed`.
- Added the same safe attachment context to existing invoice send/resend/provider-failure job event metadata.
- Extended `lib/business/internal-invoice-delivery.ts` with backward-compatible normalized attachment fields.
- Added one compact `PDF attached` indicator to the existing invoice delivery-history card.

### Truth and storage posture

- Successful/queued/provider-attempted deliveries record `pdf_attached: true` only after an attachment was generated and prepared for the provider call.
- Generation failure records `pdf_attached: false`, a safe failure classification, and no filename/content facts that would imply an attachment existed.
- Provider failure preserves attachment context because the provider attempt included the generated attachment, while the overall delivery remains failed.
- No PDF bytes, base64 content, provider payload, signed URL, temporary path, or public URL is stored.
- Historical notification rows without attachment fields normalize to `pdfAttached: false` and render without the new badge.

### Schema decision

- No schema or migration was needed. Existing JSONB notification/event metadata safely carries the required facts.

### Validation

- Focused/regression Vitest: 7 files, 99 tests passed, including attachment metadata success, resend, generation failure, provider failure, no binary persistence, historical-row compatibility, UI wiring, provider abstraction, renderer, and the 72-test invoice scope-hardening suite.
- `npx.cmd tsc --noEmit`: passed.
- Targeted ESLint for the normalized delivery model and new tests: passed. The touched delivery model's prior `any` usage was removed.
- `git diff --check`: to be recorded immediately before commit.

### Remaining work and next gate

- Slice F remains: consolidated automated validation, controlled local/manual smoke where feasible, final documentation and boundary confirmation.
- No real customer email or production mutation is authorized by this closeout.
- Stop for owner review before Slice F.

## 16. Slice F quality, smoke, and closeout

Date: 2026-07-19

### Consolidated automated validation

- Invoice/PDF/email/payment/access regression run: 19 files, 268 tests passed.
- Covered PDF model/rendering, filename safety, download route scope/headers/failure, initial send, resend, compound issue/send, premium HTML/text and payment-link preservation, generation/provider failures, delivery metadata/history compatibility, invoice payments, payment allocations, financial access, field-billing access, print/workspace wiring, and same-account hardening.
- Additional local-safe PDF variant smoke: paid, partially paid, normal invoice, 45-line multi-page invoice, long descriptions/names/locations, missing optional billing fields, no logo, and failed remote-logo fallback all produced valid PDF buffers.
- Production `next build --webpack`: passed; Next registered `/jobs/[id]/invoice/pdf` as a dynamic server route and completed compilation, TypeScript, trace collection, and 98-page static generation.
- Sequential `npx.cmd tsc --noEmit`: passed. An earlier parallel build/typecheck attempt produced transient missing `.next/types` files because both processes mutated/read build output concurrently; sequential rerun proved the harness race and passed.
- Targeted ESLint across all new PDF model/renderer/provider/route/delivery modules and clean focused tests: passed.
- `git diff --check`: to be recorded immediately before closeout commit.

### Safe local smoke conclusions

- Download response contract is exercised without authentication bypass: valid PDF bytes, customer-safe filename, attachment disposition, private no-store caching, content length, and `nosniff`.
- Cross-account, missing invoice, unauthenticated, contractor/non-internal, disabled billing mode, and renderer-failure paths stop before document/provider work as applicable.
- Multi-page output is structurally confirmed with more than one PDF page; totals are held together and repeating document/table/footer elements are renderer-controlled.
- Email payload tests prove the premium HTML and text fallback remain present, the Pay Invoice link remains present when eligible, and exactly one current PDF buffer reaches the provider abstraction on initial send and resend.
- Failure tests prove generation failure makes no provider call and provider failure remains failed; neither path records false sent success or stores PDF content.

### Controlled smoke not falsely claimed

The following require an authenticated internal browser session, representative tenant invoices, and/or an explicitly controlled email recipient. They were not executed automatically because no safe test credentials/recipient were supplied and real customer/provider delivery was not authorized:

- Visual inspection of a downloaded PDF in a desktop PDF viewer and printed output.
- Real tenant logo rendering from its signed storage URL.
- Browser verification of the Download PDF and retained Print Invoice controls under owner/admin/billing/authorized field roles.
- Provider-backed initial send/resend with attachment opened from the received email and Resend delivery evidence checked.
- Human visual judgment of page breaks across representative real invoices.

These are operational confirmation items, not known code failures. Use only a designated test invoice and controlled recipient; do not send a live customer invoice merely to close smoke evidence.

### Final boundary confirmation

No change was made to invoice totals/calculation truth, payment rows/status/allocations, Stripe checkout or saved-card behavior, job/closeout state, work items, QBO sync/mapping, estimate/proposal behavior, customer/contractor portal exposure, SMS, schema/RLS, storage buckets, environment configuration, or production data. The browser print route remains intact. No PDF artifact is persisted.

### Implementation acceptance posture

The code implementation and automated/local-safe acceptance criteria are complete. Final operational acceptance should be recorded after the controlled authenticated download and provider-recipient smoke above. Until then, the feature is build-validated and test-complete but not claimed as live-provider human-smoke complete.
