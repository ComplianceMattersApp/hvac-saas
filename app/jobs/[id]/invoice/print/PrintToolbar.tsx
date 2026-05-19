"use client";

import Link from "next/link";

export default function PrintToolbar({ backHref }: { backHref: string }) {
  return (
    <div className="print:hidden flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3">
      <p className="text-sm text-slate-600">Use your browser print dialog to print or save this invoice as PDF.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={backHref}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-[border-color,background-color,box-shadow,transform] hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 active:translate-y-[0.5px]"
        >
          Back to Invoice Workspace
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-[background-color,box-shadow,transform] hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 active:translate-y-[0.5px]"
        >
          Print
        </button>
      </div>
    </div>
  );
}
