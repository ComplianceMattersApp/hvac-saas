import type { ReactNode } from "react";

/**
 * Single source of truth for internal invoice issue-readiness.
 *
 * These checks were previously written out three separate times in
 * `app/jobs/[id]/invoice/page.tsx` (the mobile blocker list, the compact draft
 * rail, and the `view=all` rail). The copies had already drifted apart —
 * "Add at least 1 charge." vs "Needs at least 1 charge." — so the labels and
 * detail strings live here now and every surface renders the same words.
 */

export type InvoiceReadinessCheck = {
  key: "recipient" | "charges" | "closeout";
  label: string;
  /** Whether this check blocks issuing. Drives `canIssue`, not the badge. */
  ready: boolean;
  /**
   * How the row reads. "caution" covers satisfied-but-worth-knowing — a payer
   * with no email can still be issued and collected on site or by payment link,
   * so it must not block, but a green "Ready" would imply the invoice is
   * deliverable when it is not.
   */
  tone?: "ready" | "caution" | "needed";
  detail: string;
  /**
   * Kept on screen even when satisfied, because the row carries information the
   * user needs rather than only a pass/fail signal. Only the payer qualifies —
   * billing the wrong party is the expensive mistake on this screen.
   */
  alwaysShow?: boolean;
};

export function resolveInvoiceReadinessChecks(params: {
  recipientReady: boolean;
  recipientEmailReady: boolean;
  chargesReady: boolean;
  totalReady: boolean;
  jobReady: boolean;
  billingName?: string | null;
  lineItemCount: number;
  totalLabel: string;
  billingDispositionResolved: boolean;
  billingDispositionLabel?: string | null;
}): InvoiceReadinessCheck[] {
  const chargeNoun = `${params.lineItemCount} charge${params.lineItemCount === 1 ? "" : "s"}`;

  // Charges and Total were separate rows that failed together in every ordinary
  // case, so they read as the same complaint twice. They are one row now, and it
  // reports whichever condition actually binds — a $0.00 line item still trips
  // the total, which is the one case where the two genuinely diverge.
  const chargesDetail = !params.chargesReady
    ? "Add at least 1 charge."
    : !params.totalReady
      ? "Total must be above $0.00."
      : params.billingDispositionResolved
        ? params.billingDispositionLabel ?? "Billing Handled"
        : `${chargeNoun} · ${params.totalLabel}`;

  return [
    {
      key: "recipient",
      label: "Billing recipient",
      // Deliberately not tied to the email: issuing without one is a supported
      // path (collect on site or by payment link), so a missing email cautions
      // rather than blocks.
      ready: params.recipientReady,
      tone: !params.recipientReady ? "needed" : params.recipientEmailReady ? "ready" : "caution",
      detail: !params.recipientReady
        ? "Add a billing name."
        : params.recipientEmailReady
          ? String(params.billingName ?? "").trim() || "Billing recipient set."
          : `${String(params.billingName ?? "").trim() || "Billing recipient set"} — no email on file. Issue now and collect on site or by payment link.`,
      alwaysShow: true,
    },
    {
      key: "charges",
      label: "Charges",
      ready: params.chargesReady && params.totalReady,
      detail: chargesDetail,
    },
    {
      key: "closeout",
      label: "Job closeout",
      ready: params.jobReady,
      detail: params.jobReady
        ? "Job and field work are complete."
        : "Complete the job and field work first.",
    },
  ];
}

export function resolveInvoiceReadinessHeading(params: {
  billingDispositionResolved: boolean;
  canIssue: boolean;
  /**
   * Whether issuing will also deliver the invoice. "Issue" reads as "sent" to
   * most people, so the heading says which one is about to happen rather than
   * leaving the user to infer it.
   */
  willAlsoSend?: boolean;
}) {
  if (params.billingDispositionResolved) return "Billing handled";
  if (!params.canIssue) return "Needs attention";
  return params.willAlsoSend ? "Ready to issue & send" : "Ready to issue";
}

const READINESS_BADGE: Record<"ready" | "caution" | "needed", { label: string; className: string }> = {
  ready: { label: "Ready", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  caution: { label: "No email", className: "border-amber-200 bg-amber-50 text-amber-800" },
  needed: { label: "Needed", className: "border-amber-200 bg-amber-50 text-amber-800" },
};

function InvoiceReadinessCheckRow({ check }: { check: InvoiceReadinessCheck }) {
  const badge = READINESS_BADGE[check.tone ?? (check.ready ? "ready" : "needed")];

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5">
      <div>
        <div className="text-sm font-semibold text-slate-900">{check.label}</div>
        <div className="mt-0.5 text-xs leading-5 text-slate-600">{check.detail}</div>
      </div>
      <span
        className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${badge.className}`}
      >
        {badge.label}
      </span>
    </div>
  );
}

/**
 * Renders the readiness checks and a caller-supplied action slot.
 *
 * `onlyBlockers` compresses the list to unmet checks, which is what the
 * compressed field surface wants — it keeps the rail short when a tech is
 * finishing an invoice in a driveway. When every check passes the list is
 * empty by design and the action slot carries the screen.
 */
export default function InvoiceReadinessRail({
  eyebrow = "Issue Readiness",
  heading,
  checks,
  onlyBlockers = false,
  className = "",
  children,
}: {
  eyebrow?: string;
  heading: string;
  checks: InvoiceReadinessCheck[];
  onlyBlockers?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const visibleChecks = onlyBlockers
    ? checks.filter((check) => !check.ready || check.alwaysShow)
    : checks;

  return (
    <section className={className}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {eyebrow}
      </div>
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{heading}</h2>

      {visibleChecks.length > 0 ? (
        <div className="mt-3 space-y-2">
          {visibleChecks.map((check) => (
            <InvoiceReadinessCheckRow key={check.key} check={check} />
          ))}
        </div>
      ) : null}

      {children}
    </section>
  );
}
