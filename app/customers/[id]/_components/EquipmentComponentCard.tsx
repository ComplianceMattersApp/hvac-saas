"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Drawer } from "@/components/ui/Drawer";
import { OverflowMenu } from "@/components/ui/OverflowMenu";
import SubmitButton from "@/components/SubmitButton";
import { EquipmentSpecFormFields } from "./EquipmentSpecFormFields";
import {
  updateCustomerLocationEquipmentFromForm,
  retireCustomerLocationEquipmentFromForm,
  replaceCustomerLocationEquipmentFromForm,
  loadEquipmentReplacementHistoryForCustomer,
} from "@/lib/actions/customer-actions";
import type { CustomerEquipmentHistoryUnitSummary } from "@/lib/customers/customer-systems-equipment-read-model";

const RETIRE_REASONS: Array<{ value: "failure" | "warranty" | "upgrade"; label: string }> = [
  { value: "failure", label: "Failure" },
  { value: "warranty", label: "Warranty" },
  { value: "upgrade", label: "Upgrade" },
];

export type EquipmentComponentCardData = {
  id: string;
  equipmentRole: string | null;
  componentType: string | null;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  tonnage: string | null;
  refrigerantType: string | null;
  heatingCapacityKbtu: string | null;
  heatingOutputBtu: string | null;
  heatingEfficiencyPercent: string | null;
};

type DrawerKind = "edit" | "retire" | "replace" | null;

export function EquipmentComponentCard({
  customerId,
  locationId,
  systemId,
  equipment,
  roleLabel,
  specFields,
  provenanceLabel,
  jobHref,
  jobManageHref,
  priorUnitLabel,
  hasDeeperHistory,
}: {
  customerId: string;
  locationId: string;
  systemId: string | null;
  equipment: EquipmentComponentCardData;
  roleLabel: string;
  specFields: { label: string; value: string }[];
  provenanceLabel: string | null;
  jobHref: string | null;
  jobManageHref: string | null;
  priorUnitLabel: string | null;
  hasDeeperHistory: boolean;
}) {
  const router = useRouter();
  const [openDrawer, setOpenDrawer] = useState<DrawerKind>(null);
  const [history, setHistory] = useState<CustomerEquipmentHistoryUnitSummary[] | null>(null);
  const [isLoadingHistory, startHistoryTransition] = useTransition();

  const isCanonical = systemId !== null; // job_equipment (legacy) rows have no lifecycle actions
  const canManageDirectly = isCanonical;

  function loadFullHistory() {
    startHistoryTransition(async () => {
      const result = await loadEquipmentReplacementHistoryForCustomer({
        customerId,
        locationId,
        equipmentId: equipment.id,
      });
      setHistory(result);
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">{roleLabel}</div>
          {provenanceLabel ? <div className="mt-0.5 text-xs text-slate-500">{provenanceLabel}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {jobHref ? (
            <Link
              href={jobHref}
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              Open Job
            </Link>
          ) : null}
          <OverflowMenu
            items={
              canManageDirectly
                ? [
                    { label: "Edit", onSelect: () => setOpenDrawer("edit") },
                    { label: "Replace", onSelect: () => setOpenDrawer("replace") },
                    { label: "Retire", onSelect: () => setOpenDrawer("retire"), variant: "danger" },
                  ]
                : jobManageHref
                  ? [{ label: "Manage", onSelect: () => router.push(jobManageHref) }]
                  : []
            }
          />
        </div>
      </div>

      {specFields.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
          {specFields.map((field) => (
            <div key={field.label}>
              <div className="text-[11px] uppercase tracking-wide text-slate-400">{field.label}</div>
              <div className="text-sm text-slate-800">{field.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {priorUnitLabel ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <div>{priorUnitLabel}</div>
          {hasDeeperHistory ? (
            <button
              type="button"
              onClick={loadFullHistory}
              disabled={isLoadingHistory}
              className="mt-1 font-semibold text-blue-700 hover:text-blue-800 disabled:opacity-60"
            >
              {isLoadingHistory ? "Loading…" : history ? "Full history loaded" : "View full history"}
            </button>
          ) : null}
          {history && history.length > 0 ? (
            <ul className="mt-2 space-y-1 border-t border-slate-200 pt-2">
              {history.map((unit) => (
                <li key={unit.id}>
                  {[unit.manufacturer, unit.model].filter(Boolean).join(" ") || "Equipment"}
                  {unit.serial ? ` · Serial ${unit.serial}` : ""}
                  {unit.retiredAt ? ` · retired ${unit.retiredAt.slice(0, 10)}` : ""}
                  {unit.retireReason ? ` · ${unit.retireReason}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {isCanonical ? (
        <>
          <Drawer open={openDrawer === "edit"} onClose={() => setOpenDrawer(null)} title="Edit Equipment">
            <form action={updateCustomerLocationEquipmentFromForm} className="space-y-4">
              <input type="hidden" name="customer_id" value={customerId} />
              <input type="hidden" name="location_id" value={locationId} />
              <input type="hidden" name="equipment_id" value={equipment.id} />
              <EquipmentSpecFormFields
                idPrefix={`edit-${equipment.id}`}
                defaultValues={{
                  equipmentRole: equipment.equipmentRole,
                  manufacturer: equipment.manufacturer,
                  model: equipment.model,
                  serial: equipment.serial,
                  tonnage: equipment.tonnage,
                  refrigerantType: equipment.refrigerantType,
                  heatingCapacityKbtu: equipment.heatingCapacityKbtu,
                  heatingOutputBtu: equipment.heatingOutputBtu,
                  heatingEfficiencyPercent: equipment.heatingEfficiencyPercent,
                }}
              />
              <SubmitButton loadingText="Saving…" className="w-fit rounded-[10px] bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                Save Changes
              </SubmitButton>
            </form>
          </Drawer>

          <Drawer
            open={openDrawer === "retire"}
            onClose={() => setOpenDrawer(null)}
            title="Retire Equipment"
            description="The unit was removed, not replaced. This won't delete its history."
          >
            <form action={retireCustomerLocationEquipmentFromForm} className="space-y-4">
              <input type="hidden" name="customer_id" value={customerId} />
              <input type="hidden" name="location_id" value={locationId} />
              <input type="hidden" name="equipment_id" value={equipment.id} />
              <RetireReasonPicker idPrefix={`retire-${equipment.id}`} />
              <SubmitButton loadingText="Retiring…" className="w-fit rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-800 hover:bg-rose-100">
                Retire Equipment
              </SubmitButton>
            </form>
          </Drawer>

          <Drawer
            open={openDrawer === "replace"}
            onClose={() => setOpenDrawer(null)}
            title="Replace Equipment"
            description="Retires this unit and installs its replacement together — never leaves one without the other."
          >
            <form action={replaceCustomerLocationEquipmentFromForm} className="space-y-4">
              <input type="hidden" name="customer_id" value={customerId} />
              <input type="hidden" name="location_id" value={locationId} />
              <input type="hidden" name="equipment_id" value={equipment.id} />
              <input type="hidden" name="system_id" value={systemId ?? ""} />
              <RetireReasonPicker idPrefix={`replace-${equipment.id}`} />
              <div className="border-t border-slate-200 pt-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">New Unit</div>
                <EquipmentSpecFormFields idPrefix={`replace-new-${equipment.id}`} />
              </div>
              <ProvenancePicker idPrefix={`replace-${equipment.id}`} />
              <SubmitButton loadingText="Replacing…" className="w-fit rounded-[10px] bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                Replace Equipment
              </SubmitButton>
            </form>
          </Drawer>
        </>
      ) : null}
    </div>
  );
}

function RetireReasonPicker({ idPrefix }: { idPrefix: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-400" htmlFor={`${idPrefix}-reason`}>
        Retire Reason
      </label>
      <select
        id={`${idPrefix}-reason`}
        name="retire_reason"
        required
        defaultValue=""
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      >
        <option value="" disabled>
          Select a reason
        </option>
        {RETIRE_REASONS.map((reason) => (
          <option key={reason.value} value={reason.value}>
            {reason.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ProvenancePicker({ idPrefix }: { idPrefix: string }) {
  const [source, setSource] = useState<"standalone" | "job" | "contractor">("standalone");
  return (
    <div className="space-y-2 border-t border-slate-200 pt-4">
      <label className="block text-xs font-medium text-slate-400">Provenance</label>
      <select
        name="install_source"
        value={source}
        onChange={(event) => setSource(event.target.value as typeof source)}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      >
        <option value="standalone">Standalone (no job)</option>
        <option value="job">This job</option>
        <option value="contractor">Other contractor</option>
      </select>
      {source === "job" ? (
        <input
          name="source_job_id"
          required
          placeholder="Job ID"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      ) : null}
    </div>
  );
}
