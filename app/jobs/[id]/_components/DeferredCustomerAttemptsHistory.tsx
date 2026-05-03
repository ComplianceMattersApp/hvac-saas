import { createClient } from "@/lib/supabase/server";

type DeferredCustomerAttemptsHistoryProps = {
  jobId: string;
  emptyStateClassName: string;
  infoChipClassName: string;
};

function formatDateTimeLAFromIso(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";

  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);

  return `${date} ${time}`;
}

function renderAttemptItem(a: any, key: string, infoChipClassName: string) {
  const method = a?.meta?.method ? String(a.meta.method) : "";
  const result = a?.meta?.result ? String(a.meta.result) : "";
  const when = a?.created_at ? formatDateTimeLAFromIso(String(a.created_at)) : "—";

  const methodIcon = method === "text" ? "💬" : method === "call" ? "📞" : "📝";
  const resultLabel =
    result === "no_answer"
      ? "No Answer"
      : result === "sent"
        ? "Sent"
        : result === "spoke"
          ? "Spoke"
          : result || "—";

  return (
    <div key={key} className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 text-sm shadow-[0_10px_24px_-24px_rgba(15,23,42,0.35)]">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium text-slate-500">{when}</div>
        <div className="text-xs text-slate-400">
          {a?.meta?.attempt_number ? `#${String(a.meta.attempt_number)}` : null}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={infoChipClassName}>
          <span>{methodIcon}</span>
          <span className="capitalize">{method || "—"}</span>
        </span>

        <span className={infoChipClassName}>{resultLabel}</span>
      </div>
    </div>
  );
}

export default async function DeferredCustomerAttemptsHistory({
  jobId,
  emptyStateClassName,
  infoChipClassName,
}: DeferredCustomerAttemptsHistoryProps) {
  const supabase = await createClient();

  const { data: customerAttempts, error: attemptsErr } = await supabase
    .from("job_events")
    .select("created_at, meta, user_id")
    .eq("job_id", jobId)
    .eq("event_type", "customer_attempt")
    .order("created_at", { ascending: false })
    .limit(200);

  if (attemptsErr) throw new Error(attemptsErr.message);

  const attemptItems = customerAttempts ?? [];
  const contactPreviewItems = attemptItems.slice(0, 3);
  const contactOverflowItems = attemptItems.slice(3);

  if (!attemptItems.length) {
    return <div className={emptyStateClassName}>No contact attempts logged yet.</div>;
  }

  return (
    <div className="space-y-2">
      {contactPreviewItems.map((attempt: any, idx: number) =>
        renderAttemptItem(attempt, `attempt-preview-${idx}`, infoChipClassName),
      )}

      {contactOverflowItems.length > 0 ? (
        <details className="pt-1">
          <summary className="cursor-pointer text-sm font-medium text-slate-700 underline decoration-slate-300 underline-offset-4">
            Show all attempts ({attemptItems.length})
          </summary>
          <div className="mt-2 space-y-2">
            {contactOverflowItems.map((attempt: any, idx: number) =>
              renderAttemptItem(attempt, `attempt-overflow-${idx}`, infoChipClassName),
            )}
          </div>
        </details>
      ) : null}
    </div>
  );
}
