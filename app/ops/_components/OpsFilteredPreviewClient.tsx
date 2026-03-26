"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type LifecycleFilter =
  | "all"
  | "need_to_schedule"
  | "scheduled"
  | "exceptions"
  | "closeout"
  | "closed";

type SignalFilter = "pending_info" | "on_hold" | "needs_attention";

type OpsPreviewJob = {
  id: string;
  title: string | null;
  status: string | null;
  ops_status: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_phone: string | null;
  pending_info_reason: string | null;
  follow_up_date: string | null;
  next_action_note: string | null;
  action_required_by: string | null;
  created_at: string | null;
};

type Props = {
  jobs: OpsPreviewJob[];
  failedCutoffIso: string;
  attentionBusinessCutoffIso: string;
  resolvedFailedParentIds: string[];
  scheduledRetestJobIds: string[];
};

const LIFECYCLE_FILTERS: Array<{ key: LifecycleFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "need_to_schedule", label: "Need to Schedule" },
  { key: "scheduled", label: "Scheduled" },
  { key: "exceptions", label: "Exceptions" },
  { key: "closeout", label: "Closeout" },
  { key: "closed", label: "Closed" },
];

const SIGNAL_FILTERS: Array<{ key: SignalFilter; label: string }> = [
  { key: "pending_info", label: "Pending Info" },
  { key: "on_hold", label: "On Hold" },
  { key: "needs_attention", label: "Needs Attention" },
];

function hasSignalValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function getPendingInfoSignal(job: OpsPreviewJob) {
  return (
    hasSignalValue(job.pending_info_reason) ||
    hasSignalValue(job.follow_up_date) ||
    hasSignalValue(job.next_action_note) ||
    hasSignalValue(job.action_required_by)
  );
}

function customerLine(job: OpsPreviewJob) {
  const fullName = `${job.customer_first_name ?? ""} ${job.customer_last_name ?? ""}`.trim() || "Customer";
  const phone = String(job.customer_phone ?? "").trim() || "-";
  return `${fullName} • ${phone}`;
}

export default function OpsFilteredPreviewClient(props: Props) {
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>("all");
  const [signals, setSignals] = useState<Set<SignalFilter>>(new Set());
  const scheduledRetestJobIdSet = useMemo(
    () => new Set(props.scheduledRetestJobIds),
    [props.scheduledRetestJobIds]
  );

  const isExceptionsLifecycle = (job: OpsPreviewJob) => {
    const ops = String(job.ops_status ?? "").toLowerCase();
    return (
      (ops === "failed" || ops === "retest_needed") &&
      !props.resolvedFailedParentIds.includes(String(job.id ?? "")) &&
      !scheduledRetestJobIdSet.has(String(job.id ?? ""))
    );
  };

  const isCloseoutLifecycle = (job: OpsPreviewJob) => {
    const ops = String(job.ops_status ?? "").toLowerCase();
    return ops === "paperwork_required" || ops === "invoice_required";
  };

  const hasNeedsAttentionSignal = (job: OpsPreviewJob) => {
    const ops = String(job.ops_status ?? "").toLowerCase();
    const lifecycle = String(job.status ?? "").toLowerCase();
    const createdMs = new Date(String(job.created_at ?? "")).getTime();

    if (!Number.isFinite(createdMs)) return false;

    if (ops === "need_to_schedule" && lifecycle === "open") {
      return createdMs <= new Date(props.attentionBusinessCutoffIso).getTime();
    }

    if (getPendingInfoSignal(job)) {
      return createdMs <= new Date(props.attentionBusinessCutoffIso).getTime();
    }

    if (ops === "failed") {
      return createdMs <= new Date(props.failedCutoffIso).getTime();
    }

    return false;
  };

  const matchesLifecycle = (job: OpsPreviewJob) => {
    const ops = String(job.ops_status ?? "").toLowerCase();
    const lifecycle = String(job.status ?? "").toLowerCase();

    if (lifecycleFilter === "all") return true;
    if (lifecycleFilter === "need_to_schedule") return ops === "need_to_schedule" && lifecycle === "open";
    if (lifecycleFilter === "scheduled") return ops === "scheduled" && lifecycle === "open";
    if (lifecycleFilter === "exceptions") return isExceptionsLifecycle(job);
    if (lifecycleFilter === "closeout") return isCloseoutLifecycle(job);
    if (lifecycleFilter === "closed") return ops === "closed";
    return true;
  };

  const matchesSignals = (job: OpsPreviewJob) => {
    if (signals.has("pending_info") && !getPendingInfoSignal(job)) return false;
    if (signals.has("on_hold") && String(job.ops_status ?? "").toLowerCase() !== "on_hold") return false;
    if (signals.has("needs_attention") && !hasNeedsAttentionSignal(job)) return false;
    return true;
  };

  const filteredJobs = useMemo(() => {
    return props.jobs.filter((job) => matchesLifecycle(job) && matchesSignals(job));
  }, [props.jobs, lifecycleFilter, signals]);

  const lifecycleCounts = useMemo(() => {
    const all = props.jobs;
    return {
      all: all.length,
      need_to_schedule: all.filter((j) => String(j.ops_status ?? "").toLowerCase() === "need_to_schedule" && String(j.status ?? "").toLowerCase() === "open").length,
      scheduled: all.filter((j) => String(j.ops_status ?? "").toLowerCase() === "scheduled" && String(j.status ?? "").toLowerCase() === "open").length,
      exceptions: all.filter((j) => isExceptionsLifecycle(j)).length,
      closeout: all.filter((j) => isCloseoutLifecycle(j)).length,
      closed: all.filter((j) => String(j.ops_status ?? "").toLowerCase() === "closed").length,
    };
  }, [props.jobs]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 text-sm font-semibold text-gray-900">Primary Lifecycle Filters (Preview)</div>
      <div className="flex flex-wrap gap-2">
        {LIFECYCLE_FILTERS.map((item) => {
          const active = lifecycleFilter === item.key;
          const count = lifecycleCounts[item.key];
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setLifecycleFilter(item.key)}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium",
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100",
              ].join(" ")}
            >
              <span>{item.label}</span>
              <span className={active ? "text-slate-200" : "text-slate-500"}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 mb-2 text-sm font-semibold text-gray-900">Signal Filter Chips (Preview)</div>
      <div className="flex flex-wrap gap-2">
        {SIGNAL_FILTERS.map((item) => {
          const active = signals.has(item.key);
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setSignals((prev) => {
                  const next = new Set(prev);
                  if (next.has(item.key)) next.delete(item.key);
                  else next.add(item.key);
                  return next;
                });
              }}
              className={[
                "inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium",
                active
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100",
              ].join(" ")}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900">Filtered View</div>
          <div className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-gray-600">{filteredJobs.length} jobs</div>
        </div>

        {filteredJobs.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-300 bg-white px-3 py-4 text-sm text-gray-600">
            No jobs match the selected preview filters.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredJobs.slice(0, 25).map((job) => (
              <div key={job.id} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link href={`/jobs/${job.id}?tab=ops`} className="text-sm font-semibold text-blue-700 hover:underline">
                      {job.title || "Untitled Job"}
                    </Link>
                    <div className="mt-0.5 text-xs text-gray-700">{customerLine(job)}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-700">
                        {String(job.ops_status ?? "").replace(/_/g, " ") || "unknown"}
                      </span>
                      {getPendingInfoSignal(job) ? (
                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                          Pending Info
                        </span>
                      ) : null}
                      {String(job.ops_status ?? "").toLowerCase() === "on_hold" ? (
                        <span className="inline-flex rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 font-medium text-slate-800">
                          On Hold
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
