"use client";

import Link from "next/link";
import { useState } from "react";

export default function SupportCallSummaryActions({
  accountOwnerUserId,
  summaryText,
}: {
  accountOwnerUserId: string;
  summaryText: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
      >
        {copied ? "Copied" : "Copy Summary"}
      </button>
      <Link
        href={`/ops/owner-console/${encodeURIComponent(accountOwnerUserId)}/customers`}
        className="inline-flex items-center rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
      >
        View Customers
      </Link>
      <a
        href="#support-next-checks"
        className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        Next Checks
      </a>
      <a
        href="#customer-payments"
        className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        Payments
      </a>
      <a
        href="#team-seats"
        className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        Team
      </a>
      <a
        href="#company-profile"
        className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        Profile
      </a>
    </div>
  );
}
