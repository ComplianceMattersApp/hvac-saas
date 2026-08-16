export const INTERNAL_WORK_CONTRACTOR_FOCUS_ID = "__internal_work";

export type ContractorFocusOption = {
  id: string;
  name: string;
  count: number;
  selected: boolean;
};

export type ContractorFocusRow = {
  contractorId?: string | null;
  contractorName?: string | null;
  contractor_id?: string | null;
  contractors?: { name?: string | null } | { name?: string | null }[] | null;
};

export type ContractorFocusFacet = {
  allCount: number;
  internalCount: number;
  options: ContractorFocusOption[];
  showFilter: boolean;
};

type ActiveContractor = {
  id: string;
  name: string | null;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function contractorNameFromJoin(
  value: { name?: string | null } | { name?: string | null }[] | null | undefined,
) {
  const joined = Array.isArray(value) ? value[0] : value;
  return normalizeText(joined?.name);
}

export function normalizeContractorFocusIds(value: unknown): string[] {
  const rawValues = Array.isArray(value) ? value : [value];
  const ids = rawValues
    .flatMap((item) => normalizeText(item).split(","))
    .map((item) => item.trim())
    .filter(Boolean);

  return Array.from(new Set(ids));
}

export function contractorFocusId(row: ContractorFocusRow): string {
  return "contractorId" in row
    ? normalizeText(row.contractorId)
    : normalizeText(row.contractor_id);
}

export function contractorFocusName(row: ContractorFocusRow): string {
  return "contractorName" in row
    ? normalizeText(row.contractorName)
    : contractorNameFromJoin(row.contractors);
}

export function filterRowsByContractorFocus<T extends ContractorFocusRow>(
  rows: readonly T[],
  selectedIds: ReadonlySet<string>,
): T[] {
  if (selectedIds.size === 0) return [...rows];

  return rows.filter((row) => {
    const contractorId = contractorFocusId(row);
    return contractorId
      ? selectedIds.has(contractorId)
      : selectedIds.has(INTERNAL_WORK_CONTRACTOR_FOCUS_ID);
  });
}

export function buildContractorFocusFacet(params: {
  rows: readonly ContractorFocusRow[];
  activeContractors: readonly ActiveContractor[];
  selectedIds: ReadonlySet<string>;
  enabled: boolean;
}): ContractorFocusFacet {
  const counts = new Map<string, number>();
  const queuedNameById = new Map<string, string>();
  let internalCount = 0;

  for (const row of params.rows) {
    const contractorId = contractorFocusId(row);
    if (!contractorId) {
      internalCount += 1;
      continue;
    }

    counts.set(contractorId, (counts.get(contractorId) ?? 0) + 1);
    if (!queuedNameById.has(contractorId)) {
      const rowName = contractorFocusName(row);
      if (rowName) queuedNameById.set(contractorId, rowName);
    }
  }

  // Keep lifecycle-active contractors selectable while also retaining a
  // contractor that owns current queue work. De-duplicate by display name; if
  // an inactive duplicate owns the rows, use that id so filtering is truthful.
  const optionsByName = new Map<string, { id: string; name: string; count: number }>();
  const nameKey = (name: string) => name.trim().toLowerCase();

  for (const contractor of params.activeContractors) {
    const name = normalizeText(contractor.name) || contractor.id;
    optionsByName.set(nameKey(name), {
      id: contractor.id,
      name,
      count: counts.get(contractor.id) ?? 0,
    });
  }

  for (const [contractorId, count] of counts) {
    const name = queuedNameById.get(contractorId) || contractorId;
    const key = nameKey(name);
    const existing = optionsByName.get(key);
    if (!existing) {
      optionsByName.set(key, { id: contractorId, name, count });
    } else if (existing.count === 0 && count > 0) {
      optionsByName.set(key, { id: contractorId, name: existing.name, count });
    }
  }

  return {
    allCount: params.rows.length,
    internalCount,
    options: Array.from(optionsByName.values()).map((entry) => ({
      ...entry,
      selected: params.selectedIds.has(entry.id),
    })),
    showFilter: params.enabled && (params.activeContractors.length > 0 || internalCount > 0),
  };
}
