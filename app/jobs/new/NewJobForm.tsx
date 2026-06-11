// app/jobs/new/NewJobForm

"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { BriefcaseBusiness, CalendarClock, Camera, ChevronDown, ClipboardList, FileText, MapPinned, MessageSquare, Plus, Sparkles, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContractorProposalAttachmentUploadToken,
  createJobFromForm,
  finalizeContractorProposalAttachments,
  getInternalIntakeRelationshipContext,
} from "@/lib/actions/job-actions";
import JobCoreFields from "@/components/jobs/JobCoreFields";
import ActionFeedback from "@/components/ui/ActionFeedback";
import VisitScopeBuilder, {
  type VisitScopeDraftItem,
  type VisitScopePricebookTemplateItem,
} from "@/components/jobs/VisitScopeBuilder";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  createVisitScopeItemId,
  hasStructuredVisitScopeItemsJson,
  sanitizeVisitScopeItemId,
} from "@/lib/jobs/visit-scope";
import {
  resolveDefaultJobTypeForNewJobForm,
  resolveModeSafeJobType,
  resolveRestoredDraftJobType,
} from "./new-job-defaults";
import type { ProductMode } from "@/lib/business/product-mode-defaults";
import { formatDateOnlyDisplay, formatTimestampDateDisplayLA } from "@/lib/utils/schedule-la";
import { formatPersonDisplayName } from "@/lib/utils/identity-display";
import {
  EQUIPMENT_ROLE_OPTIONS,
  equipmentRoleLabel,
  equipmentUsesRefrigerant,
  isHeatingOnlyEquipment,
} from "@/lib/utils/equipment-display";

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

type LocationSiteAccessHintRow = {
  location_id: string;
  display_name: string;
  phone_e164: string | null;
  email: string | null;
  notes: string | null;
};

type MyContractor = { id: string; name: string } | null;

type MaintenanceAgreementPrefill = {
  agreement_id: string;
  agreement_name: string;
  next_due_date: string | null;
  primary_location_id: string | null;
  default_visit_scope_summary: string | null;
  default_visit_scope_items: Array<{
    id?: string;
    title: string;
    details: string | null;
    kind?: "primary" | "companion_service";
    source_pricebook_item_id?: string | null;
    expected_unit_price?: number | null;
    unit_label?: string | null;
    item_type?: string | null;
    category?: string | null;
  }>;
};
type ComponentType = (typeof EQUIPMENT_ROLE_OPTIONS)[number]["value"];

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
const CONTRACTOR_PROPOSAL_ATTACHMENT_MAX_COUNT = 8;
const CONTRACTOR_PROPOSAL_ATTACHMENT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const CONTRACTOR_PROPOSAL_ATTACHMENT_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const CONTRACTOR_PROPOSAL_ATTACHMENT_ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);

type NewJobDraft = {
  windowStart?: string;
  windowEnd?: string;
  scheduledDate?: string;
  contractorId?: string;
  jobType?: "ecc" | "service";
  serviceCaseKind?: "reactive" | "callback" | "warranty" | "maintenance";
  serviceVisitType?:
    | "diagnostic"
    | "repair"
    | "install"
    | "return_visit"
    | "callback"
    | "maintenance";
  serviceVisitOutcome?: "resolved" | "follow_up_required" | "no_issue_found";
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
  siteAccessContactDifferent?: boolean;
  siteAccessContactName?: string;
  siteAccessContactPhone?: string;
  siteAccessContactEmail?: string;
  siteAccessContactNotes?: string;
  systems?: EquipmentSystem[];
  locationId?: string;
  newLocationAddressLine2?: string;
  visitScopeSummary?: string;
  visitScopeItems?: Array<{
    id?: string;
    title: string;
    details: string | null;
    kind: "primary" | "companion_service";
    source_pricebook_item_id?: string | null;
    expected_unit_price?: number | null;
    unit_label?: string | null;
    item_type?: string | null;
    category?: string | null;
  }>;
};

type RelationshipAction = "new_case" | "open_active_job" | "create_follow_up";

type RelationshipJobSummary = {
  id: string;
  title: string | null;
  job_type: string | null;
  status: string | null;
  ops_status: string | null;
  scheduled_date: string | null;
  window_start: string | null;
  window_end: string | null;
  created_at: string | null;
};

type RelationshipContext = {
  activeJobs: RelationshipJobSummary[];
  recentJobs: RelationshipJobSummary[];
};

const EMPTY_RELATIONSHIP_CONTEXT: RelationshipContext = {
  activeJobs: [],
  recentJobs: [],
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function componentLabel(t: ComponentType) {
  return equipmentRoleLabel(t);
}

function componentUsesHeatingCapacity(t: ComponentType) {
  return isHeatingOnlyEquipment(t);
}

function customerDisplayName(row: CustomerLookupRow | ExistingCustomer) {
  return formatPersonDisplayName({
    fullName: "full_name" in row ? row.full_name : null,
    firstName: row.first_name,
    lastName: row.last_name,
    fallback: "Unnamed Customer",
  });
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

function parseFileExtension(fileName: string) {
  const normalized = String(fileName ?? "").trim().toLowerCase();
  if (!normalized.includes(".")) return "";
  const parts = normalized.split(".");
  return String(parts.at(-1) ?? "").trim();
}

function validateContractorAttachmentFile(file: File) {
  const mime = String(file.type ?? "").trim().toLowerCase();
  const extension = parseFileExtension(file.name);

  if (file.size <= 0) return "One or more files are empty.";
  if (file.size > CONTRACTOR_PROPOSAL_ATTACHMENT_MAX_FILE_SIZE_BYTES) {
    return "Each file must be 10MB or smaller.";
  }

  const mimeAllowed = CONTRACTOR_PROPOSAL_ATTACHMENT_ALLOWED_MIME_TYPES.has(mime);
  const extensionAllowed = CONTRACTOR_PROPOSAL_ATTACHMENT_ALLOWED_EXTENSIONS.has(extension);
  if (!mimeAllowed || !extensionAllowed) {
    return "Only JPG, PNG, WEBP, and PDF files are allowed.";
  }

  return null;
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

function relationshipJobTitle(job: RelationshipJobSummary) {
  return String(job.title ?? "").trim() || `Job ${job.id.slice(0, 8)}`;
}

function relationshipOpsLabel(value?: string | null) {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "need_to_schedule") return "Need to Schedule";
  if (v === "scheduled") return "Scheduled";
  if (v === "pending_info") return "Pending Info";
  if (v === "on_hold") return "On Hold";
  if (v === "failed") return "Failed";
  if (v === "pending_office_review") return "Pending Office Review";
  if (v === "retest_needed") return "Retest Needed";
  if (v === "paperwork_required") return "Paperwork Required";
  if (v === "invoice_required") return "Invoice Required";
  if (v === "closed") return "Closed";
  return v ? v.replace(/_/g, " ") : "Unknown";
}

function relationshipOpsTone(value?: string | null) {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "need_to_schedule") return "border-blue-200 bg-blue-50 text-blue-800";
  if (v === "scheduled") return "border-cyan-200 bg-cyan-50 text-cyan-800";
  if (v === "pending_info") return "border-amber-200 bg-amber-50 text-amber-800";
  if (v === "on_hold") return "border-slate-300 bg-slate-100 text-slate-700";
  if (v === "failed" || v === "retest_needed") return "border-rose-200 bg-rose-50 text-rose-800";
  if (v === "paperwork_required" || v === "invoice_required") return "border-purple-200 bg-purple-50 text-purple-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function formatRelationshipDate(value?: string | null) {
  if (!value) return "Unscheduled";
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatDateOnlyDisplay(raw);
  return formatTimestampDateDisplayLA(raw) || "Unscheduled";
}

function formatRelationshipWindow(job: RelationshipJobSummary) {
  const start = String(job.window_start ?? "").trim();
  const end = String(job.window_end ?? "").trim();
  return start && end ? `${start}-${end}` : null;
}

function formatPrefillDueDate(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "No due date";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatDateOnlyDisplay(raw);
  return formatTimestampDateDisplayLA(raw) || "No due date";
}

function mapPrefillVisitScopeItems(
  input: MaintenanceAgreementPrefill["default_visit_scope_items"],
): VisitScopeDraftItem[] {
  return input.map((item) => ({
    id: sanitizeVisitScopeItemId(item.id) ?? createVisitScopeItemId(),
    title: String(item.title ?? "").trim(),
    details: String(item.details ?? "").trim(),
    kind: (item.kind === "companion_service" ? "companion_service" : "primary") as
      | "primary"
      | "companion_service",
    source_pricebook_item_id: sanitizeVisitScopeItemId(item.source_pricebook_item_id) ?? null,
    expected_unit_price:
      item.expected_unit_price === null || item.expected_unit_price === undefined
        ? null
        : Number.isFinite(Number(item.expected_unit_price))
          ? Math.max(0, Number(item.expected_unit_price))
          : null,
    unit_label: String(item.unit_label ?? "").trim() || null,
    item_type: String(item.item_type ?? "").trim() || null,
    category: String(item.category ?? "").trim() || null,
    promoted_service_job_id: null,
    promoted_at: null,
    promoted_by_user_id: null,
  }));
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
  submittedProposalId,
  customerContextMode = false,
  customerContextSource = null,
  initialJobType,
  productMode = "hybrid",
  pricebookTemplateItems = [],
  locationSiteAccessHints = [],
  maintenanceAgreementPrefill,
  maintenanceAgreementPrefillStatus = null,
  initialCreateNewCustomer = false,
}: {
  contractors: Contractor[];
  existingCustomer?: ExistingCustomer | null;
  locations?: LocationRow[];
  customerLookupRows?: CustomerLookupRow[];
  locationLookupRows?: LocationLookupRow[];
  myContractor?: MyContractor;
  errorCode?: string | null;
  submittedProposalId?: string | null;
  customerContextMode?: boolean;
  customerContextSource?: string | null;
  initialJobType?: "ecc" | "service";
  productMode?: ProductMode;
  pricebookTemplateItems?: VisitScopePricebookTemplateItem[];
  locationSiteAccessHints?: LocationSiteAccessHintRow[];
  maintenanceAgreementPrefill?: MaintenanceAgreementPrefill | null;
  maintenanceAgreementPrefillStatus?: "unavailable" | null;
  initialCreateNewCustomer?: boolean;
}) {

  const isContractorMode = Boolean(myContractor?.id);
  const router = useRouter();
  const isInternalMode = !isContractorMode;
  const forceServicePrefillMode = Boolean(maintenanceAgreementPrefill && isInternalMode);
  const isHybridProductMode = productMode === "hybrid";
  const isHvacServiceInternalMode = isInternalMode && productMode === "hvac_service";
  const hasSeededCustomer = Boolean(existingCustomer?.id);
  const isCustomerContextInternalMode =
    isInternalMode && customerContextMode && Boolean(existingCustomer?.id);
  const maintenancePrefillLocationId = String(
    maintenanceAgreementPrefill?.primary_location_id ?? "",
  ).trim();
  const hasMaintenancePrefillLocation = Boolean(
    maintenancePrefillLocationId && locations.some((row) => row.id === maintenancePrefillLocationId),
  );
  const maintenancePrefillItems = useMemo(
    () => mapPrefillVisitScopeItems(maintenanceAgreementPrefill?.default_visit_scope_items ?? []),
    [maintenanceAgreementPrefill?.default_visit_scope_items],
  );

  const [guidedCustomerQuery, setGuidedCustomerQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    existingCustomer?.id ?? "",
  );
  const [createNewCustomer, setCreateNewCustomer] = useState<boolean>(
    initialCreateNewCustomer && isInternalMode && !isCustomerContextInternalMode,
  );
  const [locationMode, setLocationMode] = useState<"existing" | "new" | null>(
    hasSeededCustomer
      ? (locations.length > 0 ? "existing" : "new")
      : null,
  );
  const [locationId, setLocationId] = useState<string>(() => {
    if (isCustomerContextInternalMode) {
      if (hasMaintenancePrefillLocation) return maintenancePrefillLocationId;
      return locations.length === 1 ? locations[0].id : "";
    }
    if (hasMaintenancePrefillLocation) return maintenancePrefillLocationId;
    return locations.length ? locations[0].id : "";
  });
  const [newLocationNickname, setNewLocationNickname] = useState("");
  const [newLocationAddressLine1, setNewLocationAddressLine1] = useState("");
  const [newLocationAddressLine2, setNewLocationAddressLine2] = useState("");
  const [newLocationCity, setNewLocationCity] = useState("");
  const [newLocationState, setNewLocationState] = useState("CA");
  const [newLocationZip, setNewLocationZip] = useState("");
  const [siteAccessContactDifferent, setSiteAccessContactDifferent] = useState(false);
  const [siteAccessContactName, setSiteAccessContactName] = useState("");
  const [siteAccessContactPhone, setSiteAccessContactPhone] = useState("");
  const [siteAccessContactEmail, setSiteAccessContactEmail] = useState("");
  const [siteAccessContactNotes, setSiteAccessContactNotes] = useState("");
  const [newCustomerFirstName, setNewCustomerFirstName] = useState("");
  const [newCustomerLastName, setNewCustomerLastName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");

  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");

  // Contractor selection (internal/admin only). Contractor users are auto-tied.
 const [contractorId, setContractorId] = useState<string>(() => myContractor?.id ?? "");

  const defaultJobType: "ecc" | "service" = resolveDefaultJobTypeForNewJobForm({
    contractorId: myContractor?.id,
    initialJobType,
    productMode,
    isInternalMode,
  });
  const [jobType, setJobType] = useState<"ecc" | "service">(
    maintenanceAgreementPrefill ? "service" : defaultJobType,
  );
  const modeSafeJobType = resolveModeSafeJobType({
    requestedJobType: forceServicePrefillMode ? "service" : jobType,
    productMode: forceServicePrefillMode ? "hybrid" : productMode,
    isInternalMode,
  });
  const [serviceCaseKind, setServiceCaseKind] = useState<
    "reactive" | "callback" | "warranty" | "maintenance"
  >(maintenanceAgreementPrefill ? "maintenance" : "reactive");
  const [serviceVisitType, setServiceVisitType] = useState<
    "diagnostic" | "repair" | "install" | "return_visit" | "callback" | "maintenance"
  >(maintenanceAgreementPrefill ? "maintenance" : "diagnostic");
  const [serviceVisitOutcome, setServiceVisitOutcome] = useState<
    "resolved" | "follow_up_required" | "no_issue_found"
  >("follow_up_required");

const [billingRecipient, setBillingRecipient] = useState<
    "contractor" | "customer" | "other"
  >(myContractor?.id ? "contractor" : "customer");
  const [billingRecipientDifferent, setBillingRecipientDifferent] = useState(false);

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
  const [visitScopeSummary, setVisitScopeSummary] = useState(
    String(maintenanceAgreementPrefill?.default_visit_scope_summary ?? "").trim(),
  );
  const [visitScopeItems, setVisitScopeItems] = useState<VisitScopeDraftItem[]>(maintenancePrefillItems);
  const isServicePlanPrefillFlow = Boolean(isInternalMode && maintenanceAgreementPrefill);
  const isServicePlanQuickScheduleMode = Boolean(isServicePlanPrefillFlow && jobType === "service");
  const [showServicePlanWorkItems, setShowServicePlanWorkItems] = useState(false);
  const [showServicePlanAdvancedDetails, setShowServicePlanAdvancedDetails] = useState(false);
  const [visitScopeResetKey, setVisitScopeResetKey] = useState(0);
  const [visitScopeError, setVisitScopeError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [relationshipAction, setRelationshipAction] = useState<RelationshipAction>("new_case");
  const [relationshipJobId, setRelationshipJobId] = useState("");
  const [relationshipContext, setRelationshipContext] = useState<RelationshipContext>(EMPTY_RELATIONSHIP_CONTEXT);
  const [relationshipError, setRelationshipError] = useState<string | null>(null);
  const [isRelationshipPending, startRelationshipTransition] = useTransition();
  const [isAttachmentUploading, startAttachmentUploadTransition] = useTransition();
  const [proposalAttachmentError, setProposalAttachmentError] = useState<string | null>(null);
  const [proposalAttachmentSuccess, setProposalAttachmentSuccess] = useState<string | null>(null);
  const contractorAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const submitLockedRef = useRef(false);
  const relationshipRequestRef = useRef(0);
  const createNewCustomerCardRef = useRef<HTMLDivElement | null>(null);
  const createNewCustomerFirstNameRef = useRef<HTMLInputElement | null>(null);
  const visitScopeSectionRef = useRef<HTMLDivElement | null>(null);

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
    const seededLocationsForContext: LocationLookupRow[] =
      existingCustomer?.id && isCustomerContextInternalMode
        ? locations.map((l) => ({
            id: l.id,
            customer_id: existingCustomer.id,
            nickname: l.nickname,
            address_line1: l.address_line1,
            city: l.city,
            state: l.state,
            zip: l.zip,
            postal_code: l.zip,
          }))
        : [];

    const map = new Map<string, LocationLookupRow>();
    for (const l of [...locationLookupRows, ...seededLocationsForContext]) {
      if (!l.customer_id || map.has(l.customer_id)) continue;
      map.set(l.customer_id, l);
    }
    return map;
  }, [existingCustomer?.id, isCustomerContextInternalMode, locationLookupRows, locations]);

  const locationRowsForResolution = useMemo(() => {
    if (!isCustomerContextInternalMode || !existingCustomer?.id) return locationLookupRows;

    return locations.map((l) => ({
      id: l.id,
      customer_id: existingCustomer.id,
      nickname: l.nickname,
      address_line1: l.address_line1,
      city: l.city,
      state: l.state,
      zip: l.zip,
      postal_code: l.zip,
    }));
  }, [existingCustomer?.id, isCustomerContextInternalMode, locationLookupRows, locations]);

  const filteredGuidedCustomers = useMemo(() => {
    const query = guidedCustomerQuery.trim();
    if (query.length < 2) return [];
    const q = query.toLowerCase();

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
        return (
          row.name.includes(q) ||
          row.email.includes(q) ||
          row.phone.includes(q) ||
          row.locationContext.toLowerCase().includes(q) ||
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
  const hasMeaningfulCustomerQuery = guidedCustomerQuery.trim().length >= 2;

  const internalPageTitle = productMode === "hvac_service"
    ? "New Work Order"
    : productMode === "ecc_hers"
      ? "New ECC Job"
      : "New Job";
  const isHvacServiceMode = productMode === "hvac_service";
  const compactHeaderHelper = isContractorMode
    ? "Work shared between your company and Compliance Matters."
    : productMode === "ecc_hers"
      ? "Select the responsible account and service location, define the compliance work, then create the job."
      : "Select the responsible account, choose the work, then create the job.";
  const internalModeHint =
    isHvacServiceMode
      ? "Service accounts use the Service / Work Order family by default and presentation."
      : productMode === "ecc_hers"
        ? "ECC/HERS accounts use the ECC / Compliance Test family by default and presentation."
        : "Hybrid keeps both workflows available. Choose ECC or Service based on the visit you are creating.";
  const jobFamilyStepTitle = isHvacServiceMode
    ? "Work Order Setup"
    : productMode === "ecc_hers"
      ? "ECC Job Setup"
      : "Job Type";
  const jobFamilyStepDescription = isHvacServiceMode
    ? "These fields classify the visit. Work instructions are added below."
    : productMode === "ecc_hers"
      ? "ECC / Compliance is locked for this account. Review the compliance details below before continuing."
      : "What kind of job are you creating?";
  const jobFamilyControlLabel = isHvacServiceMode ? "Service / Work Order" : "Job Type";
  const serviceJobFamilyDescription = isHvacServiceMode
    ? "Locked to Service"
    : "Standard service visit workflow";
  const eccJobFamilyDescription = isHvacServiceMode
    ? "Advanced compliance testing workflow"
    : "Energy code test workflow";
  const createSectionTitle = isHvacServiceMode
    ? "Create Work Order"
    : productMode === "ecc_hers"
      ? "Create ECC Job"
      : "Create Work Order";
  const createSectionDescription = isHvacServiceMode
    ? "Review the work order summary, then create it when the required intake details are ready."
    : productMode === "ecc_hers"
      ? "Review the compliance job summary, then create it when the required intake details are ready."
      : "Review the work order summary, then create it when the required intake details are ready.";
  const createReadyLabel = productMode === "ecc_hers" ? "Ready to create this ECC job." : "Ready to create this work order.";
  const createPendingLabel = productMode === "ecc_hers"
    ? "Complete the required intake details to create this ECC job."
    : "Complete the required intake details to create this work order.";
  const customerSectionDescription = isHvacServiceMode
    ? "Select the customer / responsible account and confirm where the work order should happen."
    : productMode === "ecc_hers"
      ? "Select the customer / responsible account and confirm where the compliance job should happen."
      : "Select the customer / responsible account and confirm where the work order should happen.";

  useEffect(() => {
    if (jobType === modeSafeJobType) return;
    setJobType(modeSafeJobType);
  }, [jobType, modeSafeJobType]);

  useEffect(() => {
    if (!isServicePlanPrefillFlow) {
      setShowServicePlanWorkItems(false);
    }
  }, [isServicePlanPrefillFlow]);

  useEffect(() => {
    if (!isServicePlanQuickScheduleMode) {
      setShowServicePlanAdvancedDetails(false);
    }
  }, [isServicePlanQuickScheduleMode]);

  useEffect(() => {
    if (!isHvacServiceInternalMode) return;

    if (contractorId) {
      setContractorId("");
    }

    if (billingRecipient === "contractor") {
      setBillingRecipient("customer");
    }
  }, [billingRecipient, contractorId, isHvacServiceInternalMode]);

  useEffect(() => {
    if (!isInternalMode) return;
    if (modeSafeJobType !== "service") return;

    if (billingRecipientDifferent) {
      if (billingRecipient !== "other") setBillingRecipient("other");
      return;
    }

    if (billingRecipient !== "customer") {
      setBillingRecipient("customer");
    }
  }, [billingRecipient, billingRecipientDifferent, isInternalMode, modeSafeJobType]);

  const selectedCustomer = useMemo(
    () => guidedCustomers.find((c) => c.id === selectedCustomerId) ?? null,
    [guidedCustomers, selectedCustomerId],
  );

  const selectedCustomerLocations = useMemo(() => {
    if (!selectedCustomerId) return [];
    return locationRowsForResolution.filter((l) => l.customer_id === selectedCustomerId);
  }, [locationRowsForResolution, selectedCustomerId]);

  const selectedLocation = useMemo(
    () => selectedCustomerLocations.find((l) => l.id === locationId) ?? null,
    [selectedCustomerLocations, locationId],
  );

  const locationSiteAccessHintById = useMemo(() => {
    const map = new Map<string, LocationSiteAccessHintRow>();
    for (const row of locationSiteAccessHints) {
      const locationIdValue = String(row.location_id ?? "").trim();
      if (!locationIdValue || map.has(locationIdValue)) continue;
      map.set(locationIdValue, row);
    }
    return map;
  }, [locationSiteAccessHints]);

  const selectedLocationSiteAccessHint = useMemo(() => {
    if (!locationId) return null;
    return locationSiteAccessHintById.get(locationId) ?? null;
  }, [locationId, locationSiteAccessHintById]);

  const selectedCustomerPrimaryLocation = useMemo(
    () => selectedCustomerLocations[0] ?? customerPrimaryLocationMap.get(selectedCustomerId) ?? null,
    [customerPrimaryLocationMap, selectedCustomerId, selectedCustomerLocations],
  );

  const isNewLocation =
    isInternalMode && selectedCustomerId && !createNewCustomer && locationMode === "new";

  const hasContextSingleLocation = isCustomerContextInternalMode && selectedCustomerLocations.length === 1;
  useEffect(() => {
    if (!isCustomerContextInternalMode) return;
    if (selectedCustomerLocations.length === 1) {
      const onlyLocationId = selectedCustomerLocations[0]?.id ?? "";
      if (onlyLocationId) {
        setLocationMode("existing");
        setLocationId(onlyLocationId);
      }
      return;
    }
    if (selectedCustomerLocations.length === 0) {
      setLocationMode("new");
      setLocationId("");
      return;
    }

    setLocationMode("existing");
    setLocationId((current) => {
      if (!current) return "";
      return selectedCustomerLocations.some((location) => location.id === current) ? current : "";
    });
  }, [isCustomerContextInternalMode, selectedCustomerLocations]);

  function onQuickWindowChange(value: string) {
    if (!value) return;
    const [start, end] = value.split("-");
    if (start) setWindowStart(start);
    if (end) setWindowEnd(end);
  }

    function resetRelationshipDecision() {
      setRelationshipAction("new_case");
      setRelationshipJobId("");
    }

  const systemsNeedingName = useMemo(() => {
    return systems
      .filter((s) => s.components.length > 0 && !s.name.trim())
      .map((s) => s.id);
  }, [systems]);

  const canSubmit = systemsNeedingName.length === 0;

  const internalResolutionReady = useMemo(() => {
    const hasContextNewLocationDetails = Boolean(
      newLocationAddressLine1.trim() &&
        newLocationCity.trim() &&
        newLocationState.trim() &&
        newLocationZip.trim(),
    );

    if (!isInternalMode) return true;
    if (createNewCustomer) return true;
    if (!selectedCustomerId) return false;
    if (locationMode === "existing") return Boolean(locationId);
    if (locationMode === "new") {
      if (isCustomerContextInternalMode) {
        return hasContextNewLocationDetails;
      }
      return true;
    }
    return false;
  }, [
    createNewCustomer,
    isCustomerContextInternalMode,
    isInternalMode,
    locationId,
    locationMode,
    newLocationAddressLine1,
    newLocationCity,
    newLocationState,
    newLocationZip,
    selectedCustomerId,
  ]);

  const internalResolutionLabel = useMemo(() => {
    const hasNewLocationDetails = Boolean(
      newLocationAddressLine1.trim() &&
        newLocationCity.trim() &&
        newLocationState.trim() &&
        newLocationZip.trim(),
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
        return "New responsible account and service location details are complete.";
      }
      return "Creating a new responsible account and service location. Complete the account and address details to continue.";
    }
    if (selectedCustomerId && locationMode === "new") {
      if (hasNewLocationDetails) {
        return "Responsible account confirmed. New service location details are complete.";
      }
      return "Responsible account confirmed. Complete the new service location details to continue.";
    }
    if (selectedCustomerId && locationMode === "existing" && locationId) {
      return "Responsible account and service location confirmed.";
    }
    if (selectedCustomerId && locationMode === "existing" && !locationId) {
      return "Responsible account confirmed. Select a service location to continue.";
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
    newLocationState,
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

  const shouldShowRelationshipStep = Boolean(
    isInternalMode && !createNewCustomer && selectedCustomerId && locationMode === "existing" && locationId,
  );

  const shouldShowSiteAccessToggle = Boolean(
    isInternalMode && (createNewCustomer || selectedCustomerId),
  );

  const relationshipJobs = useMemo(() => {
    return [...relationshipContext.activeJobs, ...relationshipContext.recentJobs];
  }, [relationshipContext.activeJobs, relationshipContext.recentJobs]);

  const selectedRelationshipJob = useMemo(
    () => relationshipJobs.find((job) => job.id === relationshipJobId) ?? null,
    [relationshipJobId, relationshipJobs],
  );

  const relationshipDecisionReady =
    !shouldShowRelationshipStep || relationshipAction === "new_case" || Boolean(selectedRelationshipJob);

  const isSubmitReady = canSubmit && internalResolutionReady && relationshipDecisionReady;
  const canAdvancePastResolution =
    !isInternalMode || (internalResolutionReady && relationshipDecisionReady && relationshipAction !== "open_active_job");
  const showInternalSetupHint =
    isInternalMode && (!internalResolutionReady || (shouldShowRelationshipStep && !relationshipDecisionReady));
  const internalNextStepMessage = !internalResolutionReady
    ? isHvacServiceMode
      ? "Resolve customer and location to unlock work-order family, relationship review, job scope, scheduling, billing, and optional details."
      : productMode === "ecc_hers"
        ? "Resolve customer and location to unlock ECC setup, compliance details, optional scope, scheduling, billing, and additional details."
        : "Resolve customer and location to unlock job family, relationship review, job scope, scheduling, billing, and optional details."
    : isHvacServiceMode
      ? "Choose the work-order family and relationship path before defining the job scope for this trip."
      : productMode === "ecc_hers"
        ? "Review the ECC setup, project details, optional scope, scheduling, billing, and additional details before creating the job."
        : "Choose the job family and relationship path before defining the job scope for this trip.";
  const billingRecipientLabel =
    modeSafeJobType === "service"
      ? billingRecipientDifferent
        ? "Custom billing/paperwork"
        : "Responsible account (default)"
      : billingRecipient === "contractor"
        ? "Contractor"
        : billingRecipient === "customer"
          ? "Customer"
          : "Custom billing";
  const createSectionSummary = isSubmitReady ? createReadyLabel : createPendingLabel;

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
        serviceCaseKind,
        serviceVisitType,
        serviceVisitOutcome,
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
        siteAccessContactDifferent,
        siteAccessContactName,
        siteAccessContactPhone,
        siteAccessContactEmail,
        siteAccessContactNotes,
        systems,
        locationId,
        newLocationAddressLine2,
        visitScopeSummary,
        visitScopeItems: visitScopeItems.map((item) => ({
          id: item.id,
          title: item.title.trim(),
          details: item.details.trim() || null,
          kind: item.kind,
          source_pricebook_item_id:
            sanitizeVisitScopeItemId(item.source_pricebook_item_id) ?? null,
          expected_unit_price:
            item.expected_unit_price === null || item.expected_unit_price === undefined
              ? null
              : Math.max(0, Number(item.expected_unit_price)),
          unit_label: String(item.unit_label ?? "").trim() || null,
          item_type: String(item.item_type ?? "").trim() || null,
          category: String(item.category ?? "").trim() || null,
        })),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setDraftFound(true);
      setDraftMsg("Draft saved.");
    } catch {
      setDraftMsg("Unable to save - check browser settings.");
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
    setContractorId(isHvacServiceInternalMode ? "" : (d.contractorId ?? ""));
    setJobType(
      resolveRestoredDraftJobType({
        draftJobType: d.jobType,
        defaultJobType,
        productMode,
        isInternalMode,
      }),
    );
    setServiceCaseKind(d.serviceCaseKind ?? "reactive");
    setServiceVisitType(d.serviceVisitType ?? "diagnostic");
    setServiceVisitOutcome(d.serviceVisitOutcome ?? "follow_up_required");
    const restoredBillingRecipient = d.billingRecipient ?? (myContractor?.id ? "contractor" : "customer");
    setBillingRecipient(
      isHvacServiceInternalMode && restoredBillingRecipient === "contractor"
        ? "customer"
        : restoredBillingRecipient,
    );
    setProjectType(d.projectType ?? "alteration");

    setBillingName(d.billingName ?? "");
    setBillingEmail(d.billingEmail ?? "");
    setBillingPhone(d.billingPhone ?? "");
    setBillingAddr1(d.billingAddr1 ?? "");
    setBillingAddr2(d.billingAddr2 ?? "");
    setBillingCity(d.billingCity ?? "");
    setBillingState(d.billingState ?? "CA");
    setBillingZip(d.billingZip ?? "");
    setSiteAccessContactDifferent(Boolean(d.siteAccessContactDifferent));
    setSiteAccessContactName(d.siteAccessContactName ?? "");
    setSiteAccessContactPhone(d.siteAccessContactPhone ?? "");
    setSiteAccessContactEmail(d.siteAccessContactEmail ?? "");
    setSiteAccessContactNotes(d.siteAccessContactNotes ?? "");
    setNewLocationAddressLine2(d.newLocationAddressLine2 ?? "");
    setBillingRecipientDifferent((d.billingRecipient ?? "customer") === "other");

    setSystems(Array.isArray(d.systems) ? d.systems : []);
    setVisitScopeSummary(d.visitScopeSummary ?? "");
    setVisitScopeItems(
      Array.isArray(d.visitScopeItems)
        ? d.visitScopeItems.map((item) => ({
            id: sanitizeVisitScopeItemId(item.id) ?? createVisitScopeItemId(),
            title: String(item.title ?? ""),
            details: String(item.details ?? ""),
            kind: item.kind === "companion_service" ? "companion_service" : "primary",
            source_pricebook_item_id:
              sanitizeVisitScopeItemId(item.source_pricebook_item_id) ?? null,
            expected_unit_price:
              item.expected_unit_price === null || item.expected_unit_price === undefined
                ? null
                : Number.isFinite(Number(item.expected_unit_price))
                  ? Math.max(0, Number(item.expected_unit_price))
                  : null,
            unit_label: String(item.unit_label ?? "").trim() || null,
            item_type: String(item.item_type ?? "").trim() || null,
            category: String(item.category ?? "").trim() || null,
          }))
        : [],
    );
    setVisitScopeResetKey((value) => value + 1);
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

    if (isInternalMode && modeSafeJobType === "service") {
      const formData = new FormData(event.currentTarget);
      const serializedItems = String(formData.get("visit_scope_items_json") ?? "").trim();
      if (!hasStructuredVisitScopeItemsJson(serializedItems)) {
        event.preventDefault();
        setVisitScopeError("Add at least one structured job scope item before creating a Service job.");
        window.requestAnimationFrame(() => {
          visitScopeSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        return;
      }
    }

    submitLockedRef.current = true;
    setVisitScopeError(null);
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

  useEffect(() => {
    if (!shouldShowRelationshipStep) return;

    const requestId = relationshipRequestRef.current + 1;
    relationshipRequestRef.current = requestId;

    startRelationshipTransition(() => {
      setRelationshipError(null);
      void getInternalIntakeRelationshipContext({
        customerId: selectedCustomerId,
        locationId,
        jobType: modeSafeJobType,
      })
        .then((nextContext) => {
          if (relationshipRequestRef.current !== requestId) return;
          setRelationshipContext(nextContext);
        })
        .catch(() => {
          if (relationshipRequestRef.current !== requestId) return;
          setRelationshipContext(EMPTY_RELATIONSHIP_CONTEXT);
          setRelationshipError("Could not load existing work context. You can still continue as a new case.");
        });
    });
  }, [locationId, modeSafeJobType, selectedCustomerId, shouldShowRelationshipStep, startRelationshipTransition]);

  const secondaryButtonClass =
    "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-all duration-150 hover:border-slate-400 hover:bg-slate-50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60";
  const secondaryCompactButtonClass =
    "inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-slate-700 transition-all duration-150 hover:border-slate-400 hover:bg-slate-50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60";
  const dangerTextButtonClass =
    "text-sm text-red-600 transition-colors duration-150 hover:text-red-700 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200";
  const primaryButtonClass =
    `inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-70 ${
      canSubmit ? "bg-slate-900 hover:bg-slate-800 active:scale-[0.99]" : "bg-slate-400"
    }`;
  const completedVisitScopeItemCount = visitScopeItems.filter((item) => item.title.trim() || item.details.trim()).length;
  const guidedSectionShellClass =
    "rounded-[28px] border border-slate-200/85 bg-white shadow-[0_22px_60px_-42px_rgba(15,23,42,0.42)] overflow-hidden";
  const guidedSectionBodyClass = "space-y-4 px-4 pb-4 pt-4 sm:px-5 sm:pb-5";
  const guidedSectionInsetClass =
    "rounded-2xl border border-slate-200/85 bg-slate-50/70 p-4 shadow-[0_14px_28px_-28px_rgba(15,23,42,0.32)]";
  const supportingSectionIconWrapClass =
    "flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200/85 bg-white text-slate-600 shadow-[0_10px_22px_-24px_rgba(15,23,42,0.28)]";
  const supportingSectionMetaClass =
    "inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const selectedCustomerSummary = selectedCustomer ? customerDisplayName(selectedCustomer) : "Customer not selected";
  const resolvedExistingLocation = locationMode === "existing"
    ? (selectedLocation ?? (hasContextSingleLocation ? selectedCustomerLocations[0] ?? null : null))
    : null;
  const selectedLocationSummary = createNewCustomer || locationMode === "new"
    ? (newLocationAddressLine1 || "New location")
    : (selectedLocation ? formatLocationContext(selectedLocation) : "Location not selected");
  const customerSectionTone = internalResolutionReady ? "complete" : "active";
  const setupSectionTone = !canAdvancePastResolution
    ? "pending"
    : internalResolutionReady
      ? "active"
      : "pending";
  const workOrderSectionTone = !canAdvancePastResolution
    ? "pending"
    : completedVisitScopeItemCount > 0
      ? "complete"
      : "active";
  const scheduleSectionTone = !canAdvancePastResolution
    ? "pending"
    : scheduledDate || windowStart || windowEnd
      ? "complete"
      : "pending";
  const additionalDetailsTone = systems.length > 0 ? "complete" : "pending";
  const createSectionTone = isSubmitReady ? "complete" : canAdvancePastResolution ? "active" : "pending";
  const workOrderSectionSummary = completedVisitScopeItemCount > 0
    ? `${visitScopeSummary.trim() || visitScopeItems.find((item) => item.title.trim())?.title.trim() || "Scope added"} • ${completedVisitScopeItemCount} item${completedVisitScopeItemCount === 1 ? "" : "s"}`
    : isServicePlanQuickScheduleMode
      ? "Included work stays collapsed unless you choose to review it."
      : "Choose visit details and add the work scope.";
  const scheduleSectionSummary = scheduledDate
    ? `${scheduledDate}${windowStart && windowEnd ? ` • ${windowStart}-${windowEnd}` : ""}`
    : "Leave unscheduled if timing is not set yet.";
  const additionalDetailsSummary = systems.length > 0
    ? `${systems.length} system${systems.length === 1 ? "" : "s"} added`
    : "Permit, equipment, photos, and comments stay secondary.";

  function guidedSectionToneClasses(tone: "active" | "complete" | "pending") {
    if (tone === "complete") {
      return {
        header: "border-b border-emerald-200 bg-emerald-50/80",
        badge: "border border-emerald-200 bg-white text-emerald-700",
        badgeText: "Complete",
      };
    }

    if (tone === "active") {
      return {
        header: "border-b border-blue-200 bg-blue-50/80",
        badge: "border border-blue-200 bg-white text-blue-700",
        badgeText: "In progress",
      };
    }

    return {
      header: "border-b border-slate-200 bg-slate-50/80",
      badge: "border border-slate-200 bg-white text-slate-600",
      badgeText: "Up next",
    };
  }

  function renderGuidedSectionIntro({
    icon,
    title,
    description,
    summary,
    tone,
    action,
  }: {
    icon?: ReactNode;
    title: string;
    description: string;
    summary?: string;
    tone: "active" | "complete" | "pending";
    action?: ReactNode;
  }) {
    const toneClasses = guidedSectionToneClasses(tone);
    const helperText = summary?.trim() || description;

    return (
      <div className={`flex flex-col gap-3 px-4 py-4 sm:px-5 ${toneClasses.header}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {icon ? (
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/85 bg-white text-slate-600">
                  {icon}
                </span>
              ) : null}
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${toneClasses.badge}`}>
                {toneClasses.badgeText}
              </span>
            </div>
            <p className="text-sm text-slate-700">{helperText}</p>
          </div>
          {action ? <div className="flex flex-none items-center">{action}</div> : null}
        </div>
      </div>
    );
  }

  function renderSupportingSectionHeader({
    icon,
    title,
    description,
    trailing,
  }: {
    icon: ReactNode;
    title: string;
    description?: string;
    trailing?: ReactNode;
  }) {
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={supportingSectionIconWrapClass}>{icon}</div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            {description ? <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p> : null}
          </div>
        </div>
        {trailing ? <div className="flex shrink-0 items-center gap-2">{trailing}</div> : null}
      </div>
    );
  }

  function uploadProposalAttachments() {
    if (!submittedProposalId) {
      setProposalAttachmentError("Proposal was submitted, but attachment upload is temporarily unavailable.");
      return;
    }

    const selectedFiles = Array.from(contractorAttachmentInputRef.current?.files ?? []);
    if (!selectedFiles.length) {
      setProposalAttachmentError("Select at least one file to upload.");
      setProposalAttachmentSuccess(null);
      return;
    }

    if (selectedFiles.length > CONTRACTOR_PROPOSAL_ATTACHMENT_MAX_COUNT) {
      setProposalAttachmentError(`You can upload up to ${CONTRACTOR_PROPOSAL_ATTACHMENT_MAX_COUNT} files at a time.`);
      setProposalAttachmentSuccess(null);
      return;
    }

    for (const file of selectedFiles) {
      const validationError = validateContractorAttachmentFile(file);
      if (validationError) {
        setProposalAttachmentError(validationError);
        setProposalAttachmentSuccess(null);
        return;
      }
    }

    setProposalAttachmentError(null);
    setProposalAttachmentSuccess(null);

    startAttachmentUploadTransition(() => {
      void (async () => {
        try {
          const supabase = createBrowserSupabaseClient();
          const uploadDrafts: Array<{
            attachmentId: string;
            path: string;
            fileName: string;
            contentType: string;
            fileSize: number;
          }> = [];

          for (const file of selectedFiles) {
            const token = await createContractorProposalAttachmentUploadToken({
              submissionId: submittedProposalId,
              fileName: file.name,
              contentType: file.type,
              fileSize: file.size,
            });

            const { error: uploadErr } = await supabase.storage
              .from("attachments")
              .uploadToSignedUrl(token.path, token.token, file, {
                upsert: false,
              });

            if (uploadErr) {
              throw new Error("File upload failed. Please try again.");
            }

            uploadDrafts.push({
              attachmentId: token.attachmentId,
              path: token.path,
              fileName: token.fileName,
              contentType: token.contentType,
              fileSize: token.fileSize,
            });
          }

          const finalized = await finalizeContractorProposalAttachments({
            submissionId: submittedProposalId,
            uploads: uploadDrafts,
          });

          if (contractorAttachmentInputRef.current) {
            contractorAttachmentInputRef.current.value = "";
          }
          setProposalAttachmentSuccess(
            finalized.count === 1
              ? "1 attachment uploaded."
              : `${finalized.count} attachments uploaded.`,
          );
          setProposalAttachmentError(null);
          router.refresh();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not upload files.";
          setProposalAttachmentError(message);
          setProposalAttachmentSuccess(null);
        }
      })();
    });
  }

  if (isContractorMode && errorCode === "contractor_proposal_submitted") {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 shadow-sm space-y-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-emerald-100 text-lg font-bold text-emerald-700" aria-hidden="true" />
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Job submitted</h1>
              <p className="text-sm text-slate-600">Your submission has been received and is now under review.</p>
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
          <div className="rounded-xl border border-emerald-200 bg-white px-4 py-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Attachments (optional)</p>
            <p className="text-sm text-slate-600">
              Your proposal is already saved. You can add photos or PDFs now without affecting your submission.
            </p>
            <input
              ref={contractorAttachmentInputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
              className="w-full rounded-xl border border-slate-300 bg-white p-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700"
            />
            <p className="text-xs text-slate-500">
              Max {CONTRACTOR_PROPOSAL_ATTACHMENT_MAX_COUNT} files, 10MB each. Allowed: JPG, PNG, WEBP, PDF.
            </p>
            <ActionFeedback type="warning" message={proposalAttachmentError} />
            <ActionFeedback type="success" message={proposalAttachmentSuccess} />
            <button
              type="button"
              onClick={uploadProposalAttachments}
              disabled={isAttachmentUploading || !submittedProposalId}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-slate-800 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isAttachmentUploading ? "Uploading..." : "Upload Attachments"}
            </button>
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
    <div className="mx-auto max-w-6xl px-3 py-3 sm:px-6 lg:px-8">
      <div className="space-y-4">
      <header className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-950/5 sm:px-5 sm:py-4">
        <p className="text-[11px] font-semibold uppercase text-slate-500">
          {isContractorMode ? "Portal Work Request" : "Internal intake"}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-slate-950 sm:text-2xl">
          {isContractorMode ? "Send Work to Compliance Matters" : internalPageTitle}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{compactHeaderHelper}</p>
      </header>

      <ActionFeedback
        type="warning"
        message={
          errorCode === "missing_address"
            ? "Could not create job. Service address is required."
            : errorCode === "contractor_proposal_invalid_input"
            ? "Could not submit your job. Please complete customer and service address fields and try again."
            : errorCode === "contractor_proposal_submit_failed"
            ? "Could not submit your job. Please try again, or contact us if the issue persists."
            : errorCode === "visit_scope_required"
            ? "Service jobs require at least one job scope item."
            : errorCode === "visit_scope_invalid"
            ? "Job scope entries could not be read. Please review Step 5 and try again."
            : null
        }
        className="mb-5"
      />

      <ActionFeedback
        type="warning"
        message={visitScopeError}
        className="mb-5"
      />

      <ActionFeedback
        type="success"
        message={
          errorCode === "contractor_proposal_submitted"
            ? "Proposal received - our team will review and follow up shortly."
            : null
        }
        className="mb-5"
      />

      {maintenanceAgreementPrefill ? (
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Prefilled from Service Plan: <span className="font-semibold">{maintenanceAgreementPrefill.agreement_name}</span>
          {" "}
          <span className="text-blue-700">(due {formatPrefillDueDate(maintenanceAgreementPrefill.next_due_date)})</span>.
          Review and edit all fields before submitting.
        </div>
      ) : maintenanceAgreementPrefillStatus === "unavailable" ? (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Service Plan prefill was unavailable for this request. You can continue creating the work order manually.
        </div>
      ) : null}

      {draftFound && (
        <div className="mb-5 rounded-xl border border-slate-200/80 bg-white/85 p-4 space-y-3">
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
        <input type="hidden" name="relationship_action" value={shouldShowRelationshipStep ? relationshipAction : "new_case"} />
        <input type="hidden" name="relationship_job_id" value={selectedRelationshipJob?.id ?? ""} />
        <input type="hidden" name="maintenance_agreement_id" value={maintenanceAgreementPrefill?.agreement_id ?? ""} />
        <input type="hidden" name="intake_context" value={isContractorMode ? "portal" : "app"} />
        {isCustomerContextInternalMode && customerContextSource ? (
          <input type="hidden" name="intake_source" value={customerContextSource} />
        ) : null}
        {/* Identity-tied contractor */}
        {myContractor?.id ? (
          <>
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700" aria-hidden="true" />
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Submitting as</div>
                <div className="text-sm font-semibold text-slate-900">{myContractor.name}</div>
              </div>
            </div>
            <input type="hidden" name="contractor_id" value={myContractor.id} />
          </>
        ) : !isHvacServiceInternalMode ? (
          <div className="rounded-xl border border-slate-200/80 bg-white p-4 space-y-2">
            <label className="block text-sm font-medium text-slate-900">Contractor (optional)</label>
            <select
              name="contractor_id"
              className="w-full rounded-md border border-slate-300 bg-white p-2"
              value={contractorId}
              onChange={(e) => {
                const v = e.target.value;
                setContractorId(v);
                // Let server decide default, but keep UI sensible
                if (modeSafeJobType !== "service") {
                  if (v && billingRecipient === "customer") setBillingRecipient("contractor");
                  if (!v && billingRecipient === "contractor") setBillingRecipient("customer");
                }
              }}
            >
              <option value="">- None -</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <input type="hidden" name="contractor_id" value="" />
        )}

        <div className="flex flex-col gap-8">
        {!isInternalMode ? (
        <section className="space-y-3">
          <h2 className="border-b border-slate-100 pb-2 text-base font-semibold text-slate-900">Job Type</h2>

          {/* Job Type */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <label className="block text-sm font-medium text-slate-900">Job Type</label>
            <p className="text-xs text-slate-600">{internalModeHint}</p>
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
                  <span className="block text-xs text-slate-500">Compliance testing</span>
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
                  <span className="block text-xs text-slate-500">Standard work order</span>
                </span>
              </label>
            </div>

            {/* real submitted value */}
            <input type="hidden" name="job_type" value={modeSafeJobType} />
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

          {jobType === "service" ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <label className="block text-sm font-medium text-slate-900">Service Details</label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Service Type</label>
                  <select
                    name="service_case_kind"
                    className="w-full rounded-md border border-slate-300 bg-white p-2"
                    value={serviceCaseKind}
                    onChange={(e) =>
                      setServiceCaseKind(
                        e.target.value as "reactive" | "callback" | "warranty" | "maintenance",
                      )
                    }
                  >
                    <option value="reactive">Standard Service</option>
                    <option value="callback">Callback</option>
                    <option value="warranty">Warranty</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Visit Type</label>
                  <select
                    name="service_visit_type"
                    className="w-full rounded-md border border-slate-300 bg-white p-2"
                    value={serviceVisitType}
                    onChange={(e) =>
                      setServiceVisitType(
                        e.target.value as
                          | "diagnostic"
                          | "repair"
                          | "install"
                          | "return_visit"
                          | "callback"
                          | "maintenance",
                      )
                    }
                  >
                    <option value="diagnostic">Diagnostic</option>
                    <option value="repair">Repair</option>
                    <option value="install">Install</option>
                    <option value="return_visit">Return Visit</option>
                    <option value="callback">Callback</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
              </div>

            </div>
          ) : null}

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <label className="block text-sm font-medium text-slate-900">Permit Information</label>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-900">Permit Number</label>
              <input
                type="text"
                name="permit_number"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-900">Jurisdiction</label>
                <input
                  type="text"
                  name="jurisdiction"
                  placeholder="City or county permit office"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-900">Permit Date</label>
                <input
                  type="date"
                  name="permit_date"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                />
              </div>
            </div>
          </div>
        </section>
        ) : null}

        <section className={guidedSectionShellClass}>
          {renderGuidedSectionIntro({
            icon: <MapPinned className="h-4 w-4" aria-hidden="true" />,
            title: "Customer & Service Location",
            description: customerSectionDescription,
            summary: internalResolutionReady
              ? (!selectedCustomer && (createNewCustomer || locationMode === "new")
                ? "New customer and service address"
                : `${selectedCustomerSummary} — ${selectedLocationSummary}`)
              : "Select or create the responsible account, then confirm the service location.",
            tone: customerSectionTone,
            action:
              selectedCustomerId && !createNewCustomer && !isCustomerContextInternalMode ? (
                <button
                  type="button"
                  onClick={() => {
                    resetRelationshipDecision();
                    setSelectedCustomerId("");
                    setLocationMode(null);
                    setLocationId("");
                  }}
                  className={secondaryCompactButtonClass}
                >
                  Change
                </button>
              ) : undefined,
          })}
          <div className={guidedSectionBodyClass}>
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
              {!isCustomerContextInternalMode && !createNewCustomer && !selectedCustomerId ? (
                <div className={`${guidedSectionInsetClass} space-y-4`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Step 1</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-950">Select or create responsible account</h3>
                    <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">
                      Who is responsible for this work?
                    </p>
                  </div>
                    <div className="flex flex-col items-end gap-2 flex-none">
                      <button
                        type="button"
                        id="create-new-customer-shortcut"
                        onClick={() => {
                          resetRelationshipDecision();
                          setCreateNewCustomer(true);
                          setSelectedCustomerId("");
                          setLocationMode(null);
                          setLocationId("");
                        }}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-all duration-150 hover:border-slate-400 hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                      >
                        + New Customer
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200/85 bg-white p-3 shadow-sm">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label htmlFor="internal_customer_finder" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Responsible Account Finder
                      </label>
                      <span className="text-[11px] font-medium text-slate-500">
                        {hasMeaningfulCustomerQuery
                          ? `${filteredGuidedCustomers.length} match${filteredGuidedCustomers.length === 1 ? "" : "es"}`
                          : "Type 2+ characters"}
                      </span>
                    </div>
                    <input
                      id="internal_customer_finder"
                      type="search"
                      value={guidedCustomerQuery}
                      onChange={(e) => setGuidedCustomerQuery(e.target.value)}
                      placeholder="Search responsible account name, phone, or address"
                      autoFocus
                      className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-3 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                    />
                  </div>

                  <div className="space-y-2">
                    {hasMeaningfulCustomerQuery && filteredGuidedCustomers.length > 0 ? (
                      filteredGuidedCustomers.map((c, index) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            resetRelationshipDecision();
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
                            {c.phone && c.email ? " | " : ""}
                            {String(c.email ?? "").trim() || ""}
                          </p>
                        </button>
                      ))
                    ) : hasMeaningfulCustomerQuery ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                        No matching customers found.
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {selectedCustomerId && !createNewCustomer ? (
                <div className="space-y-3">
                  <div className={guidedSectionInsetClass}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Selected responsible account</p>
                        <p className="mt-1 text-base font-semibold text-slate-900">{customerDisplayName(selectedCustomer as CustomerLookupRow)}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {String(selectedCustomer?.phone ?? "").trim() || "No phone"}
                          {selectedCustomer?.phone && selectedCustomer?.email ? " | " : ""}
                          {String(selectedCustomer?.email ?? "").trim() || ""}
                        </p>
                        <p className="mt-2 text-sm text-slate-700">
                          {formatLocationContext(selectedCustomerPrimaryLocation)}
                        </p>
                      </div>
                      {!isCustomerContextInternalMode ? (
                        <button
                          type="button"
                          onClick={() => {
                            resetRelationshipDecision();
                            setSelectedCustomerId("");
                            setLocationMode(null);
                            setLocationId("");
                          }}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-900"
                        >
                          Change customer
                        </button>
                      ) : (
                        <span className="rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                          Locked
                        </span>
                      )}
                    </div>
                    <input type="hidden" name="customer_id" value={selectedCustomerId} />
                  </div>

                  <div className={`${guidedSectionInsetClass} space-y-3`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 2</p>
                        <p className="mt-1 text-base font-semibold text-slate-900">Service Address</p>
                        <p className="mt-1 text-sm text-slate-500">
                          This is where the job will take place.
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {selectedCustomerLocations.length} saved service address{selectedCustomerLocations.length === 1 ? "" : "es"} on file for this customer.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          resetRelationshipDecision();
                          setLocationMode("existing");
                          if (!locationId && selectedCustomerLocations.length === 1) {
                            setLocationId(selectedCustomerLocations[0]?.id ?? "");
                          }
                        }}
                        disabled={selectedCustomerLocations.length === 0}
                        className={[
                          "rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-60",
                          locationMode === "existing"
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-300 bg-white text-slate-700",
                        ].join(" ")}
                      >
                        Use saved service address
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          resetRelationshipDecision();
                          setLocationMode("new");
                          setLocationId("");
                        }}
                        className={[
                          "rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition-all",
                          locationMode === "new"
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-300 bg-white text-slate-700",
                        ].join(" ")}
                      >
                        Add new service address
                      </button>
                    </div>

                    {locationMode === "existing" ? (
                      selectedCustomerLocations.length > 0 ? (
                        <div className="space-y-2">
                          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Saved service address
                          </label>
                          <select
                            className="w-full rounded-xl border border-slate-300 bg-white p-2.5 shadow-sm"
                            value={locationId}
                            onChange={(e) => {
                              resetRelationshipDecision();
                              setLocationId(e.target.value);
                            }}
                          >
                            <option value="">Select saved service address...</option>
                            {selectedCustomerLocations.map((l) => (
                              <option key={l.id} value={l.id}>
                                {(l.nickname ? `${l.nickname} - ` : "") +
                                  (l.address_line1 ?? "Address") +
                                  ", " +
                                  [l.city, l.state, l.zip || l.postal_code].filter(Boolean).join(" ")}
                              </option>
                            ))}
                          </select>
                          {resolvedExistingLocation ? (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-900">
                              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                                Selected service address
                              </p>
                              <p className="mt-1 font-medium text-slate-900">{formatLocationContext(resolvedExistingLocation)}</p>
                            </div>
                          ) : null}
                          {locationId ? <input type="hidden" name="location_id" value={locationId} /> : null}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-sm text-blue-900">
                          No saved service addresses found. Add a new service address to continue.
                        </div>
                      )
                    ) : null}

                    {isNewLocation ? (
                      <div className="mt-1 space-y-2 rounded-xl bg-slate-50/70 p-3 ring-1 ring-slate-200/80">
                        <p className="text-xs text-slate-600">
                          This service address will be saved under the customer for future jobs.
                        </p>
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
                        <input
                          className="w-full rounded-xl border border-slate-300 bg-white p-2.5"
                          name="address_line2"
                          placeholder="Unit, suite, or address line 2 (optional)"
                          value={newLocationAddressLine2}
                          onChange={(e) => setNewLocationAddressLine2(e.target.value)}
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
                            name="state"
                            placeholder="State"
                            required
                            value={newLocationState}
                            onChange={(e) => setNewLocationState(e.target.value)}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
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
                              .map((l) => (l.nickname ? `${l.nickname} - ` : "") + (l.address_line1 || "Address"))
                              .join(" | ")}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {!isCustomerContextInternalMode && createNewCustomer ? (
                <div
                  ref={createNewCustomerCardRef}
                  className={`${guidedSectionInsetClass} space-y-3 scroll-mt-6`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">New Customer Entry</p>
                      <p className="mt-0.5 text-xs text-slate-500">Add a new customer and service address when they are not already saved.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        resetRelationshipDecision();
                        setCreateNewCustomer(false);
                      }}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-900"
                    >
                      &lt;- Back to finder
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
                      name="state"
                      placeholder="State"
                      required
                      value={newLocationState}
                      onChange={(e) => setNewLocationState(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
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

              {shouldShowSiteAccessToggle ? (
                <div className={`${guidedSectionInsetClass} space-y-3`}>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <input
                        type="checkbox"
                        checked={siteAccessContactDifferent}
                        onChange={(e) => setSiteAccessContactDifferent(e.target.checked)}
                      />
                      Different site/access contact?
                    </label>
                    <p className="text-xs leading-5 text-slate-600">
                      Use this when the tech should contact a tenant, occupant, or on-site person instead of the responsible account.
                    </p>
                    {!siteAccessContactDifferent ? (
                      <p className="text-xs text-slate-500">Defaults to responsible account contact details.</p>
                    ) : null}
                  </div>

                  {selectedLocationSiteAccessHint && !siteAccessContactDifferent ? (
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700">
                      <div className="font-semibold text-slate-900">Saved site/access contact on location</div>
                      <div className="mt-1">{selectedLocationSiteAccessHint.display_name}</div>
                      {selectedLocationSiteAccessHint.phone_e164 ? (
                        <div className="mt-0.5">Phone: {selectedLocationSiteAccessHint.phone_e164}</div>
                      ) : null}
                      {selectedLocationSiteAccessHint.email ? (
                        <div className="mt-0.5 break-all">Email: {selectedLocationSiteAccessHint.email}</div>
                      ) : null}
                    </div>
                  ) : null}

                  <input
                    type="hidden"
                    name="site_access_contact_different"
                    value={siteAccessContactDifferent ? "1" : "0"}
                  />

                  {siteAccessContactDifferent ? (
                    <div className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-slate-200/80">
                      <input
                        className="w-full rounded-md border border-slate-300 bg-white p-2"
                        name="site_access_contact_name"
                        placeholder="Name"
                        value={siteAccessContactName}
                        onChange={(e) => setSiteAccessContactName(e.target.value)}
                      />
                      <input
                        className="w-full rounded-md border border-slate-300 bg-white p-2"
                        name="site_access_contact_phone"
                        placeholder="Phone"
                        value={siteAccessContactPhone}
                        onChange={(e) => setSiteAccessContactPhone(e.target.value)}
                      />
                      <input
                        type="email"
                        className="w-full rounded-md border border-slate-300 bg-white p-2"
                        name="site_access_contact_email"
                        placeholder="Email"
                        value={siteAccessContactEmail}
                        onChange={(e) => setSiteAccessContactEmail(e.target.value)}
                      />
                      <textarea
                        className="w-full rounded-md border border-slate-300 bg-white p-2"
                        name="site_access_contact_notes"
                        rows={2}
                        placeholder="Access notes (optional)"
                        value={siteAccessContactNotes}
                        onChange={(e) => setSiteAccessContactNotes(e.target.value)}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {!internalResolutionReady ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-sm">
                  Select customer and location to continue.
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
                      {(l.nickname ? `${l.nickname} - ` : "") +
                        (l.address_line1 ?? "Address") +
                        ", " +
                        [l.city, l.state, l.zip].filter(Boolean).join(" ")}
                    </option>
                  ))}
                  <option value="__new__">+ Add new location...</option>
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
                        name="state"
                        placeholder="State"
                        defaultValue="CA"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
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
          </div>
        </section>

        {isInternalMode && internalResolutionReady && isHvacServiceMode ? (
          <input type="hidden" name="job_type" value={modeSafeJobType} />
        ) : null}
        {isInternalMode && internalResolutionReady && !isHvacServiceMode ? (
          <section className={guidedSectionShellClass}>
            {renderGuidedSectionIntro({
              icon: <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />,
              title: jobFamilyStepTitle,
              description: jobFamilyStepDescription,
              summary: isHybridProductMode
                ? `Choose ${jobType === "service" ? "Service / Work Order" : "ECC / Compliance"} to keep the right intake lane and fields visible.`
                : "ECC / Compliance is locked for this account and keeps the required compliance fields visible.",
              tone: setupSectionTone,
            })}
            <div className={guidedSectionBodyClass}>
              {isHybridProductMode ? (
                <div className={`${guidedSectionInsetClass} space-y-3`}>
                  <label className="block text-sm font-medium text-slate-900">{jobFamilyControlLabel}</label>
                  <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
                    <>
                      <label className={[
                        "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-all sm:flex-1",
                        jobType === "service"
                          ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50",
                      ].join(" ")}>
                        <input
                          type="radio"
                          name="_jobTypeUi"
                          value="service"
                          checked={jobType === "service"}
                          onChange={() => setJobType("service")}
                          className="mt-0.5"
                        />
                        <span>
                          <span className={jobType === "service" ? "block text-sm font-medium text-white" : "block text-sm font-medium text-slate-900"}>Service / Work Order</span>
                          <span className={jobType === "service" ? "mt-0.5 block text-xs text-slate-200" : "mt-0.5 block text-xs text-slate-500"}>{serviceJobFamilyDescription}</span>
                        </span>
                      </label>
                      <label className={[
                        "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-all sm:flex-1",
                        jobType === "ecc"
                          ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50",
                      ].join(" ")}>
                        <input
                          type="radio"
                          name="_jobTypeUi"
                          value="ecc"
                          checked={jobType === "ecc"}
                          onChange={() => setJobType("ecc")}
                          className="mt-0.5"
                        />
                        <span>
                          <span className={jobType === "ecc" ? "block text-sm font-medium text-white" : "block text-sm font-medium text-slate-900"}>ECC / Compliance</span>
                          <span className={jobType === "ecc" ? "mt-0.5 block text-xs text-slate-200" : "mt-0.5 block text-xs text-slate-500"}>{eccJobFamilyDescription}</span>
                        </span>
                      </label>
                    </>
                  </div>
                  <input type="hidden" name="job_type" value={modeSafeJobType} />
                </div>
              ) : (
                <div className={`${guidedSectionInsetClass} space-y-3`}>
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                        ✓
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">ECC / Compliance</p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          This account stays in the ECC workflow. Project type, permit, and jurisdiction details stay visible below.
                        </p>
                      </div>
                    </div>
                  </div>
                  <input type="hidden" name="job_type" value={modeSafeJobType} />
                </div>
              )}

              {jobType !== "service" ? (
                <div className={`${guidedSectionInsetClass} space-y-2`}>
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

              {jobType === "service" ? (
                <div className={`${guidedSectionInsetClass} space-y-3`}>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Service Type</label>
                      <p className="mb-1.5 text-[11px] leading-5 text-slate-500">Case/business context for this service relationship.</p>
                      <select
                        name="service_case_kind"
                        className="w-full rounded-xl border border-slate-300 bg-white p-2.5"
                        value={serviceCaseKind}
                        onChange={(e) =>
                          setServiceCaseKind(
                            e.target.value as "reactive" | "callback" | "warranty" | "maintenance",
                          )
                        }
                      >
                        <option value="reactive">Standard Service</option>
                        <option value="callback">Callback</option>
                        <option value="warranty">Warranty</option>
                        <option value="maintenance">Maintenance</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700">Visit Type</label>
                      <p className="mb-1.5 text-[11px] leading-5 text-slate-500">Trip purpose for this specific field visit.</p>
                      <select
                        name="service_visit_type"
                        className="w-full rounded-xl border border-slate-300 bg-white p-2.5"
                        value={serviceVisitType}
                        onChange={(e) =>
                          setServiceVisitType(
                            e.target.value as
                              | "diagnostic"
                              | "repair"
                              | "install"
                              | "return_visit"
                              | "callback"
                              | "maintenance",
                          )
                        }
                      >
                        <option value="diagnostic">Initial / Diagnostic Visit</option>
                        <option value="repair">Service Work Visit</option>
                        <option value="install">Install Visit</option>
                        <option value="return_visit">Return Visit</option>
                        <option value="callback">Callback Visit</option>
                        <option value="maintenance">Maintenance Visit</option>
                      </select>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className={`${guidedSectionInsetClass} space-y-3`}>
                <label className="block text-sm font-medium text-slate-900">Permit Information</label>
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-900">Permit Number</label>
                  <input
                    type="text"
                    name="permit_number"
                    className="w-full rounded-xl border border-slate-300 bg-white p-2.5"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-slate-900">Jurisdiction</label>
                    <input
                      type="text"
                      name="jurisdiction"
                      placeholder="City or county permit office"
                      className="w-full rounded-xl border border-slate-300 bg-white p-2.5"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-slate-900">Permit Date</label>
                    <input
                      type="date"
                      name="permit_date"
                      className="w-full rounded-xl border border-slate-300 bg-white p-2.5"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {showInternalSetupHint ? (
          <section className="space-y-3">
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Next</p>
              <p className="mt-1 text-sm text-blue-900">{internalNextStepMessage}</p>
            </div>
          </section>
        ) : null}

        {canAdvancePastResolution ? (
          <>
            <section className={`space-y-3 ${isServicePlanQuickScheduleMode ? "order-2" : "order-1"}`}>
              {isInternalMode ? (
                <div className={guidedSectionShellClass} ref={visitScopeSectionRef}>
                  {renderGuidedSectionIntro({
                    icon: <ClipboardList className="h-4 w-4" aria-hidden="true" />,
                    title: isHvacServiceMode ? "Work Order Details" : "Work To Perform & Job Scope",
                    description: isServicePlanQuickScheduleMode
                      ? "Service Plan visit defaults to quick scheduling. Review included work only when needed."
                      : isServicePlanPrefillFlow && jobType === "service"
                      ? "Service Plan work is included by default. Schedule first, then review work items only when needed."
                      : isHvacServiceMode
                      ? "What kind of visit is this, and what work needs to be done?"
                      : jobType === "service"
                        ? "Start with Reason for Visit, then add the structured job scope for this trip."
                        : "ECC testing can be created without job scope; add optional companion scope only when this visit also includes service work.",
                    summary: workOrderSectionSummary,
                    tone: workOrderSectionTone,
                  })}
                  <div className={guidedSectionBodyClass}>
                  {isHybridProductMode ? (
                    <p className="text-xs text-slate-500">
                      Job type controls workflow/testing. Visit Scope can include additional work performed during the same visit.
                    </p>
                  ) : null}
                  <div className={`space-y-3 ${visitScopeError ? "rounded-2xl border border-red-300 bg-red-50/40 p-4 ring-2 ring-red-100" : ""}`}>
                    {!isServicePlanQuickScheduleMode ? (
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">Visit Summary &amp; Job Scope</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {jobType === "service"
                            ? "Reason for Visit sets the visit title, then add at least one scope item for the field work."
                            : "ECC jobs don't require job scope. Add companion scope only if this visit includes service work."}
                        </p>
                      </div>
                    ) : null}
                    {isHvacServiceMode && jobType === "service" && !isServicePlanQuickScheduleMode ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-700">Service Type</label>
                          <select
                            name="service_case_kind"
                            className="w-full rounded-xl border border-slate-300 bg-white p-2.5"
                            value={serviceCaseKind}
                            onChange={(e) =>
                              setServiceCaseKind(
                                e.target.value as "reactive" | "callback" | "warranty" | "maintenance",
                              )
                            }
                          >
                            <option value="reactive">Standard Service</option>
                            <option value="callback">Callback</option>
                            <option value="warranty">Warranty</option>
                            <option value="maintenance">Maintenance</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-700">Visit Type</label>
                          <select
                            name="service_visit_type"
                            className="w-full rounded-xl border border-slate-300 bg-white p-2.5"
                            value={serviceVisitType}
                            onChange={(e) =>
                              setServiceVisitType(
                                e.target.value as
                                  | "diagnostic"
                                  | "repair"
                                  | "install"
                                  | "return_visit"
                                  | "callback"
                                  | "maintenance",
                              )
                            }
                          >
                            <option value="diagnostic">Initial / Diagnostic Visit</option>
                            <option value="repair">Service Work Visit</option>
                            <option value="install">Install Visit</option>
                            <option value="return_visit">Return Visit</option>
                            <option value="callback">Callback Visit</option>
                            <option value="maintenance">Maintenance Visit</option>
                          </select>
                        </div>
                      </div>
                    ) : null}
                    {isServicePlanQuickScheduleMode ? (
                      <>
                        <input type="hidden" name="service_case_kind" value={serviceCaseKind} />
                        <input type="hidden" name="service_visit_type" value={serviceVisitType} />
                      </>
                    ) : null}
                    {isServicePlanPrefillFlow && jobType === "service" ? (
                      <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-3.5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Service Plan Visit</p>
                            <p className="mt-1 text-sm text-blue-950">
                              <span className="font-semibold">{maintenanceAgreementPrefill?.agreement_name}</span>
                              {" work is already included."}
                            </p>
                            <p className="mt-1 text-xs text-blue-800">
                              {completedVisitScopeItemCount} prefilled {completedVisitScopeItemCount === 1 ? "item" : "items"} will submit with this work order.
                            </p>
                          </div>
                          <button
                            type="button"
                            className={secondaryCompactButtonClass}
                            onClick={() => setShowServicePlanWorkItems((value) => !value)}
                            aria-expanded={showServicePlanWorkItems}
                          >
                            {showServicePlanWorkItems ? "Hide Included Work" : "Review Included Work"}
                          </button>
                        </div>
                        <div className={showServicePlanWorkItems ? "mt-4 border-t border-blue-200 pt-4" : "hidden"}>
                          <VisitScopeBuilder
                            initialSummary={visitScopeSummary}
                            initialItems={visitScopeItems}
                            jobType={jobType}
                            serviceVisitType={serviceVisitType}
                            pricebookTemplateItems={pricebookTemplateItems}
                            resetKey={visitScopeResetKey}
                            onSummaryChange={setVisitScopeSummary}
                            onItemsChange={setVisitScopeItems}
                          />
                        </div>
                      </div>
                    ) : (
                      <VisitScopeBuilder
                        initialSummary={visitScopeSummary}
                        initialItems={visitScopeItems}
                        jobType={jobType}
                        serviceVisitType={serviceVisitType}
                        pricebookTemplateItems={pricebookTemplateItems}
                        resetKey={visitScopeResetKey}
                        onSummaryChange={setVisitScopeSummary}
                        onItemsChange={setVisitScopeItems}
                      />
                    )}
                  </div>
                  </div>
                </div>
              ) : (
                <div>
                  <h2 className="border-b border-slate-100 pb-2 text-base font-semibold text-slate-900">Request Details</h2>
                  <p className="mt-2 text-sm text-slate-500">Tell our team what work you want reviewed, any notes they should know, and the job context that will help with intake review.</p>
                </div>
              )}
              {!isInternalMode ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-900">
                    Your submission stays in review until our team confirms the details and creates the internal work record.
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-900">Reason for Visit / Dispatch Notes</label>
                    <textarea
                      rows={8}
                      value={visitScopeSummary}
                      onChange={(e) => setVisitScopeSummary(e.target.value)}
                      placeholder="Describe the requested work, any notes our team should know, and any helpful job context."
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-slate-500">Reason for Visit explains why this visit exists and gives dispatch context.</p>
                  </div>

                  <input type="hidden" name="title" value={visitScopeSummary} />
                  <input type="hidden" name="job_notes" value={visitScopeSummary} />
                </div>
              ) : null}
              <JobCoreFields
                mode={myContractor?.id ? "external" : "internal"}
                titleRequired={jobType === "service"}
                showJobTitle={false}
                hideCustomer
                hideServiceLocation
                jobType={jobType}
                showJobDetails={false}
                showCustomerSection={false}
                showServiceLocationSection={false}
                showNotesSection={false}
              />
            </section>

            {/* Scheduling - internal/staff only; hidden for contractor and customer intake */}
            {!isContractorMode && (
              <section className={`${isServicePlanQuickScheduleMode ? "order-1" : "order-2"} ${isInternalMode ? guidedSectionShellClass : "space-y-3"}`}>
                {isInternalMode ? renderGuidedSectionIntro({
                  icon: <CalendarClock className="h-4 w-4" aria-hidden="true" />,
                  title: "Schedule",
                  description: isServicePlanQuickScheduleMode
                    ? "Pick a date and window first. Included Service Plan work stays in the background."
                    : "Schedule the visit if needed, then confirm who gets billed later.",
                  summary: scheduleSectionSummary,
                  tone: scheduleSectionTone,
                }) : (
                  <h2 className="border-b border-slate-100 pb-2 text-base font-semibold text-slate-900">Scheduling</h2>
                )}

                <div className={isInternalMode ? guidedSectionBodyClass : "space-y-3"}>
                <div className={`${isInternalMode ? guidedSectionInsetClass : "rounded-2xl border border-slate-200/85 bg-white p-4 shadow-sm"} space-y-3`}>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Scheduled Date</label>
                  <input
                    type="date"
                    name="scheduled_date"
                    className="w-full rounded-xl border border-slate-300 bg-white p-2.5"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                  />

                  <div className="pt-1 text-xs text-slate-600">
                    Set a date now, or leave unscheduled.
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
                      <option value="">- Select -</option>
                      <option value="08:00-10:00">08:00-10:00</option>
                      <option value="10:00-12:00">10:00-12:00</option>
                      <option value="12:00-14:00">12:00-14:00</option>
                      <option value="14:00-16:00">14:00-16:00</option>
                    </select>
                  </div>

                  {isServicePlanQuickScheduleMode ? (
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                      <label className="block text-xs font-medium text-slate-700">Visit Note (optional)</label>
                      <textarea
                        rows={2}
                        value={visitScopeSummary}
                        onChange={(e) => setVisitScopeSummary(e.target.value)}
                        placeholder="Add a quick dispatch note (optional)."
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                      <p className="text-[11px] text-slate-500">
                        This note saves with the included Service Plan work without opening the work builder.
                      </p>
                    </div>
                  ) : null}
                </div>

                {isInternalMode ? (
                  <div className={`${guidedSectionInsetClass} space-y-3`}>
                    <label className="block text-sm font-medium text-slate-900">Billing / Paperwork Recipient</label>

                    {modeSafeJobType === "service" ? (
                      <>
                        <p className="text-xs leading-5 text-slate-600">
                          Billing and paperwork default to the responsible account.
                        </p>
                        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900">
                          <input
                            type="checkbox"
                            checked={billingRecipientDifferent}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setBillingRecipientDifferent(checked);
                              if (!checked) {
                                setBillingName("");
                                setBillingEmail("");
                                setBillingPhone("");
                                setBillingAddr1("");
                                setBillingAddr2("");
                                setBillingCity("");
                                setBillingState("CA");
                                setBillingZip("");
                              }
                            }}
                          />
                          Different billing/paperwork recipient?
                        </label>

                        <input
                          type="hidden"
                          name="billing_recipient"
                          value={billingRecipientDifferent ? "other" : "customer"}
                        />

                        {billingRecipientDifferent ? (
                          <div className="mt-2 space-y-2 rounded-xl bg-white p-3 ring-1 ring-slate-200/80">
                            <div className="text-xs text-slate-600">
                              Use this only when invoices or paperwork should go somewhere other than the responsible account.
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
                        ) : null}
                      </>
                    ) : (
                      <>
                        <div className="flex flex-col gap-2">
                          {!isHvacServiceInternalMode ? (
                            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
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
                          ) : null}

                          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                            <input
                              type="radio"
                              name="_billingRecipientUi"
                              value="customer"
                              checked={billingRecipient === "customer"}
                              onChange={() => setBillingRecipient("customer")}
                            />
                            Customer / Homeowner
                          </label>

                          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
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

                        {billingRecipient === "other" ? (
                          <div className="mt-2 space-y-2 rounded-xl bg-white p-3 ring-1 ring-slate-200/80">
                            <div className="text-xs text-slate-600">
                              If billing is Other, please enter billing name + address.
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
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
                </div>
              </section>
            )}

            {/* Billing Recipient */}
            {!isInternalMode ? (
            <section className="space-y-3">
              {isInternalMode ? null : <h2 className="border-b border-slate-100 pb-2 text-base font-semibold text-slate-900">Billing</h2>}
              <div className="rounded-2xl border border-slate-200/80 bg-white/75 p-4 shadow-sm space-y-3">
                <label className="block text-sm font-medium text-slate-900">Billing Recipient</label>

            <div className="flex flex-col gap-2">
              {!isHvacServiceInternalMode ? (
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
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
              ) : null}

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <input
                  type="radio"
                  name="_billingRecipientUi"
                  value="customer"
                  checked={billingRecipient === "customer"}
                  onChange={() => setBillingRecipient("customer")}
                />
                Customer / Homeowner
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
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
              <div className="mt-2 space-y-2 rounded-xl bg-white p-3 ring-1 ring-slate-200/80">
                <div className="text-xs text-slate-600">
                  If billing is Other, please enter billing name + address.
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
            ) : null}

            {/* Optional Equipment */}
            {isInternalMode || isContractorMode ? (
            <section className={guidedSectionShellClass}>
              {renderGuidedSectionIntro({
                icon: <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />,
                title: isContractorMode ? "Equipment" : "Additional Details",
                description: isContractorMode
                  ? "Add equipment now so Compliance Matters has the system details before the job is reviewed."
                  : productMode === "ecc_hers"
                  ? "Supporting information only. Add it when it helps the compliance job move forward."
                  : "Supporting information only. Add it when it helps this work order move forward.",
                summary: additionalDetailsSummary,
                tone: additionalDetailsTone,
              })}
              <div className={guidedSectionBodyClass}>
              {isServicePlanQuickScheduleMode ? (
                <div className={`${guidedSectionInsetClass} flex flex-wrap items-center justify-between gap-3`}>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Advanced Job Details</p>
                    <p className="mt-1 text-sm text-slate-600">Permit, equipment, photos, and extra comments.</p>
                  </div>
                  <button
                    type="button"
                    className={secondaryCompactButtonClass}
                    onClick={() => setShowServicePlanAdvancedDetails((value) => !value)}
                    aria-expanded={showServicePlanAdvancedDetails}
                  >
                    {showServicePlanAdvancedDetails ? "Hide Advanced Details" : "Review Advanced Details"}
                  </button>
                </div>
              ) : null}
              {!isServicePlanQuickScheduleMode || showServicePlanAdvancedDetails ? (
                <>
              {isHvacServiceMode ? (
                <details className={`${guidedSectionInsetClass} group`}>
                  <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden">
                    {renderSupportingSectionHeader({
                      icon: <FileText className="h-4 w-4" aria-hidden="true" />,
                      title: "Permit information",
                      description: "Add permit details if required.",
                      trailing: (
                        <>
                          <span className={supportingSectionMetaClass}>Optional</span>
                          <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
                        </>
                      ),
                    })}
                  </summary>
                  <div className="mt-4 space-y-3 border-t border-slate-200/80 pt-4">
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-slate-900">Permit Number</label>
                      <input
                        type="text"
                        name="permit_number"
                        className="w-full rounded-xl border border-slate-300 bg-white p-2.5"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label className="block text-sm font-medium text-slate-900">Jurisdiction</label>
                        <input
                          type="text"
                          name="jurisdiction"
                          placeholder="City or county permit office"
                          className="w-full rounded-xl border border-slate-300 bg-white p-2.5"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-sm font-medium text-slate-900">Permit Date</label>
                        <input
                          type="date"
                          name="permit_date"
                          className="w-full rounded-xl border border-slate-300 bg-white p-2.5"
                        />
                      </div>
                    </div>
                  </div>
                </details>
              ) : null}
              <div className={`${guidedSectionInsetClass} space-y-3`}>
          {renderSupportingSectionHeader({
            icon: <Wrench className="h-4 w-4" aria-hidden="true" />,
                  title: "Equipment systems",
                  description: isContractorMode
                    ? "Proposed equipment is intake context. Compliance Matters will verify final equipment before it becomes job equipment."
                    : "Add systems only when needed.",
                  trailing: (
              <button
                type="button"
                className={secondaryCompactButtonClass}
                onClick={addSystem}
              >
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                Add System
              </button>
            ),
          })}

          {systems.length === 0 && (
            <div className="text-sm text-slate-500">No systems added yet.</div>
          )}

          {systems.map((sys, idx) => {
            const nameRequired = sys.components.length > 0;
            const showNameError = nameRequired && !sys.name.trim();

            return (
              <div key={sys.id} className="rounded-lg border border-slate-200/80 bg-slate-50/45 p-3 space-y-3">
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
                      <option value="">- Select -</option>
                      {EQUIPMENT_ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {sys.components.length === 0 ? (
                  <div className="text-sm text-slate-600">No components added yet.</div>
                ) : (
                  <div className="space-y-3">
                    {sys.components.map((c) => (
                      <div key={c.id} className="rounded border border-slate-200/80 bg-white p-2 space-y-2">
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
                                ? "Heating Input (KBTU/h) (optional)"
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
                              placeholder="Efficiency / AFUE % (e.g. 80) (optional)"
                              type="number"
                              min="1"
                              max="100"
                              step="1"
                              value={c.heating_efficiency_percent}
                              onChange={(e) => patchComponent(sys.id, c.id, { heating_efficiency_percent: e.target.value })}
                            />
                          )}
                        </div>

                        {equipmentUsesRefrigerant(c.type) && (
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
              {isInternalMode ? (
                <>
              <div className={`${guidedSectionInsetClass} space-y-3`}>
                {renderSupportingSectionHeader({
                  icon: <Camera className="h-4 w-4" aria-hidden="true" />,
                  title: "Photos",
                  description: "Equipment photos, permit copies, or site images. JPG, PNG, WEBP, or PDF.",
                  trailing: <span className={supportingSectionMetaClass}>Optional</span>,
                })}
                <input
                  type="file"
                  name="photos"
                  accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                  multiple
                  className="w-full rounded-xl border border-slate-300 bg-white p-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700"
                />
              </div>
              <div className={`${guidedSectionInsetClass} space-y-3`}>
                {renderSupportingSectionHeader({
                  icon: <MessageSquare className="h-4 w-4" aria-hidden="true" />,
                  title: "Additional Comments",
                  description: "Add handoff notes only if needed.",
                  trailing: <span className={supportingSectionMetaClass}>Optional</span>,
                })}
                <textarea
                  name="job_notes"
                  rows={4}
                  placeholder="Anything the next person should know before this job moves forward..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </div>
                </>
              ) : null}
                </>
              ) : null}
              </div>
            </section>
            ) : null}

            {!isInternalMode ? (
            <section className="space-y-3">
              <div className="rounded-2xl border border-slate-200/85 bg-white p-4 shadow-sm">
                <div>
                <h2 className="text-base font-semibold text-slate-900">Photos (optional)</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Equipment photos, permit copies, or site images. JPG, PNG, WEBP, or PDF.
                  {isContractorMode ? " Files upload after proposal submit." : ""}
                </p>
                </div>
                <input
                  type="file"
                  name={isContractorMode ? undefined : "photos"}
                  accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                  multiple
                  className="mt-3 w-full rounded-xl border border-slate-300 bg-white p-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700"
                />
              </div>
            </section>
            ) : null}

            {!isInternalMode ? (
            <section className="space-y-3">
              <div className="rounded-2xl border border-slate-200/85 bg-white p-4 shadow-sm">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Additional Comments (optional)</h2>
                  {isContractorMode ? (
                    <p className="mt-0.5 text-xs text-slate-500">Include any scheduling preferences, site access notes, or other details our team should know.</p>
                  ) : null}
                </div>
                <textarea
                  name="job_notes"
                  rows={4}
                  placeholder="Anything the next person should know before this job moves forward..."
                  className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </div>
            </section>
            ) : null}
          </>
        ) : null}
        </div>

        {!canSubmit && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            Please name each system that has components. (Example: Upstairs / Downstairs / ADU)
          </div>
        )}

        {isInternalMode && internalResolutionReady && canAdvancePastResolution ? (
          <div className={guidedSectionShellClass}>
            {renderGuidedSectionIntro({
              icon: <Sparkles className="h-4 w-4" aria-hidden="true" />,
              title: createSectionTitle,
              description: createSectionDescription,
              summary: createSectionSummary,
              tone: createSectionTone,
            })}
            <div className={guidedSectionBodyClass}>
            <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-200/85 bg-white/85 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Job</p>
                <p className="mt-1 font-medium text-slate-900">{jobType === "service" ? "Service" : `ECC (${projectType.replaceAll("_", " ")})`}</p>
              </div>
              <div className="rounded-xl border border-slate-200/85 bg-white/85 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Customer</p>
                <p className="mt-1 font-medium text-slate-900">
                  {createNewCustomer
                    ? ([newCustomerFirstName, newCustomerLastName].filter(Boolean).join(" ") || "New customer")
                    : (selectedCustomer ? customerDisplayName(selectedCustomer) : "Not selected")}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/85 bg-white/85 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Location</p>
                <p className="mt-1 font-medium text-slate-900">
                  {createNewCustomer || locationMode === "new"
                    ? (newLocationAddressLine1 || "New location")
                    : (selectedLocation?.address_line1 || "Existing location")}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/85 bg-white/85 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Schedule</p>
                <p className="mt-1 font-medium text-slate-900">
                  {scheduledDate ? `${scheduledDate}${windowStart && windowEnd ? ` ${windowStart}-${windowEnd}` : ""}` : "Unscheduled"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/85 bg-white/85 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Billing</p>
                <p className="mt-1 font-medium text-slate-900">{billingRecipientLabel}</p>
              </div>
              <div className="rounded-xl border border-slate-200/85 bg-white/85 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Job Scope</p>
                <p className="mt-1 font-medium text-slate-900">
                  {visitScopeSummary.trim() || visitScopeItems.find((item) => item.title.trim())?.title.trim() || "Needs review"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {visitScopeItems.filter((item) => item.title.trim() || item.details.trim()).length} item{visitScopeItems.filter((item) => item.title.trim() || item.details.trim()).length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            </div>
          </div>
        ) : null}

        <div className="sr-only" aria-live="polite">
          {isSubmitting ? "Creating job. Please wait." : ""}
        </div>

        <div className={`${guidedSectionShellClass} mt-4`}>
          <div className={guidedSectionBodyClass}>
          {draftMsg && !draftFound ? (
            <p className="text-right text-xs text-slate-500">{draftMsg}</p>
          ) : null}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">
                {isSubmitReady ? "Ready to create" : "Finish the required intake steps"}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {isInternalMode ? "Drafts stay on this device until the job is created." : "Save locally if you need to come back before submitting."}
              </p>
            </div>
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
                ? isSubmitting ? "Submitting\u2026" : "Send Work to Compliance Matters \u2192"
                : isSubmitting ? "Creating Job\u2026" : "Create Job \u2192"}
            </button>
            </div>
          </div>
          </div>
        </div>
      </form>
      </div>
    </div>
  );
}

