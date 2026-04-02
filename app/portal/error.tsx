"use client";

import Link from "next/link";

export default function PortalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <h2 className="text-lg font-semibold">We could not load this portal page.</h2>
        <p className="mt-2 text-sm">
          Please try again. If this keeps happening, return to your jobs list and reopen the job.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium hover:bg-amber-100"
          >
            Try again
          </button>
          <Link
            href="/portal/jobs"
            className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium hover:bg-amber-100"
          >
            Back to jobs
          </Link>
        </div>
      </div>
    </div>
  );
}
