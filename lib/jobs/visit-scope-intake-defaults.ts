type ScopeDefaultShape = {
  item_type: string;
  category: string;
  unit_label: string;
  expected_unit_price: number;
};

type ScopeDefaultInput = {
  title: string;
  item_type?: string | null;
  category?: string | null;
  unit_label?: string | null;
  expected_unit_price?: number | null;
};

const QUICK_SCOPE_DEFAULTS: Record<string, ScopeDefaultShape> = {
  "service call": {
    item_type: "service",
    category: "Service Call",
    unit_label: "job",
    expected_unit_price: 0,
  },
  diagnostic: {
    item_type: "service",
    category: "Diagnostic",
    unit_label: "job",
    expected_unit_price: 0,
  },
  install: {
    item_type: "service",
    category: "Installation",
    unit_label: "job",
    expected_unit_price: 0,
  },
};

function normalizeScopeTitle(value: string) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function resolveFieldIntakeScopeDefaults(title: string): ScopeDefaultShape {
  const normalized = normalizeScopeTitle(title);
  const mapped = QUICK_SCOPE_DEFAULTS[normalized];
  if (mapped) return mapped;

  return {
    item_type: "service",
    category: "General",
    unit_label: "job",
    expected_unit_price: 0,
  };
}

export function applyFieldIntakeScopeDefaults(input: ScopeDefaultInput): ScopeDefaultShape {
  const defaults = resolveFieldIntakeScopeDefaults(input.title);

  return {
    item_type: String(input.item_type ?? "").trim() || defaults.item_type,
    category: String(input.category ?? "").trim() || defaults.category,
    unit_label: String(input.unit_label ?? "").trim() || defaults.unit_label,
    expected_unit_price:
      input.expected_unit_price === null ||
      input.expected_unit_price === undefined ||
      !Number.isFinite(Number(input.expected_unit_price))
        ? defaults.expected_unit_price
        : Math.max(0, Number(input.expected_unit_price)),
  };
}
