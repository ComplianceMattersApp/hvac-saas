"use client";

import { cancelJobFromForm } from "@/lib/actions/job-actions";

export default function CancelJobButton({ jobId }: { jobId: string }) {
  return (
    <form
      action={cancelJobFromForm}
      style={{ display: "inline" }}
      onSubmit={(e) => {
        if (!window.confirm("Cancel this job? This action cannot be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="job_id" value={jobId} />
      <button
        type="submit"
        className="inline-flex h-10 items-center rounded-md border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-600 hover:bg-red-100"
      >
        📋 Cancel Job
      </button>
    </form>
  );
}
