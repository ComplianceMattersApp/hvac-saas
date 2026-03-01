// app/jobs/new/NewJobForm.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { createJobFromForm } from "@/lib/actions";
import JobCoreFields from "@/components/jobs/JobCoreFields";

type Contractor = { id: string; name: string };

type ExistingCustomer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
};

type LocationRow = {
  id: string;
  nickname: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type MyContractor = { id: string; name: string } | null;

type ComponentType =
  | "condenser_ac"
  | "heat_pump_outdoor"
  | "furnace_gas"
  | "air_handler_electric"
  | "package_gas_electric"
  | "package_heat_pump"
  | "mini_split_outdoor"
  | "mini_split_head"
  | "other";

type EquipmentComponent = {
  id: string;
  type: ComponentType;
  manufacturer: string;
  model: string;
  serial: string;
  refrigerant_type: string;
  tonnage: string; // keep string in UI; server can coerce
  notes: string;
};

type EquipmentSystem = {
  id: string;
  name: string; // System Location/Name (required if any component selected)
  components: EquipmentComponent[];
};

const DRAFT_KEY = "cm:newjob:draft:v1";

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function componentLabel(t: ComponentType) {
  switch (t) {
    case "condenser_ac":
      return "Condenser (A/C)";
    case "heat_pump_outdoor":
      return "Heat Pump (Outdoor)";
    case "furnace_gas":
      return "Furnace (Gas)";
    case "air_handler_electric":
      return "Air Handler (Electric)";
    case "package_gas_electric":
      return "Package Unit (Gas/Electric)";
    case "package_heat_pump":
      return "Package Unit (Heat Pump)";
    case "mini_split_outdoor":
      return "Mini-Split Outdoor";
    case "mini_split_head":
      return "Mini-Split Indoor Head";
    default:
      return "Other";
  }
}

export default function NewJobForm({
  contractors,
  existingCustomer,
  locations = [],
  myContractor,
}: {
  contractors: Contractor[];
  existingCustomer?: ExistingCustomer | null;
  locations?: LocationRow[];
  myContractor?: MyContractor;
}) {

  const isContractorMode = Boolean(myContractor?.id);
  
  const isExistingCustomer = Boolean(existingCustomer?.id);

  const [locationId, setLocationId] = useState<string>(() => {
  if (!isExistingCustomer) return "";
  return locations.length ? locations[0].id : "__new__";
});

  const selectedLoc = isExistingCustomer
    ? locations.find((l) => l.id === locationId) ?? null
    : null;

  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");

  // Contractor selection (internal/admin only). Contractor users are auto-tied.
 const [contractorId, setContractorId] = useState<string>(() => myContractor?.id ?? "");

  const [jobType, setJobType] = useState<"ecc" | "service">("ecc");

const [billingRecipient, setBillingRecipient] = useState<
    "contractor" | "customer" | "other"
  >(myContractor?.id ? "contractor" : "customer");

  const [projectType, setProjectType] = useState<
    "alteration" | "all_new" | "new_construction"
  >("alteration");

  // Billing fields (optional unless "other")
  const [billingName, setBillingName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [billingPhone, setBillingPhone] = useState("");
  const [billingAddr1, setBillingAddr1] = useState("");
  const [billingAddr2, setBillingAddr2] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingState, setBillingState] = useState("CA");
  const [billingZip, setBillingZip] = useState("");

  // Optional equipment
  const [systems, setSystems] = useState<EquipmentSystem[]>([]);

  const isNewLocation = isExistingCustomer && locationId === "__new__";

  function onQuickWindowChange(value: string) {
    if (!value) return;
    const [start, end] = value.split("-");
    if (start) setWindowStart(start);
    if (end) setWindowEnd(end);
  }

  const equipmentHasAnyComponents = useMemo(
    () => systems.some((s) => s.components.length > 0),
    [systems]
  );

  const systemsNeedingName = useMemo(() => {
    return systems
      .filter((s) => s.components.length > 0 && !s.name.trim())
      .map((s) => s.id);
  }, [systems]);

  const canSubmit = systemsNeedingName.length === 0;

  const equipmentJson = useMemo(() => {
    // Only send payload when something was actually selected.
    const payloadSystems = systems
      .filter((s) => s.components.length > 0)
      .map((s) => ({
        name: s.name.trim(),
        components: s.components.map((c) => ({
          type: c.type,
          manufacturer: c.manufacturer.trim() || null,
          model: c.model.trim() || null,
          serial: c.serial.trim() || null,
          refrigerant_type: c.refrigerant_type.trim() || null,
          tonnage: c.tonnage.trim() || null,
          notes: c.notes.trim() || null,
        })),
      }))
      // if name is blank, keep it (server will reject), but we already block submit client-side
      ;

    if (payloadSystems.length === 0) return "";
    return JSON.stringify({ systems: payloadSystems });
  }, [systems]);

  // ---- Draft save/restore ----
  const [draftFound, setDraftFound] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      setDraftFound(Boolean(raw));
    } catch {
      // ignore
    }
  }, []);

  function saveDraft() {
    try {
      const draft = {
        windowStart,
        windowEnd,
        contractorId,
        jobType,
        billingRecipient,
        projectType,
        billingName,
        billingEmail,
        billingPhone,
        billingAddr1,
        billingAddr2,
        billingCity,
        billingState,
        billingZip,
        systems,
        locationId,
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setDraftFound(true);
      alert("Draft saved on this device.");
    } catch {
      alert("Unable to save draft in this browser.");
    }
  }

  function restoreDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      setWindowStart(d.windowStart ?? "");
      setWindowEnd(d.windowEnd ?? "");
      setContractorId(d.contractorId ?? "");
      setJobType(d.jobType ?? "ecc");
      setBillingRecipient(d.billingRecipient ?? (myContractor?.id ? "contractor" : "customer"));
      setProjectType(d.projectType ?? "alteration");

      setBillingName(d.billingName ?? "");
      setBillingEmail(d.billingEmail ?? "");
      setBillingPhone(d.billingPhone ?? "");
      setBillingAddr1(d.billingAddr1 ?? "");
      setBillingAddr2(d.billingAddr2 ?? "");
      setBillingCity(d.billingCity ?? "");
      setBillingState(d.billingState ?? "CA");
      setBillingZip(d.billingZip ?? "");

      setSystems(d.systems ?? []);
      if (!myContractor?.id) setLocationId(d.locationId ?? locationId);

      alert("Draft restored.");
    } catch {
      alert("Draft was corrupted and could not be restored.");
    }
  }

  function discardDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
      setDraftFound(false);
      alert("Draft discarded.");
    } catch {
      // ignore
    }
  }

  function addSystem() {
    setSystems((prev) => [
      ...prev,
      { id: uid(), name: "", components: [] },
    ]);
  }

  function removeSystem(systemId: string) {
    setSystems((prev) => prev.filter((s) => s.id !== systemId));
  }

  function setSystemName(systemId: string, name: string) {
    setSystems((prev) =>
      prev.map((s) => (s.id === systemId ? { ...s, name } : s))
    );
  }

  function addComponent(systemId: string, type: ComponentType) {
    setSystems((prev) =>
      prev.map((s) => {
        if (s.id !== systemId) return s;
        const next: EquipmentComponent = {
          id: uid(),
          type,
          manufacturer: "",
          model: "",
          serial: "",
          refrigerant_type: "",
          tonnage: "",
          notes: "",
        };
        return { ...s, components: [...s.components, next] };
      })
    );
  }

  function removeComponent(systemId: string, compId: string) {
    setSystems((prev) =>
      prev.map((s) => {
        if (s.id !== systemId) return s;
        const nextComps = s.components.filter((c) => c.id !== compId);
        return { ...s, components: nextComps };
      })
    );
  }

  function patchComponent(systemId: string, compId: string, patch: Partial<EquipmentComponent>) {
    setSystems((prev) =>
      prev.map((s) => {
        if (s.id !== systemId) return s;
        return {
          ...s,
          components: s.components.map((c) => (c.id === compId ? { ...c, ...patch } : c)),
        };
      })
    );
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-xl font-semibold mb-2">New Job</h1>

      <div className="text-sm text-gray-600 mb-6">
        <div className="font-medium text-gray-800">How this works</div>
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li>Fill out the core job + customer info.</li>
          <li>
            (Optional) Add equipment if you have it — even a single component (furnace-only, condenser-only, etc.).
          </li>
          <li>Submit and the job will appear in the Ops queue.</li>
        </ul>
      </div>

      {draftFound && (
        <div className="rounded-lg border p-3 mb-4 bg-gray-50">
          <div className="text-sm font-medium mb-2">Draft found on this device</div>
          <div className="flex gap-2">
            <button type="button" className="border rounded px-3 py-1 text-sm" onClick={restoreDraft}>
              Restore
            </button>
            <button type="button" className="border rounded px-3 py-1 text-sm" onClick={discardDraft}>
              Discard
            </button>
          </div>
        </div>
      )}

      <form action={createJobFromForm} className="space-y-4">
        {/* Identity-tied contractor */}
        {myContractor?.id ? (
          <>
            <div className="rounded-lg border p-3">
              <div className="text-sm font-medium">Submitting as</div>
              <div className="text-sm text-gray-700 mt-1">{myContractor.name}</div>
            </div>
            <input type="hidden" name="contractor_id" value={myContractor.id} />
          </>
        ) : (
          <div className="rounded-lg border p-3 space-y-2">
            <label className="block text-sm font-medium">Contractor (optional)</label>
            <select
              name="contractor_id"
              className="border rounded w-full p-2"
              value={contractorId}
              onChange={(e) => {
                const v = e.target.value;
                setContractorId(v);
                // Let server decide default, but keep UI sensible
                if (v && billingRecipient === "customer") setBillingRecipient("contractor");
                if (!v && billingRecipient === "contractor") setBillingRecipient("customer");
              }}
            >
              <option value="">— None —</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Job Type */}
        <div className="rounded-lg border p-3 space-y-2">
          <label className="block text-sm font-medium">Job Type</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="_jobTypeUi"
                value="ecc"
                checked={jobType === "ecc"}
                onChange={() => setJobType("ecc")}
              />
              ECC
            </label>

            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="_jobTypeUi"
                value="service"
                checked={jobType === "service"}
                onChange={() => setJobType("service")}
              />
              Service
            </label>
          </div>

          {/* real submitted value */}
          <input type="hidden" name="job_type" value={jobType} />
        </div>

        {/* Project Type */}
{jobType !== "service" && (
  <div className="rounded-lg border p-3 space-y-2">
    <label className="block text-sm font-medium">Project Type (ECC)</label>
    <select
      name="project_type"
      className="border rounded w-full p-2"
      value={projectType}
      onChange={(e) => setProjectType(e.target.value as any)}
    >
      <option value="alteration">Alteration</option>
      <option value="all_new">All New</option>
      <option value="new_construction">New Construction</option>
    </select>
  </div>
)}

{/* Scheduling (internal only) */}
{!isContractorMode && (
  <div className="rounded-lg border p-3 space-y-2">
    <div className="text-sm font-medium">Scheduling (wall-clock)</div>
    <div className="text-xs text-gray-600">
      Enter times exactly as you want them shown (ex: 08:00). No timezone conversion.
    </div>

    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="text-xs text-gray-600">Window Start</label>
        <input
          type="time"
          name="window_start"
          className="border rounded w-full p-2"
          value={windowStart}
          onChange={(e) => setWindowStart(e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs text-gray-600">Window End</label>
        <input
          type="time"
          name="window_end"
          className="border rounded w-full p-2"
          value={windowEnd}
          onChange={(e) => setWindowEnd(e.target.value)}
        />
      </div>
    </div>

    <div>
      <label className="text-xs text-gray-600">Quick Window</label>
      <select
        className="border rounded w-full p-2"
        onChange={(e) => onQuickWindowChange(e.target.value)}
      >
        <option value="">— Select —</option>
        <option value="08:00-10:00">08:00-10:00</option>
        <option value="10:00-12:00">10:00-12:00</option>
        <option value="12:00-14:00">12:00-14:00</option>
        <option value="14:00-16:00">14:00-16:00</option>
      </select>
    </div>
  </div>
)}

{/* Existing Customer / Location Mode */}
{isExistingCustomer && existingCustomer?.id ? (
  <>
    <div className="rounded-lg border p-3 space-y-1">
      <div className="text-sm font-semibold">Customer (Existing)</div>
      <div className="text-sm text-gray-700">
        {(existingCustomer.first_name ?? "") + " " + (existingCustomer.last_name ?? "")}
      </div>
      {existingCustomer.phone ? (
        <div className="text-xs text-gray-600">Phone: {existingCustomer.phone}</div>
      ) : null}
      {existingCustomer.email ? (
        <div className="text-xs text-gray-600">Email: {existingCustomer.email}</div>
      ) : null}

      <input type="hidden" name="customer_id" value={existingCustomer.id} />
    </div>

    <div className="rounded-lg border p-3 space-y-2">
      <div className="text-sm font-semibold">Service Location</div>

      <label className="block text-sm font-medium">Pick a location</label>
      <select
        className="border rounded w-full p-2"
        value={locationId}
        onChange={(e) => setLocationId(e.target.value)}
      >
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {(l.nickname ? `${l.nickname} — ` : "") + (l.address_line1 ?? "Address") + ", " + (l.city ?? "")}
          </option>
        ))}
        <option value="__new__">+ Add new location…</option>
      </select>

      {!isNewLocation ? (
        <input type="hidden" name="location_id" value={locationId} />
      ) : (
        <div className="space-y-2 mt-2">
          <div className="text-xs text-gray-600">
            New location details (required for new location)
          </div>

          <input
            className="border rounded w-full p-2"
            name="location_nickname"
            placeholder="Nickname (optional) e.g., Main House, ADU"
          />

          <input
            className="border rounded w-full p-2"
            name="address_line1"
            placeholder="Address"
            required
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              className="border rounded w-full p-2"
              name="city"
              placeholder="City"
              required
            />
            <input
              className="border rounded w-full p-2"
              name="zip"
              placeholder="ZIP"
              required
            />
          </div>
        </div>
      )}
    </div>
  </>
) : null}


       
          <JobCoreFields
  mode={myContractor?.id ? "external" : "internal"}
  titleRequired={jobType === "service"}
  hideCustomer={isExistingCustomer}
  hideServiceLocation={isExistingCustomer}
/>

        {/* Billing Recipient */}
        <div className="rounded-lg border p-3 space-y-2">
          <label className="block text-sm font-medium">Billing Recipient</label>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="_billingRecipientUi"
                value="contractor"
                checked={billingRecipient === "contractor"}
                onChange={() => setBillingRecipient("contractor")}
                disabled={Boolean(!myContractor?.id && !contractorId)}
              />
              Contractor (company)
              {!myContractor?.id && !contractorId && (
                <span className="text-xs text-gray-500">(select contractor first)</span>
              )}
            </label>

            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="_billingRecipientUi"
                value="customer"
                checked={billingRecipient === "customer"}
                onChange={() => setBillingRecipient("customer")}
              />
              Customer / Homeowner
            </label>

            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="_billingRecipientUi"
                value="other"
                checked={billingRecipient === "other"}
                onChange={() => setBillingRecipient("other")}
              />
              Other (custom)
            </label>
          </div>

          <input type="hidden" name="billing_recipient" value={billingRecipient} />

          {billingRecipient === "other" && (
            <div className="mt-2 space-y-2">
              <div className="text-xs text-gray-600">
                If billing is “Other”, please enter billing name + address.
              </div>

              <input
                className="border rounded w-full p-2"
                name="billing_name"
                placeholder="Billing name"
                value={billingName}
                onChange={(e) => setBillingName(e.target.value)}
              />
              <input
                className="border rounded w-full p-2"
                name="billing_email"
                placeholder="Billing email (optional)"
                value={billingEmail}
                onChange={(e) => setBillingEmail(e.target.value)}
              />
              <input
                className="border rounded w-full p-2"
                name="billing_phone"
                placeholder="Billing phone (optional)"
                value={billingPhone}
                onChange={(e) => setBillingPhone(e.target.value)}
              />
              <input
                className="border rounded w-full p-2"
                name="billing_address_line1"
                placeholder="Address line 1"
                value={billingAddr1}
                onChange={(e) => setBillingAddr1(e.target.value)}
              />
              <input
                className="border rounded w-full p-2"
                name="billing_address_line2"
                placeholder="Address line 2 (optional)"
                value={billingAddr2}
                onChange={(e) => setBillingAddr2(e.target.value)}
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  className="border rounded w-full p-2 col-span-2"
                  name="billing_city"
                  placeholder="City"
                  value={billingCity}
                  onChange={(e) => setBillingCity(e.target.value)}
                />
                <input
                  className="border rounded w-full p-2"
                  name="billing_state"
                  placeholder="State"
                  value={billingState}
                  onChange={(e) => setBillingState(e.target.value)}
                />
              </div>
              <input
                className="border rounded w-full p-2"
                name="billing_zip"
                placeholder="ZIP"
                value={billingZip}
                onChange={(e) => setBillingZip(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Optional Equipment */}
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Optional Equipment</div>
              <div className="text-xs text-gray-600 mt-1">
                Add what you know — all equipment fields are optional.
                <br />
                <span className="font-medium">
                  Rule:
                </span>{" "}
                If you add a component, you must name the system (Upstairs/Downstairs/ADU) so tests map correctly.
              </div>
            </div>

            <button
              type="button"
              className="border rounded px-3 py-1 text-sm"
              onClick={addSystem}
            >
              Add System
            </button>
          </div>

          {systems.length === 0 && (
            <div className="text-sm text-gray-600">
              No systems added. (That’s fine.)
            </div>
          )}

          {systems.map((sys, idx) => {
            const nameRequired = sys.components.length > 0;
            const showNameError = nameRequired && !sys.name.trim();

            return (
              <div key={sys.id} className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">System {idx + 1}</div>
                  <button
                    type="button"
                    className="text-sm text-red-600"
                    onClick={() => removeSystem(sys.id)}
                  >
                    Remove
                  </button>
                </div>

                <div>
                  <label className="block text-xs text-gray-600">
                    System Location/Name {nameRequired ? "(required)" : "(optional)"}
                  </label>
                  <input
                    className={`border rounded w-full p-2 ${showNameError ? "border-red-500" : ""}`}
                    placeholder='Examples: "Upstairs", "Main House", "ADU", "Zone 1"'
                    value={sys.name}
                    onChange={(e) => setSystemName(sys.id, e.target.value)}
                  />
                  {showNameError && (
                    <div className="text-xs text-red-600 mt-1">
                      System name is required when any component is added.
                    </div>
                  )}
                </div>

                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-600">Add Component</label>
                    <select
                      className="border rounded w-full p-2"
                      defaultValue=""
                      onChange={(e) => {
                        const v = e.target.value as ComponentType;
                        if (!v) return;
                        addComponent(sys.id, v);
                        e.currentTarget.value = "";
                      }}
                    >
                      <option value="">— Select —</option>
                      <option value="condenser_ac">Condenser (A/C)</option>
                      <option value="heat_pump_outdoor">Heat Pump (Outdoor)</option>
                      <option value="furnace_gas">Furnace (Gas)</option>
                      <option value="air_handler_electric">Air Handler (Electric)</option>
                      <option value="package_gas_electric">Package Unit (Gas/Electric)</option>
                      <option value="package_heat_pump">Package Unit (Heat Pump)</option>
                      <option value="mini_split_outdoor">Mini-Split Outdoor</option>
                      <option value="mini_split_head">Mini-Split Indoor Head</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                {sys.components.length === 0 ? (
                  <div className="text-sm text-gray-600">No components added yet.</div>
                ) : (
                  <div className="space-y-3">
                    {sys.components.map((c) => (
                      <div key={c.id} className="rounded border p-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">{componentLabel(c.type)}</div>
                          <button
                            type="button"
                            className="text-sm text-red-600"
                            onClick={() => removeComponent(sys.id, c.id)}
                          >
                            Remove
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <input
                            className="border rounded p-2"
                            placeholder="Manufacturer (optional)"
                            value={c.manufacturer}
                            onChange={(e) => patchComponent(sys.id, c.id, { manufacturer: e.target.value })}
                          />
                          <input
                            className="border rounded p-2"
                            placeholder="Model (optional)"
                            value={c.model}
                            onChange={(e) => patchComponent(sys.id, c.id, { model: e.target.value })}
                          />
                          <input
                            className="border rounded p-2"
                            placeholder="Serial (optional)"
                            value={c.serial}
                            onChange={(e) => patchComponent(sys.id, c.id, { serial: e.target.value })}
                          />
                          <input
                            className="border rounded p-2"
                            placeholder="Tonnage (optional)"
                            value={c.tonnage}
                            onChange={(e) => patchComponent(sys.id, c.id, { tonnage: e.target.value })}
                          />
                        </div>

                        {(c.type === "condenser_ac" ||
                          c.type === "heat_pump_outdoor" ||
                          c.type === "package_gas_electric" ||
                          c.type === "package_heat_pump" ||
                          c.type === "mini_split_outdoor") && (
                          <input
                            className="border rounded w-full p-2"
                            placeholder="Refrigerant type (optional)"
                            value={c.refrigerant_type}
                            onChange={(e) => patchComponent(sys.id, c.id, { refrigerant_type: e.target.value })}
                          />
                        )}

                        <textarea
                          className="border rounded w-full p-2"
                          placeholder="Notes (optional)"
                          value={c.notes}
                          onChange={(e) => patchComponent(sys.id, c.id, { notes: e.target.value })}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* equipment_json payload */}
          <input type="hidden" name="equipment_json" value={equipmentJson} />
        </div>

        {!canSubmit && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            Please name each system that has components. (Example: Upstairs / Downstairs / ADU)
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            className="border rounded px-3 py-2 text-sm"
            onClick={saveDraft}
          >
            Save Draft
          </button>

          <button
            type="submit"
            className={`rounded px-3 py-2 text-sm text-white ${canSubmit ? "bg-black" : "bg-gray-400 cursor-not-allowed"}`}
            disabled={!canSubmit}
            onClick={() => {
              // If submit succeeds, server will redirect away. We can safely clear draft on click.
              try {
                localStorage.removeItem(DRAFT_KEY);
              } catch {}
            }}
          >
            Create Job
          </button>
        </div>
      </form>
    </div>
  );
}