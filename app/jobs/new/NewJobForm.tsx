// app/jobs/new/NewJobForm

"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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

type CustomerLookupRow = {
  id: string;
  full_name: string | null;
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

type LocationLookupRow = {
  id: string;
  customer_id: string;
  nickname: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  postal_code?: string | null;
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

function customerDisplayName(row: CustomerLookupRow | ExistingCustomer) {
  const full = "full_name" in row ? String(row.full_name ?? "").trim() : "";
  if (full) return full;
  return [String(row.first_name ?? "").trim(), String(row.last_name ?? "").trim()]
    .filter(Boolean)
    .join(" ") || "Unnamed Customer";
}

function onlyDigits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeLocationText(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatLocationContext(location: LocationLookupRow | null | undefined) {
  if (!location) return "No saved address yet";
  const address = String(location.address_line1 ?? "").trim() || "Address";
  const cityStateZip = [location.city, location.state, location.zip || location.postal_code]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const nickname = String(location.nickname ?? "").trim();
  const base = nickname ? `${nickname} - ${address}` : address;
  return cityStateZip ? `${base}, ${cityStateZip}` : base;
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
  customerLookupRows = [],
  locationLookupRows = [],
  myContractor,
  errorCode,
}: {
  contractors: Contractor[];
  existingCustomer?: ExistingCustomer | null;
  locations?: LocationRow[];
  customerLookupRows?: CustomerLookupRow[];
  locationLookupRows?: LocationLookupRow[];
  myContractor?: MyContractor;
  errorCode?: string | null;
}) {

  const isContractorMode = Boolean(myContractor?.id);
  const router = useRouter();
  const isInternalMode = !isContractorMode;
  const hasSeededCustomer = Boolean(existingCustomer?.id);

  const [guidedCustomerQuery, setGuidedCustomerQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    existingCustomer?.id ?? "",
  );
  const [createNewCustomer, setCreateNewCustomer] = useState<boolean>(false);
  const [locationMode, setLocationMode] = useState<"existing" | "new" | null>(
    hasSeededCustomer ? (locations.length > 0 ? "existing" : "new") : null,
  );
  const [locationId, setLocationId] = useState<string>(locations.length ? locations[0].id : "");
  const [newLocationNickname, setNewLocationNickname] = useState("");
  const [newLocationAddressLine1, setNewLocationAddressLine1] = useState("");
  const [newLocationCity, setNewLocationCity] = useState("");
  const [newLocationZip, setNewLocationZip] = useState("");
  const [newCustomerFirstName, setNewCustomerFirstName] = useState("");
  const [newCustomerLastName, setNewCustomerLastName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");

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
  const createNewCustomerCardRef = useRef<HTMLDivElement | null>(null);
  const createNewCustomerFirstNameRef = useRef<HTMLInputElement | null>(null);

  const guidedCustomers = useMemo(() => {
    if (!isInternalMode) return [];

    const fallbackCustomer = existingCustomer?.id
      ? [{
          id: existingCustomer.id,
          full_name: null,
          first_name: existingCustomer.first_name,
          last_name: existingCustomer.last_name,
          phone: existingCustomer.phone,
          email: existingCustomer.email,
        }]
      : [];

    const merged = [...customerLookupRows, ...fallbackCustomer];
    const byId = new Map<string, CustomerLookupRow>();
    merged.forEach((row) => {
      if (!row?.id || byId.has(row.id)) return;
      byId.set(row.id, row);
    });

    return Array.from(byId.values());
  }, [isInternalMode, customerLookupRows, existingCustomer]);

  const customerPrimaryLocationMap = useMemo(() => {
    const map = new Map<string, LocationLookupRow>();
    for (const l of locationLookupRows) {
      if (!l.customer_id || map.has(l.customer_id)) continue;
      map.set(l.customer_id, l);
    }
    return map;
  }, [locationLookupRows]);

  const filteredGuidedCustomers = useMemo(() => {
    const q = guidedCustomerQuery.trim().toLowerCase();
    if (!q) {
      return guidedCustomers.slice(0, 8).map((c) => ({
        ...c,
        _score: 0,
        _reasons: [] as string[],
        _locationContext: formatLocationContext(customerPrimaryLocationMap.get(c.id)),
      }));
    }

    const qDigits = onlyDigits(q);
    const qParts = q.split(/\s+/).filter(Boolean);

    return guidedCustomers
      .map((c) => {
        const name = customerDisplayName(c).toLowerCase();
        const email = String(c.email ?? "").toLowerCase();
        const phone = String(c.phone ?? "").toLowerCase();
        const phoneDigits = onlyDigits(c.phone);
        let score = 0;
        const reasons: string[] = [];

        if (q && name.startsWith(q)) {
          score += 6;
          reasons.push("name");
        } else if (q && name.includes(q)) {
          score += 4;
          reasons.push("name");
        }

        if (qParts.length > 1 && qParts.every((part) => name.includes(part))) {
          score += 2;
          if (!reasons.includes("name")) reasons.push("name");
        }

        if (q.includes("@") && email.includes(q)) {
          score += 4;
          reasons.push("email");
        }

        if (qDigits.length >= 7 && phoneDigits.slice(-7) === qDigits.slice(-7)) {
          score += 4;
          reasons.push("phone");
        } else if (qDigits.length >= 3 && phoneDigits.includes(qDigits)) {
          score += 1;
          reasons.push("phone");
        }

        return {
          c,
          name,
          email,
          phone,
          phoneDigits,
          score,
          reasons,
          locationContext: formatLocationContext(customerPrimaryLocationMap.get(c.id)),
        };
      })
      .filter((row) => {
        if (!q) return true;

        return (
          row.name.includes(q) ||
          row.email.includes(q) ||
          row.phone.includes(q) ||
          (qDigits.length >= 3 && row.phoneDigits.includes(qDigits))
        );
      })
      .sort((a, b) => b.score - a.score)
      .map((row) => ({
        ...row.c,
        _score: row.score,
        _reasons: row.reasons,
        _locationContext: row.locationContext,
      }))
      .slice(0, 10);
  }, [customerPrimaryLocationMap, guidedCustomerQuery, guidedCustomers]);

  const selectedCustomer = useMemo(
    () => guidedCustomers.find((c) => c.id === selectedCustomerId) ?? null,
    [guidedCustomers, selectedCustomerId],
  );

  const selectedCustomerLocations = useMemo(() => {
    if (!selectedCustomerId) return [];
    return locationLookupRows.filter((l) => l.customer_id === selectedCustomerId);
  }, [locationLookupRows, selectedCustomerId]);

  const selectedLocation = useMemo(
    () => selectedCustomerLocations.find((l) => l.id === locationId) ?? null,
    [selectedCustomerLocations, locationId],
  );

  const selectedCustomerPrimaryLocation = useMemo(
    () => selectedCustomerLocations[0] ?? customerPrimaryLocationMap.get(selectedCustomerId) ?? null,
    [customerPrimaryLocationMap, selectedCustomerId, selectedCustomerLocations],
  );

  const isNewLocation =
    isInternalMode && selectedCustomerId && !createNewCustomer && locationMode === "new";

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

  const internalResolutionReady = useMemo(() => {
    if (!isInternalMode) return true;
    if (createNewCustomer) return true;
    if (!selectedCustomerId) return false;
    if (locationMode === "existing") return Boolean(locationId);
    if (locationMode === "new") return true;
    return false;
  }, [createNewCustomer, isInternalMode, locationId, locationMode, selectedCustomerId]);

  const predictedPathLabel = useMemo(() => {
    if (!isInternalMode) return "";
    if (createNewCustomer) return "New customer + new location";
    if (selectedCustomerId && locationMode === "new") return "Existing customer + new location";
    if (selectedCustomerId && locationMode === "existing" && locationId) return "Existing customer + existing location";
    return "Resolve customer and location";
  }, [createNewCustomer, isInternalMode, locationId, locationMode, selectedCustomerId]);

  const internalResolutionLabel = useMemo(() => {
    const hasNewLocationDetails = Boolean(
      newLocationAddressLine1.trim() && newLocationCity.trim() && newLocationZip.trim(),
    );
    const hasNewCustomerDetails = Boolean(
      newCustomerFirstName.trim() ||
      newCustomerLastName.trim() ||
      newCustomerPhone.trim() ||
      newCustomerEmail.trim(),
    );

    if (!isInternalMode) return "";
    if (createNewCustomer) {
      if (hasNewCustomerDetails && hasNewLocationDetails) {
        return "New customer and service location details are complete.";
      }
      return "Creating a new customer and service location. Complete the customer and address details to continue.";
    }
    if (selectedCustomerId && locationMode === "new") {
      if (hasNewLocationDetails) {
        return "Customer confirmed. New service location details are complete.";
      }
      return "Customer confirmed. Complete the new service location details to continue.";
    }
    if (selectedCustomerId && locationMode === "existing" && locationId) {
      return "Customer and service location confirmed.";
    }
    if (selectedCustomerId && locationMode === "existing" && !locationId) {
      return "Customer confirmed. Select a service location to continue.";
    }
    return "Resolve customer and location";
  }, [
    createNewCustomer,
    isInternalMode,
    locationId,
    locationMode,
    newCustomerEmail,
    newCustomerFirstName,
    newCustomerLastName,
    newCustomerPhone,
    newLocationAddressLine1,
    newLocationCity,
    newLocationZip,
    selectedCustomerId,
  ]);

  const matchingLocationHints = useMemo(() => {
    if (!isInternalMode || !newLocationAddressLine1.trim()) return [];
    const addr = normalizeLocationText(newLocationAddressLine1);
    const city = normalizeLocationText(newLocationCity);
    const zip = onlyDigits(newLocationZip);

    const pool = selectedCustomerId ? selectedCustomerLocations : locationLookupRows;

    return pool.filter((l) => {
      const lAddr = normalizeLocationText(l.address_line1);
      const lCity = normalizeLocationText(l.city);
      const lZip = onlyDigits(l.zip || l.postal_code || "");
      if (!lAddr || !addr) return false;

      const addrMatch = lAddr.includes(addr) || addr.includes(lAddr);
      const cityMatch = !city || !lCity || city === lCity;
      const zipMatch = !zip || !lZip || zip === lZip;
      return addrMatch && cityMatch && zipMatch;
    }).slice(0, 3);
  }, [isInternalMode, locationLookupRows, newLocationAddressLine1, newLocationCity, newLocationZip, selectedCustomerId, selectedCustomerLocations]);

  const isSubmitReady = canSubmit && internalResolutionReady;
  const canAdvancePastResolution = !isInternalMode || internalResolutionReady;
  const showInternalSetupHint = isInternalMode && !internalResolutionReady;
  const billingRecipientLabel =
    billingRecipient === "contractor"
      ? "Contractor"
      : billingRecipient === "customer"
        ? "Customer"
        : "Custom billing";

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
  const [draftMsg, setDraftMsg] = useState<string | null>(null);

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
      setDraftMsg("Draft saved.");
    } catch {
      setDraftMsg("Unable to save — check browser settings.");
    }
  }

  function restoreDraft() {
    const d = readValidDraft();
    if (!d) {
      setDraftFound(false);
      setDraftMsg("Draft file could not be read and was removed.");
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
    if (selectedCustomerId) setLocationId(d.locationId ?? locationId);

    setDraftMsg("Draft restored.");
  }

  function discardDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
      setDraftFound(false);
      setDraftMsg(null);
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

  useEffect(() => {
    if (!createNewCustomer) return;

    const frame = window.requestAnimationFrame(() => {
      createNewCustomerCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      createNewCustomerFirstNameRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [createNewCustomer]);

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

  // Contractor post-submit success panel
  if (isContractorMode && errorCode === "contractor_proposal_submitted") {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 shadow-sm space-y-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-emerald-100 text-lg font-bold text-emerald-700">✓</span>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Job submitted</h1>
              <p className="text-sm text-slate-600">Your submission has been received.</p>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-white px-4 py-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">What happens next</p>
            <ol className="space-y-2">
              <li className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-px flex-none font-semibold text-emerald-600">1.</span>
                Our team reviews the job details you submitted.
              </li>
              <li className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-px flex-none font-semibold text-emerald-600">2.</span>
                We confirm the address, scheduling, and any open questions.
              </li>
              <li className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-px flex-none font-semibold text-emerald-600">3.</span>
                You&apos;ll hear from us to confirm next steps.
              </li>
            </ol>
          </div>
          <div className="pt-1 text-center">
            <a href="/portal" className="text-sm font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900">
              Back to portal
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h1 className="text-2xl font-semibold text-slate-900 mb-1">
        {isContractorMode ? "Intake Form" : "New Job"}
      </h1>
      <p className="mb-6 text-sm text-slate-600">
        {isContractorMode
          ? "Fill in the details below. Our team will review your submission and follow up to confirm scheduling."
          : "Create a new job in a few quick steps."}
      </p>

      <ActionFeedback
        type="warning"
        message={
          errorCode === "missing_address"
            ? "Could not create job. Service address is required."
            : errorCode === "contractor_proposal_submit_failed"
            ? "Could not submit your job. Please try again, or contact us if the issue persists."
            : null
        }
        className="mb-5"
      />

      <ActionFeedback
        type="success"
        message={
          errorCode === "contractor_proposal_submitted"
            ? "Proposal received — our team will review and follow up shortly."
            : null
        }
        className="mb-5"
      />

      {draftFound && (
        <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Saved draft found</div>
            <div className="mt-0.5 text-xs text-slate-500">A draft was saved on this device from a previous session.</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={secondaryCompactButtonClass} onClick={restoreDraft}>
              Restore draft
            </button>
            <button type="button" className={dangerTextButtonClass} onClick={discardDraft}>
              Discard
            </button>
            {draftMsg ? (
              <span className="text-xs text-slate-500">{draftMsg}</span>
            ) : null}
          </div>
        </div>
      )}

      <form action={createJobFromForm} className="space-y-8" onSubmit={handleFormSubmit} aria-busy={isSubmitting}>
        {isInternalMode ? (
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-5 py-5 text-white shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Internal job creation</p>
                <h2 className="mt-2 text-lg font-semibold text-white">Create with confidence, not form fatigue.</h2>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  Resolve the customer and service location first. The rest of the page will narrow automatically.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[26rem]">
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">1</p>
                  <p className="mt-1 text-sm font-medium text-white">Customer and location</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">2</p>
                  <p className="mt-1 text-sm font-medium text-white">Job setup and details</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">3</p>
                  <p className="mt-1 text-sm font-medium text-white">Schedule and finish</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Identity-tied contractor */}
        {myContractor?.id ? (
          <>
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">✓</span>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Submitting as</div>
                <div className="text-sm font-semibold text-slate-900">{myContractor.name}</div>
              </div>
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

        {!isInternalMode ? (
        <section className="space-y-3">
          <h2 className="border-b border-slate-100 pb-2 text-base font-semibold text-slate-900">Job Setup</h2>

          {/* Job Type */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
            <label className="block text-sm font-medium text-slate-900">Job Type</label>
            <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="radio"
                  name="_jobTypeUi"
                  value="ecc"
                  checked={jobType === "ecc"}
                  onChange={() => setJobType("ecc")}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">ECC</span>
                  {isContractorMode && (
                    <span className="block text-xs text-slate-500">Energy Conservation Code test</span>
                  )}
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="radio"
                  name="_jobTypeUi"
                  value="service"
                  checked={jobType === "service"}
                  onChange={() => setJobType("service")}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">Service</span>
                  {isContractorMode && (
                    <span className="block text-xs text-slate-500">Standard service visit</span>
                  )}
                </span>
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
        ) : null}

        <section className="space-y-3">
          <h2 className="border-b border-slate-100 pb-2 text-base font-semibold text-slate-900">Customer &amp; Location</h2>

          {isContractorMode ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-amber-900">Reviewed by our team</p>
              <p className="text-xs leading-5 text-amber-800">
                Enter the customer name and service address below. Our team will verify the details, confirm scheduling, and reach out with next steps.
              </p>
            </div>
          ) : null}

          {isInternalMode ? (
            <>
              {!createNewCustomer ? (
                <div className="rounded-[1.5rem] border border-blue-200 bg-gradient-to-b from-blue-50 via-white to-slate-50 p-5 shadow-sm ring-1 ring-blue-100/70 space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Step 1</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-950">Find or create customer</h3>
                    <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">
                      Start by typing a customer name. Results update live with address context so you can select confidently.
                    </p>
                  </div>
                    <div className="rounded-full border border-blue-200 bg-white/80 px-3 py-1 text-[11px] font-medium text-blue-800 shadow-sm">
                      Live recognition
                    </div>
                  </div>

                  <div className="rounded-2xl border border-blue-200 bg-white p-3 shadow-sm">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label htmlFor="internal_customer_finder" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Customer Finder
                      </label>
                      <span className="text-[11px] font-medium text-slate-500">
                        {filteredGuidedCustomers.length} match{filteredGuidedCustomers.length === 1 ? "" : "es"}
                      </span>
                    </div>
                    <input
                      id="internal_customer_finder"
                      type="search"
                      value={guidedCustomerQuery}
                      onChange={(e) => setGuidedCustomerQuery(e.target.value)}
                      placeholder="Type name, phone, or email..."
                      autoFocus
                      className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-3 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                    />
                    <p className="mt-2 text-xs leading-5 text-slate-500">Name-first lookup is fastest. Phone and email still work when you need a quick confirmation.</p>
                  </div>

                  <div className="space-y-2">
                    {filteredGuidedCustomers.length > 0 ? (
                      filteredGuidedCustomers.map((c, index) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedCustomerId(c.id);
                            setCreateNewCustomer(false);
                            setLocationMode("existing");
                            const firstLocation = locationLookupRows.find((l) => l.customer_id === c.id);
                            setLocationId(firstLocation?.id ?? "");
                          }}
                          className={[
                            "w-full rounded-xl border px-3 py-3 text-left transition-all",
                            selectedCustomerId === c.id
                              ? "border-slate-500 bg-slate-100"
                              : index === 0 && (c as CustomerLookupRow & { _score?: number })._score
                                ? "border-blue-300 bg-blue-50 hover:border-blue-400"
                                : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">{customerDisplayName(c)}</p>
                            {index === 0 && (c as CustomerLookupRow & { _score?: number })._score ? (
                              <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">best match</span>
                            ) : null}
                            {(c as CustomerLookupRow & { _reasons?: string[] })._reasons?.includes("phone") ? (
                              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">phone</span>
                            ) : null}
                            {(c as CustomerLookupRow & { _reasons?: string[] })._reasons?.includes("email") ? (
                              <span className="rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-700">email</span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-xs font-medium text-slate-700">
                            {(c as CustomerLookupRow & { _locationContext?: string })._locationContext || "No saved address yet"}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {String(c.phone ?? "").trim() || "No phone"}
                            {c.phone && c.email ? " · " : ""}
                            {String(c.email ?? "").trim() || ""}
                          </p>
                        </button>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                        {guidedCustomerQuery.trim().length >= 2
                          ? "No customer matches found. You can create a new customer below."
                          : "Start typing to search customers."}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-500">No confident match? Start a clean record instead.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateNewCustomer(true);
                        setSelectedCustomerId("");
                        setLocationMode(null);
                        setLocationId("");
                      }}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      Create new customer
                    </button>
                  </div>
                </div>
              ) : null}

              {selectedCustomerId && !createNewCustomer ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Selected customer</p>
                        <p className="mt-1 text-base font-semibold text-slate-900">{customerDisplayName(selectedCustomer as CustomerLookupRow)}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {String(selectedCustomer?.phone ?? "").trim() || "No phone"}
                          {selectedCustomer?.phone && selectedCustomer?.email ? " · " : ""}
                          {String(selectedCustomer?.email ?? "").trim() || ""}
                        </p>
                        <p className="mt-2 text-sm text-slate-700">
                          {formatLocationContext(selectedCustomerPrimaryLocation)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCustomerId("");
                          setLocationMode(null);
                          setLocationId("");
                        }}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-900"
                      >
                        Change customer
                      </button>
                    </div>
                    <input type="hidden" name="customer_id" value={selectedCustomerId} />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 2</p>
                      <p className="mt-1 text-base font-semibold text-slate-900">Choose service location</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {selectedCustomerLocations.length} location{selectedCustomerLocations.length === 1 ? "" : "s"} on file for this customer.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setLocationMode("existing")}
                        className={[
                          "rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition-all",
                          locationMode === "existing"
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-300 bg-white text-slate-700",
                        ].join(" ")}
                      >
                        Use existing location
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocationMode("new")}
                        className={[
                          "rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition-all",
                          locationMode === "new"
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-300 bg-white text-slate-700",
                        ].join(" ")}
                      >
                        Create new location
                      </button>
                    </div>

                    {locationMode === "existing" ? (
                      selectedCustomerLocations.length > 0 ? (
                        <>
                          <select
                            className="w-full rounded-xl border border-slate-300 bg-white p-2.5 shadow-sm"
                            value={locationId}
                            onChange={(e) => setLocationId(e.target.value)}
                          >
                            <option value="">Select existing location...</option>
                            {selectedCustomerLocations.map((l) => (
                              <option key={l.id} value={l.id}>
                                {(l.nickname ? `${l.nickname} — ` : "") +
                                  (l.address_line1 ?? "Address") +
                                  ", " +
                                  [l.city, l.state, l.zip || l.postal_code].filter(Boolean).join(" ")}
                              </option>
                            ))}
                          </select>
                          {locationId ? <input type="hidden" name="location_id" value={locationId} /> : null}
                        </>
                      ) : (
                        <p className="text-xs text-slate-500">No saved locations for this customer. Choose “Create new location”.</p>
                      )
                    ) : null}

                    {isNewLocation ? (
                      <div className="mt-1 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <input
                          className="w-full rounded-xl border border-slate-300 bg-white p-2.5"
                          name="location_nickname"
                          placeholder="Nickname (optional) e.g., Main House, ADU"
                          value={newLocationNickname}
                          onChange={(e) => setNewLocationNickname(e.target.value)}
                        />
                        <input
                          className="w-full rounded-xl border border-slate-300 bg-white p-2.5"
                          name="address_line1"
                          placeholder="Address"
                          required
                          value={newLocationAddressLine1}
                          onChange={(e) => setNewLocationAddressLine1(e.target.value)}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            className="w-full rounded-xl border border-slate-300 bg-white p-2.5"
                            name="city"
                            placeholder="City"
                            required
                            value={newLocationCity}
                            onChange={(e) => setNewLocationCity(e.target.value)}
                          />
                          <input
                            className="w-full rounded-xl border border-slate-300 bg-white p-2.5"
                            name="zip"
                            placeholder="ZIP"
                            required
                            value={newLocationZip}
                            onChange={(e) => setNewLocationZip(e.target.value)}
                          />
                        </div>
                        {matchingLocationHints.length > 0 ? (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            Similar location{matchingLocationHints.length === 1 ? "" : "s"} already on file:{" "}
                            {matchingLocationHints
                              .map((l) => (l.nickname ? `${l.nickname} — ` : "") + (l.address_line1 || "Address"))
                              .join(" | ")}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {createNewCustomer ? (
                <div
                  ref={createNewCustomerCardRef}
                  className="rounded-2xl border border-amber-200 bg-gradient-to-b from-amber-50 to-white p-4 shadow-sm space-y-3 scroll-mt-6"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Create new customer and location</p>
                      <p className="mt-0.5 text-xs text-slate-500">Use this only when a reliable existing match is not available.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCreateNewCustomer(false)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-900"
                    >
                      ← Back to finder
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      ref={createNewCustomerFirstNameRef}
                      type="text"
                      name="customer_first_name"
                      placeholder="First name"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                      value={newCustomerFirstName}
                      onChange={(e) => setNewCustomerFirstName(e.target.value)}
                    />
                    <input
                      type="text"
                      name="customer_last_name"
                      placeholder="Last name"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                      value={newCustomerLastName}
                      onChange={(e) => setNewCustomerLastName(e.target.value)}
                    />
                    <input
                      type="tel"
                      name="customer_phone"
                      placeholder="Phone"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                    />
                    <input
                      type="email"
                      name="customer_email"
                      placeholder="Email (optional)"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                      value={newCustomerEmail}
                      onChange={(e) => setNewCustomerEmail(e.target.value)}
                    />
                  </div>
                  <input
                    className="w-full rounded-md border border-slate-300 bg-white p-2"
                    name="location_nickname"
                    placeholder="Location nickname (optional)"
                    value={newLocationNickname}
                    onChange={(e) => setNewLocationNickname(e.target.value)}
                  />
                  <input
                    className="w-full rounded-md border border-slate-300 bg-white p-2"
                    name="address_line1"
                    placeholder="Address"
                    required
                    value={newLocationAddressLine1}
                    onChange={(e) => setNewLocationAddressLine1(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="w-full rounded-md border border-slate-300 bg-white p-2"
                      name="city"
                      placeholder="City"
                      required
                      value={newLocationCity}
                      onChange={(e) => setNewLocationCity(e.target.value)}
                    />
                    <input
                      className="w-full rounded-md border border-slate-300 bg-white p-2"
                      name="zip"
                      placeholder="ZIP"
                      required
                      value={newLocationZip}
                      onChange={(e) => setNewLocationZip(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}

              {!internalResolutionReady ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-sm">
                  Complete customer and location selection to continue.
                </div>
              ) : null}

              {internalResolutionReady ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-900 shadow-sm">
                  {internalResolutionLabel}
                </div>
              ) : null}
            </>
          ) : hasSeededCustomer && existingCustomer?.id ? (
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

                {locationId !== "__new__" ? (
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

        {showInternalSetupHint ? (
          <section className="space-y-3">
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Next</p>
              <p className="mt-1 text-sm text-blue-900">Resolve customer and location to unlock job setup, scheduling, billing, and optional enrichment.</p>
            </div>
          </section>
        ) : null}

        {isInternalMode && canAdvancePastResolution ? (
          <section className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-5 shadow-sm space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 3</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">Job setup</h2>
                <p className="mt-1 text-sm text-slate-500">Set the visit type first. ECC-only choices appear only when they matter.</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                <label className="block text-sm font-medium text-slate-900">Job Type</label>
                <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 transition-colors hover:bg-slate-100 sm:flex-1">
                    <input
                      type="radio"
                      name="_jobTypeUi"
                      value="ecc"
                      checked={jobType === "ecc"}
                      onChange={() => setJobType("ecc")}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-sm font-medium text-slate-900">ECC</span>
                      <span className="mt-0.5 block text-xs text-slate-500">Energy code test workflow</span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 transition-colors hover:bg-slate-100 sm:flex-1">
                    <input
                      type="radio"
                      name="_jobTypeUi"
                      value="service"
                      checked={jobType === "service"}
                      onChange={() => setJobType("service")}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-sm font-medium text-slate-900">Service</span>
                      <span className="mt-0.5 block text-xs text-slate-500">Standard service visit workflow</span>
                    </span>
                  </label>
                </div>
                <input type="hidden" name="job_type" value={jobType} />
              </div>

              {jobType !== "service" ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
                  <label className="block text-sm font-medium text-slate-900">Project Type (ECC)</label>
                  <select
                    name="project_type"
                    className="w-full rounded-xl border border-slate-300 bg-white p-2.5"
                    value={projectType}
                    onChange={(e) => setProjectType(e.target.value as "alteration" | "all_new" | "new_construction")}
                  >
                    <option value="alteration">Alteration</option>
                    <option value="all_new">All New</option>
                    <option value="new_construction">New Construction</option>
                  </select>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {canAdvancePastResolution ? (
          <>
            <section className="space-y-3">
              {isInternalMode ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 4</p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">Job details</h2>
                  <p className="mt-1 text-sm text-slate-500">Capture only the visit details needed to create a clean job record.</p>
                </div>
              ) : (
                <h2 className="border-b border-slate-100 pb-2 text-base font-semibold text-slate-900">Job Details</h2>
              )}
              <JobCoreFields
                mode={myContractor?.id ? "external" : "internal"}
                titleRequired={jobType === "service"}
                hideCustomer
                hideServiceLocation
                jobType={jobType}
                showCustomerSection={false}
                showServiceLocationSection={false}
                showNotesSection={false}
              />
            </section>

            {/* Scheduling — internal/staff only; hidden for contractor and customer intake */}
            {!isContractorMode && (
              <section className="space-y-3">
                {isInternalMode ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 5</p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-900">Scheduling and billing</h2>
                    <p className="mt-1 text-sm text-slate-500">Set timing and who should be billed, then leave the rest for later if needed.</p>
                  </div>
                ) : (
                  <h2 className="border-b border-slate-100 pb-2 text-base font-semibold text-slate-900">Scheduling</h2>
                )}

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Scheduled Date</label>
                  <input
                    type="date"
                    name="scheduled_date"
                    className="w-full rounded-xl border border-slate-300 bg-white p-2.5"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                  />

                  <div className="pt-1 text-xs text-slate-600">
                    Set a date and time now, or leave it for later.
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-600">Window Start</label>
                      <input
                        type="time"
                        name="window_start"
                        className="w-full rounded-xl border border-slate-300 bg-white p-2.5"
                        value={windowStart}
                        onChange={(e) => setWindowStart(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-600">Window End</label>
                      <input
                        type="time"
                        name="window_end"
                        className="w-full rounded-xl border border-slate-300 bg-white p-2.5"
                        value={windowEnd}
                        onChange={(e) => setWindowEnd(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-600">Quick Window</label>
                    <select
                      className="w-full rounded-xl border border-slate-300 bg-white p-2.5"
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
              {isInternalMode ? null : <h2 className="border-b border-slate-100 pb-2 text-base font-semibold text-slate-900">Billing</h2>}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm space-y-3">
                <label className="block text-sm font-medium text-slate-900">Billing Recipient</label>

            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
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

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                <input
                  type="radio"
                  name="_billingRecipientUi"
                  value="customer"
                  checked={billingRecipient === "customer"}
                  onChange={() => setBillingRecipient("customer")}
                />
                Customer / Homeowner
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
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
              <div className="mt-2 space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
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

            {/* Optional Equipment */}
            <section className="space-y-3">
              {isInternalMode ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 6</p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">Optional details</h2>
                  <p className="mt-1 text-sm text-slate-500">Add equipment, photos, and notes only when helpful.</p>
                </div>
              ) : (
                <h2 className="border-b border-slate-100 pb-2 text-base font-semibold text-slate-900">Equipment (optional)</h2>
              )}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-600">Add systems if needed. Use a clear label, such as Upstairs or Downstairs.</p>
            <button
              type="button"
              className={secondaryCompactButtonClass}
              onClick={addSystem}
            >
              + Add System
            </button>
          </div>

          {systems.length === 0 && (
            <div className="text-sm text-slate-500">No systems added yet.</div>
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
                    System Label
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

            <section className="space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div>
                <h2 className="text-base font-semibold text-slate-900">Photos (optional)</h2>
                <p className="mt-0.5 text-xs text-slate-500">Equipment photos, permit copies, or site images. JPG, PNG, or PDF.</p>
                </div>
                <input
                  type="file"
                  name="photos"
                  multiple
                  className="mt-3 w-full rounded-xl border border-slate-300 bg-white p-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700"
                />
              </div>
            </section>

            <section className="space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Additional Comments (optional)</h2>
                  {isContractorMode ? (
                    <p className="mt-0.5 text-xs text-slate-500">Include any scheduling preferences, site access notes, or other details our team should know.</p>
                  ) : null}
                </div>
                <textarea
                  name="job_notes"
                  rows={4}
                  placeholder="Anything the next person should know before this job moves forward…"
                  className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </div>
            </section>
          </>
        ) : null}
        </div>

        {!canSubmit && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            Please name each system that has components. (Example: Upstairs / Downstairs / ADU)
          </div>
        )}

        {isInternalMode && internalResolutionReady ? (
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-5 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Before you create</p>
            <p className="mt-1 text-sm text-slate-500">Quick final check before you create the job.</p>
            <div className="mt-3 grid gap-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Job</p>
                <p className="mt-1 font-medium text-slate-900">{jobType === "service" ? "Service" : `ECC (${projectType.replaceAll("_", " ")})`}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Customer</p>
                <p className="mt-1 font-medium text-slate-900">
                  {createNewCustomer
                    ? ([newCustomerFirstName, newCustomerLastName].filter(Boolean).join(" ") || "New customer")
                    : (selectedCustomer ? customerDisplayName(selectedCustomer) : "Not selected")}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Location</p>
                <p className="mt-1 font-medium text-slate-900">
                  {createNewCustomer || locationMode === "new"
                    ? (newLocationAddressLine1 || "New location")
                    : (selectedLocation?.address_line1 || "Existing location")}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Schedule</p>
                <p className="mt-1 font-medium text-slate-900">
                  {scheduledDate ? `${scheduledDate}${windowStart && windowEnd ? ` ${windowStart}-${windowEnd}` : ""}` : "Unscheduled"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Billing</p>
                <p className="mt-1 font-medium text-slate-900">{billingRecipientLabel}</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="sr-only" aria-live="polite">
          {isSubmitting ? "Creating job. Please wait." : ""}
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
          {draftMsg && !draftFound ? (
            <p className="text-right text-xs text-slate-500">{draftMsg}</p>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              {isInternalMode ? "Drafts stay on this device until the job is created." : "Save locally if you need to come back before submitting."}
            </p>
            <div className="flex flex-wrap gap-2 sm:justify-end">
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
              disabled={!isSubmitReady || isSubmitting}
              aria-disabled={!isSubmitReady || isSubmitting}
              onClick={() => {
                try {
                  localStorage.removeItem(DRAFT_KEY);
                } catch {}
              }}
            >
              {isContractorMode
                ? isSubmitting ? "Submitting\u2026" : "Submit Job \u2192"
                : isSubmitting ? "Creating Job\u2026" : "Create Job \u2192"}
            </button>
            </div>
          </div>
        </div>
      </form>
      </div>
    </div>
  );
}
