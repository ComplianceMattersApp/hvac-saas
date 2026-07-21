'use client';

import { useActionState, useMemo, useState } from "react";
import { createConsolidatedInvoiceDraftFromForm } from "@/lib/actions/consolidated-invoice-actions";
import type { ReadyToBillContractorGroup } from "@/lib/business/ready-to-bill";

type ActionState = { ok: false; code: string; message: string } | null;

export default function ReadyToBillSelection({
  group,
  requestKey,
}: {
  group: ReadyToBillContractorGroup;
  requestKey: string;
}) {
  const [selected, setSelected] = useState(() => new Set<string>());
  const [state, action, pending] = useActionState(async (_state: ActionState, formData: FormData) => {
    const result = await createConsolidatedInvoiceDraftFromForm(formData);
    return result && !result.ok ? result : null;
  }, null);
  const eligibleJobs = group.jobs.filter((job) => job.eligible);
  const selectedTotalCents = useMemo(() => eligibleJobs
    .filter((job) => selected.has(job.id))
    .reduce((sum, job) => sum + job.expectedTotalCents, 0), [eligibleJobs, selected]);
  const totalDisplay = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(selectedTotalCents / 100);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="request_key" value={requestKey} />
      {state ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{state.message}</div> : null}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[2.5rem_8rem_7rem_1fr_1.2fr_1fr_8rem] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
          <span /> <span>Job</span> <span>Date</span> <span>Customer</span> <span>Service address</span> <span>Work</span> <span className="text-right">Expected</span>
        </div>
        {group.jobs.map((job) => (
          <label key={job.id} className={`grid gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 lg:grid-cols-[2.5rem_8rem_7rem_1fr_1.2fr_1fr_8rem] ${job.eligible ? "cursor-pointer hover:bg-blue-50/40" : "bg-slate-50 text-slate-500"}`}>
            <span><input type="checkbox" name="job_id" value={job.id} disabled={!job.eligible || pending} checked={selected.has(job.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(job.id); else next.delete(job.id); return next; })} className="h-5 w-5 rounded border-slate-300" /></span>
            <span className="font-semibold text-slate-900">{job.jobReference}</span>
            <span className="text-sm">{job.jobDate}</span>
            <span className="text-sm">{job.customerName}</span>
            <span className="text-sm">{job.serviceAddress}</span>
            <span className="text-sm"><span className="font-medium text-slate-900">{job.title}</span>{job.blocker ? <span className="mt-1 block text-xs font-semibold text-amber-700">{job.blocker}</span> : null}</span>
            <span className="text-right font-semibold text-slate-900">{job.expectedTotalDisplay}</span>
          </label>
        ))}
      </div>
      <div className="sticky bottom-3 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div><div className="font-semibold text-slate-950">{selected.size} jobs selected</div><div className="text-sm text-slate-600">Combined expected total: {totalDisplay}</div></div>
        <button type="submit" disabled={selected.size < 2 || pending} className="rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300">
          {pending ? "Creating draft…" : "Create Consolidated Draft Invoice"}
        </button>
      </div>
    </form>
  );
}
