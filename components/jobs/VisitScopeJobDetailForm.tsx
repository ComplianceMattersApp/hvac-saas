"use client";

import { useState, type FormEvent } from "react";
import { updateJobVisitScopeFromForm } from "@/lib/actions";
import {
  hasVisitScopeContent,
  type VisitScopeItem,
} from "@/lib/jobs/visit-scope";
import VisitScopeBuilder, { type VisitScopeDraftItem } from "@/components/jobs/VisitScopeBuilder";
import SubmitButton from "@/components/SubmitButton";

type Props = {
  jobId: string;
  jobType: "ecc" | "service";
  tab?: string;
  initialSummary?: string | null;
  initialItems?: VisitScopeItem[];
  primaryButtonClass: string;
};

export default function VisitScopeJobDetailForm({
  jobId,
  jobType,
  tab = "info",
  initialSummary = "",
  initialItems = [],
  primaryButtonClass,
}: Props) {
  const [summary, setSummary] = useState(String(initialSummary ?? ""));
  const [items, setItems] = useState<VisitScopeDraftItem[]>(
    initialItems.map((item, index) => ({
      id: `${jobId}-${index}`,
      title: item.title,
      details: item.details ?? "",
      kind: item.kind,
    })),
  );
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const nonEmptyItems = items.filter((item) => item.title.trim() || item.details.trim());
    if (jobType === "service" && !hasVisitScopeContent(summary.trim() || null, nonEmptyItems)) {
      event.preventDefault();
      setError("Add a visit reason or at least one scope item before saving.");
      return;
    }

    setError(null);
  }

  return (
    <form action={updateJobVisitScopeFromForm} onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="tab" value={tab} />
      <input type="hidden" name="return_to" value={`/jobs/${jobId}?tab=${tab}`} />

      <VisitScopeBuilder
        initialSummary={initialSummary}
        initialItems={initialItems}
        jobType={jobType}
        onSummaryChange={setSummary}
        onItemsChange={setItems}
      />

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton loadingText="Saving..." className={primaryButtonClass}>
          Save Visit Scope
        </SubmitButton>
      </div>
    </form>
  );
}