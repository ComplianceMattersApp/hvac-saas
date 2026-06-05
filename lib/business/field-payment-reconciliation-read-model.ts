import { formatInvoiceDisplayReference, formatJobDisplayReference } from "@/lib/utils/display-references";

type OpenFieldPaymentReportStatus = "reported" | "under_review" | "needs_correction";

type FieldPaymentCollectionReportRow = {
  id: string;
  account_owner_user_id: string;
  job_id: string;
  internal_invoice_id: string;
  customer_id: string | null;
  reported_by_user_id: string;
  payment_method: string;
  amount_cents: number;
  currency: string;
  reference: string | null;
  note: string | null;
  status: string;
  reported_at: string | null;
};

type InvoiceRow = {
  id: string;
  account_owner_user_id: string;
  job_id: string;
  customer_id: string | null;
  invoice_display_number: string | null;
  invoice_number: string | null;
  status: string | null;
};

type JobLocationRow = {
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type JobRow = {
  id: string;
  job_display_number: string | null;
  title: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  locations?: JobLocationRow | JobLocationRow[] | null;
};

type CustomerRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

type InternalUserRow = {
  user_id: string;
  role: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
};

const OPEN_STATUSES: OpenFieldPaymentReportStatus[] = ["reported", "under_review", "needs_correction"];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLimit(limit: unknown) {
  const parsed = Math.floor(toNumber(limit));
  if (parsed <= 0) return 250;
  return Math.min(parsed, 500);
}

function nowIso() {
  return new Date().toISOString();
}

function shortUserRef(userId: string | null | undefined) {
  const normalized = clean(userId);
  return normalized ? normalized.slice(0, 8) : "-";
}

function pickJobLocation(row: JobRow | null | undefined) {
  const raw = row?.locations;
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.find(Boolean) ?? null;
  return raw;
}

function buildLocationLabel(row: JobRow | null | undefined) {
  const location = pickJobLocation(row);
  if (!location) return null;

  const line = clean(location.address_line1);
  const city = clean(location.city);
  const state = clean(location.state);
  const zip = clean(location.zip);
  const cityStateZip = [city, state, zip].filter(Boolean).join(" ");
  const joined = [line, cityStateZip].filter(Boolean).join(", ");
  return joined || null;
}

function buildCustomerDisplayName(params: {
  customer?: CustomerRow | null;
  job?: JobRow | null;
}) {
  const customerFullName = clean(params.customer?.full_name);
  if (customerFullName) return customerFullName;

  const customerNameJoined = [
    clean(params.customer?.first_name),
    clean(params.customer?.last_name),
  ].filter(Boolean).join(" ");
  if (customerNameJoined) return customerNameJoined;

  const jobNameJoined = [
    clean(params.job?.customer_first_name),
    clean(params.job?.customer_last_name),
  ].filter(Boolean).join(" ");
  return jobNameJoined || null;
}

function buildReporterDisplayName(params: {
  profile?: ProfileRow | null;
  internalUser?: InternalUserRow | null;
  userId: string;
}) {
  const email = clean(params.profile?.email);
  if (email) return email;

  const role = clean(params.internalUser?.role).toLowerCase();
  if (role) return `${role} (${shortUserRef(params.userId)})`;

  return `user ${shortUserRef(params.userId)}`;
}

export type FieldPaymentReconciliationQueueItem = {
  reportId: string;
  accountOwnerUserId: string;
  jobId: string;
  jobReference: string;
  jobTitle: string | null;
  locationLabel: string | null;
  internalInvoiceId: string;
  invoiceReference: string;
  customerId: string | null;
  customerDisplayName: string | null;
  paymentMethod: "check" | "cash" | "other";
  amountCents: number;
  currency: string;
  reference: string | null;
  note: string | null;
  status: OpenFieldPaymentReportStatus;
  reportedByUserId: string;
  reportedByDisplayName: string;
  reportedAt: string | null;
  links: {
    invoiceWorkspaceHref: string;
    jobHref: string;
    customerHref: string | null;
  };
};

export type FieldPaymentReconciliationQueueSummary = {
  openCount: number;
  reportedCount: number;
  underReviewCount: number;
  needsCorrectionCount: number;
  totalReportedAmountCents: number;
  oldestReportedAt: string | null;
  newestReportedAt: string | null;
};

export type FieldPaymentReconciliationQueueResult = {
  items: FieldPaymentReconciliationQueueItem[];
  summary: FieldPaymentReconciliationQueueSummary;
  includedStatuses: OpenFieldPaymentReportStatus[];
  excludedStatuses: Array<"verified" | "rejected" | "voided" | "corrected">;
  generatedAt: string;
  noVerificationActions: true;
  noPaymentRowWrites: true;
  noAllocationRowWrites: true;
  noInvoiceMutations: true;
  noStripeCalls: true;
};

export async function listFieldPaymentCollectionReportsForReconciliation(params: {
  admin: any;
  accountOwnerUserId: string;
  limit?: number;
}): Promise<FieldPaymentReconciliationQueueResult> {
  const accountOwnerUserId = clean(params.accountOwnerUserId);
  const limit = normalizeLimit(params.limit);

  const emptyResult: FieldPaymentReconciliationQueueResult = {
    items: [],
    summary: {
      openCount: 0,
      reportedCount: 0,
      underReviewCount: 0,
      needsCorrectionCount: 0,
      totalReportedAmountCents: 0,
      oldestReportedAt: null,
      newestReportedAt: null,
    },
    includedStatuses: [...OPEN_STATUSES],
    excludedStatuses: ["verified", "rejected", "voided", "corrected"],
    generatedAt: nowIso(),
    noVerificationActions: true,
    noPaymentRowWrites: true,
    noAllocationRowWrites: true,
    noInvoiceMutations: true,
    noStripeCalls: true,
  };

  if (!accountOwnerUserId) return emptyResult;

  const { data: reportsRaw, error: reportsError } = await params.admin
    .from("field_payment_collection_reports")
    .select([
      "id",
      "account_owner_user_id",
      "job_id",
      "internal_invoice_id",
      "customer_id",
      "reported_by_user_id",
      "payment_method",
      "amount_cents",
      "currency",
      "reference",
      "note",
      "status",
      "reported_at",
    ].join(", "))
    .eq("account_owner_user_id", accountOwnerUserId)
    .in("status", [...OPEN_STATUSES])
    .order("reported_at", { ascending: false })
    .limit(limit);

  if (reportsError) {
    throw new Error(`Failed to load field payment reconciliation reports: ${reportsError.message ?? "unknown error"}`);
  }

  const reports = (Array.isArray(reportsRaw) ? reportsRaw : []) as FieldPaymentCollectionReportRow[];
  if (!reports.length) return emptyResult;

  const invoiceIds = Array.from(new Set(reports.map((row) => clean(row.internal_invoice_id)).filter(Boolean)));
  const jobIds = Array.from(new Set(reports.map((row) => clean(row.job_id)).filter(Boolean)));
  const customerIds = Array.from(new Set(reports.map((row) => clean(row.customer_id)).filter(Boolean)));
  const reporterIds = Array.from(new Set(reports.map((row) => clean(row.reported_by_user_id)).filter(Boolean)));

  const [invoiceResult, jobResult, customerResult, internalUserResult, profileResult] = await Promise.all([
    invoiceIds.length
      ? params.admin
          .from("internal_invoices")
          .select("id, account_owner_user_id, job_id, customer_id, invoice_display_number, invoice_number, status")
          .eq("account_owner_user_id", accountOwnerUserId)
          .in("id", invoiceIds)
          .limit(invoiceIds.length)
      : Promise.resolve({ data: [], error: null }),
    jobIds.length
      ? params.admin
          .from("jobs")
          .select("id, job_display_number, title, customer_first_name, customer_last_name, locations:location_id(address_line1, city, state, zip)")
          .in("id", jobIds)
          .limit(jobIds.length)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? params.admin
          .from("customers")
          .select("id, full_name, first_name, last_name")
          .eq("owner_user_id", accountOwnerUserId)
          .in("id", customerIds)
          .limit(customerIds.length)
      : Promise.resolve({ data: [], error: null }),
    reporterIds.length
      ? params.admin
          .from("internal_users")
          .select("user_id, role")
          .eq("account_owner_user_id", accountOwnerUserId)
          .in("user_id", reporterIds)
          .limit(reporterIds.length)
      : Promise.resolve({ data: [], error: null }),
    reporterIds.length
      ? params.admin
          .from("profiles")
          .select("id, email")
          .in("id", reporterIds)
          .limit(reporterIds.length)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (invoiceResult.error) {
    throw new Error(`Failed to load field payment invoice context: ${invoiceResult.error.message ?? "unknown error"}`);
  }
  if (jobResult.error) {
    throw new Error(`Failed to load field payment job context: ${jobResult.error.message ?? "unknown error"}`);
  }
  if (customerResult.error) {
    throw new Error(`Failed to load field payment customer context: ${customerResult.error.message ?? "unknown error"}`);
  }
  if (internalUserResult.error) {
    throw new Error(`Failed to load field payment reporter role context: ${internalUserResult.error.message ?? "unknown error"}`);
  }
  if (profileResult.error) {
    throw new Error(`Failed to load field payment reporter profile context: ${profileResult.error.message ?? "unknown error"}`);
  }

  const invoices = (Array.isArray(invoiceResult.data) ? invoiceResult.data : []) as InvoiceRow[];
  const jobs = (Array.isArray(jobResult.data) ? jobResult.data : []) as JobRow[];
  const customers = (Array.isArray(customerResult.data) ? customerResult.data : []) as CustomerRow[];
  const internalUsers = (Array.isArray(internalUserResult.data) ? internalUserResult.data : []) as InternalUserRow[];
  const profiles = (Array.isArray(profileResult.data) ? profileResult.data : []) as ProfileRow[];

  const invoicesById = new Map(invoices.map((row) => [clean(row.id), row]));
  const jobsById = new Map(jobs.map((row) => [clean(row.id), row]));
  const customersById = new Map(customers.map((row) => [clean(row.id), row]));
  const internalUsersByUserId = new Map(internalUsers.map((row) => [clean(row.user_id), row]));
  const profilesByUserId = new Map(profiles.map((row) => [clean(row.id), row]));

  const items = reports
    .map((report) => {
      const reportId = clean(report.id);
      const jobId = clean(report.job_id);
      const invoiceId = clean(report.internal_invoice_id);
      const reportedByUserId = clean(report.reported_by_user_id);
      const method = clean(report.payment_method).toLowerCase();
      const status = clean(report.status).toLowerCase() as OpenFieldPaymentReportStatus;

      if (!reportId || !jobId || !invoiceId || !reportedByUserId) return null;
      if (method !== "check" && method !== "cash" && method !== "other") return null;
      if (!OPEN_STATUSES.includes(status)) return null;

      const invoice = invoicesById.get(invoiceId) ?? null;
      const job = jobsById.get(jobId) ?? null;
      const customerId = clean(report.customer_id) || clean(invoice?.customer_id) || null;
      const customer = customerId ? customersById.get(customerId) ?? null : null;
      const internalUser = internalUsersByUserId.get(reportedByUserId) ?? null;
      const profile = profilesByUserId.get(reportedByUserId) ?? null;

      const invoiceReference = formatInvoiceDisplayReference({
        invoiceDisplayNumber: invoice?.invoice_display_number ?? null,
        invoiceNumber: invoice?.invoice_number ?? null,
        invoiceId,
      });

      const jobReference = formatJobDisplayReference({
        jobDisplayNumber: job?.job_display_number ?? null,
        jobId,
      });

      return {
        reportId,
        accountOwnerUserId,
        jobId,
        jobReference,
        jobTitle: clean(job?.title) || null,
        locationLabel: buildLocationLabel(job),
        internalInvoiceId: invoiceId,
        invoiceReference,
        customerId,
        customerDisplayName: buildCustomerDisplayName({ customer, job }),
        paymentMethod: method as "check" | "cash" | "other",
        amountCents: Math.max(0, toNumber(report.amount_cents)),
        currency: clean(report.currency).toLowerCase() || "usd",
        reference: clean(report.reference) || null,
        note: clean(report.note) || null,
        status,
        reportedByUserId,
        reportedByDisplayName: buildReporterDisplayName({
          profile,
          internalUser,
          userId: reportedByUserId,
        }),
        reportedAt: clean(report.reported_at) || null,
        links: {
          invoiceWorkspaceHref: `/jobs/${jobId}/invoice?invoice_id=${encodeURIComponent(invoiceId)}#invoice-workspace`,
          jobHref: `/jobs/${jobId}`,
          customerHref: customerId ? `/customers/${customerId}` : null,
        },
      };
    })
    .filter((item): item is FieldPaymentReconciliationQueueItem => item !== null)
    .sort((a, b) => (Date.parse(b.reportedAt ?? "") || 0) - (Date.parse(a.reportedAt ?? "") || 0))
    .slice(0, limit);

  const reportDates = items
    .map((item) => Date.parse(item.reportedAt ?? ""))
    .filter((value) => Number.isFinite(value) && value > 0);

  const summary: FieldPaymentReconciliationQueueSummary = {
    openCount: items.length,
    reportedCount: items.filter((item) => item.status === "reported").length,
    underReviewCount: items.filter((item) => item.status === "under_review").length,
    needsCorrectionCount: items.filter((item) => item.status === "needs_correction").length,
    totalReportedAmountCents: items.reduce((sum, item) => sum + item.amountCents, 0),
    oldestReportedAt: reportDates.length ? new Date(Math.min(...reportDates)).toISOString() : null,
    newestReportedAt: reportDates.length ? new Date(Math.max(...reportDates)).toISOString() : null,
  };

  return {
    items,
    summary,
    includedStatuses: [...OPEN_STATUSES],
    excludedStatuses: ["verified", "rejected", "voided", "corrected"],
    generatedAt: nowIso(),
    noVerificationActions: true,
    noPaymentRowWrites: true,
    noAllocationRowWrites: true,
    noInvoiceMutations: true,
    noStripeCalls: true,
  };
}
