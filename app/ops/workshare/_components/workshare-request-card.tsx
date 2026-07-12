import type { ReactNode } from "react";

import type { AccountWorkshareRequestRow } from "@/lib/workflows/account-workshare-requests-read";
import { countWorkshareEquipmentItems } from "@/lib/workflows/workshare-equipment-snapshot";

export function formatWorkshareDateTime(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "-";

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "-";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function formatPreferredDate(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;

  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return normalized;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

type ScopeLine = { title: string; details: string | null };

// The requested_scope snapshot is written by the sender in P1-C as:
//   { requested_scope_text, source_visit_scope_summary, source_visit_scope_items: [{ title, details, kind }] }
// Format it defensively into human-readable labels; tolerate legacy/other shapes.
function formatRequestedScope(snapshot: Record<string, unknown> | null | undefined): {
  summaryLines: string[];
  scopeItems: ScopeLine[];
} {
  const summaryLines: string[] = [];
  const scopeItems: ScopeLine[] = [];

  if (!snapshot || typeof snapshot !== "object") {
    return { summaryLines, scopeItems };
  }

  const requestedScopeText = cleanText(snapshot.requested_scope_text);
  if (requestedScopeText) summaryLines.push(requestedScopeText);

  const visitScopeSummary = cleanText(snapshot.source_visit_scope_summary);
  if (visitScopeSummary && visitScopeSummary !== requestedScopeText) {
    summaryLines.push(visitScopeSummary);
  }

  const rawItems = snapshot.source_visit_scope_items;
  if (Array.isArray(rawItems)) {
    for (const rawItem of rawItems) {
      const item = (rawItem ?? {}) as Record<string, unknown>;
      const title = cleanText(item.title) || cleanText(item.kind);
      const details = cleanText(item.details);
      if (!title && !details) continue;
      scopeItems.push({ title: title || "Scope item", details: details || null });
    }
  }

  return { summaryLines, scopeItems };
}

function locationDisplay(request: AccountWorkshareRequestRow) {
  const formatted = cleanText(request.location_address_snapshot);
  if (formatted) return formatted;

  const parts = [
    cleanText(request.location_address_line1_snapshot),
    cleanText(request.location_address_line2_snapshot),
    [
      cleanText(request.location_city_snapshot),
      cleanText(request.location_state_snapshot),
      cleanText(request.location_zip_snapshot),
    ]
      .filter(Boolean)
      .join(" "),
  ].filter(Boolean);

  return parts.join(", ") || "Service address not provided";
}

function sourceJobLabel(request: AccountWorkshareRequestRow) {
  return (
    cleanText(request.source_job_reference_snapshot)
    || cleanText(request.source_job_title_snapshot)
    || "Not provided"
  );
}

// Presentational workshare request card shared by the incoming (actionable) and
// decided (read-only history) receiver surfaces. `decisionBadge` renders an
// extra status chip in the header; `footer` replaces the card's action zone.
export function WorkshareRequestCard({
  request,
  senderCompanyName,
  decisionBadge,
  footer,
}: {
  request: AccountWorkshareRequestRow;
  senderCompanyName: string;
  decisionBadge?: ReactNode;
  footer?: ReactNode;
}) {
  const customerName = cleanText(request.customer_name_snapshot) || "Customer not provided";
  const customerPhone = cleanText(request.customer_phone_snapshot);
  const customerEmail = cleanText(request.customer_email_snapshot);
  const address = locationDisplay(request);
  const { summaryLines, scopeItems } = formatRequestedScope(request.requested_scope_snapshot);
  const notes = cleanText(request.sender_notes_snapshot);
  const preferredDate = formatPreferredDate(request.preferred_date);
  const preferredWindow = cleanText(request.preferred_window_snapshot);
  const hasPreferredTiming = Boolean(preferredDate || preferredWindow);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_36px_-28px_rgba(15,23,42,0.28)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
              Received
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
              ECC/HERS
            </span>
            {decisionBadge}
          </div>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">
            From: {senderCompanyName}
          </h2>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>Received {formatWorkshareDateTime(request.created_at)}</div>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Customer</dt>
          <dd className="mt-1">{customerName}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Service address</dt>
          <dd className="mt-1 whitespace-pre-wrap">{address}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Customer contact</dt>
          <dd className="mt-1">
            {customerPhone || customerEmail ? (
              <div className="space-y-0.5">
                {customerPhone ? <div>{customerPhone}</div> : null}
                {customerEmail ? <div className="break-all text-slate-600">{customerEmail}</div> : null}
              </div>
            ) : (
              <span className="text-slate-500">Not provided</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Source job</dt>
          <dd className="mt-1">{sourceJobLabel(request)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Equipment included</dt>
          <dd className="mt-1">
            {(() => {
              const systems = request.equipment_snapshot ?? [];
              const items = countWorkshareEquipmentItems(systems);
              if (items === 0) return <span className="text-slate-500">None provided</span>;
              return (
                <span>
                  {items} item{items === 1 ? "" : "s"} across {systems.length} system{systems.length === 1 ? "" : "s"}
                  {" — copies to your job on accept"}
                </span>
              );
            })()}
          </dd>
        </div>
      </dl>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Requested scope</div>
        {summaryLines.length === 0 && scopeItems.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">No scope details provided.</p>
        ) : (
          <div className="mt-2 space-y-2 text-sm text-slate-700">
            {summaryLines.map((line, index) => (
              <p key={`summary-${index}`} className="whitespace-pre-wrap leading-6">{line}</p>
            ))}
            {scopeItems.length > 0 ? (
              <ul className="ml-4 list-disc space-y-1">
                {scopeItems.map((item, index) => (
                  <li key={`scope-${index}`}>
                    <span className="font-medium text-slate-800">{item.title}</span>
                    {item.details ? <span className="text-slate-600"> — {item.details}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </div>

      {notes ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Notes</div>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{notes}</p>
        </div>
      ) : null}

      {hasPreferredTiming ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Preferred timing</div>
          <p className="mt-1 text-sm text-slate-700">
            {[preferredDate, preferredWindow].filter(Boolean).join(" · ")}
          </p>
        </div>
      ) : null}

      {footer ? <div className="mt-4">{footer}</div> : null}
    </article>
  );
}
