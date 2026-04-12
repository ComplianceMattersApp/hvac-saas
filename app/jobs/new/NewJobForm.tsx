// app/jobs/new/NewJobForm

"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createJobFromForm } from "@/lib/actions";
import JobCoreFields from "@/components/jobs/JobCoreFields";
import ActionFeedback from "@/components/ui/ActionFeedback";

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
  | "coil"
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
  heating_output_btu: string; // furnace only
  heating_efficiency_percent: string; // furnace only
  notes: string;
};

type EquipmentSystem = {
  id: string;
  name: string; // System Location/Name (required if any component selected)
  components: EquipmentComponent[];
};

const DRAFT_KEY = "cm:newjob:draft:v1";

type NewJobDraft = {
  windowStart?: string;
  windowEnd?: string;
  scheduledDate?: string;
  contractorId?: string;
  jobType?: "ecc" | "service";
  billingRecipient?: "contractor" | "customer" | "other";
  projectType?: "alteration" | "all_new" | "new_construction";
  billingName?: string;
  billingEmail?: string;
  billingPhone?: string;
  billingAddr1?: string;
  billingAddr2?: string;
  billingCity?: string;
  billingState?: string;
  billingZip?: string;
  systems?: EquipmentSystem[];
  locationId?: string;
};

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

function componentUsesHeatingCapacity(t: ComponentType) {
  return t === "furnace_gas";
}

function readValidDraft(): NewJobDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return parsed as NewJobDraft;
  } catch {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore storage cleanup failures
    }
    return null;
  }
}

export default function NewJobForm({
  contractors,
  existingCustomer,
  locations = [],
  myContractor,
  errorCode,
}: {
  contractors: Contractor[];
  existingCustomer?: ExistingCustomer | null;
  locations?: LocationRow[];
  myContractor?: MyContractor;
  errorCode?: string | null;
}) {

  const isContractorMode = Boolean(myContractor?.id);
  const router = useRouter();
  
  const isExistingCustomer = Boolean(existingCustomer?.id);

  const [locationId, setLocationId] = useState<string>(() => {
  if (!isExistingCustomer) return "";
  return locations.length ? locations[0].id : "__new__";
});

  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLockedRef = useRef(false);

  const isNewLocation = isExistingCustomer && locationId === "__new__";

  function onQuickWindowChange(value: string) {
    if (!value) return;
    const [start, end] = value.split("-");
    if (start) setWindowStart(start);
    if (end) setWindowEnd(end);
  }

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
          tonnage: componentUsesHeatingCapacity(c.type) ? null : c.tonnage.trim() || null,
          heating_capacity_kbtu: componentUsesHeatingCapacity(c.type)
            ? c.tonnage.trim() || null
            : null,
          heating_output_btu: componentUsesHeatingCapacity(c.type)
            ? c.heating_output_btu.trim() || null
            : null,
          heating_efficiency_percent: componentUsesHeatingCapacity(c.type)
            ? c.heating_efficiency_percent.trim() || null
            : null,
          notes: c.notes.trim() || null,
        })),
      }))
      // if name is blank, keep it (server will reject), but we already block submit client-side
      ;

    if (payloadSystems.length === 0) return "";
    return JSON.stringify({ systems: payloadSystems });
  }, [systems]);

  // ---- Draft save/restore ----
  const [draftFound, setDraftFound] = useState(() => {
    return Boolean(readValidDraft());
  });

  function saveDraft() {
    try {
      const draft = {
        windowStart,
        windowEnd,
        scheduledDate,
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
    const d = readValidDraft();
    if (!d) {
      setDraftFound(false);
      alert("Draft was corrupted and could not be restored.");
      return;
    }

    setWindowStart(d.windowStart ?? "");
    setWindowEnd(d.windowEnd ?? "");
    setScheduledDate(d.scheduledDate ?? "");
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

    setSystems(Array.isArray(d.systems) ? d.systems : []);
    if (isExistingCustomer) setLocationId(d.locationId ?? locationId);

    alert("Draft restored.");
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
          heating_output_btu: "",
          heating_efficiency_percent: "",
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

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    if (submitLockedRef.current || isSubmitting) {
      event.preventDefault();
      return;
    }

    submitLockedRef.current = true;
    setIsSubmitting(true);
  }

  const secondaryButtonClass =
    "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition-all duration-150 hover:bg-slate-100 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60";
  const secondaryCompactButtonClass =
    "rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 transition-all duration-150 hover:bg-slate-100 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60";
  const dangerTextButtonClass =
    "text-sm text-red-600 transition-colors duration-150 hover:text-red-700 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200";
  const primaryButtonClass =
    `rounded-md px-4 py-2 text-sm font-semibold text-white transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-70 ${
      canSubmit ? "bg-slate-900 hover:bg-slate-800 active:scale-[0.99]" : "bg-slate-400"
    }`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h1 className="text-2xl font-semibold text-slate-900 mb-1">New Job</h1>
      <p className="mb-4 text-sm text-slate-600">Create a new job in a few quick steps.</p>

      <ActionFeedback
        type="warning"
        message={errorCode === "missing_address" ? "Could not create job. Service address is required." : null}
        className="mb-5"
      />

      {draftFound && (
        <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-2 text-sm font-medium text-slate-900">Draft found on this device</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryCompactButtonClass} onClick={restoreDraft}>
              Restore
            </button>
            <button type="button" className={secondaryCompactButtonClass} onClick={discardDraft}>
              Discard
            </button>
          </div>
        </div>
      )}

      <form action={createJobFromForm} className="space-y-8" onSubmit={handleFormSubmit} aria-busy={isSubmitting}>
        {/* Identity-tied contractor */}
        {myContractor?.id ? (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-medium text-slate-900">Submitting as</div>
              <div className="mt-1 text-sm text-slate-700">{myContractor.name}</div>
            </div>
            <input type="hidden" name="contractor_id" value={myContractor.id} />
          </>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
            <label className="block text-sm font-medium text-slate-900">Contractor (optional)</label>
            <select
              name="contractor_id"
              className="w-full rounded-md border border-slate-300 bg-white p-2"
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

        <div className="space-y-8">

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900">Job Setup</h2>

          {/* Job Type */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
            <label className="block text-sm font-medium text-slate-900">Job Type</label>
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
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
              <label className="block text-sm font-medium text-slate-900">Project Type (ECC)</label>
              <select
                name="project_type"
                className="w-full rounded-md border border-slate-300 bg-white p-2"
                value={projectType}
                onChange={(e) => setProjectType(e.target.value as "alteration" | "all_new" | "new_construction")}
              >
                <option value="alteration">Alteration</option>
                <option value="all_new">All New</option>
                <option value="new_construction">New Construction</option>
              </select>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900">Customer &amp; Location</h2>

          {/* Existing Customer / Location Mode */}
          {isExistingCustomer && existingCustomer?.id ? (
            <>
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1">
                <div className="text-sm font-semibold text-slate-900">Customer (Existing)</div>
                <div className="text-sm text-slate-700">
                  {(existingCustomer.first_name ?? "") + " " + (existingCustomer.last_name ?? "")}
                </div>
                {existingCustomer.phone ? (
                  <div className="text-xs text-slate-600">Phone: {existingCustomer.phone}</div>
                ) : null}
                {existingCustomer.email ? (
                  <div className="text-xs text-slate-600">Email: {existingCustomer.email}</div>
                ) : null}

                <input type="hidden" name="customer_id" value={existingCustomer.id} />
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                <div className="text-sm font-semibold text-slate-900">Service Location</div>

                <label className="block text-sm font-medium text-slate-900">Pick a location</label>
                <select
                  className="w-full rounded-md border border-slate-300 bg-white p-2"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {(l.nickname ? `${l.nickname} — ` : "") +
                        (l.address_line1 ?? "Address") +
                        ", " +
                        [l.city, l.state, l.zip].filter(Boolean).join(" ")}
                    </option>
                  ))}
                  <option value="__new__">+ Add new location…</option>
                </select>

                {!isNewLocation ? (
                  <input type="hidden" name="location_id" value={locationId} />
                ) : (
                  <div className="space-y-2 mt-2">
                    <div className="text-xs text-slate-600">
                      New location details (required for new location)
                    </div>

                    <input
                      className="w-full rounded-md border border-slate-300 bg-white p-2"
                      name="location_nickname"
                      placeholder="Nickname (optional) e.g., Main House, ADU"
                    />

                    <input
                      className="w-full rounded-md border border-slate-300 bg-white p-2"
                      name="address_line1"
                      placeholder="Address"
                      required
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="w-full rounded-md border border-slate-300 bg-white p-2"
                        name="city"
                        placeholder="City"
                        required
                      />
                      <input
                        className="w-full rounded-md border border-slate-300 bg-white p-2"
                        name="zip"
                        placeholder="ZIP"
                        required
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <JobCoreFields
              mode={myContractor?.id ? "external" : "internal"}
              titleRequired={jobType === "service"}
              hideCustomer={false}
              hideServiceLocation={false}
              jobType={jobType}
              showJobDetails={false}
              showNotesSection={false}
            />
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900">Job Details</h2>
          <JobCoreFields
            mode={myContractor?.id ? "external" : "internal"}
            titleRequired={jobType === "service"}
            hideCustomer
            hideServiceLocation
            jobType={jobType}
            showCustomerSection={false}
            showServiceLocationSection={false}
          />
        </section>

        {/* Scheduling — internal/staff only; hidden for contractor and customer intake */}
        {!isContractorMode && (
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-slate-900">Scheduling</h2>

            <div>
              <label className="text-xs text-slate-600">Scheduled Date</label>
              <input
                type="date"
                name="scheduled_date"
                className="w-full rounded-md border border-slate-300 bg-white p-2"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
              <div className="text-sm font-medium text-slate-900">Schedule (optional)</div>
              <div className="text-xs text-slate-600">
                Set a date and time now, or leave it for later.
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-600">Window Start</label>
                  <input
                    type="time"
                    name="window_start"
                    className="w-full rounded-md border border-slate-300 bg-white p-2"
                    value={windowStart}
                    onChange={(e) => setWindowStart(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600">Window End</label>
                  <input
                    type="time"
                    name="window_end"
                    className="w-full rounded-md border border-slate-300 bg-white p-2"
                    value={windowEnd}
                    onChange={(e) => setWindowEnd(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-600">Quick Window</label>
                <select
                  className="w-full rounded-md border border-slate-300 bg-white p-2"
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
          </section>
        )}

        {/* Billing Recipient */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-800">Billing</h2>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-2">
            <label className="block text-sm font-medium text-slate-900">Billing Recipient</label>

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
                  <span className="text-xs text-slate-500">(select contractor first)</span>
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
                <div className="text-xs text-slate-600">
                  If billing is “Other”, please enter billing name + address.
                </div>

                <input
                  className="w-full rounded-md border border-slate-300 bg-white p-2"
                  name="billing_name"
                  placeholder="Billing name"
                  value={billingName}
                  onChange={(e) => setBillingName(e.target.value)}
                />
                <input
                  className="w-full rounded-md border border-slate-300 bg-white p-2"
                  name="billing_email"
                  placeholder="Billing email (optional)"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                />
                <input
                  className="w-full rounded-md border border-slate-300 bg-white p-2"
                  name="billing_phone"
                  placeholder="Billing phone (optional)"
                  value={billingPhone}
                  onChange={(e) => setBillingPhone(e.target.value)}
                />
                <input
                  className="w-full rounded-md border border-slate-300 bg-white p-2"
                  name="billing_address_line1"
                  placeholder="Address line 1"
                  value={billingAddr1}
                  onChange={(e) => setBillingAddr1(e.target.value)}
                />
                <input
                  className="w-full rounded-md border border-slate-300 bg-white p-2"
                  name="billing_address_line2"
                  placeholder="Address line 2 (optional)"
                  value={billingAddr2}
                  onChange={(e) => setBillingAddr2(e.target.value)}
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    className="col-span-2 w-full rounded-md border border-slate-300 bg-white p-2"
                    name="billing_city"
                    placeholder="City"
                    value={billingCity}
                    onChange={(e) => setBillingCity(e.target.value)}
                  />
                  <input
                    className="w-full rounded-md border border-slate-300 bg-white p-2"
                    name="billing_state"
                    placeholder="State"
                    value={billingState}
                    onChange={(e) => setBillingState(e.target.value)}
                  />
                </div>
                <input
                  className="w-full rounded-md border border-slate-300 bg-white p-2"
                  name="billing_zip"
                  placeholder="ZIP"
                  value={billingZip}
                  onChange={(e) => setBillingZip(e.target.value)}
                />
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-800">Photos (optional)</h2>
          <input
            type="file"
            name="photos"
            multiple
            className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700"
          />
        </section>

        {/* Optional Equipment */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-800">Equipment (optional)</h2>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-900">Optional Equipment</div>
              <div className="mt-1 text-xs text-slate-600">If you add a component, name the system (for example: Upstairs, Downstairs, ADU).</div>
            </div>

            <button
              type="button"
              className={secondaryCompactButtonClass}
              onClick={addSystem}
            >
              Add System
            </button>
          </div>

          {systems.length === 0 && (
            <div className="text-sm text-slate-600">
              No systems added. (That’s fine.)
            </div>
          )}

          {systems.map((sys, idx) => {
            const nameRequired = sys.components.length > 0;
            const showNameError = nameRequired && !sys.name.trim();

            return (
              <div key={sys.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-900">System {idx + 1}</div>
                  <button
                    type="button"
                    className={dangerTextButtonClass}
                    onClick={() => removeSystem(sys.id)}
                  >
                    Remove
                  </button>
                </div>

                <div>
                  <label className="block text-xs text-slate-600">
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
                    <label className="block text-xs text-slate-600">Add Component</label>
                    <select
                      className="w-full rounded-md border border-slate-300 bg-white p-2"
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
                  <div className="text-sm text-slate-600">No components added yet.</div>
                ) : (
                  <div className="space-y-3">
                    {sys.components.map((c) => (
                      <div key={c.id} className="rounded border border-slate-200 bg-white p-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-slate-900">{componentLabel(c.type)}</div>
                          <button
                            type="button"
                            className={dangerTextButtonClass}
                            onClick={() => removeComponent(sys.id, c.id)}
                          >
                            Remove
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <input
                            className="rounded-md border border-slate-300 p-2"
                            placeholder="Manufacturer (optional)"
                            value={c.manufacturer}
                            onChange={(e) => patchComponent(sys.id, c.id, { manufacturer: e.target.value })}
                          />
                          <input
                            className="rounded-md border border-slate-300 p-2"
                            placeholder="Model (optional)"
                            value={c.model}
                            onChange={(e) => patchComponent(sys.id, c.id, { model: e.target.value })}
                          />
                          <input
                            className="rounded-md border border-slate-300 p-2"
                            placeholder="Serial (optional)"
                            value={c.serial}
                            onChange={(e) => patchComponent(sys.id, c.id, { serial: e.target.value })}
                          />
                          <input
                            className="rounded-md border border-slate-300 p-2"
                            placeholder={
                              componentUsesHeatingCapacity(c.type)
                                ? "Heating Capacity (KBTU/h) (optional)"
                                : "Tonnage (optional)"
                            }
                            value={c.tonnage}
                            onChange={(e) => patchComponent(sys.id, c.id, { tonnage: e.target.value })}
                          />
                          {componentUsesHeatingCapacity(c.type) && (
                            <input
                              className="rounded-md border border-slate-300 p-2"
                              placeholder="Heating Output (BTU/h) (optional)"
                              type="number"
                              min="0"
                              step="1"
                              value={c.heating_output_btu}
                              onChange={(e) => patchComponent(sys.id, c.id, { heating_output_btu: e.target.value })}
                            />
                          )}
                          {componentUsesHeatingCapacity(c.type) && (
                            <input
                              className="rounded-md border border-slate-300 p-2"
                              placeholder="Efficiency % (e.g. 80 for AFUE 80) (optional)"
                              type="number"
                              min="1"
                              max="100"
                              step="1"
                              value={c.heating_efficiency_percent}
                              onChange={(e) => patchComponent(sys.id, c.id, { heating_efficiency_percent: e.target.value })}
                            />
                          )}
                        </div>

                        {(c.type === "condenser_ac" ||
                          c.type === "heat_pump_outdoor" ||
                          c.type === "package_gas_electric" ||
                          c.type === "package_heat_pump" ||
                          c.type === "mini_split_outdoor") && (
                          <input
                            className="w-full rounded-md border border-slate-300 p-2"
                            placeholder="Refrigerant type (optional)"
                            value={c.refrigerant_type}
                            onChange={(e) => patchComponent(sys.id, c.id, { refrigerant_type: e.target.value })}
                          />
                        )}

                        <textarea
                          className="w-full rounded-md border border-slate-300 p-2"
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
        </section>
        </div>

        {!canSubmit && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            Please name each system that has components. (Example: Upstairs / Downstairs / ADU)
          </div>
        )}

        <div className="sr-only" aria-live="polite">
          {isSubmitting ? "Creating job. Please wait." : ""}
        </div>

        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200 pt-5 sm:justify-end">
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => {
              if (window.history.length > 1) {
                router.back();
                return;
              }
              router.push(myContractor?.id ? "/portal" : "/ops");
            }}
            disabled={isSubmitting}
            aria-disabled={isSubmitting}
          >
            Cancel
          </button>

          <button
            type="button"
            className={secondaryButtonClass}
            onClick={saveDraft}
            disabled={isSubmitting}
            aria-disabled={isSubmitting}
          >
            Save Draft
          </button>

          <button
            type="submit"
            className={primaryButtonClass}
            disabled={!canSubmit || isSubmitting}
            aria-disabled={!canSubmit || isSubmitting}
            onClick={() => {
              // If submit succeeds, server will redirect away. We can safely clear draft on click.
              try {
                localStorage.removeItem(DRAFT_KEY);
              } catch {}
            }}
          >
            {isSubmitting ? "Creating Job..." : "Create Job"}
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}