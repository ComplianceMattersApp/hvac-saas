"use client";

import { useState, type FormEvent } from "react";
import { updateJobVisitScopeFromForm } from "@/lib/actions";
import {
  hasVisitScopeContent,
  type VisitScopeItem,
} from "@/lib/jobs/visit-scope";
import VisitScopeBuilder, {
  type VisitScopeDraftItem,
  type VisitScopePricebookTemplateItem,
} from "@/components/jobs/VisitScopeBuilder";
import SubmitButton from "@/components/SubmitButton";

type Props = {
  jobId: string;
  jobType: "ecc" | "service";
  tab?: string;
  initialSummary?: string | null;
  initialItems?: VisitScopeItem[];
  pricebookTemplateItems?: VisitScopePricebookTemplateItem[];
  primaryButtonClass: string;
};

export default function VisitScopeJobDetailForm({
  jobId,
  jobType,
  tab = "info",
  initialSummary = "",
  initialItems = [],
  pricebookTemplateItems = [],
  primaryButtonClass,
}: Props) {
  const hadInitialContent = hasVisitScopeContent(
    String(initialSummary ?? "").trim() || null,
    initialItems,
  );
  const [summary, setSummary] = useState(String(initialSummary ?? ""));
  const [items, setItems] = useState<VisitScopeDraftItem[]>(
    initialItems.map((item, index) => ({
      id: `${jobId}-${index}`,
      title: item.title,
      details: item.details ?? "",
      kind: item.kind,
      source_pricebook_item_id: item.source_pricebook_item_id ?? null,
      expected_unit_price: item.expected_unit_price ?? null,
      unit_label: item.unit_label ?? null,
      item_type: item.item_type ?? null,
      category: item.category ?? null,
      promoted_service_job_id: item.promoted_service_job_id ?? null,
      promoted_at: item.promoted_at ?? null,
      promoted_by_user_id: item.promoted_by_user_id ?? null,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const nonEmptyItems = items.filter((item) => item.title.trim() || item.details.trim());
  const hasDraftContent = hasVisitScopeContent(summary.trim() || null, nonEmptyItems);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (jobType === "service" && !hasVisitScopeContent(summary.trim() || null, nonEmptyItems)) {
      event.preventDefault();
      setError("Add a Reason for Visit or at least one Work Item before saving.");
      return;
    }

    setError(null);
  }

  return (
    <form action={updateJobVisitScopeFromForm} onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="tab" value={tab} />
      <input type="hidden" name="return_to" value={`/jobs/${jobId}?tab=${tab}#visit-scope-section`} />

      <VisitScopeBuilder
        initialSummary={initialSummary}
        initialItems={initialItems}
        jobType={jobType}
        pricebookTemplateItems={pricebookTemplateItems}
        hideInitialSelectedItems
        onSummaryChange={setSummary}
        onItemsChange={setItems}
      />

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </div>
      ) : null}

      {hasDraftContent || hadInitialContent ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-xs font-medium text-slate-600">Save additions and work updates.</p>
          <SubmitButton loadingText="Saving..." className={primaryButtonClass}>
            Save Work Updates
          </SubmitButton>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Add a work item to enable save.</p>
      )}
    </form>
  );
}
