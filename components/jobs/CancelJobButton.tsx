"use client";

import { cancelJobFromForm } from "@/lib/actions/job-actions";

export default function CancelJobButton({ jobId }: { jobId: string }) {
  return (
    <form
      action={cancelJobFromForm}
      className="min-w-[9.5rem] flex-1 sm:w-auto sm:min-w-0 sm:flex-none"
      onSubmit={(e) => {
        if (!window.confirm("Cancel this job? This action cannot be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="job_id" value={jobId} />
      <button
        type="submit"
        className="w-full min-h-10 inline-flex items-center justify-center whitespace-nowrap rounded-md border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-600 hover:bg-red-100 sm:w-auto"
      >
        📋 Cancel Job (Admin)
      </button>
    </form>
  );
}
