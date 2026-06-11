"use client";

import { cancelJobFromForm } from "@/lib/actions/job-actions";

export default function CancelJobButton({ jobId }: { jobId: string }) {
  return (
    <form
      action={cancelJobFromForm}
      className="w-full sm:w-auto"
      onSubmit={(e) => {
        if (!window.confirm("Cancel this job? This action cannot be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="job_id" value={jobId} />
      <button
        type="submit"
        className="inline-flex min-h-10 w-full items-center justify-center whitespace-nowrap rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition-[border-color,background-color,box-shadow,transform] hover:border-red-400 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 active:translate-y-[0.5px] sm:w-auto"
      >
        📋 Cancel Job (Admin)
      </button>
    </form>
  );
}
