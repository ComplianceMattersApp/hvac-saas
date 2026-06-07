import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isMaintenanceAgreementsEnabled } from "@/lib/maintenance-agreements/agreement-exposure";
import {
  MAINTENANCE_AGREEMENT_FREQUENCIES,
  MAINTENANCE_AGREEMENT_TYPES,
} from "@/lib/maintenance-agreements/read-model";
import {
  listMaintenanceAgreementTemplatesForAccount,
  type MaintenanceAgreementTemplateLifecycleStatus,
  type MaintenanceAgreementTemplateRow,
} from "@/lib/maintenance-agreements/template-read-model";
import {
  archiveMaintenanceAgreementTemplate,
  createMaintenanceAgreementTemplate,
  duplicateMaintenanceAgreementTemplate,
  updateMaintenanceAgreementTemplate,
} from "@/lib/maintenance-agreements/template-actions";
import { isInternalAccessError, requireInternalUser } from "@/lib/auth/internal-user";

export const metadata = { title: "Service Plan Templates" };

function titleCase(value: string) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return "-";
  return cleaned
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseSingleQueryParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

function normalizeTemplateStatus(value: string): MaintenanceAgreementTemplateLifecycleStatus {
  return value === "archived" ? "archived" : "active";
}

function formatTemplateItems(items: unknown[]) {
  if (!Array.isArray(items) || items.length === 0) return "";
  return JSON.stringify(items, null, 2);
}

function buildTemplatesHref(options?: {
  banner?: string;
  message?: string;
}) {
  const params = new URLSearchParams();
  const banner = String(options?.banner ?? "").trim();
  const message = String(options?.message ?? "").trim();

  if (banner) params.set("banner", banner);
  if (message) params.set("message", message);

  const query = params.toString();
  return query ? `/service-plans/templates?${query}` : "/service-plans/templates";
}

function isTemplateStoreUnavailableError(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? "").trim();
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  if (message.includes("maintenance_agreement_templates")) return true;
  if (code === "42P01") return true;
  return false;
}

export default async function ServicePlanTemplatesPage({
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
        buildTemplatesHref({
          banner: "template_create_failed",
          message: result.error,
        }),
      );
    }

    revalidatePath("/service-plans");
    revalidatePath("/service-plans/templates");
    redirect(buildTemplatesHref({ banner: "template_created" }));
  }

  async function updateTemplateFromForm(formData: FormData) {
    "use server";

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
        buildTemplatesHref({
          banner: "template_update_failed",
          message: result.error,
        }),
      );
    }

    revalidatePath("/service-plans");
    revalidatePath("/service-plans/templates");
    redirect(buildTemplatesHref({ banner: "template_updated" }));
  }

  async function archiveTemplateFromForm(formData: FormData) {
    "use server";

    const result = await archiveMaintenanceAgreementTemplate({
      templateId: String(formData.get("template_id") ?? ""),
    });

    if (!result.success) {
      redirect(
        buildTemplatesHref({
          banner: "template_archive_failed",
          message: result.error,
        }),
      );
    }

    revalidatePath("/service-plans");
    revalidatePath("/service-plans/templates");
    redirect(buildTemplatesHref({ banner: "template_archived" }));
  }

  async function duplicateTemplateFromForm(formData: FormData) {
    "use server";

    const result = await duplicateMaintenanceAgreementTemplate({
      templateId: String(formData.get("template_id") ?? ""),
    });

    if (!result.success) {
      redirect(
        buildTemplatesHref({
          banner: "template_duplicate_failed",
          message: result.error,
        }),
      );
    }

    revalidatePath("/service-plans");
    revalidatePath("/service-plans/templates");
    redirect(buildTemplatesHref({ banner: "template_duplicated" }));
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 text-slate-900 sm:space-y-5 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-slate-300/80 bg-white p-4 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.35)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <Link
              href="/service-plans"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              <span aria-hidden="true">&larr;</span> Back to Service Plans
            </Link>
            <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-slate-950">Template Management</h1>
            <p className="mt-1 text-sm text-slate-600">Create and maintain reusable templates for future Service Plan assignments.</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Templates</div>
            <div className="text-sm font-semibold text-slate-800">
              {activeTemplates.length} active / {archivedTemplates.length} archived
            </div>
          </div>
        </div>

        {banner === "template_created" ? (
          <section className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Template created.
          </section>
        ) : null}
        {banner === "template_updated" ? (
          <section className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Template updated.
          </section>
        ) : null}
        {banner === "template_archived" ? (
          <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Template archived.
          </section>
        ) : null}
        {banner === "template_duplicated" ? (
          <section className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Template duplicated.
          </section>
        ) : null}
        {banner === "template_create_failed" || banner === "template_update_failed" || banner === "template_archive_failed" || banner === "template_duplicate_failed" ? (
          <section className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            <div className="font-semibold">Template action failed.</div>
            <div className="mt-1 text-xs text-rose-800">{bannerMessage || "Please review your input and try again."}</div>
          </section>
        ) : null}

        {templateStoreUnavailable ? (
          <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Template storage is not available in this environment yet. Run the latest migrations to enable template management.
          </section>
        ) : null}

        <details id="create-template-form" className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4" open>
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">
            Create Template
          </summary>
          <form action={createTemplateFromForm} className="mt-4 space-y-3">
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
              Default Visit Work
              <textarea
                name="default_visit_scope_items_json"
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="Example: Inspect system, replace filter, check refrigerant charge, clean condenser coil."
              />
              <span className="mt-1 block text-xs text-slate-500">Describe the default work, checklist, or scope for future visits.</span>
              <span className="mt-1 block text-xs text-slate-500">Leave blank if this template should not prefill visit work.</span>
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
        </details>

        <div className="mt-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-600">Active Templates</h2>
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
                      Default Visit Work
                      <textarea
                        name="default_visit_scope_items_json"
                        rows={4}
                        defaultValue={formatTemplateItems(template.default_visit_scope_items)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        placeholder="Example: Inspect system, replace filter, check refrigerant charge, clean condenser coil."
                      />
                      <span className="mt-1 block text-xs text-slate-500">Describe the default work, checklist, or scope for future visits.</span>
                      <span className="mt-1 block text-xs text-slate-500">Leave blank if this template should not prefill visit work.</span>
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

                  <form action={duplicateTemplateFromForm} className="mt-3 border-t border-slate-100 pt-3">
                    <input type="hidden" name="template_id" value={template.id} />
                    <button
                      type="submit"
                      className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 transition-[background-color,border-color] hover:border-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                    >
                      Duplicate Template
                    </button>
                  </form>

                  <form action={archiveTemplateFromForm} className="mt-3 border-t border-slate-100 pt-3">
                    <input type="hidden" name="template_id" value={template.id} />
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
              archivedTemplates.map((template) => (
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
    </div>
  );
}
