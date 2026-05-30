import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isMaintenanceAgreementsEnabled } from "@/lib/maintenance-agreements/agreement-exposure";
import {
  MAINTENANCE_AGREEMENT_FREQUENCIES,
  MAINTENANCE_AGREEMENT_TYPES,
  listMaintenanceAgreementDrilldownForAccount,
  type MaintenanceAgreementDrilldownFilter,
} from "@/lib/maintenance-agreements/read-model";
import {
  listMaintenanceAgreementTemplatesForAccount,
  type MaintenanceAgreementTemplateLifecycleStatus,
  type MaintenanceAgreementTemplateRow,
} from "@/lib/maintenance-agreements/template-read-model";
import {
  archiveMaintenanceAgreementTemplate,
  createMaintenanceAgreementTemplate,
  updateMaintenanceAgreementTemplate,
} from "@/lib/maintenance-agreements/template-actions";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";

export const metadata = { title: "Service Plans" };

const FILTERS: Array<{ value: MaintenanceAgreementDrilldownFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "overdue", label: "Overdue" },
  { value: "due_today", label: "Due Today" },
  { value: "due_1_7_days", label: "Due in 1-7 Days" },
  { value: "due_8_30_days", label: "Due in 8-30 Days" },
  { value: "not_scheduled", label: "Not Scheduled" },
  { value: "inactive", label: "Inactive" },
];

function isDrilldownFilter(value: unknown): value is MaintenanceAgreementDrilldownFilter {
  return (
    typeof value === "string" &&
    FILTERS.some((filter) => filter.value === value)
  );
}

function formatYmd(value: string | null) {
  if (!value) return "Not scheduled";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00Z`));
  } catch {
    return value;
  }
}

function titleCase(value: string) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return "-";
  return cleaned
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dueStateClass(value: string) {
  if (value === "overdue") return "bg-rose-100 text-rose-700";
  if (value === "due_today") return "bg-amber-100 text-amber-700";
  if (value === "upcoming") return "bg-blue-100 text-blue-700";
  if (value === "not_scheduled") return "bg-slate-100 text-slate-700";
  return "bg-slate-200 text-slate-600";
}

function statusClass(value: string) {
  if (value === "active") return "bg-emerald-100 text-emerald-700";
  if (value === "draft") return "bg-slate-100 text-slate-700";
  if (value === "paused") return "bg-amber-100 text-amber-700";
  if (value === "expired") return "bg-zinc-200 text-zinc-700";
  if (value === "cancelled") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

function countReviewClass(value: string) {
  if (value === "eligible_for_count_review") return "bg-amber-100 text-amber-800";
  if (value === "counted") return "bg-emerald-100 text-emerald-700";
  if (value === "excluded" || value === "reversed") return "bg-slate-200 text-slate-700";
  if (value === "not_eligible") return "bg-rose-100 text-rose-700";
  return "bg-blue-100 text-blue-700";
}

function formatCountReviewLabel(value: string) {
  if (value === "eligible_for_count_review") return "Eligible for count review";
  if (value === "not_eligible") return "Not eligible";
  return titleCase(value);
}

function parseSingleQueryParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

function normalizeTemplateStatus(value: string): MaintenanceAgreementTemplateLifecycleStatus {
  return value === "archived" ? "archived" : "active";
}

function formatTemplateItems(items: unknown[]) {
  if (!Array.isArray(items) || items.length === 0) return "[]";
  return JSON.stringify(items, null, 2);
}

function buildServicePlansHref(options?: {
  filter?: string;
  banner?: string;
  message?: string;
}) {
  const params = new URLSearchParams();
  const filter = String(options?.filter ?? "").trim();
  const banner = String(options?.banner ?? "").trim();
  const message = String(options?.message ?? "").trim();

  if (filter && filter !== "all") params.set("filter", filter);
  if (banner) params.set("banner", banner);
  if (message) params.set("message", message);

  const query = params.toString();
  return query ? `/service-plans?${query}` : "/service-plans";
}

function isTemplateStoreUnavailableError(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? "").trim();
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  if (message.includes("maintenance_agreement_templates")) return true;
  if (code === "42P01") return true;
  return false;
}

type ServicePlanDrilldownRow = Awaited<
  ReturnType<typeof listMaintenanceAgreementDrilldownForAccount>
>["rows"][number];

function getCountReviewBadges(row: ServicePlanDrilldownRow) {
  const summary = row.visit_count_review;
  return [
    { key: "eligible_for_count_review", count: summary.eligible_for_count_review_links },
    { key: "linked", count: summary.linked_links },
    { key: "counted", count: summary.counted_links },
    { key: "excluded", count: summary.excluded_links },
    { key: "reversed", count: summary.reversed_links },
    { key: "not_eligible", count: summary.not_eligible_links },
  ].filter((item) => item.count > 0);
}

function buildCustomerPlanHref(row: ServicePlanDrilldownRow) {
  const agreementId = String(row.id ?? "").trim();
  const customerId = String(row.customer_id ?? "").trim();
  const hash = `maintenance-agreement-${agreementId}`;
  return `/customers/${encodeURIComponent(customerId)}?maFocus=${encodeURIComponent(agreementId)}#${hash}`;
}

export default async function ServicePlansPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");

  let internalUser: Awaited<ReturnType<typeof requireInternalUser>>["internalUser"];
  try {
    const result = await requireInternalUser({ supabase, userId: userData.user.id });
    internalUser = result.internalUser;
  } catch (error) {
    if (isInternalAccessError(error)) redirect("/login");
    throw error;
  }

  if (!isMaintenanceAgreementsEnabled()) {
    redirect("/ops");
  }

  const sp = (await searchParams) ?? {};
  const rawFilter = Array.isArray(sp.filter) ? sp.filter[0] : sp.filter;
  const selectedFilter = isDrilldownFilter(rawFilter) ? rawFilter : "all";
  const banner = parseSingleQueryParam(sp.banner);
  const bannerMessage = parseSingleQueryParam(sp.message);

  let templateStoreUnavailable = false;
  let templateRows: MaintenanceAgreementTemplateRow[] = [];
  try {
    templateRows = await listMaintenanceAgreementTemplatesForAccount({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      includeArchived: true,
      limit: 500,
    });
  } catch (error) {
    if (isTemplateStoreUnavailableError(error)) {
      templateStoreUnavailable = true;
      templateRows = [];
    } else {
      throw error;
    }
  }

  const activeTemplates = templateRows.filter((row) => normalizeTemplateStatus(row.lifecycle_status) === "active");
  const archivedTemplates = templateRows.filter((row) => normalizeTemplateStatus(row.lifecycle_status) === "archived");

  async function createTemplateFromForm(formData: FormData) {
    "use server";

    const filter = String(formData.get("return_filter") ?? "").trim().toLowerCase();
    const result = await createMaintenanceAgreementTemplate({
      templateName: String(formData.get("template_name") ?? ""),
      agreementType: String(formData.get("agreement_type") ?? ""),
      frequency: String(formData.get("frequency") ?? ""),
      defaultVisitScopeSummary: String(formData.get("default_visit_scope_summary") ?? ""),
      defaultVisitScopeItemsJson: String(formData.get("default_visit_scope_items_json") ?? ""),
      internalNotesDefault: String(formData.get("internal_notes_default") ?? ""),
    });

    if (!result.success) {
      redirect(
        buildServicePlansHref({
          filter,
          banner: "template_create_failed",
          message: result.error,
        }),
      );
    }

    revalidatePath("/service-plans");
    redirect(buildServicePlansHref({ filter, banner: "template_created" }));
  }

  async function updateTemplateFromForm(formData: FormData) {
    "use server";

    const filter = String(formData.get("return_filter") ?? "").trim().toLowerCase();
    const result = await updateMaintenanceAgreementTemplate({
      templateId: String(formData.get("template_id") ?? ""),
      templateName: String(formData.get("template_name") ?? ""),
      agreementType: String(formData.get("agreement_type") ?? ""),
      frequency: String(formData.get("frequency") ?? ""),
      defaultVisitScopeSummary: String(formData.get("default_visit_scope_summary") ?? ""),
      defaultVisitScopeItemsJson: String(formData.get("default_visit_scope_items_json") ?? ""),
      internalNotesDefault: String(formData.get("internal_notes_default") ?? ""),
    });

    if (!result.success) {
      redirect(
        buildServicePlansHref({
          filter,
          banner: "template_update_failed",
          message: result.error,
        }),
      );
    }

    revalidatePath("/service-plans");
    redirect(buildServicePlansHref({ filter, banner: "template_updated" }));
  }

  async function archiveTemplateFromForm(formData: FormData) {
    "use server";

    const filter = String(formData.get("return_filter") ?? "").trim().toLowerCase();
    const result = await archiveMaintenanceAgreementTemplate({
      templateId: String(formData.get("template_id") ?? ""),
    });

    if (!result.success) {
      redirect(
        buildServicePlansHref({
          filter,
          banner: "template_archive_failed",
          message: result.error,
        }),
      );
    }

    revalidatePath("/service-plans");
    redirect(buildServicePlansHref({ filter, banner: "template_archived" }));
  }

  const result = await listMaintenanceAgreementDrilldownForAccount({
    supabase,
    accountOwnerUserId: internalUser.account_owner_user_id,
    today: null,
    filter: selectedFilter,
    limit: 250,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 text-slate-900 sm:space-y-5 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-slate-300/80 bg-white p-4 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.35)] sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <Link
              href="/ops"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              <span aria-hidden="true">&larr;</span> Back to Ops
            </Link>
            <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-slate-950">Service Plans</h1>
            <p className="mt-1 text-sm text-slate-600">
              Templates help you standardize Service Plans before assigning them to customers.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Creating a template does not create a customer Service Plan, job, invoice, or payment.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">As Of</div>
            <div className="text-sm font-semibold text-slate-800">{result.as_of_date}</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-600">
            Existing customer Service Plans remain read-only on this page.
          </p>
          <a
            href="#create-template-form"
            className="inline-flex min-h-10 items-center rounded-lg border border-slate-900 bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white transition-[background-color,border-color,transform] hover:-translate-y-px hover:border-slate-700 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          >
            Create Template
          </a>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {FILTERS.map((filter) => {
            const active = filter.value === selectedFilter;
            return (
              <Link
                key={filter.value}
                href={filter.value === "all" ? "/service-plans" : `/service-plans?filter=${encodeURIComponent(filter.value)}`}
                className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-semibold transition-[background-color,border-color,color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${
                  active
                    ? "border-slate-800 bg-slate-800 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:-translate-y-px hover:border-slate-400 hover:bg-slate-50"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {filter.label}
              </Link>
            );
          })}
        </div>

        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Showing {result.rows.length} plan{result.rows.length === 1 ? "" : "s"}. This page is read-only.
        </div>
      </section>

      {banner === "template_created" ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Template created.
        </section>
      ) : null}
      {banner === "template_updated" ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Template updated.
        </section>
      ) : null}
      {banner === "template_archived" ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Template archived.
        </section>
      ) : null}
      {banner === "template_create_failed" || banner === "template_update_failed" || banner === "template_archive_failed" ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <div className="font-semibold">Template update failed.</div>
          <div className="mt-1 text-xs text-rose-800">{bannerMessage || "Please review your input and try again."}</div>
        </section>
      ) : null}
      {templateStoreUnavailable ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Template storage is not available in this environment yet. Run the latest migrations to enable template management.
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-300/80 bg-white p-4 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.35)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">Template Management</h2>
            <p className="mt-1 text-sm text-slate-600">
              Manage reusable defaults for future Service Plan assignments.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Templates</div>
            <div className="text-sm font-semibold text-slate-800">
              {activeTemplates.length} active / {archivedTemplates.length} archived
            </div>
          </div>
        </div>

        <form id="create-template-form" action={createTemplateFromForm} className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <input type="hidden" name="return_filter" value={selectedFilter} />
          <div className="text-sm font-semibold text-slate-900">Create Template</div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-700">
              Template Name
              <input
                name="template_name"
                required
                maxLength={160}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="Spring AC tune-up standard"
              />
            </label>
            <label className="text-sm text-slate-700">
              Agreement Type
              <select
                name="agreement_type"
                required
                defaultValue="service_plan"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                {MAINTENANCE_AGREEMENT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {titleCase(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-700">
              Frequency
              <select
                name="frequency"
                required
                defaultValue="annual"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                {MAINTENANCE_AGREEMENT_FREQUENCIES.map((value) => (
                  <option key={value} value={value}>
                    {titleCase(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-700">
              Default Visit Scope Summary
              <input
                name="default_visit_scope_summary"
                maxLength={2000}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="Seasonal checklist and safety inspection"
              />
            </label>
          </div>
          <label className="block text-sm text-slate-700">
            Default Work Items (JSON array)
            <textarea
              name="default_visit_scope_items_json"
              rows={4}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
              defaultValue="[]"
            />
          </label>
          <label className="block text-sm text-slate-700">
            Internal Notes Default
            <textarea
              name="internal_notes_default"
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              This only saves a reusable template and does not create customer records, jobs, invoices, or payments.
            </p>
            <button
              type="submit"
              className="inline-flex min-h-10 items-center rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-[background-color,border-color,transform] hover:-translate-y-px hover:border-slate-700 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              Create Template
            </button>
          </div>
        </form>

        <div className="mt-4 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-600">Active Templates</h3>
          {activeTemplates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
              No active templates yet.
            </div>
          ) : (
            <div className="space-y-3">
              {activeTemplates.map((template) => (
                <article key={template.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{template.template_name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {titleCase(template.agreement_type)} • {titleCase(template.frequency)}
                      </div>
                    </div>
                    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                      Active
                    </span>
                  </div>

                  <form action={updateTemplateFromForm} className="space-y-3">
                    <input type="hidden" name="template_id" value={template.id} />
                    <input type="hidden" name="return_filter" value={selectedFilter} />
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-sm text-slate-700">
                        Template Name
                        <input
                          name="template_name"
                          required
                          maxLength={160}
                          defaultValue={template.template_name}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        />
                      </label>
                      <label className="text-sm text-slate-700">
                        Agreement Type
                        <select
                          name="agreement_type"
                          required
                          defaultValue={template.agreement_type}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        >
                          {MAINTENANCE_AGREEMENT_TYPES.map((value) => (
                            <option key={value} value={value}>
                              {titleCase(value)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm text-slate-700">
                        Frequency
                        <select
                          name="frequency"
                          required
                          defaultValue={template.frequency}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        >
                          {MAINTENANCE_AGREEMENT_FREQUENCIES.map((value) => (
                            <option key={value} value={value}>
                              {titleCase(value)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm text-slate-700">
                        Default Visit Scope Summary
                        <input
                          name="default_visit_scope_summary"
                          maxLength={2000}
                          defaultValue={template.default_visit_scope_summary ?? ""}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        />
                      </label>
                    </div>

                    <label className="block text-sm text-slate-700">
                      Default Work Items (JSON array)
                      <textarea
                        name="default_visit_scope_items_json"
                        rows={4}
                        defaultValue={formatTemplateItems(template.default_visit_scope_items)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      />
                    </label>

                    <label className="block text-sm text-slate-700">
                      Internal Notes Default
                      <textarea
                        name="internal_notes_default"
                        rows={3}
                        defaultValue={template.internal_notes_default ?? ""}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      />
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        className="inline-flex min-h-10 items-center rounded-lg border border-slate-800 bg-slate-800 px-3.5 py-2 text-sm font-semibold text-white transition-[background-color,border-color,transform] hover:-translate-y-px hover:border-slate-700 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                      >
                        Save Template
                      </button>
                    </div>
                  </form>

                  <form action={archiveTemplateFromForm} className="mt-3 border-t border-slate-100 pt-3">
                    <input type="hidden" name="template_id" value={template.id} />
                    <input type="hidden" name="return_filter" value={selectedFilter} />
                    <button
                      type="submit"
                      className="inline-flex min-h-10 items-center rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-sm font-semibold text-amber-900 transition-[background-color,border-color] hover:border-amber-400 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                    >
                      Archive Template
                    </button>
                  </form>
                </article>
              ))}
            </div>
          )}
        </div>

        <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">
            Archived Templates ({archivedTemplates.length})
          </summary>
          <div className="mt-3 space-y-2">
            {archivedTemplates.length === 0 ? (
              <div className="text-sm text-slate-500">No archived templates.</div>
            ) : (
              archivedTemplates.map((template: MaintenanceAgreementTemplateRow) => (
                <article key={template.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-700">{template.template_name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {titleCase(template.agreement_type)} • {titleCase(template.frequency)}
                      </div>
                    </div>
                    <span className="inline-flex rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
                      Archived
                    </span>
                  </div>
                </article>
              ))
            )}
          </div>
        </details>
      </section>

      {result.rows.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600">
          No service plans match this filter.
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-300/80 bg-white shadow-[0_18px_34px_-30px_rgba(15,23,42,0.35)]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Primary Location</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Due State</th>
                  <th className="px-4 py-3">Next Due</th>
                  <th className="px-4 py-3">Visit Count Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.rows.map((row) => {
                  const countReviewBadges = getCountReviewBadges(row);
                  return (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3">
                      <Link
                        href={buildCustomerPlanHref(row)}
                        className="font-semibold text-slate-900 underline-offset-4 hover:text-slate-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                      >
                        {row.agreement_name}
                      </Link>
                      <div className="mt-1 text-xs text-slate-500">
                        {titleCase(row.frequency)} • {titleCase(row.agreement_type)}
                      </div>
                      <div className="mt-2">
                        <Link
                          href={buildCustomerPlanHref(row)}
                          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-[background-color,border-color,color] hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                        >
                          Manage on Customer
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/customers/${row.customer_id}`}
                        className="font-semibold text-slate-800 underline-offset-4 hover:text-slate-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                      >
                        {row.customer_display_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.primary_location_display ?? <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                        {titleCase(row.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${dueStateClass(row.due_state)}`}>
                        {titleCase(row.due_state)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">{formatYmd(row.next_due_date)}</td>
                    <td className="px-4 py-3">
                      {countReviewBadges.length === 0 ? (
                        <span className="text-xs font-medium text-slate-400">No linked visits</span>
                      ) : (
                        <div className="flex max-w-[260px] flex-wrap gap-1.5">
                          {countReviewBadges.map((item) => (
                            <span
                              key={item.key}
                              className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${countReviewClass(item.key)}`}
                            >
                              {formatCountReviewLabel(item.key)} {item.count}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
