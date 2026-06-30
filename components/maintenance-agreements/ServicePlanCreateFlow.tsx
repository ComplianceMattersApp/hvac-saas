"use client";

import { useState } from "react";
import Link from "next/link";
import type { MaintenanceAgreementTemplateRow, TemplateChecklistItem } from "@/lib/maintenance-agreements/template-read-model";
import { MaintenanceAgreementCadenceFields } from "./MaintenanceAgreementCadenceFields";
import VisitScopeBuilder from "@/components/jobs/VisitScopeBuilder";
import ChecklistItemBuilder from "@/components/jobs/ChecklistItemBuilder";

const CADENCE_LABELS: Record<string, string> = {
  annual: "1× per year",
  semi_annual: "2× per year",
  quarterly: "4× per year",
  monthly: "Monthly",
  custom: "Custom",
};

type LocationOption = { id: string; label: string };

type Props = {
  templates: MaintenanceAgreementTemplateRow[];
  createAction: (formData: FormData) => Promise<void>;
  customerId: string;
  initialStartDate: string;
  locationOptions: LocationOption[];
  singleLocationId: string | null;
  isAdmin: boolean;
  templateChecklistItems?: Record<string, TemplateChecklistItem[]>;
};

export function ServicePlanCreateFlow({
  templates,
  createAction,
  customerId,
  initialStartDate,
  locationOptions,
  singleLocationId,
  isAdmin,
  templateChecklistItems = {},
}: Props) {
  const [step, setStep] = useState<"closed" | "picker" | "form">("closed");
  const [selectedTemplate, setSelectedTemplate] = useState<MaintenanceAgreementTemplateRow | null>(null);
  const [formKey, setFormKey] = useState(0);

  function openPicker() {
    setStep("picker");
  }

  function selectTemplate(t: MaintenanceAgreementTemplateRow) {
    setSelectedTemplate(t);
    setFormKey((k) => k + 1);
    setStep("form");
  }

  function openBlankForm() {
    setSelectedTemplate(null);
    setFormKey((k) => k + 1);
    setStep("form");
  }

  function startFromScratch() {
    setSelectedTemplate(null);
    setFormKey((k) => k + 1);
  }

  function close() {
    setStep("closed");
    setSelectedTemplate(null);
  }

  const hasTemplates = templates.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className="inline-flex items-center rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Add service plan
      </button>

      {step !== "closed" && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">
                New service plan
              </h2>
              <button
                type="button"
                onClick={close}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                &#x2715;
              </button>
            </div>

            {step === "picker" && (
              <div className="max-h-[70vh] overflow-y-auto p-5">
                {/* Primary option — always first */}
                <button
                  type="button"
                  onClick={openBlankForm}
                  className="w-full rounded-lg border border-slate-900 bg-slate-900 px-4 py-3.5 text-left text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-1"
                >
                  Create new service plan
                </button>

                {/* Template section */}
                {hasTemplates ? (
                  <>
                    <div className="mt-4 mb-2.5 text-xs font-medium text-slate-500">Or choose a template</div>
                    <div className="grid gap-2.5">
                      {templates.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => selectTemplate(t)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3.5 text-left hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                        >
                          <div className="text-sm font-semibold text-slate-900">{t.template_name}</div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {CADENCE_LABELS[t.frequency] ?? t.frequency}
                          </div>
                          {t.default_visit_scope_summary ? (
                            <div className="mt-1.5 line-clamp-2 text-xs text-slate-600">
                              {t.default_visit_scope_summary}
                            </div>
                          ) : null}
                          {(templateChecklistItems[t.id]?.length ?? 0) > 0 ? (
                            <div className="mt-1 text-xs text-slate-400">
                              Includes {templateChecklistItems[t.id].length} checklist item{templateChecklistItems[t.id].length === 1 ? "" : "s"}
                            </div>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                    No templates set up yet.{" "}
                    {isAdmin ? (
                      <Link
                        href="/ops/admin/service-plan-templates"
                        className="font-medium text-blue-600 hover:underline"
                      >
                        Set up templates
                      </Link>
                    ) : null}
                  </div>
                )}

                {/* Footer — admin-only template management link */}
                {isAdmin ? (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <Link
                      href="/ops/admin/service-plan-templates"
                      className="text-xs text-slate-400 hover:text-slate-600 hover:underline"
                    >
                      Manage templates
                    </Link>
                  </div>
                ) : null}
              </div>
            )}

            {step === "form" && (
              <div className="max-h-[80vh] overflow-y-auto p-5">
                {selectedTemplate ? (
                  <div className="mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                    <span className="text-xs text-slate-600">
                      Starting from:{" "}
                      <span className="font-semibold">{selectedTemplate.template_name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={startFromScratch}
                      className="ml-3 shrink-0 text-xs text-blue-600 hover:underline"
                    >
                      Start from scratch instead
                    </button>
                  </div>
                ) : null}

                <form action={createAction} className="grid gap-3">
                  <input type="hidden" name="customer_id" value={customerId} />
                  <input type="hidden" name="source_template_id" value={selectedTemplate?.id ?? ""} />

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Agreement Name</label>
                    <input
                      key={`name-${formKey}`}
                      name="agreement_name"
                      required
                      defaultValue={selectedTemplate?.template_name ?? ""}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    />
                  </div>

                  <input
                    type="hidden"
                    name="agreement_type"
                    value={selectedTemplate?.agreement_type ?? "maintenance"}
                  />

                  <MaintenanceAgreementCadenceFields
                    key={`cadence-${formKey}`}
                    initialFrequency={selectedTemplate?.frequency ?? "quarterly"}
                    initialStartDate={initialStartDate}
                  />

                  {singleLocationId ? (
                    <input type="hidden" name="primary_location_id" value={singleLocationId} />
                  ) : (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">
                        Primary Location (Optional)
                      </label>
                      <select
                        name="primary_location_id"
                        defaultValue=""
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                      >
                        <option value="">No primary location</option>
                        {locationOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      {"What's Included (Optional)"}
                    </label>
                    <VisitScopeBuilder
                      key={`scope-${formKey}`}
                      jobType="service"
                      summaryName="default_visit_scope_summary"
                      itemsName="default_visit_scope_items_json"
                      initialSummary={selectedTemplate?.default_visit_scope_summary ?? ""}
                      initialItems={selectedTemplate?.default_visit_scope_items ?? []}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Checklist items (optional)
                    </label>
                    <ChecklistItemBuilder
                      key={`checklist-${formKey}`}
                      initialItems={
                        selectedTemplate
                          ? (templateChecklistItems[selectedTemplate.id] ?? []).map((item) => ({
                              id: item.id,
                              item_label: item.item_label,
                              default_guidance: item.default_guidance ?? "",
                            }))
                          : []
                      }
                      itemsName="checklist_items_json"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Internal notes
                    </label>
                    <p className="mb-1 text-xs text-slate-500">
                      Visible to your team only, not the customer.
                    </p>
                    <textarea
                      key={`notes-${formKey}`}
                      name="internal_notes"
                      rows={2}
                      defaultValue={selectedTemplate?.internal_notes_default ?? ""}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="submit"
                      className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                    >
                      Save Maintenance Agreement
                    </button>
                    {hasTemplates ? (
                      <button
                        type="button"
                        onClick={() => setStep("picker")}
                        className="text-sm text-slate-500 hover:text-slate-700"
                      >
                        &#8592; Back to templates
                      </button>
                    ) : null}
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
