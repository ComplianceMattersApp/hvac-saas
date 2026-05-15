// app/ops/call-list/page

import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestActorContext } from "@/lib/auth/request-actor-context";
import { logCustomerContactAttemptFromForm } from "@/lib/actions/job-contact-actions";
import { updateJobScheduleFromForm } from "@/lib/actions";
import { formatBusinessDateUS } from "@/lib/utils/schedule-la";

const baseSelect =
  "id, title, status, ops_status, job_type, scheduled_date, window_start, window_end, city, job_address, customer_first_name, customer_last_name, customer_phone, contractor_id, contractors(name), customer_id, location_id, created_at, deleted_at, pending_info_reason, on_hold_reason, permit_number, jurisdiction, permit_date";

function digitsOnly(v?: string | null) {
  return String(v ?? "").replace(/\D/g, "");
}

function telHref(phone?: string | null) {
  const p = digitsOnly(phone);
  return p ? `tel:${p}` : "";
}

function smsHref(phone?: string | null) {
  const p = digitsOnly(phone);
  return p ? `sms:${p}` : "";
}

function customerDisplayName(j: any) {
  const first = String(j?.customer_first_name ?? "").trim();
  const last = String(j?.customer_last_name ?? "").trim();
  return [first, last].filter(Boolean).join(" ") || "Unnamed Customer";
}

function addressLine(j: any) {
  const addr = String(j?.job_address ?? "").trim();
  const city = String(j?.city ?? "").trim();
  if (addr && city) return `${addr}, ${city}`;
  return addr || city || "No address";
}

function contractorDisplayName(j: any) {
  const contractor = Array.isArray(j?.contractors) ? j.contractors[0] : j?.contractors;
  return String(contractor?.name ?? "").trim() || "Unassigned contractor";
}

function jobTitle(j: any) {
  return String(j?.title ?? "").trim() || `Job ${String(j?.id ?? "").slice(0, 8)}`;
}

function jobTypeBadge(j: any) {
  const t = String(j?.job_type ?? "").toLowerCase();
  if (t === "ecc") return { label: "ECC", cls: "border-slate-200 bg-slate-50 text-slate-600" };
  if (t === "service") return { label: "Service", cls: "border-slate-200 bg-slate-50 text-slate-600" };
  return null;
}

function timeToTimeInput(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const hhmm = /^\d{2}:\d{2}/.test(raw) ? raw.slice(0, 5) : "";
  return hhmm || "";
}

const labelClass =
  "text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400";
const subtleChipClass =
  "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600";
const outlineActionClass =
  "inline-flex min-h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300";
const compactActionClass =
  "inline-flex h-7 items-center justify-center rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300";
const primaryActionClass =
  "inline-flex min-h-8 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1";
const fieldClass =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-sm transition-colors focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200";

export default async function CallListPage({
  searchParams,
}: {
  searchParams?: Promise<{ contractor?: string }>;
}) {
  const actorContext = await getRequestActorContext();
  const supabase = actorContext.supabase;
  const user = actorContext.user;

  if (!user) redirect("/login");
  if (actorContext.kind === "contractor") redirect("/portal");
  if (actorContext.kind !== "internal" || !actorContext.internalUser) redirect("/login");

  const sp = (searchParams ? await searchParams : {}) ?? {};
  const contractor = (sp.contractor ?? "").trim() || null;
  const returnTo = contractor ? `/ops/call-list?contractor=${encodeURIComponent(contractor)}` : "/ops/call-list";

  let q = supabase
    .from("jobs")
    .select(baseSelect)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .eq("status", "open")
    .eq("ops_status", "need_to_schedule")
    .order("created_at", { ascending: false });

  if (contractor) q = q.eq("contractor_id", contractor);

  const { data, error } = await q;
  if (error) throw error;

  const jobs = data ?? [];
  const now = new Date();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/ops"
            className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          >
            <span aria-hidden="true">&larr;</span> Back to Ops
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Unscheduled Work</h1>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              Unscheduled
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Jobs and work requests that still need a scheduled date, time window, or dispatch follow-up. {" "}
            <span className="font-semibold text-slate-800">{jobs.length}</span>{" "}
            {jobs.length === 1 ? "item" : "items"}
          </p>
        </div>
      </div>

      {/* Empty state */}
      {jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-500">No unscheduled work right now.</p>
          <p className="mt-1 text-xs text-slate-400">Check back later or return to the Ops overview.</p>
          <Link
            href="/ops"
            className="mt-4 inline-flex rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          >
            Return to Ops
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((j: any) => {
            const jobId = String(j.id ?? "");
            const name = customerDisplayName(j);
            const phone = String(j.customer_phone ?? "").trim();
            const phoneHref = telHref(phone) || smsHref(phone);
            const addr = addressLine(j);
            const title = jobTitle(j);
            const badge = jobTypeBadge(j);
            const contractorName = contractorDisplayName(j);
            const createdMs = j.created_at ? new Date(j.created_at).getTime() : null;
            const ageDays =
              createdMs != null
                ? Math.floor((now.getTime() - createdMs) / (1000 * 60 * 60 * 24))
                : null;
            const ageSuffix =
              ageDays == null
                ? ""
                : ageDays === 0
                ? "Today"
                : ageDays === 1
                ? "1 day ago"
                : `${ageDays} days ago`;
            const scheduledText = j.scheduled_date
              ? formatBusinessDateUS(String(j.scheduled_date))
              : null;

            return (
              <div
                key={jobId}
                className="rounded-xl border border-l-4 border-slate-200 border-l-blue-900/25 bg-white px-4 py-4 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.45)] transition-colors hover:border-slate-300 hover:border-l-blue-900/35 sm:px-5"
              >
                <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(16rem,1.05fr)_minmax(14rem,0.72fr)_minmax(18rem,0.9fr)] lg:items-start lg:gap-5">
                  {/* Left: job + customer + contractor */}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/jobs/${jobId}?tab=ops`}
                        className="text-[15px] font-semibold leading-5 text-slate-950 underline-offset-4 hover:text-slate-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                      >
                        {title}
                      </Link>
                      {badge ? (
                        <span
                          className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      ) : null}
                      {ageSuffix ? (
                        <span className="text-xs text-slate-400">{ageSuffix}</span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-800">{name}</div>
                    <div className="mt-2 grid gap-1 text-sm leading-5 text-slate-500">
                      <div>
                        <span className={labelClass}>Contractor</span>
                        <div className="font-medium text-slate-700">{contractorName}</div>
                      </div>
                      <div>{addr}</div>
                    </div>
                  </div>

                  {/* Center: contact + schedule status */}
                  <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                    {phone ? (
                      <div className="grid gap-1.5">
                        <span className={labelClass}>Phone</span>
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          {phoneHref ? (
                            <a
                              href={phoneHref}
                              className="text-sm font-semibold text-slate-800 transition-colors hover:text-slate-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                            >
                              {phone}
                            </a>
                          ) : (
                            <span className="text-sm font-medium text-slate-800">{phone}</span>
                          )}
                          <div className="flex items-center gap-1.5">
                            {telHref(phone) ? (
                              <a href={telHref(phone)} className={compactActionClass}>
                                Call
                              </a>
                            ) : null}
                            {smsHref(phone) ? (
                              <a href={smsHref(phone)} className={compactActionClass}>
                                Open SMS App
                              </a>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-1.5">
                        <span className={labelClass}>Phone</span>
                        <span className="text-sm text-slate-400">No phone on file</span>
                      </div>
                    )}
                    <div className="grid gap-1.5">
                      <span className={labelClass}>Schedule</span>
                      <span className={subtleChipClass}>
                        {scheduledText ?? "Not scheduled"}
                      </span>
                    </div>
                  </div>

                  {/* Right: workflow actions */}
                  <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                    <span className={labelClass}>Actions</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <details className="group">
                        <summary className={`${outlineActionClass} cursor-pointer list-none gap-1.5`}>
                          <span>Scheduler</span>
                          <span className="text-[10px] text-slate-400 transition-transform duration-150 group-open:rotate-180" aria-hidden="true">
                            v
                          </span>
                        </summary>
                        <form action={updateJobScheduleFromForm} className="mt-2 space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 shadow-[0_12px_24px_-24px_rgba(15,23,42,0.35)]">
                          <input type="hidden" name="job_id" value={jobId} />
                          <input type="hidden" name="permit_number" value={String(j?.permit_number ?? "")} />
                          <input type="hidden" name="jurisdiction" value={String(j?.jurisdiction ?? "")} />
                          <input type="hidden" name="permit_date" value={String(j?.permit_date ?? "")} />
                          <input type="hidden" name="return_to" value={returnTo} />

                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                            <label className="space-y-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                              Date
                              <input
                                type="date"
                                name="scheduled_date"
                                defaultValue={String(j?.scheduled_date ?? "")}
                                className={fieldClass}
                              />
                            </label>
                            <label className="space-y-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                              Start
                              <input
                                type="time"
                                name="window_start"
                                defaultValue={timeToTimeInput(j?.window_start)}
                                className={fieldClass}
                              />
                            </label>
                            <label className="space-y-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                              End
                              <input
                                type="time"
                                name="window_end"
                                defaultValue={timeToTimeInput(j?.window_end)}
                                className={fieldClass}
                              />
                            </label>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <button type="submit" className={primaryActionClass}>
                              Save Schedule
                            </button>
                            <button
                              type="submit"
                              name="unschedule"
                              value="1"
                              className={outlineActionClass}
                            >
                              Clear
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-500">Uses the same scheduling rules as Job Workspace.</p>
                        </form>
                      </details>
                      <form action={logCustomerContactAttemptFromForm}>
                        <input type="hidden" name="job_id" value={jobId} />
                        <input type="hidden" name="method" value="call" />
                        <input type="hidden" name="result" value="no_answer" />
                        <input type="hidden" name="return_to" value={returnTo} />
                        <input type="hidden" name="success_banner" value="contact_attempt_logged_call" />
                        <button type="submit" className={outlineActionClass}>
                          Log Call
                        </button>
                      </form>
                      <form action={logCustomerContactAttemptFromForm}>
                        <input type="hidden" name="job_id" value={jobId} />
                        <input type="hidden" name="method" value="text" />
                        <input type="hidden" name="result" value="sent" />
                        <input type="hidden" name="return_to" value={returnTo} />
                        <input type="hidden" name="success_banner" value="contact_attempt_logged_text" />
                        <button type="submit" className={outlineActionClass}>
                          Log Text Attempt
                        </button>
                      </form>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Logs communication attempts only; does not confirm carrier delivery.
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
