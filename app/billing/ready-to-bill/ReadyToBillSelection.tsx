'use client';

import { useActionState, useMemo, useState } from "react";
import { createConsolidatedInvoiceDraftFromForm } from "@/lib/actions/consolidated-invoice-actions";
import type { ReadyToBillContractorGroup } from "@/lib/business/ready-to-bill";

type ActionState = { ok: false; code: string; message: string } | null;
type ManualDetails = { title: string; details: string; quantity: string; unitPrice: string };

export default function ReadyToBillSelection({
  group,
  requestKey,
}: {
  group: ReadyToBillContractorGroup;
  requestKey: string;
}) {
  const [selected, setSelected] = useState(() => new Set<string>());
  const [manualDetails, setManualDetails] = useState<Record<string, ManualDetails>>(() => Object.fromEntries(
    group.jobs.filter((job) => job.manualDetailsRequired).map((job) => [job.id, {
      title: job.title,
      details: job.jobReference,
      quantity: "1",
      unitPrice: "",
    }]),
  ));
  const [state, action, pending] = useActionState(async (_state: ActionState, formData: FormData) => {
    const result = await createConsolidatedInvoiceDraftFromForm(formData);
    return result && !result.ok ? result : null;
  }, null);
  const eligibleJobs = group.jobs.filter((job) => job.eligible);
  const selectedTotalCents = useMemo(() => eligibleJobs
    .filter((job) => selected.has(job.id))
    .reduce((sum, job) => {
      if (!job.manualDetailsRequired) return sum + job.expectedTotalCents;
      const details = manualDetails[job.id];
      const quantity = Number(details?.quantity ?? 0);
      const unitPrice = Number(details?.unitPrice ?? 0);
      return sum + (Number.isFinite(quantity) && Number.isFinite(unitPrice) ? Math.round(quantity * unitPrice * 100) : 0);
    }, 0), [eligibleJobs, manualDetails, selected]);
  const selectedManualDetailsValid = [...selected].every((jobId) => {
    const job = eligibleJobs.find((candidate) => candidate.id === jobId);
    if (!job?.manualDetailsRequired) return true;
    const details = manualDetails[jobId];
    return Boolean(details?.title.trim()) && Number(details?.quantity) > 0 && Number(details?.unitPrice) > 0;
  });
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
          <div key={job.id} className={`grid gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 lg:grid-cols-[2.5rem_8rem_7rem_1fr_1.2fr_1fr_8rem] ${job.eligible ? "hover:bg-blue-50/40" : "bg-slate-50 text-slate-500"}`}>
            <span><input type="checkbox" name="job_id" value={job.id} aria-label={`Select ${job.jobReference}`} disabled={!job.eligible || pending} checked={selected.has(job.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(job.id); else next.delete(job.id); return next; })} className="h-5 w-5 rounded border-slate-300" /></span>
            <span className="font-semibold text-slate-900">{job.jobReference}</span>
            <span className="text-sm">{job.jobDate}</span>
            <span className="text-sm">{job.customerName}</span>
            <span className="text-sm">{job.serviceAddress}</span>
            <span className="text-sm"><span className="font-medium text-slate-900">{job.title}</span>{job.preparedDraft ? <span className="mt-1 block text-xs font-semibold text-emerald-700">Saved billing details ready.</span> : job.blocker ? <span className="mt-1 block text-xs font-semibold text-amber-700">{job.blocker}</span> : null}</span>
            <span className="text-right font-semibold text-slate-900">{job.manualDetailsRequired ? "Enter below" : job.expectedTotalDisplay}</span>
            {job.manualDetailsRequired ? (
              <div className="col-span-full ml-0 grid gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 lg:ml-[2.5rem] lg:grid-cols-[2fr_2fr_0.7fr_1fr]">
                <label className="text-xs font-semibold text-slate-700">Description<input name={`manual_title_${job.id}`} value={manualDetails[job.id]?.title ?? ""} onChange={(event) => setManualDetails((current) => ({ ...current, [job.id]: { ...current[job.id], title: event.target.value } }))} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm font-normal" required={selected.has(job.id)} /></label>
                <label className="text-xs font-semibold text-slate-700">Job detail<input name={`manual_details_${job.id}`} value={manualDetails[job.id]?.details ?? ""} onChange={(event) => setManualDetails((current) => ({ ...current, [job.id]: { ...current[job.id], details: event.target.value } }))} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm font-normal" /></label>
                <label className="text-xs font-semibold text-slate-700">Quantity<input name={`manual_quantity_${job.id}`} type="number" min="0.01" step="0.01" value={manualDetails[job.id]?.quantity ?? "1"} onChange={(event) => setManualDetails((current) => ({ ...current, [job.id]: { ...current[job.id], quantity: event.target.value } }))} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm font-normal" required={selected.has(job.id)} /></label>
                <label className="text-xs font-semibold text-slate-700">Unit price<input name={`manual_unit_price_${job.id}`} type="number" min="0.01" step="0.01" value={manualDetails[job.id]?.unitPrice ?? ""} onChange={(event) => setManualDetails((current) => ({ ...current, [job.id]: { ...current[job.id], unitPrice: event.target.value } }))} placeholder="0.00" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm font-normal" required={selected.has(job.id)} /></label>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="sticky bottom-3 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div><div className="font-semibold text-slate-950">{selected.size} jobs selected</div><div className="text-sm text-slate-600">Combined expected total: {totalDisplay}</div></div>
        <button type="submit" disabled={selected.size < 2 || !selectedManualDetailsValid || pending} className="rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300">
          {pending ? "Creating draft…" : "Create Consolidated Draft Invoice"}
        </button>
      </div>
    </form>
  );
}
