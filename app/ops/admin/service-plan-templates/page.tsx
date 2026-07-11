import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/request-identity";
import { isInternalAccessError, requireInternalRole } from "@/lib/auth/internal-user";
import { resolveInternalAccessErrorRedirectPath } from "@/lib/auth/internal-access-redirect";
import { isMaintenanceAgreementsEnabled } from "@/lib/maintenance-agreements/agreement-exposure";
import {
  listMaintenanceAgreementTemplatesForAccount,
  type MaintenanceAgreementTemplateRow,
} from "@/lib/maintenance-agreements/template-read-model";
import {
  createServicePlanTemplateFromForm,
  updateServicePlanTemplateFromForm,
  archiveServicePlanTemplateFromForm,
  restoreServicePlanTemplateFromForm,
} from "@/lib/maintenance-agreements/template-actions";
import VisitScopeBuilder from "@/components/jobs/VisitScopeBuilder";
import ChecklistItemBuilder, { type ChecklistDraftItem } from "@/components/jobs/ChecklistItemBuilder";
import { listChecklistItemsForTemplate, type TemplateChecklistItem } from "@/lib/maintenance-agreements/template-read-model";

const CADENCE_OPTIONS = [
  { label: "1× per year", frequency: "annual" },
  { label: "2× per year", frequency: "semi_annual" },
  { label: "4× per year", frequency: "quarterly" },
  { label: "Monthly", frequency: "monthly" },
  { label: "Custom", frequency: "custom" },
] as const;

const CADENCE_LABELS: Record<string, string> = {
  annual: "1× per year",
  semi_annual: "2× per year",
  quarterly: "4× per year",
  monthly: "Monthly",
  custom: "Custom",
};

const NOTICE_TEXT: Record<string, string> = {
  template_created: "Template created.",
  template_updated: "Template saved.",
  template_archived: "Template archived. It will no longer appear in the service plan picker.",
  template_restored: "Template restored. It will appear in the service plan picker again.",
};

const pageClass = "mx-auto max-w-5xl space-y-6 p-4 sm:p-6";
const panelClass =
  "rounded-lg border border-slate-200 bg-white p-5 shadow-[0_14px_34px_-28px_rgba(15,23,42,0.28)] sm:p-6";
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
const labelClass = "mb-1 block text-xs font-medium text-slate-700";
const primaryButtonClass =
  "inline-flex min-h-9 items-center justify-center rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 active:translate-y-[0.5px]";
const secondaryButtonClass =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 active:translate-y-[0.5px]";

async function requireAdminOrRedirect() {
  const supabase = await createClient();
  const user = await getRequestUser();

  if (!user) redirect("/login");

  try {
    const authz = await requireInternalRole("admin", { supabase, userId: user.id });
    return { supabase, internalUser: authz.internalUser };
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect(
        await resolveInternalAccessErrorRedirectPath({
          supabase,
          user,
          fallbackPath: "/ops",
        }),
      );
    }
    throw error;
  }
}

function TemplateCreateForm({
  action,
  initialChecklistItems = [],
}: {
  action: typeof createServicePlanTemplateFromForm;
  initialChecklistItems?: ChecklistDraftItem[];
}) {
  return (
    <div className={panelClass}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Add template</h2>
        <Link href="/ops/admin/service-plan-templates" className="text-xs text-slate-500 hover:underline">
          Cancel
        </Link>
      </div>
      <form action={action} className="grid gap-4">
        <div>
          <label className={labelClass}>Template name *</label>
          <input name="template_name" required className={inputClass} autoFocus />
        </div>

        <div>
          <label className={labelClass}>Cadence *</label>
          <select name="frequency" required defaultValue="quarterly" className={inputClass}>
            {CADENCE_OPTIONS.map((opt) => (
              <option key={opt.frequency} value={opt.frequency}>
                {opt.label}
              </option>
            ))}
          </select>
          <input type="hidden" name="agreement_type" value="maintenance" />
        </div>

        <div>
          <label className={labelClass}>{"What's included (optional)"}</label>
          <textarea
            name="default_visit_scope_summary"
            rows={3}
            placeholder="e.g. Annual AC tune-up, filter check, safety inspection."
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Default work items (optional)</label>
          <p className="mb-1.5 text-xs text-slate-500">
            These work items prefill automatically every time this template is used to create a new service plan.
          </p>
          <VisitScopeBuilder
            jobType="service"
            summaryName="__unused_scope_summary__"
            hideSummaryField={true}
            itemsName="default_visit_scope_items_json"
            initialSummary=""
            initialItems={[]}
          />
        </div>

        <div>
          <label className={labelClass}>Checklist items — optional</label>
          <p className="mb-1.5 text-xs text-slate-500">
            These items prefill on every job created from this template. Technicians check them off and can add notes during the visit.
          </p>
          <ChecklistItemBuilder
            initialItems={initialChecklistItems}
            itemsName="checklist_items_json"
          />
        </div>

        <div>
          <label className={labelClass}>Internal notes — default (optional)</label>
          <p className="mb-1 text-xs text-slate-500">
            For your team only. Prefills when creating a plan from this template.
          </p>
          <textarea name="internal_notes_default" rows={2} className={inputClass} />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" className={primaryButtonClass}>
            Create template
          </button>
          <Link href="/ops/admin/service-plan-templates" className="text-sm text-slate-500 hover:underline">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function TemplateEditForm({
  template,
  action,
  initialChecklistItems = [],
}: {
  template: MaintenanceAgreementTemplateRow;
  action: typeof updateServicePlanTemplateFromForm;
  initialChecklistItems?: ChecklistDraftItem[];
}) {
  const cadenceLabel = CADENCE_LABELS[template.frequency] ?? template.frequency;

  return (
    <div className={panelClass}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Edit template</h2>
        <Link href="/ops/admin/service-plan-templates" className="text-xs text-slate-500 hover:underline">
          Cancel
        </Link>
      </div>
      <form action={action} className="grid gap-4">
        <input type="hidden" name="template_id" value={template.id} />

        <div>
          <label className={labelClass}>Template name *</label>
          <input
            name="template_name"
            required
            defaultValue={template.template_name}
            className={inputClass}
            autoFocus
          />
        </div>

        <div>
          <label className={labelClass}>Cadence</label>
          <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
            {cadenceLabel}
          </div>
          <p className="mt-1 text-xs text-slate-400">Cadence cannot be changed after creation.</p>
        </div>

        <div>
          <label className={labelClass}>{"What's included (optional)"}</label>
          <textarea
            name="default_visit_scope_summary"
            rows={3}
            defaultValue={template.default_visit_scope_summary ?? ""}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Default work items (optional)</label>
          <p className="mb-1.5 text-xs text-slate-500">
            These work items prefill automatically every time this template is used to create a new service plan.
          </p>
          <VisitScopeBuilder
            jobType="service"
            summaryName="__unused_scope_summary__"
            hideSummaryField={true}
            itemsName="default_visit_scope_items_json"
            initialSummary=""
            initialItems={template.default_visit_scope_items}
          />
        </div>

        <div>
          <label className={labelClass}>Checklist items — optional</label>
          <p className="mb-1.5 text-xs text-slate-500">
            These items prefill on every job created from this template. Technicians check them off and can add notes during the visit.
          </p>
          <ChecklistItemBuilder
            initialItems={initialChecklistItems}
            itemsName="checklist_items_json"
          />
        </div>

        <div>
          <label className={labelClass}>Internal notes — default (optional)</label>
          <p className="mb-1 text-xs text-slate-500">
            For your team only. Prefills when creating a plan from this template.
          </p>
          <textarea
            name="internal_notes_default"
            rows={2}
            defaultValue={template.internal_notes_default ?? ""}
            className={inputClass}
          />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" className={primaryButtonClass}>
            Save changes
          </button>
          <Link href="/ops/admin/service-plan-templates" className="text-sm text-slate-500 hover:underline">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function TemplateRow({
  template,
  isEditing,
  archiveAction,
  restoreAction,
}: {
  template: MaintenanceAgreementTemplateRow;
  isEditing: boolean;
  archiveAction: typeof archiveServicePlanTemplateFromForm;
  restoreAction: typeof restoreServicePlanTemplateFromForm;
}) {
  const isActive = template.lifecycle_status === "active";
  const cadenceLabel = CADENCE_LABELS[template.frequency] ?? template.frequency;

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3.5 ${
        isEditing
          ? "border-blue-300 bg-blue-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{template.template_name}</span>
          <span className="text-xs text-slate-500">{cadenceLabel}</span>
          {isActive ? (
            <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
              Active
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
              Archived
            </span>
          )}
        </div>
        {template.default_visit_scope_summary ? (
          <div className="mt-1 truncate text-xs text-slate-500">{template.default_visit_scope_summary}</div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={`/ops/admin/service-plan-templates?action=edit&tplId=${encodeURIComponent(template.id)}`}
          className="text-xs font-semibold text-blue-600 hover:underline"
        >
          Edit
        </Link>
        {isActive ? (
          <form action={archiveAction}>
            <input type="hidden" name="template_id" value={template.id} />
            <button
              type="submit"
              className="text-xs font-semibold text-slate-500 hover:text-slate-700 hover:underline"
            >
              Archive
            </button>
          </form>
        ) : (
          <form action={restoreAction}>
            <input type="hidden" name="template_id" value={template.id} />
            <button
              type="submit"
              className="text-xs font-semibold text-teal-600 hover:text-teal-800 hover:underline"
            >
              Restore
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

type SearchParams = Promise<{
  action?: string;
  tplId?: string;
  notice?: string;
  error?: string;
}>;

export default async function ServicePlanTemplatesPage(props: { searchParams: SearchParams }) {
  const { internalUser } = await requireAdminOrRedirect();

  if (!isMaintenanceAgreementsEnabled()) {
    redirect("/ops/admin");
  }

  const supabase = await createClient();
  let allTemplates: MaintenanceAgreementTemplateRow[] = [];
  try {
    allTemplates = await listMaintenanceAgreementTemplatesForAccount({
      supabase,
      accountOwnerUserId: internalUser.account_owner_user_id,
      includeArchived: true,
      limit: null,
    });
  } catch {
    allTemplates = [];
  }

  const sortedTemplates = [...allTemplates].sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
  );

  const sp = await props.searchParams;
  const action = String(sp.action ?? "").trim().toLowerCase();
  const tplId = String(sp.tplId ?? "").trim();
  const notice = String(sp.notice ?? "").trim();
  const errorMsg = String(sp.error ?? "").trim();

  const editingTemplate = action === "edit" && tplId
    ? sortedTemplates.find((t) => t.id === tplId) ?? null
    : null;

  let editingChecklistItems: TemplateChecklistItem[] = [];
  if (editingTemplate) {
    try {
      editingChecklistItems = await listChecklistItemsForTemplate({
        supabase,
        accountOwnerUserId: internalUser.account_owner_user_id,
        templateId: editingTemplate.id,
      });
    } catch {
      editingChecklistItems = [];
    }
  }

  const noticeText = notice ? (NOTICE_TEXT[notice] ?? null) : null;

  const archiveAction = archiveServicePlanTemplateFromForm;
  const restoreAction = restoreServicePlanTemplateFromForm;

  return (
    <div className={pageClass}>
      <div className={panelClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-500">Admin Center</div>
            <h1 className="mt-1 text-xl font-semibold text-slate-950">Service plan templates</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Templates appear as options when creating a new service plan for a customer.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/ops/admin" className={secondaryButtonClass}>
              Back to Admin
            </Link>
            <Link
              href="/ops/admin/service-plan-templates?action=create"
              className={primaryButtonClass}
            >
              Add template
            </Link>
          </div>
        </div>
      </div>

      {noticeText ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {noticeText}
        </div>
      ) : null}

      {errorMsg ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMsg}
        </div>
      ) : null}

      {action === "create" ? (
        <TemplateCreateForm action={createServicePlanTemplateFromForm} initialChecklistItems={[]} />
      ) : null}

      {editingTemplate ? (
        <TemplateEditForm
          template={editingTemplate}
          action={updateServicePlanTemplateFromForm}
          initialChecklistItems={editingChecklistItems.map((item) => ({
            id: item.id,
            item_label: item.item_label,
            default_guidance: item.default_guidance ?? "",
          }))}
        />
      ) : null}

      <div className={panelClass}>
        {sortedTemplates.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium text-slate-700">No templates yet.</p>
            <p className="mt-1 text-xs text-slate-500">
              Add your first template to speed up service plan creation.
            </p>
            <div className="mt-4">
              <Link
                href="/ops/admin/service-plan-templates?action=create"
                className={primaryButtonClass}
              >
                Add template
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedTemplates.map((template) => (
              <TemplateRow
                key={template.id}
                template={template}
                isEditing={editingTemplate?.id === template.id}
                archiveAction={archiveAction}
                restoreAction={restoreAction}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
