# Contractor Experience and Payment Communications Closeout — July 2026

Status: FUNCTIONAL SCOPE COMPLETE; production smoke evidence pending normal post-deploy confirmation

## What shipped

1. Public signed invoice payment: `/payments/invoice/{token}` is unauthenticated, limited, balance-aware, explicit-action Stripe Checkout. Public return is `/payments/checkout-complete`.
2. Internal contractor management: `/ops/admin/contractors` is the searchable directory; `/contractors/{id}/edit` owns contractor details, billing/QBO identity, access, lifecycle, associated work, and contractor-billed financial history.
3. Payment communications: durable `internal_payment_email_deliveries` uniquely claims payment plus recipient. Manual and newly recorded Stripe payments trigger best-effort internal email after payment truth. Preview: `/ops/admin/payment-email-preview`.
4. Contractor invoice center: `/portal/invoices`, `/portal/invoices/{invoiceId}`, and `/portal/invoices/{invoiceId}/print` show only issued invoices frozen as billed to the authenticated contractor. Outstanding invoices reuse the signed guest payment rail.

## Source-of-truth and authorization locks

- `internal_invoice_payments` plus active allocations remain collected-money truth.
- Stripe webhook confirmation—not Checkout creation, redirect, or return—records online payment.
- Invoice `bill_to_kind` and `bill_to_contractor_id` authorize contractor financial visibility. Job `contractor_id` never does.
- Customer/homeowner invoices, other-contractor invoices, drafts, unrelated work, internal notes, staff references, and QBO detail are not contractor-visible.
- Email delivery failure never reverses payment. Duplicate webhook/payment processing cannot claim a second delivery to the same recipient.
- QBO remains optional downstream accounting synchronization.

## Operator destinations

| User | Destination | Purpose |
|---|---|---|
| Staff admin | `/ops/admin/contractors` | Search/create/open contractor records |
| Staff admin/office | `/contractors/{id}/edit` | Contractor profile, billing identity, access summary, lifecycle, internal financial history |
| Staff financial role | `/reports/invoices?contractor={id}` | Full contractor-billed invoice ledger |
| Staff admin | `/ops/admin/payment-email-preview` | Preview internal payment-received email; sends nothing |
| Contractor | `/portal` → Billing invoices | Portal entry point |
| Contractor | `/portal/invoices` | Strict contractor-billed invoice list |
| Contractor | `/portal/invoices/{invoiceId}` | Scoped invoice detail and payment action |
| Contractor | `/portal/invoices/{invoiceId}/print` | Scoped printable/PDF-friendly invoice |
| Any signed-link recipient | `/payments/invoice/{token}` | Limited guest invoice review and Stripe payment without signup |

## Commits

- `b0060596` — public invoice payment flow
- `7ed4799d` — contractor management modernization
- `84e0435c` — internal payment-received communications
- `bfd30a55` — internal contractor financial history
- `6107dc0e` — contractor invoice center

## Remaining deferred work

- Broad customer portal/client hub
- ACH
- Refund/dispute workflows
- Contractor saved-card self-service
- Broader recurring payment automation
- Automated customer receipt program beyond Stripe/provider behavior

## Closeout smoke

Use the July 2026 checklist at the top of [Compliance_Matters_Prelaunch_Confirmation_Checklist.md](./Compliance_Matters_Prelaunch_Confirmation_Checklist.md). Record production observations in the tactical evidence ledger; do not weaken authorization or payment truth to resolve presentation defects.
