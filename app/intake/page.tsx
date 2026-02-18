// app/intake/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createJobFromIntake } from "@/lib/actions/intake-actions";

type JobType = "ecc" | "service";

type EquipmentRow = {
  make?: string;
  model?: string;
  serial?: string;
  notes?: string;
};

type SystemBlock = {
  label: string;
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
    { label: "", equipment: [{ make: "", model: "", serial: "", notes: "" }] },
  ]);

  // Service title required / ECC optional
  const titleRequired = jobType === "service";

  // Equipment label required only if equipment is enabled AND any equipment is being entered
  const equipmentActive = useMemo(() => {
    if (!showEquipment) return false;

    // If any field in any equipment row has content, we consider equipment being entered.
    return systems.some((sys) =>
      sys.equipment.some((e) =>
        [e.make, e.model, e.serial, e.notes].some((v) => (v ?? "").trim().length > 0)
      )
    );
  }, [showEquipment, systems]);

  const equipmentJson = useMemo(() => JSON.stringify(systems), [systems]);

  function updateSystemLabel(idx: number, value: string) {
    setSystems((prev) => prev.map((s, i) => (i === idx ? { ...s, label: value } : s)));
  }

  function updateEquipmentField(sysIdx: number, eqIdx: number, field: keyof EquipmentRow, value: string) {
    setSystems((prev) =>
      prev.map((sys, i) => {
        if (i !== sysIdx) return sys;
        const nextEq = sys.equipment.map((eq, j) => (j === eqIdx ? { ...eq, [field]: value } : eq));
        return { ...sys, equipment: nextEq };
      })
    );
  }

  function addSystem() {
    setSystems((prev) => [...prev, { label: "", equipment: [{ make: "", model: "", serial: "", notes: "" }] }]);
  }

  function removeSystem(idx: number) {
    setSystems((prev) => prev.filter((_, i) => i !== idx));
  }

  function addEquipmentRow(sysIdx: number) {
    setSystems((prev) =>
      prev.map((sys, i) => {
        if (i !== sysIdx) return sys;
        return { ...sys, equipment: [...sys.equipment, { make: "", model: "", serial: "", notes: "" }] };
      })
    );
  }

  function removeEquipmentRow(sysIdx: number, eqIdx: number) {
    setSystems((prev) =>
      prev.map((sys, i) => {
        if (i !== sysIdx) return sys;
        const next = sys.equipment.filter((_, j) => j !== eqIdx);
        return { ...sys, equipment: next.length ? next : [{ make: "", model: "", serial: "", notes: "" }] };
      })
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Customer Intake</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Create Customer → Location → Job → Visit #1, then route into Ops correctly.
        </p>
      </header>

      {/* Server Action Submit */}
      <form
        action={createJobFromIntake}
        className="space-y-6"
        onSubmit={(e) => {
          // Hard UI guardrails before server action runs
          if (jobType === "service") {
            const titleEl = (e.currentTarget.elements.namedItem("title") as HTMLInputElement | null);
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
              alert("If you add equipment, each system must have a Location Label (System label).");
              return;
            }
          }
        }}
      >
        {/* Hidden inputs for server action */}
        <input type="hidden" name="job_type" value={jobType} />
        <input type="hidden" name="equipment_enabled" value={showEquipment ? "1" : "0"} />
        <input type="hidden" name="equipment_json" value={equipmentJson} />

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
            {jobType === "service" ? "Service requires a Job Title." : "ECC Title is optional (auto-title later)."}
          </div>
        </section>

        {/* B + C) Title + Permit */}
        <section className="rounded-xl border bg-white p-4">
          <h2 className="text-sm font-semibold">Job Details</h2>

          <div className="mt-3 space-y-3">
            <div>
              <label className="block text-sm font-medium">
                Job Title {titleRequired ? <span className="text-red-600">*</span> : <span className="text-neutral-500">(optional)</span>}
              </label>
              <input
                name="title"
                type="text"
                required={titleRequired}
                placeholder={jobType === "service" ? "e.g., Duct Cleaning, HVAC Repair, Dryer Vent" : "Optional for ECC"}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium">
                Permit Number <span className="text-neutral-500">(optional)</span>
              </label>
              <input
                name="permit_number"
                type="text"
                placeholder="Optional for both ECC and Service"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
          </div>
        </section>

        {/* D) Customer Info */}
        <section className="rounded-xl border bg-white p-4">
          <h2 className="text-sm font-semibold">Customer</h2>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">
                First Name <span className="text-red-600">*</span>
              </label>
              <input
                name="customer_first_name"
                type="text"
                required
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium">
                Last Name <span className="text-red-600">*</span>
              </label>
              <input
                name="customer_last_name"
                type="text"
                required
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium">
                Phone <span className="text-red-600">*</span>
              </label>
              <input
                name="customer_phone"
                type="tel"
                required
                placeholder="(###) ###-####"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium">
                Email <span className="text-neutral-500">(optional)</span>
              </label>
              <input
                name="customer_email"
                type="email"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
          </div>
        </section>

        {/* E) Location Info */}
        <section className="rounded-xl border bg-white p-4">
          <h2 className="text-sm font-semibold">Service Location</h2>

          <div className="mt-3 space-y-3">
            <div>
              <label className="block text-sm font-medium">
                Service Address <span className="text-red-600">*</span>
              </label>
              <input
                name="address_line1"
                type="text"
                required
                placeholder="123 Main St"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium">
                  City <span className="text-red-600">*</span>
                </label>
                <input
                  name="city"
                  type="text"
                  required
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">
                  Notes <span className="text-neutral-500">(optional)</span>
                </label>
                <input
                  name="location_notes"
                  type="text"
                  placeholder="Gate code / best time to call"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
        </section>

        {/* F) Scheduling Inputs (optional) */}
        <section className="rounded-xl border bg-white p-4">
          <h2 className="text-sm font-semibold">Scheduling (Optional)</h2>
          <p className="mt-1 text-xs text-neutral-600">
            If a Scheduled Date is set → ops_status becomes <b>scheduled</b>. Otherwise → <b>need_to_schedule</b>.
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

        {/* G) Optional Equipment */}
        <section className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Optional Equipment</h2>
              <p className="mt-1 text-xs text-neutral-600">
                Expand to add equipment now. You can always add later on the job page.
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
                <b>Rule:</b> If you enter equipment, each system needs a <b>Location Label</b> (e.g., “Upstairs”, “Downstairs”).
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
                      {equipmentActive ? <span className="text-red-600">*</span> : <span className="text-neutral-500">(required if equipment is entered)</span>}
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

                        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div>
                            <label className="block text-xs font-medium">Make</label>
                            <input
                              type="text"
                              value={eq.make ?? ""}
                              onChange={(e) => updateEquipmentField(sysIdx, eqIdx, "make", e.target.value)}
                              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium">Model</label>
                            <input
                              type="text"
                              value={eq.model ?? ""}
                              onChange={(e) => updateEquipmentField(sysIdx, eqIdx, "model", e.target.value)}
                              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium">Serial</label>
                            <input
                              type="text"
                              value={eq.serial ?? ""}
                              onChange={(e) => updateEquipmentField(sysIdx, eqIdx, "serial", e.target.value)}
                              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                            />
                          </div>
                        </div>

                        <div className="mt-3">
                          <label className="block text-xs font-medium">Notes</label>
                          <input
                            type="text"
                            value={eq.notes ?? ""}
                            onChange={(e) => updateEquipmentField(sysIdx, eqIdx, "notes", e.target.value)}
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
