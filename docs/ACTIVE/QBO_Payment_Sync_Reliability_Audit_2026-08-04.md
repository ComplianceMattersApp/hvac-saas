# QBO Payment Sync Reliability Audit

Date: August 4, 2026

Status: AUDIT COMPLETE — HARDENING DESIGN RECOMMENDED, NOT IMPLEMENTED

## Scope and current behavior

This audit covers QBO Payment synchronization after EveryStep has already established durable recorded-payment truth. It does not authorize or change Stripe processing, payment truth, invoice projections, allocations, permissions, customer workflows, production data, or QBO records.

Current runtime sequence:

1. Stripe or an authorized internal workflow confirms a payment.
2. EveryStep persists `internal_invoice_payments.payment_status = 'recorded'` and updates allocation/projection truth.
3. `autoSyncRecordedPaymentToQbo` invokes `syncPaymentToQbo` as a downstream, non-blocking operation.
4. `syncPaymentToQbo` exits successfully when `qbo_payment_id` is already present, resolves or creates the related QBO invoice when necessary, validates the live QBO invoice/customer/balance, creates a linked QBO Payment, and then persists `qbo_payment_id` and `qbo_sync_status = 'synced'`.
5. Failures are stored as `qbo_sync_status = 'failed'` with `qbo_sync_error` and are visible in the invoice workspace and Attention Center. An authorized operator can retry.

## Findings

### Provider idempotency

Intuit documents a `requestid` query parameter for write requests. Reusing the same unique request ID allows Intuit to recognize a retried request and return the original response instead of creating another entity. Intuit recommends request IDs for create, update, and delete operations and limits non-batch request IDs to 50 characters.

Official references:

- https://developer.intuit.com/app/developer/qbpayments/docs/learn/learn-basic-field-definitions
- https://developer.intuit.com/app/developer/qbo/docs/develop/troubleshooting/error-codes

The current EveryStep QBO client does not send `requestid`. `qboFetch` adds only `minorversion`, and `createQboPayment` posts directly to the `payment` endpoint. Therefore, the provider-success/local-persistence-failure window is not protected by provider idempotency.

### Existing duplicate protection

- Stripe event and payment identity dedupe prevents duplicate EveryStep payment truth.
- `internal_invoice_payments.qbo_payment_id` prevents ordinary retries after the external ID was persisted.
- A live QBO invoice balance check prevents applying an amount greater than the current QBO balance.
- No current code queries QBO for an EveryStep payment identity before creating a Payment.
- No durable QBO sync-attempt table exists.
- `PaymentRefNum` and `PrivateNote` contain useful EveryStep/processor references, but no automated duplicate detector queries or reconciles them.

### Failure and retry behavior

- QBO failures are non-blocking: Stripe/EveryStep payment truth remains recorded even when QBO fails.
- Pre-provider failures and explicit provider errors can generally be retried after connection, authorization, matching, or availability is repaired.
- Manual retry is safe when no QBO Payment was created or when `qbo_payment_id` was persisted.
- Manual retry is not provably safe after an ambiguous timeout, dropped response, or successful QBO creation followed by failure to persist `qbo_payment_id`.
- There is no automatic QBO Payment retry scheduler. Operator retry surfaces exist in the invoice workspace and Attention Center.
- Duplicate QBO Payments are not automatically detected. Operators may recognize duplicates through QBO records and EveryStep references, but that is not a reliable control.

## Confirmed reliability gap

The following sequence can create a duplicate accounting Payment:

1. EveryStep posts a QBO Payment without `requestid`.
2. QBO creates the Payment.
3. EveryStep does not receive the response, or the subsequent local `qbo_payment_id` update fails.
4. The EveryStep row remains failed/pending without an external ID.
5. An operator retries.
6. EveryStep posts a second create request, and QBO can create a second Payment.

The QBO balance preflight may reduce some full-payment duplicates because the first Payment can reduce the invoice balance to zero, but it is not sufficient idempotency. It is timing-dependent, does not recover the original external ID, and is weaker for partial payments or stale reads.

## Recommended implementation slice

Implement a focused **QBO Payment Sync Attempt + Provider Idempotency** slice:

1. Add `qbo_sync_attempts` with:
   - `account_owner_user_id`
   - `internal_invoice_id`
   - `internal_invoice_payment_id`
   - `sync_type` (`payment` initially)
   - `attempt_status` (`pending`, `provider_accepted`, `synced`, `failed`, `ambiguous`)
   - `external_provider` (`quickbooks_online`)
   - `provider_request_id`
   - `external_payment_id`
   - `attempt_count`
   - `last_error`
   - timestamps
2. Enforce one logical payment-sync identity with a unique constraint on `(external_provider, sync_type, internal_invoice_payment_id)`.
3. Derive and persist one deterministic QBO `requestid` per EveryStep payment, within Intuit's 50-character limit, and reuse it for every retry of that logical create request.
4. Extend `qboFetch`/`createQboPayment` to send `requestid` on Payment creation.
5. Before creating:
   - return the stored successful external ID when present;
   - inspect the durable attempt state;
   - reuse the same provider request ID for pending, failed, or ambiguous retries;
   - never generate a new request ID merely because an attempt is retried.
6. After provider success, persist the attempt's external Payment ID before/finally reconciling the existing payment sync columns. If the legacy-row update fails, a retry uses the same request ID and can recover the original provider response.
7. Treat network timeouts and unknown provider outcomes as `ambiguous`, not ordinary safe-to-recreate failures.
8. Preserve current operator visibility and add an explicit ambiguous/duplicate-risk state. Do not add automatic retry until the idempotent request flow is proven in the QBO sandbox.

## Required validation for that future slice

- Stripe Checkout recorded payment creates exactly one QBO Payment.
- Saved-card/manual PaymentIntent recorded payment creates exactly one QBO Payment.
- Scheduled-autopay recorded payment creates exactly one QBO Payment.
- Authorized manual/off-platform recorded payment creates exactly one QBO Payment.
- Repeating the same provider request ID after a simulated lost response returns/reconciles the original Payment rather than creating another.
- Simulated QBO success followed by local persistence failure safely recovers the original external Payment ID.
- QBO unavailable and authorization-expired paths remain non-blocking and operator-visible.
- Partial and full payments preserve QBO balance/application behavior.
- Refunds, disputes, and reversals remain explicitly outside the slice.

## Decision

Do not enable automatic QBO Payment retries until deterministic provider request IDs and durable attempt state are implemented and verified. The existing manual retry remains useful but carries a narrow duplicate risk after an ambiguous provider outcome.
