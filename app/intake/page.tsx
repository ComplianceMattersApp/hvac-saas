// app/intake/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createJobFromIntake } from "@/lib/actions/intake-actions";
import JobCoreFields from "@/components/jobs/JobCoreFields";

type JobType = "ecc" | "service";

type EquipmentRole =
  | ""
  | "outdoor"
  | "indoor"
  | "furnace"
  | "air_handler"
  | "package"
  | "other";

type EquipmentRow = {
  make?: string; // we'll POST as "manufacturer"
  model?: string;
  serial?: string;
  tonnage?: string;
  refrigerant_type?: string; // visible but optional
  equipment_role?: EquipmentRole;
  notes?: string;
};

type SystemBlock = {
  label: string; // this becomes system_location
  equipment: EquipmentRow[];
};

export default function IntakePage() {
  const router = useRouter();

  const [jobType, setJobType] = useState<JobType>("ecc");

  // Scheduling (optional)
  const [scheduledDate, setScheduledDate] = useState<string>("");

  // Optional equipment
  const [showEquipment, setShowEquipment] = useState(false);
  const [systems, setSystems] = useState<SystemBlock[]>([
    {
      label: "",
      equipment: [
        {
          make: "",
          model: "",
          serial: "",
          tonnage: "",
          refrigerant_type: "",
          equipment_role: "",
          notes: "",
        },
      ],
    },
  ]);

  // Service title required / ECC optional
  const titleRequired = jobType === "service";

  // Equipment label required only if equipment is enabled AND any equipment is being entered
  const equipmentActive = useMemo(() => {
    if (!showEquipment) return false;

    return systems.some((sys) =>
      sys.equipment.some((e) =>
        [
          e.make,
          e.model,
          e.serial,
          e.tonnage,
          e.refrigerant_type,
          e.equipment_role,
          e.notes,
        ].some((v) => (v ?? "").trim().length > 0)
      )
    );
  }, [showEquipment, systems]);

  function updateSystemLabel(idx: number, value: string) {
    setSystems((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, label: value } : s))
    );
  }

  function updateEquipmentField(
    sysIdx: number,
    eqIdx: number,
    field: keyof EquipmentRow,
    value: string
  ) {
    setSystems((prev) =>
      prev.map((sys, i) => {
        if (i !== sysIdx) return sys;
        const nextEq = sys.equipment.map((eq, j) =>
          j === eqIdx ? { ...eq, [field]: value } : eq
        );
        return { ...sys, equipment: nextEq };
      })
    );
  }

  function addSystem() {
    setSystems((prev) => [
      ...prev,
      {
        label: "",
        equipment: [
          {
            make: "",
            model: "",
            serial: "",
            tonnage: "",
            refrigerant_type: "",
            equipment_role: "",
            notes: "",
          },
        ],
      },
    ]);
  }

  function removeSystem(idx: number) {
    setSystems((prev) => prev.filter((_, i) => i !== idx));
  }

  function addEquipmentRow(sysIdx: number) {
    setSystems((prev) =>
      prev.map((sys, i) => {
        if (i !== sysIdx) return sys;
        return {
          ...sys,
          equipment: [
            ...sys.equipment,
            {
              make: "",
              model: "",
              serial: "",
              tonnage: "",
              refrigerant_type: "",
              equipment_role: "",
              notes: "",
            },
          ],
        };
      })
    );
  }

  function removeEquipmentRow(sysIdx: number, eqIdx: number) {
    setSystems((prev) =>
      prev.map((sys, i) => {
        if (i !== sysIdx) return sys;
        const next = sys.equipment.filter((_, j) => j !== eqIdx);
        return {
          ...sys,
          equipment: next.length
            ? next
            : [
                {
                  make: "",
                  model: "",
                  serial: "",
                  tonnage: "",
                  refrigerant_type: "",
                  equipment_role: "",
                  notes: "",
                },
              ],
        };
      })
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Customer Intake</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Create Customer → Location → Job → Visit #1, then route into Ops
          correctly.
        </p>
      </header>

      {/* Server Action Submit */}
      <form
        action={createJobFromIntake}
        className="space-y-6"
        onSubmit={(e) => {
          // Hard UI guardrails before server action runs
          if (jobType === "service") {
            const titleEl = e.currentTarget.elements.namedItem(
              "title"
            ) as HTMLInputElement | null;
            if (!titleEl?.value?.trim()) {
              e.preventDefault();
              alert("Service jobs require a Job Title.");
              titleEl?.focus();
              return;
            }
          }

          if (showEquipment && equipmentActive) {
            // All system labels must be present
            const missingLabel = systems.some((s) => !s.label.trim());
            if (missingLabel) {
              e.preventDefault();
              alert(
                'If you add equipment, each system must have a Location Label (e.g., "Upstairs").'
              );
              return;
            }
          }
        }}
      >
        {/* Hidden inputs for server action */}
        <input type="hidden" name="job_type" value={jobType} />
        {jobType === "ecc" && (
          <input type="hidden" name="project_type" value="alteration" />
        )}

        {/* A) Job Type (TOP) */}
        <section className="rounded-xl border bg-white p-4">
          <h2 className="text-sm font-semibold">Job Type</h2>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`rounded-lg border px-3 py-3 text-sm font-medium ${
                jobType === "ecc" ? "border-black" : "border-neutral-300"
              }`}
              onClick={() => setJobType("ecc")}
            >
              ECC Test
            </button>

            <button
              type="button"
              className={`rounded-lg border px-3 py-3 text-sm font-medium ${
                jobType === "service" ? "border-black" : "border-neutral-300"
              }`}
              onClick={() => setJobType("service")}
            >
              Service
            </button>
          </div>

          <div className="mt-3 text-xs text-neutral-600">
            {jobType === "service"
              ? "Service requires a Job Title."
              : "ECC Title is optional (auto-title later)."}
          </div>
        </section>

        {/* Shared core fields (title/permit/customer/address/city/job_notes) */}
        <JobCoreFields mode="external" titleRequired={titleRequired} />

        <div className="text-xs text-neutral-600 -mt-3">
          You can always add more notes later from inside the job.
        </div>

        {/* Scheduling Inputs (optional) */}
        <section className="rounded-xl border bg-white p-4">
          <h2 className="text-sm font-semibold">Scheduling (Optional)</h2>
          <p className="mt-1 text-xs text-neutral-600">
            If a Scheduled Date is set → ops_status becomes <b>scheduled</b>.
            Otherwise → <b>need_to_schedule</b>.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="block text-sm font-medium">Scheduled Date</label>
              <input
                name="scheduled_date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block text-sm font-medium">Window Start</label>
              <input
                name="window_start"
                type="time"
                disabled={!scheduledDate}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-neutral-100"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block text-sm font-medium">Window End</label>
              <input
                name="window_end"
                type="time"
                disabled={!scheduledDate}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-neutral-100"
              />
            </div>
          </div>
        </section>

        {/* Optional Equipment */}
        <section className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Optional Equipment</h2>
              <p className="mt-1 text-xs text-neutral-600">
                Expand to add equipment now. You can always add more later on the
                job page.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowEquipment((v) => !v)}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              {showEquipment ? "Hide" : "Add Equipment"}
            </button>
          </div>

          {showEquipment && (
            <div className="mt-4 space-y-4">
              <div className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-700">
                <b>Rule:</b> If you enter equipment, each system needs a{" "}
                <b>Location Label</b> (e.g., “Upstairs”, “Downstairs”).
              </div>

              {systems.map((sys, sysIdx) => (
                <div key={sysIdx} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">System {sysIdx + 1}</h3>

                    {systems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSystem(sysIdx)}
                        className="rounded-lg border px-2 py-1 text-xs"
                      >
                        Remove System
                      </button>
                    )}
                  </div>

                  <div className="mt-3">
                    <label className="block text-sm font-medium">
                      Location Label{" "}
                      {equipmentActive ? (
                        <span className="text-red-600">*</span>
                      ) : (
                        <span className="text-neutral-500">
                          (required if equipment is entered)
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={sys.label}
                      onChange={(e) => updateSystemLabel(sysIdx, e.target.value)}
                      placeholder='e.g., "Upstairs", "Downstairs", "Zone 1"'
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="mt-4 space-y-3">
                    {sys.equipment.map((eq, eqIdx) => (
                      <div key={eqIdx} className="rounded-lg border bg-white p-3">
                        {/* This hidden input ensures each equipment row posts system_location */}
                        <input
                          type="hidden"
                          name="system_location"
                          value={sys.label}
                        />

                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-neutral-700">
                            Equipment {eqIdx + 1}
                          </div>

                          {sys.equipment.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeEquipmentRow(sysIdx, eqIdx)}
                              className="rounded-lg border px-2 py-1 text-xs"
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        {/* Role / Tonnage / Refrigerant */}
                        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div>
                            <label className="block text-xs font-medium">
                              Equipment Role
                            </label>
                            <select
                              name="equipment_role"
                              value={eq.equipment_role ?? ""}
                              onChange={(e) =>
                                updateEquipmentField(
                                  sysIdx,
                                  eqIdx,
                                  "equipment_role",
                                  e.target.value
                                )
                              }
                              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                            >
                              <option value="">(optional)</option>
                              <option value="outdoor">Outdoor</option>
                              <option value="indoor">Indoor</option>
                              <option value="furnace">Furnace</option>
                              <option value="air_handler">Air Handler</option>
                              <option value="package">Package</option>
                              <option value="other">Other</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-medium">
                              Tonnage
                            </label>
                            <input
                              type="text"
                              name="tonnage"
                              value={eq.tonnage ?? ""}
                              onChange={(e) =>
                                updateEquipmentField(
                                  sysIdx,
                                  eqIdx,
                                  "tonnage",
                                  e.target.value
                                )
                              }
                              placeholder="Optional"
                              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium">
                              Refrigerant Type
                            </label>
                            <input
                              type="text"
                              name="refrigerant_type"
                              value={eq.refrigerant_type ?? ""}
                              onChange={(e) =>
                                updateEquipmentField(
                                  sysIdx,
                                  eqIdx,
                                  "refrigerant_type",
                                  e.target.value
                                )
                              }
                              placeholder="Optional"
                              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                            />
                          </div>
                        </div>

                        {/* Manufacturer/Model/Serial */}
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div>
                            <label className="block text-xs font-medium">
                              Manufacturer
                            </label>
                            <input
                              type="text"
                              name="manufacturer"
                              value={eq.make ?? ""}
                              onChange={(e) =>
                                updateEquipmentField(
                                  sysIdx,
                                  eqIdx,
                                  "make",
                                  e.target.value
                                )
                              }
                              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium">
                              Model
                            </label>
                            <input
                              type="text"
                              name="model"
                              value={eq.model ?? ""}
                              onChange={(e) =>
                                updateEquipmentField(
                                  sysIdx,
                                  eqIdx,
                                  "model",
                                  e.target.value
                                )
                              }
                              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium">
                              Serial
                            </label>
                            <input
                              type="text"
                              name="serial"
                              value={eq.serial ?? ""}
                              onChange={(e) =>
                                updateEquipmentField(
                                  sysIdx,
                                  eqIdx,
                                  "serial",
                                  e.target.value
                                )
                              }
                              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                            />
                          </div>
                        </div>

                        {/* Notes */}
                        <div className="mt-3">
                          <label className="block text-xs font-medium">Notes</label>
                          <input
                            type="text"
                            name="notes"
                            value={eq.notes ?? ""}
                            onChange={(e) =>
                              updateEquipmentField(
                                sysIdx,
                                eqIdx,
                                "notes",
                                e.target.value
                              )
                            }
                            placeholder="Optional"
                            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => addEquipmentRow(sysIdx)}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    >
                      + Add Another Equipment Item
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addSystem}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                + Add Another System
              </button>
            </div>
          )}
        </section>

        {/* Submit */}
        <section className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border px-4 py-2 text-sm"
          >
            Cancel
          </button>

          <button
            type="submit"
            className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
          >
            Create Job
          </button>
        </section>
      </form>
    </div>
  );
}