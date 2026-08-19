import Stripe from "stripe";

import { listQboInvoicesSince, listQboPaymentsSince } from "@/lib/qbo/qbo-api-client";
import { getValidQboAccessToken } from "@/lib/qbo/qbo-connection";
import { getQboAvailability, getQboBaseUrl } from "@/lib/qbo/qbo-env";
import { getStripeServerClient } from "@/lib/business/platform-billing-stripe";
import { isMissingInvoiceTaxColumnError } from "@/lib/invoices/invoice-tax-state";
import { resolveTenantStripeConnectReadiness } from "@/lib/business/tenant-stripe-connect-readiness";

/**
 * Three-way reconciliation: EveryStep vs QuickBooks vs Stripe.
 *
 * Every other control in this app is driven by EveryStep's own state — they
 * report on actions the app took. That leaves them blind to anything originating
 * outside: an invoice edited or deleted in QuickBooks, a Stripe charge whose
 * metadata never matched, a write we believed succeeded but did not. A QBO void
 * drifted for six days precisely because the only detector was a person happening
 * to look.
 *
 * Two properties make this useful, and both are easy to lose:
 *
 *  1. INDEPENDENCE. It must not read through the sync engine or reuse its
 *     eligibility rules, or it inherits whatever assumption is broken and
 *     confirms the bug instead of finding it. It compares raw external state
 *     against raw EveryStep state.
 *  2. REPORT-ONLY. It never writes to invoices or payments. A detector that also
 *     corrects can mask its own failures, and an unattended nightly job with
 *     write access to accounting is a bad trade.
 */

export type ReconciliationFinding = {
  findingType: string;
  severity: "critical" | "warning";
  subjectKind: "invoice" | "payment";
  subjectId: string | null;
  externalSystem: "quickbooks" | "stripe";
  externalId: string | null;
  title: string;
  detail: string;
  truth: string;
  everystepValue: string | null;
  externalValue: string | null;
  amountCents: number | null;
  jobId: string | null;
};

export type ReconciliationRunResult = {
  accountOwnerUserId: string;
  windowDays: number;
  checkedInvoices: number;
  checkedPayments: number;
  findings: ReconciliationFinding[];
  /** Comparisons that could not run (no connection, provider error). */
  skipped: string[];
  /** Exact subjects observed this run; only these may auto-resolve old findings. */
  evaluated: {
    qboInvoiceSubjectIds: string[];
    qboPaymentSubjectIds: string[];
    qboForeignPaymentIds: string[];
    stripePaymentSubjectIds: string[];
    stripeChargeIds: string[];
  };
};

const clean = (value: unknown) => String(value ?? "").trim();
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
/** QBO reports dollars as floats; compare in cents. */
const toCents = (amount: unknown) => Math.round(Number(amount ?? 0) * 100);

function windowStartIso(windowDays: number): string {
  return new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Compare EveryStep invoices against QuickBooks.
 *
 * Deliberately does NOT re-implement sync eligibility. It asks only about
 * invoices EveryStep already claims it pushed, because those are the ones where
 * a claim can be false. Whether an unpushed invoice *should* have synced is the
 * sync engine's business, and duplicating that judgement here would just mirror
 * its bugs.
 */
function reconcileInvoices(params: {
  invoices: any[];
  qboInvoices: Awaited<ReturnType<typeof listQboInvoicesSince>>;
}): ReconciliationFinding[] {
  const findings: ReconciliationFinding[] = [];
  const qboById = new Map(params.qboInvoices.map((invoice) => [invoice.id, invoice]));

  for (const invoice of params.invoices) {
    const qboInvoiceId = clean(invoice.qbo_invoice_id);
    if (!qboInvoiceId) continue;

    const label = clean(invoice.invoice_display_number) || clean(invoice.invoice_number) || clean(invoice.id);
    const status = clean(invoice.status).toLowerCase();
    const qboInvoice = qboById.get(qboInvoiceId);
    const base = {
      severity: "critical" as const,
      subjectKind: "invoice" as const,
      subjectId: clean(invoice.id),
      externalSystem: "quickbooks" as const,
      externalId: qboInvoiceId,
      amountCents: Number(invoice.total_cents ?? 0),
      jobId: clean(invoice.job_id) || null,
    };

    if (!qboInvoice) {
      findings.push({
        ...base,
        findingType: "invoice_missing_in_qbo",
        title: `QuickBooks has no invoice ${label}`,
        detail: `EveryStep recorded this as synced to QuickBooks invoice ${qboInvoiceId}, but no such invoice exists there now.`,
        truth: "It was deleted in QuickBooks, or the sync never actually landed. QuickBooks is missing revenue EveryStep believes it has.",
        everystepValue: `synced, ${money(Number(invoice.total_cents ?? 0))}`,
        externalValue: "not found",
      });
      continue;
    }

    const qboDocNumber = clean(qboInvoice.docNumber);
    if (qboDocNumber && qboDocNumber !== label) {
      findings.push({
        ...base,
        findingType: "invoice_number_mismatch",
        severity: "warning",
        title: `Invoice number mismatch · EveryStep ${label}, QuickBooks ${qboDocNumber}`,
        detail: `EveryStep invoice ${label} is linked by QuickBooks ID to document number ${qboDocNumber}.`,
        truth: "These are the same linked invoice under two visible numbers. The QuickBooks document may have been renumbered or the wrong QuickBooks invoice may be linked.",
        everystepValue: label,
        externalValue: qboDocNumber,
      });
    }

    if (status === "void" && !qboInvoice.looksVoided) {
      findings.push({
        ...base,
        findingType: "voided_invoice_open_in_qbo",
        title: `QuickBooks still shows voided invoice ${label} as open`,
        detail: `EveryStep voided this invoice. QuickBooks shows a total of ${money(toCents(qboInvoice.totalAmount))}.`,
        truth: "QuickBooks is counting revenue for an invoice that no longer exists in EveryStep, overstating income and A/R.",
        everystepValue: "void",
        externalValue: `open, ${money(toCents(qboInvoice.totalAmount))}`,
      });
      continue;
    }

    if (status !== "void" && !qboInvoice.looksVoided) {
      // Compare PRE-TAX. Each side computes its own tax (we send taxability,
      // QuickBooks applies its rate), so including tax here would report a
      // rate disagreement as "the totals disagree" — a critical finding for
      // something that is really the warning-level tax parity check below.
      const everystepCents = Number(invoice.total_cents ?? 0) - (Number(invoice.tax_cents ?? 0) || 0);
      const qboCents = toCents(qboInvoice.totalAmount) - toCents(qboInvoice.totalTax);
      if (everystepCents !== qboCents) {
        findings.push({
          ...base,
          findingType: "invoice_total_mismatch",
          title: `Invoice ${label} totals disagree`,
          detail: `EveryStep has ${money(everystepCents)} before tax; QuickBooks has ${money(qboCents)} before tax.`,
          truth: "One of the two has been edited since the sync. The books do not agree on what this customer was billed.",
          everystepValue: money(everystepCents),
          externalValue: money(qboCents),
        });
      }
    }

    // Tax parity. We send per-line TAX/NON and let QuickBooks compute the
    // amount from its own rates, so the two can legitimately disagree — a
    // different rate, a jurisdiction QBO resolves differently, Automated Sales
    // Tax. That is a bookkeeping question for a human, NOT a sync failure: it
    // never touches qbo_sync_status and never un-syncs an invoice. Reported as
    // a warning so it is visible without competing with real drift.
    if (status !== "void" && !qboInvoice.looksVoided) {
      const everystepTaxCents = Number(invoice.tax_cents ?? 0) || 0;
      const qboTaxCents = toCents(qboInvoice.totalTax);
      if (Math.abs(everystepTaxCents - qboTaxCents) > 1) {
        findings.push({
          ...base,
          findingType: "qbo_tax_mismatch",
          severity: "warning",
          title: `Sales tax differs on invoice ${label}`,
          detail: `EveryStep computed ${money(everystepTaxCents)} tax; QuickBooks computed ${money(qboTaxCents)}.`,
          truth:
            "EveryStep sends which lines are taxable and QuickBooks applies its own rate, so the two can disagree. "
            + "The customer was billed EveryStep's amount; QuickBooks will report its own. Payment application in "
            + "QuickBooks may be over or under by the difference until the rates are reconciled.",
          everystepValue: money(everystepTaxCents),
          externalValue: money(qboTaxCents),
        });
      }
    }

    if (status !== "void" && qboInvoice.looksVoided) {
      findings.push({
        ...base,
        findingType: "invoice_voided_only_in_qbo",
        title: `Invoice ${label} was voided in QuickBooks only`,
        detail: "QuickBooks shows this invoice zeroed out, but EveryStep still treats it as live.",
        truth: "Someone voided it directly in QuickBooks. EveryStep may still be chasing payment on an invoice the books have written off.",
        everystepValue: status,
        externalValue: "voided",
      });
    }
  }

  return findings;
}

/** Compare EveryStep payments against QuickBooks. */
function reconcilePaymentsAgainstQbo(params: {
  payments: any[];
  qboPayments: Awaited<ReturnType<typeof listQboPaymentsSince>>;
  invoiceLabels: Map<string, string>;
}): ReconciliationFinding[] {
  const findings: ReconciliationFinding[] = [];
  const qboPaymentsById = new Map(params.qboPayments.map((payment) => [payment.id, payment]));
  const qboPaymentIds = new Set(qboPaymentsById.keys());

  for (const payment of params.payments) {
    const qboPaymentId = clean(payment.qbo_payment_id);
    const status = clean(payment.payment_status).toLowerCase();
    const label = params.invoiceLabels.get(clean(payment.invoice_id)) ?? clean(payment.invoice_id);
    const base = {
      severity: "critical" as const,
      subjectKind: "payment" as const,
      subjectId: clean(payment.id),
      externalSystem: "quickbooks" as const,
      externalId: qboPaymentId || null,
      amountCents: Number(payment.amount_cents ?? 0),
      jobId: clean(payment.job_id) || null,
    };

    if (!qboPaymentId) continue;

    if (status === "reversed" && qboPaymentIds.has(qboPaymentId)) {
      findings.push({
        ...base,
        findingType: "reversed_payment_present_in_qbo",
        title: `QuickBooks still holds a reversed payment on invoice ${label}`,
        detail: `EveryStep reversed ${money(Number(payment.amount_cents ?? 0))}, but QuickBooks payment ${qboPaymentId} is still there.`,
        truth: "The money was refunded or lost to a dispute. QuickBooks still counts it as received, overstating revenue.",
        everystepValue: "reversed",
        externalValue: "present",
      });
      continue;
    }

    if (status === "recorded" && !qboPaymentIds.has(qboPaymentId)) {
      findings.push({
        ...base,
        findingType: "payment_missing_in_qbo",
        title: `QuickBooks has no payment for invoice ${label}`,
        detail: `EveryStep recorded ${money(Number(payment.amount_cents ?? 0))} as synced to QuickBooks payment ${qboPaymentId}, which no longer exists there.`,
        truth: "Collected money is missing from the books. The invoice will look unpaid in QuickBooks.",
        everystepValue: `recorded, ${money(Number(payment.amount_cents ?? 0))}`,
        externalValue: "not found",
      });
      continue;
    }

    if (status === "recorded") {
      const qboPayment = qboPaymentsById.get(qboPaymentId);
      if (!qboPayment) continue;
      const everystepCents = Number(payment.amount_cents ?? 0);
      const expectedQboInvoiceId = clean(payment.qbo_invoice_id);
      const linkedToExpectedInvoice = qboPayment.linkedInvoiceIds.includes(expectedQboInvoiceId);
      const appliedDollars = qboPayment.appliedAmountByInvoiceId?.[expectedQboInvoiceId]
        ?? (qboPayment.linkedInvoiceIds.length === 1 && linkedToExpectedInvoice ? qboPayment.totalAmount : 0);
      const qboAppliedCents = toCents(appliedDollars);
      if (everystepCents !== qboAppliedCents || !linkedToExpectedInvoice) {
        const allocationDescription = linkedToExpectedInvoice
          ? "the expected invoice"
          : qboPayment.linkedInvoiceIds.length === 0
            ? "no invoice"
            : "a different invoice";
        findings.push({
          ...base,
          findingType: "payment_allocation_mismatch",
          title: `Payment received — QuickBooks allocation needs repair · invoice ${label}`,
          detail: `EveryStep recorded ${money(everystepCents)} as collected against this invoice. QuickBooks payment ${qboPaymentId} still exists for ${money(toCents(qboPayment.totalAmount))}, but applies ${money(qboAppliedCents)} here and is linked to ${allocationDescription}.`,
          truth: "The customer payment is recorded. This is a QuickBooks accounting allocation problem, not a failed or missing customer payment.",
          everystepValue: `${money(everystepCents)}, invoice ${label}`,
          externalValue: `${money(qboAppliedCents)} applied, ${qboPayment.linkedInvoiceIds.join(", ") || "no linked invoice"}`,
        });
      }
    }
  }

  return findings;
}

/**
 * QuickBooks payments applied to our invoices that EveryStep never recorded —
 * a customer paying through QuickBooks' own portal, or a bookkeeper keying a
 * payment there. Every other payment check starts from an EveryStep row, so
 * without this the QBO collection channel is invisible: the app keeps showing
 * a balance due and can double-collect from a customer who already paid.
 */
function reconcileForeignQboPayments(params: {
  invoices: any[];
  payments: any[];
  qboPayments: Awaited<ReturnType<typeof listQboPaymentsSince>>;
  invoiceLabels: Map<string, string>;
}): ReconciliationFinding[] {
  const findings: ReconciliationFinding[] = [];
  const knownQboAllocations = new Set(
    params.payments
      .filter((payment) => clean(payment.qbo_payment_id) && clean(payment.qbo_invoice_id))
      .map((payment) => `${clean(payment.qbo_payment_id)}::${clean(payment.qbo_invoice_id)}`),
  );
  const invoiceByQboId = new Map<string, any>(
    params.invoices
      .filter((invoice) => clean(invoice.qbo_invoice_id))
      .map((invoice) => [clean(invoice.qbo_invoice_id), invoice]),
  );
  // Recorded EveryStep payments whose QBO push has not landed yet look exactly
  // like a foreign payment once a bookkeeper keys the same money in QBO — the
  // push's own adoption lane will link them. Suppress amount-matches so this
  // check only surfaces money EveryStep genuinely has no row for.
  const unpushedAmountsByInvoiceId = new Map<string, number[]>();
  for (const payment of params.payments) {
    if (clean(payment.qbo_payment_id)) continue;
    if (clean(payment.payment_status).toLowerCase() !== "recorded") continue;
    const invoiceId = clean(payment.invoice_id);
    const amounts = unpushedAmountsByInvoiceId.get(invoiceId) ?? [];
    amounts.push(Number(payment.amount_cents ?? 0));
    unpushedAmountsByInvoiceId.set(invoiceId, amounts);
  }

  for (const qboPayment of params.qboPayments) {
    for (const linkedInvoiceId of qboPayment.linkedInvoiceIds) {
      if (knownQboAllocations.has(`${clean(qboPayment.id)}::${clean(linkedInvoiceId)}`)) continue;
      const invoice = invoiceByQboId.get(clean(linkedInvoiceId));
      if (!invoice) continue; // applied to a QBO-only document — not ours to judge
      // A voided EveryStep invoice with QBO money on it is already screaming
      // through voided_invoice_open_in_qbo; adoption could not record onto it.
      if (clean(invoice.status).toLowerCase() !== "issued") continue;

      const appliedCents = toCents(
        qboPayment.appliedAmountByInvoiceId?.[clean(linkedInvoiceId)]
          ?? (qboPayment.linkedInvoiceIds.length === 1 ? qboPayment.totalAmount : 0),
      );
      if (appliedCents <= 0) continue;
      if ((unpushedAmountsByInvoiceId.get(clean(invoice.id)) ?? []).includes(appliedCents)) continue;

      const label = params.invoiceLabels.get(clean(invoice.id)) ?? clean(invoice.id);
      findings.push({
        findingType: "qbo_payment_unrecorded",
        severity: "critical",
        subjectKind: "invoice",
        subjectId: clean(invoice.id),
        externalSystem: "quickbooks",
        externalId: clean(qboPayment.id),
        title: `QuickBooks holds a payment EveryStep never recorded · invoice ${label}`,
        detail: `QuickBooks payment ${qboPayment.id} applies ${money(appliedCents)} to this invoice (payment total ${money(toCents(qboPayment.totalAmount))}${qboPayment.txnDate ? `, dated ${qboPayment.txnDate}` : ""}). EveryStep has no payment with this QuickBooks id.`,
        truth: "Money was collected through QuickBooks. EveryStep still shows a balance due and could double-collect — adopt the payment into EveryStep or reconcile it in QuickBooks.",
        everystepValue: "no payment recorded",
        externalValue: `${money(appliedCents)} applied`,
        amountCents: appliedCents,
        jobId: clean(invoice.job_id) || null,
      });
    }
  }

  return findings;
}

/**
 * Detect duplicate Stripe identity inside EveryStep itself.
 *
 * This check intentionally does not depend on Stripe being reachable. A remote
 * comparison cannot expose a duplicated local row when both copies point to the
 * same valid Charge, and that is exactly the failure mode that can make one
 * customer payment count twice. Database guards stop new races; this detector
 * makes retained/imported corruption visible until it is explicitly repaired.
 */
function reconcileDuplicateStripePaymentIdentities(params: {
  payments: any[];
  invoiceLabels: Map<string, string>;
}): ReconciliationFinding[] {
  const findings: ReconciliationFinding[] = [];
  const emittedRowSets = new Set<string>();
  const stripePayments = params.payments.filter((payment) => (
    clean(payment.processor_name).toLowerCase() === "stripe"
    || clean(payment.payment_method) === "card_stripe_online"
    || Boolean(clean(payment.stripe_payment_intent_id))
    || Boolean(clean(payment.stripe_checkout_session_id))
    || /^(ch|py)_/.test(clean(payment.processor_charge_id))
  ));

  const identities = [
    {
      kind: "Charge",
      column: "processor_charge_id",
      include: (_payment: any) => true,
    },
    {
      kind: "PaymentIntent",
      column: "stripe_payment_intent_id",
      include: (payment: any) => clean(payment.payment_status).toLowerCase() !== "failed",
    },
    {
      kind: "Checkout Session",
      column: "stripe_checkout_session_id",
      include: (payment: any) => clean(payment.payment_status).toLowerCase() !== "failed",
    },
  ] as const;

  for (const identity of identities) {
    const groups = new Map<string, any[]>();
    for (const payment of stripePayments) {
      if (!identity.include(payment)) continue;
      const externalId = clean(payment[identity.column]);
      if (!externalId) continue;
      const group = groups.get(externalId) ?? [];
      group.push(payment);
      groups.set(externalId, group);
    }

    for (const [externalId, group] of groups.entries()) {
      if (group.length < 2) continue;
      const ordered = [...group].sort((left, right) => clean(left.id).localeCompare(clean(right.id)));
      const rowSet = ordered.map((payment) => clean(payment.id)).join("::");
      if (emittedRowSets.has(rowSet)) continue;
      emittedRowSets.add(rowSet);

      const invoiceNames = [...new Set(ordered.map((payment) => (
        params.invoiceLabels.get(clean(payment.invoice_id)) ?? clean(payment.invoice_id)
      )).filter(Boolean))];
      const statuses = [...new Set(ordered.map((payment) => clean(payment.payment_status)).filter(Boolean))];
      const subject = ordered[0];
      const label = invoiceNames.join(", ") || "unknown invoice";

      findings.push({
        findingType: "stripe_payment_identity_duplicate",
        severity: "critical",
        subjectKind: "payment",
        subjectId: clean(subject.id) || null,
        externalSystem: "stripe",
        externalId,
        title: `Stripe payment is recorded more than once - invoice ${label}`,
        detail: `EveryStep has ${ordered.length} payment rows tied to Stripe ${identity.kind} ${externalId}.`,
        truth: "Stripe identifies one payment or attempt, but EveryStep has multiple ledger rows for it. Do not collect again or delete evidence; reconcile the duplicate rows so the invoice and financial reports count the money once.",
        everystepValue: `${ordered.length} rows (${statuses.join(", ") || "unknown status"})`,
        externalValue: `one ${identity.kind} identity`,
        amountCents: Math.max(...ordered.map((payment) => Number(payment.amount_cents ?? 0) || 0)),
        jobId: clean(subject.job_id) || null,
      });
    }
  }

  return findings;
}

/**
 * Compare EveryStep payments against Stripe.
 *
 * The reverse direction is the point: Stripe charges carrying one of our
 * invoice ids that EveryStep has no payment for. Nothing else in the app can see
 * that, because every other check starts from an EveryStep row.
 */
function reconcileAgainstStripe(params: {
  payments: any[];
  charges: Stripe.Charge[];
  invoiceLabels: Map<string, string>;
  qboInvoiceLabels?: Map<string, string>;
}): ReconciliationFinding[] {
  const findings: ReconciliationFinding[] = [];
  const chargeById = new Map(params.charges.map((charge) => [clean(charge.id), charge]));
  const chargeByPaymentIntentId = new Map(
    params.charges
      .map((charge) => {
        const intentId = typeof charge.payment_intent === "string"
          ? clean(charge.payment_intent)
          : clean(charge.payment_intent?.id);
        return [intentId, charge] as const;
      })
      .filter(([intentId]) => Boolean(intentId)),
  );

  const knownChargeIds = new Set<string>();
  for (const payment of params.payments) {
    for (const column of ["processor_charge_id", "processor_payment_reference", "stripe_payment_intent_id"]) {
      const value = clean(payment[column]);
      if (value) knownChargeIds.add(value);
    }
  }

  for (const payment of params.payments) {
    if (clean(payment.payment_status).toLowerCase() !== "recorded") continue;
    const storedChargeId = clean(payment.processor_charge_id);
    const storedPaymentIntentId = clean(payment.stripe_payment_intent_id);
    if (!storedChargeId && !storedPaymentIntentId) continue;
    const charge = chargeById.get(storedChargeId) ?? chargeByPaymentIntentId.get(storedPaymentIntentId);
    if (!charge) continue; // Outside the window or a different account — not evidence of anything.

    const chargeId = clean(charge.id);
    const label = params.invoiceLabels.get(clean(payment.invoice_id)) ?? clean(payment.invoice_id);
    const refundedCents = Number(charge.amount_refunded ?? 0);
    const everyStepRefundedCents = Number(payment.stripe_refunded_amount_cents ?? 0);
    const base = {
      severity: "critical" as const,
      subjectKind: "payment" as const,
      subjectId: clean(payment.id),
      externalSystem: "stripe" as const,
      externalId: chargeId,
      amountCents: Number(payment.amount_cents ?? 0),
      jobId: clean(payment.job_id) || null,
    };

    // A matching external id alone is not reconciliation. Verify the financial
    // facts Stripe says that id represents: amount, invoice metadata, state,
    // currency, and PaymentIntent identity.
    const chargeInvoiceId = clean(charge.metadata?.invoice_id);
    const chargePaymentIntentId = typeof charge.payment_intent === "string"
      ? clean(charge.payment_intent)
      : clean(charge.payment_intent?.id);
    const stripeDisagreements = [
      Number(charge.amount ?? 0) !== Number(payment.amount_cents ?? 0)
        ? `amount ${money(Number(charge.amount ?? 0))} vs ${money(Number(payment.amount_cents ?? 0))}`
        : null,
      chargeInvoiceId && chargeInvoiceId !== clean(payment.invoice_id)
        ? `invoice metadata ${chargeInvoiceId} vs ${clean(payment.invoice_id)}`
        : null,
      clean(charge.status) && clean(charge.status) !== "succeeded"
        ? `status ${clean(charge.status)}`
        : null,
      charge.paid === false ? "not paid" : null,
      clean(charge.currency) && clean(charge.currency).toLowerCase() !== "usd"
        ? `currency ${clean(charge.currency).toUpperCase()}`
        : null,
      storedPaymentIntentId && chargePaymentIntentId && storedPaymentIntentId !== chargePaymentIntentId
        ? `PaymentIntent ${chargePaymentIntentId} vs ${storedPaymentIntentId}`
        : null,
    ].filter((value): value is string => Boolean(value));
    if (stripeDisagreements.length > 0) {
      findings.push({
        ...base,
        findingType: "stripe_payment_record_mismatch",
        title: `Payment record disagrees with Stripe · invoice ${label}`,
        detail: `EveryStep's recorded payment is linked to Stripe charge ${chargeId}, but ${stripeDisagreements.join("; ")}.`,
        truth: "Do not collect again. Verify the customer-facing payment state in Stripe before changing this record or invoice.",
        everystepValue: `${money(Number(payment.amount_cents ?? 0))}, invoice ${label}, recorded`,
        externalValue: `${money(Number(charge.amount ?? 0))}, ${clean(charge.status) || "unknown status"}`,
      });
      continue;
    }

    if (refundedCents !== everyStepRefundedCents) {
      findings.push({
        ...base,
        findingType: "stripe_refund_not_reflected",
        title: `Stripe refunded a payment EveryStep still counts · invoice ${label}`,
        detail: `Stripe shows ${money(refundedCents)} refunded on charge ${chargeId}; EveryStep still has the payment recorded.`,
        truth: "The refund projection does not match Stripe's cumulative money-out total, so the open invoice balance may be wrong.",
        everystepValue: `recorded, refunded ${money(everyStepRefundedCents)}`,
        externalValue: `refunded ${money(refundedCents)}`,
      });
      continue;
    }

    // A matching partial refund is reflected correctly in EveryStep. It still
    // surfaces in Needs Attention for the separate QBO/accounting adjustment,
    // but it is not a Stripe reconciliation discrepancy.
    if (refundedCents > 0) continue;

    if (charge.disputed) {
      findings.push({
        ...base,
        findingType: "stripe_dispute_not_reflected",
        title: `Stripe shows a dispute EveryStep does not know about · invoice ${label}`,
        detail: `Charge ${chargeId} is disputed in Stripe.`,
        truth: "A chargeback is running against money this app still counts as settled.",
        everystepValue: clean(payment.dispute_status) || "no dispute recorded",
        externalValue: "disputed",
      });
    }
  }

  // Money Stripe has that EveryStep never recorded.
  for (const charge of params.charges) {
    if (charge.status !== "succeeded" || charge.refunded) continue;
    const invoiceId = clean(charge.metadata?.invoice_id);
    if (!invoiceId) continue; // Platform/subscription charges are not invoice money.
    const chargeId = clean(charge.id);
    const paymentIntentId = typeof charge.payment_intent === "string" ? clean(charge.payment_intent) : clean(charge.payment_intent?.id);
    if (knownChargeIds.has(chargeId) || (paymentIntentId && knownChargeIds.has(paymentIntentId))) continue;
    const everystepLabel = params.invoiceLabels.get(invoiceId) ?? invoiceId;
    const qboLabel = params.qboInvoiceLabels?.get(invoiceId);
    const invoiceLabel = qboLabel && qboLabel !== everystepLabel
      ? `${everystepLabel} (QuickBooks ${qboLabel})`
      : everystepLabel;

    // A webhook or legacy payment path can record the money and invoice balance
    // but fail to persist the external Stripe identity. Do not call that "no
    // payment row": an operator might replay the event and double-record money.
    // Only classify it as an identity mismatch when one exact recorded payment
    // unambiguously matches this invoice and amount.
    const exactRecordedPayments = params.payments.filter((payment) =>
      clean(payment.invoice_id) === invoiceId
      && clean(payment.payment_status).toLowerCase() === "recorded"
      && Number(payment.amount_cents ?? 0) === Number(charge.amount ?? 0),
    );
    if (exactRecordedPayments.length === 1) {
      const payment = exactRecordedPayments[0];
      findings.push({
        findingType: "stripe_payment_identity_mismatch",
        severity: "warning",
        subjectKind: "payment",
        subjectId: clean(payment.id),
        externalSystem: "stripe",
        externalId: chargeId,
        title: `Stripe payment identity is not linked · invoice ${invoiceLabel}`,
        detail: `EveryStep already has a recorded ${money(Number(payment.amount_cents ?? 0))} payment for this invoice, but it is not linked to Stripe payment ${chargeId}.`,
        truth: "The invoice balance may already be correct in EveryStep and QuickBooks. Do not replay or record the payment again; repair the missing Stripe identity link after verification.",
        everystepValue: `recorded payment ${clean(payment.id)}, ${money(Number(payment.amount_cents ?? 0))}`,
        externalValue: `succeeded, ${money(Number(charge.amount ?? 0))}`,
        amountCents: Number(charge.amount ?? 0),
        jobId: clean(payment.job_id) || clean(charge.metadata?.job_id) || null,
      });
      continue;
    }

    findings.push({
      findingType: "stripe_charge_unrecorded",
      severity: "critical",
      subjectKind: "payment",
      // There is no EveryStep payment row to point at. Keep the related invoice
      // id so the attention center can open the correct invoice workspace.
      subjectId: invoiceId,
      externalSystem: "stripe",
      externalId: chargeId,
      title: `Stripe collected money EveryStep has no record of · invoice ${invoiceLabel}`,
      detail: `Charge ${chargeId} for ${money(Number(charge.amount ?? 0))} succeeded in Stripe with no matching payment in EveryStep.`,
      truth: "A customer was charged and this app never recorded it. The invoice still looks unpaid and the money is unreconciled.",
      everystepValue: "no payment row",
      externalValue: `succeeded, ${money(Number(charge.amount ?? 0))}`,
      amountCents: Number(charge.amount ?? 0),
      jobId: clean(charge.metadata?.job_id) || null,
    });
  }

  return findings;
}

export async function runThreeWayReconciliation(params: {
  admin: any;
  accountOwnerUserId: string;
  windowDays?: number;
  stripe?: Stripe;
}): Promise<ReconciliationRunResult> {
  const { admin } = params;
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  const windowDays = Number(params.windowDays ?? 90);
  const since = windowStartIso(windowDays);
  const sinceDate = since.slice(0, 10);
  const skipped: string[] = [];
  const findings: ReconciliationFinding[] = [];
  const evaluated: ReconciliationRunResult["evaluated"] = {
    qboInvoiceSubjectIds: [],
    qboPaymentSubjectIds: [],
    qboForeignPaymentIds: [],
    stripePaymentSubjectIds: [],
    stripeChargeIds: [],
  };
  const qboInvoiceLabels = new Map<string, string>();

  const { data: invoiceRows, error: invoiceError } = await admin
    .from("internal_invoices")
    .select("id, job_id, invoice_number, invoice_display_number, status, total_cents, tax_cents, qbo_invoice_id, invoice_date")
    .eq("account_owner_user_id", accountOwnerUserId)
    .gte("invoice_date", sinceDate)
    .limit(5000);
  let invoices: any[] = invoiceRows ?? [];
  if (invoiceError) {
    // tax_cents is additive; on a deployment without it, reconcile everything
    // else rather than going dark on the only external drift detector we have.
    if (!isMissingInvoiceTaxColumnError(invoiceError)) {
      throw new Error(`Failed to load invoices for reconciliation: ${invoiceError.message ?? "unknown error"}`);
    }
    const fallback = await admin
      .from("internal_invoices")
      .select("id, job_id, invoice_number, invoice_display_number, status, total_cents, qbo_invoice_id, invoice_date")
      .eq("account_owner_user_id", accountOwnerUserId)
      .gte("invoice_date", sinceDate)
      .limit(5000);
    if (fallback.error) {
      throw new Error(`Failed to load invoices for reconciliation: ${fallback.error.message ?? "unknown error"}`);
    }
    invoices = fallback.data ?? [];
  }

  const { data: paymentRows, error: paymentError } = await admin
    .from("internal_invoice_payments")
    .select("id, invoice_id, job_id, amount_cents, payment_status, payment_method, paid_at, processor_name, processor_charge_id, processor_payment_reference, stripe_checkout_session_id, stripe_payment_intent_id, stripe_identity_dedupe_scope, qbo_payment_id, dispute_status, stripe_refunded_amount_cents")
    .eq("account_owner_user_id", accountOwnerUserId)
    .gte("paid_at", since)
    .limit(5000);
  if (paymentError) throw new Error(`Failed to load payments for reconciliation: ${paymentError.message ?? "unknown error"}`);
  const payments: any[] = paymentRows ?? [];

  // Payment dates and invoice dates are independent. A current payment can
  // settle an invoice older than the reconciliation window; omitting that
  // invoice made the expected QBO invoice id blank and produced a false
  // allocation mismatch. Pull those referenced invoices only as context while
  // keeping the invoice-drift comparison itself bounded to the requested window.
  const loadedInvoiceIds = new Set(invoices.map((invoice) => clean(invoice.id)));
  const missingPaymentInvoiceIds = [...new Set(
    payments
      .map((payment) => clean(payment.invoice_id))
      .filter((invoiceId) => invoiceId && !loadedInvoiceIds.has(invoiceId)),
  )];
  let invoiceContexts = invoices;
  if (missingPaymentInvoiceIds.length > 0) {
    const { data: contextRows, error: contextError } = await admin
      .from("internal_invoices")
      .select("id, job_id, invoice_number, invoice_display_number, status, total_cents, qbo_invoice_id, invoice_date")
      .eq("account_owner_user_id", accountOwnerUserId)
      .in("id", missingPaymentInvoiceIds)
      .limit(5000);
    if (contextError) {
      throw new Error(`Failed to load payment invoice context: ${contextError.message ?? "unknown error"}`);
    }
    invoiceContexts = [...invoices, ...(contextRows ?? [])];
  }

  const qboInvoiceIdByInvoiceId = new Map<string, string>(
    invoiceContexts.map((invoice) => [clean(invoice.id), clean(invoice.qbo_invoice_id)]),
  );
  for (const payment of payments) {
    payment.qbo_invoice_id = qboInvoiceIdByInvoiceId.get(clean(payment.invoice_id)) ?? "";
  }

  const invoiceLabels = new Map<string, string>(
    invoiceContexts.map((invoice) => [
      clean(invoice.id),
      clean(invoice.invoice_display_number) || clean(invoice.invoice_number) || clean(invoice.id),
    ]),
  );

  findings.push(...reconcileDuplicateStripePaymentIdentities({ payments, invoiceLabels }));

  // --- QuickBooks ---------------------------------------------------------
  if (!getQboAvailability().available) {
    skipped.push("QuickBooks is not configured for this environment");
  } else {
    try {
      const token = await getValidQboAccessToken({ supabase: admin, accountOwnerUserId });
      if (!token) {
        skipped.push("QuickBooks is not connected");
      } else {
        const baseUrl = getQboBaseUrl();
        const [qboInvoices, qboPayments] = await Promise.all([
          listQboInvoicesSince({ accessToken: token.accessToken, realmId: token.realmId, baseUrl, fromDate: sinceDate }),
          listQboPaymentsSince({ accessToken: token.accessToken, realmId: token.realmId, baseUrl, fromDate: sinceDate }),
        ]);
        const qboInvoicesById = new Map(qboInvoices.map((invoice) => [clean(invoice.id), invoice]));
        for (const invoice of invoiceContexts) {
          const qboInvoice = qboInvoicesById.get(clean(invoice.qbo_invoice_id));
          const docNumber = clean(qboInvoice?.docNumber);
          if (docNumber) qboInvoiceLabels.set(clean(invoice.id), docNumber);
        }
        findings.push(...reconcileInvoices({ invoices, qboInvoices }));
        findings.push(...reconcilePaymentsAgainstQbo({ payments, qboPayments, invoiceLabels }));
        findings.push(...reconcileForeignQboPayments({ invoices: invoiceContexts, payments, qboPayments, invoiceLabels }));
        evaluated.qboInvoiceSubjectIds = invoices.map((invoice) => clean(invoice.id)).filter(Boolean);
        evaluated.qboPaymentSubjectIds = payments.map((payment) => clean(payment.id)).filter(Boolean);
        evaluated.qboForeignPaymentIds = qboPayments.map((payment) => clean(payment.id)).filter(Boolean);
      }
    } catch (error) {
      // A provider outage must not fail the whole run — the Stripe half is still
      // worth having, and a partial answer beats none.
      skipped.push(`QuickBooks comparison failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  // --- Stripe -------------------------------------------------------------
  try {
    const readiness = await resolveTenantStripeConnectReadiness(accountOwnerUserId, admin);
    if (!readiness.isReady || !readiness.connectedAccountId) {
      skipped.push("Stripe Connect is not ready for this account");
    } else {
      const stripe = params.stripe ?? getStripeServerClient();
      const charges: Stripe.Charge[] = [];
      for await (const charge of stripe.charges.list(
        { created: { gte: Math.floor(new Date(since).getTime() / 1000) }, limit: 100 },
        { stripeAccount: readiness.connectedAccountId },
      )) {
        charges.push(charge);
        if (charges.length >= 5000) break;
      }
      findings.push(...reconcileAgainstStripe({ payments, charges, invoiceLabels, qboInvoiceLabels }));
      evaluated.stripePaymentSubjectIds = payments.map((payment) => clean(payment.id)).filter(Boolean);
      evaluated.stripeChargeIds = charges.map((charge) => clean(charge.id)).filter(Boolean);
    }
  } catch (error) {
    skipped.push(`Stripe comparison failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  return {
    accountOwnerUserId,
    windowDays,
    checkedInvoices: invoices.length,
    checkedPayments: payments.length,
    findings,
    skipped,
    evaluated,
  };
}

/**
 * Persist a run's findings.
 *
 * Findings are keyed by (account, type, subject), so a nightly re-run refreshes
 * last_seen_at rather than stacking duplicates. Anything previously open that
 * this run did not observe is auto-resolved — nobody has to remember to clear a
 * finding once the underlying problem is fixed.
 *
 * Only ever writes to reconciliation_findings. Never to invoices or payments.
 */
export async function persistReconciliationFindings(params: {
  admin: any;
  result: ReconciliationRunResult;
}): Promise<{ opened: number; refreshed: number; resolved: number }> {
  const { admin, result } = params;
  const nowIso = new Date().toISOString();

  const { data: openRows, error: openRowsError } = await admin
    .from("reconciliation_findings")
    .select("id, finding_type, subject_kind, subject_id, external_id")
    .eq("account_owner_user_id", result.accountOwnerUserId)
    .is("resolved_at", null);
  if (openRowsError) {
    throw new Error(`Failed to load open reconciliation findings: ${openRowsError.message ?? "unknown error"}`);
  }

  const keyOf = (findingType: string, subjectId: string | null, externalId: string | null) =>
    `${findingType}::${subjectId ?? ""}::${externalId ?? ""}`;
  const openByKey = new Map<string, any>(
    (openRows ?? []).map((row: any) => [keyOf(clean(row.finding_type), row.subject_id ?? null, row.external_id ?? null), row]),
  );

  let opened = 0;
  let refreshed = 0;
  const seen = new Set<string>();

  for (const finding of result.findings) {
    const key = keyOf(finding.findingType, finding.subjectId, finding.externalId);
    seen.add(key);
    const existing = openByKey.get(key);

    if (existing?.id) {
      const { error } = await admin
        .from("reconciliation_findings")
        .update({
          last_seen_at: nowIso,
          severity: finding.severity,
          title: finding.title,
          detail: finding.detail,
          truth: finding.truth,
          everystep_value: finding.everystepValue,
          external_value: finding.externalValue,
          amount_cents: finding.amountCents,
          job_id: finding.jobId,
        })
        .eq("id", existing.id);
      if (error) throw new Error(`Failed to refresh reconciliation finding: ${error.message ?? "unknown error"}`);
      refreshed += 1;
      continue;
    }

    const { error } = await admin.from("reconciliation_findings").insert({
      account_owner_user_id: result.accountOwnerUserId,
      finding_type: finding.findingType,
      severity: finding.severity,
      subject_kind: finding.subjectKind,
      subject_id: finding.subjectId,
      external_system: finding.externalSystem,
      external_id: finding.externalId,
      title: finding.title,
      detail: finding.detail,
      truth: finding.truth,
      everystep_value: finding.everystepValue,
      external_value: finding.externalValue,
      amount_cents: finding.amountCents,
      job_id: finding.jobId,
      first_seen_at: nowIso,
      last_seen_at: nowIso,
    });
    if (error) throw new Error(`Failed to persist reconciliation finding: ${error.message ?? "unknown error"}`);
    opened += 1;
  }

  // Auto-resolve what this run no longer sees — but only for comparisons that
  // actually ran. If QuickBooks was unreachable, its findings must NOT be closed
  // as fixed; that would quietly erase real drift during an outage.
  const ranQbo = !result.skipped.some((reason) => reason.toLowerCase().includes("quickbooks"));
  const ranStripe = !result.skipped.some((reason) => reason.toLowerCase().includes("stripe"));
  const qboInvoiceSubjects = new Set(result.evaluated.qboInvoiceSubjectIds);
  const qboPaymentSubjects = new Set(result.evaluated.qboPaymentSubjectIds);
  const qboForeignPayments = new Set(result.evaluated.qboForeignPaymentIds);
  const stripePaymentSubjects = new Set(result.evaluated.stripePaymentSubjectIds);
  const stripeCharges = new Set(result.evaluated.stripeChargeIds);
  let resolved = 0;

  for (const [key, row] of openByKey.entries()) {
    if (seen.has(key)) continue;
    const system = clean(row.finding_type).startsWith("stripe_") ? "stripe" : "quickbooks";
    if (system === "quickbooks" && !ranQbo) continue;
    if (system === "stripe" && !ranStripe) continue;

    // Absence is evidence only inside the exact scope this run observed. A
    // still-open finding must never disappear just because its transaction
    // aged past the rolling reconciliation window.
    const subjectId = clean(row.subject_id);
    const externalId = clean(row.external_id);
    const wasEvaluated = system === "quickbooks"
      ? clean(row.finding_type) === "qbo_payment_unrecorded"
        ? qboForeignPayments.has(externalId)
        : clean(row.subject_kind) === "payment"
          ? qboPaymentSubjects.has(subjectId)
          : qboInvoiceSubjects.has(subjectId)
      : clean(row.subject_kind) === "payment"
        ? stripePaymentSubjects.has(subjectId)
        : stripeCharges.has(externalId);
    if (!wasEvaluated) continue;

    const { error } = await admin
      .from("reconciliation_findings")
      .update({ resolved_at: nowIso, resolved_reason: "No longer observed by reconciliation" })
      .eq("id", row.id);
    if (error) throw new Error(`Failed to resolve reconciliation finding: ${error.message ?? "unknown error"}`);
    resolved += 1;
  }

  return { opened, refreshed, resolved };
}
