type QueryResult<T> = {
  data: T;
  error: any;
  count?: number | null;
  [key: string]: any;
};

function applyNullBillingDispositionDefaultsToRow(
  row: any,
  options?: { includeDispositionMetadata?: boolean },
) {
  if (!row || typeof row !== "object") return row;

  const includeDispositionMetadata = options?.includeDispositionMetadata === true;
  return {
    ...row,
    billing_disposition: null,
    ...(includeDispositionMetadata
      ? {
          billing_disposition_note: null,
          billing_disposition_at: null,
          billing_disposition_by_user_id: null,
        }
      : {}),
  };
}

function applyNullBillingDispositionDefaults<T>(
  data: T,
  options?: { includeDispositionMetadata?: boolean },
): T {
  if (data == null) return data;

  if (Array.isArray(data)) {
    return data.map((row) => applyNullBillingDispositionDefaultsToRow(row, options)) as T;
  }

  if (typeof data === "object") {
    return applyNullBillingDispositionDefaultsToRow(data, options) as T;
  }

  return data;
}

export function isMissingJobsBillingDispositionColumnError(error: unknown): boolean {
  const code = String((error as any)?.code ?? "").trim();
  const message = String((error as any)?.message ?? "").toLowerCase();

  if (code === "42703") {
    return message.includes("jobs.billing_disposition");
  }

  return (
    message.includes("column")
    && message.includes("jobs.billing_disposition")
    && message.includes("does not exist")
  );
}

export async function withJobsBillingDispositionSelectFallback<T>(params: {
  runPrimary: () => PromiseLike<QueryResult<T>> | QueryResult<T>;
  runCompat: () => PromiseLike<QueryResult<T>> | QueryResult<T>;
  includeDispositionMetadata?: boolean;
}): Promise<QueryResult<T>> {
  const primary = await params.runPrimary();
  if (!primary.error || !isMissingJobsBillingDispositionColumnError(primary.error)) {
    return primary;
  }

  const compat = await params.runCompat();
  if (compat.error) {
    return compat;
  }

  return {
    ...compat,
    data: applyNullBillingDispositionDefaults(compat.data, {
      includeDispositionMetadata: params.includeDispositionMetadata,
    }),
    error: null,
  };
}
