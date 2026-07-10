import Link from "next/link";
import { redirect } from "next/navigation";

import { getRequestActorContext } from "@/lib/auth/request-actor-context";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import {
  listIncomingAccountWorkshareRequestsForReceiver,
  type AccountWorkshareRequestRow,
} from "@/lib/workflows/account-workshare-requests-read";

export const metadata = {
  title: "Incoming ECC/HERS Requests",
  description: "Read-only queue of ECC/HERS testing requests sent to this account by connected contractors.",
};

function formatDateTime(value: string | null | undefined) {
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

  const requestedScopeText = cleanText((snapshot as any).requested_scope_text);
  if (requestedScopeText) summaryLines.push(requestedScopeText);

  const visitScopeSummary = cleanText((snapshot as any).source_visit_scope_summary);
  if (visitScopeSummary && visitScopeSummary !== requestedScopeText) {
    summaryLines.push(visitScopeSummary);
  }

  const rawItems = (snapshot as any).source_visit_scope_items;
  if (Array.isArray(rawItems)) {
    for (const item of rawItems) {
      const title = cleanText(item?.title) || cleanText(item?.kind);
      const details = cleanText(item?.details);
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

function RequestCard({
  request,
  senderCompanyName,
}: {
  request: AccountWorkshareRequestRow;
  senderCompanyName: string;
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
          </div>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">
            From: {senderCompanyName}
          </h2>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>Received {formatDateTime(request.created_at)}</div>
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

      <p className="mt-4 text-xs text-slate-400">Review and accept/decline coming soon.</p>
    </article>
  );
}

export default async function OpsWorkshareIncomingPage() {
  const actorContext = await getRequestActorContext();
  const supabase = actorContext.supabase;
  const user = actorContext.user;

  if (!user) redirect("/login");
  if (actorContext.kind === "contractor") redirect("/portal");
  if (actorContext.kind !== "internal" || !actorContext.internalUser) redirect("/login");

  const accountOwnerUserId = String(actorContext.internalUser.account_owner_user_id ?? "").trim();
  const requests = await listIncomingAccountWorkshareRequestsForReceiver(supabase, accountOwnerUserId);

  // Sender display names live in internal_business_profiles, which is RLS-scoped to
  // each sender's own account. The receiver cannot read them under account-scoped RLS,
  // so resolve the sender company name with the service-role client for this lookup only.
  const senderNameById = new Map<string, string>();
  const uniqueSenderIds = Array.from(
    new Set(requests.map((request) => String(request.sender_account_id ?? "").trim()).filter(Boolean)),
  );

  if (uniqueSenderIds.length > 0) {
    const admin = createAdminClient();
    const resolved = await Promise.all(
      uniqueSenderIds.map(async (senderId) => {
        const identity = await resolveInternalBusinessIdentityByAccountOwnerId({
          accountOwnerUserId: senderId,
          supabase: admin,
        });
        return [senderId, identity.display_name] as const;
      }),
    );
    for (const [senderId, displayName] of resolved) {
      senderNameById.set(senderId, displayName);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 text-slate-900 sm:space-y-6 sm:p-6">
      <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.28)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Operations</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Incoming ECC/HERS Requests</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              These are ECC/HERS testing requests sent to your account by connected contractors. This queue is read-only — review
              and accept/decline controls are coming soon.
            </p>
          </div>
          <Link
            href="/ops"
            className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            Back to Ops
          </Link>
        </div>
      </section>

      {requests.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center shadow-[0_18px_36px_-32px_rgba(15,23,42,0.24)]">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-900">
            No incoming ECC/HERS requests yet.
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            When a connected contractor sends you a request, it will appear here.
          </p>
        </section>
      ) : (
        <section className="space-y-4">
          {requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              senderCompanyName={
                senderNameById.get(String(request.sender_account_id ?? "").trim()) || "Connected contractor"
              }
            />
          ))}
        </section>
      )}
    </div>
  );
}
