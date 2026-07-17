"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type Props = {
  label: string;
  name: string;
  value: string;
  emptyText: string;
  jobId: string;
  returnTo: string;
  action: (formData: FormData) => void | Promise<void>;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="inline-flex min-h-8 items-center justify-center rounded-md bg-slate-900 px-3 text-[11px] font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60">
      {pending ? "Saving..." : "Save"}
    </button>
  );
}

export default function InlineEditableBriefField({ label, name, value, emptyText, jobId, returnTo, action }: Props) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="min-w-0">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</div>
        {!editing ? (
          <button type="button" onClick={() => setEditing(true)} className="rounded-md px-2 py-1 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-50 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200">
            Edit
          </button>
        ) : null}
      </div>
      {editing ? (
        <form action={action} className="mt-1.5 space-y-2">
          <input type="hidden" name="job_id" value={jobId} />
          <input type="hidden" name="tab" value="info" />
          <input type="hidden" name="return_to" value={returnTo} />
          <input name={name} defaultValue={value} required maxLength={200} autoFocus className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          <div className="flex items-center gap-2">
            <SaveButton />
            <button type="button" onClick={() => setEditing(false)} className="inline-flex min-h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          </div>
        </form>
      ) : (
        <div className="mt-1 text-[15px] leading-6 text-slate-800">{value || emptyText}</div>
      )}
    </div>
  );
}
