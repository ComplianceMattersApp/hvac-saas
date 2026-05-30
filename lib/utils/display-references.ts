export function normalizeDisplayNumber(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const normalizedNumber = String(Math.trunc(value)).trim();
    return normalizedNumber ? normalizedNumber : null;
  }

  if (typeof value !== "string") return null;

  const normalized = value.trim();
  if (!normalized) return null;

  const lowered = normalized.toLowerCase();
  if (lowered === "null" || lowered === "undefined" || lowered === "nan") return null;

  return normalized;
}

export function shortUuidReference(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, 8) : "-";
}

export function preferredJobReference(params: {
  jobDisplayNumber: unknown;
  jobId: string | null | undefined;
}): string {
  return normalizeDisplayNumber(params.jobDisplayNumber) ?? shortUuidReference(params.jobId);
}

export function preferredInvoiceReference(params: {
  invoiceDisplayNumber: unknown;
  invoiceNumber: unknown;
  invoiceId: string | null | undefined;
}): string {
  return (
    normalizeDisplayNumber(params.invoiceDisplayNumber) ??
    normalizeDisplayNumber(params.invoiceNumber) ??
    shortUuidReference(params.invoiceId)
  );
}

export function formatJobDisplayReference(params: {
  jobDisplayNumber: unknown;
  jobId: string | null | undefined;
}): string {
  const display = normalizeDisplayNumber(params.jobDisplayNumber);
  if (display) return `Job #${display}`;
  return `Job ${shortUuidReference(params.jobId)}`;
}

export function formatInvoiceDisplayReference(params: {
  invoiceDisplayNumber: unknown;
  invoiceNumber: unknown;
  invoiceId: string | null | undefined;
}): string {
  const display = normalizeDisplayNumber(params.invoiceDisplayNumber);
  if (display) return `Invoice #${display}`;

  const legacyInvoiceNumber = normalizeDisplayNumber(params.invoiceNumber);
  if (legacyInvoiceNumber) return `Invoice ${legacyInvoiceNumber}`;

  return `Invoice ${shortUuidReference(params.invoiceId)}`;
}
