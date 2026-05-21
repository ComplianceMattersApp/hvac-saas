type ScopeDefaultShape = {
  item_type: string;
  category: string;
  unit_label: string;
};

type ScopeDefaultInput = {
  title: string;
  item_type?: string | null;
  category?: string | null;
  unit_label?: string | null;
};

const QUICK_SCOPE_DEFAULTS: Record<string, ScopeDefaultShape> = {
  "service call": {
    item_type: "service",
    category: "Service Call",
    unit_label: "job",
  },
  diagnostic: {
    item_type: "service",
    category: "Diagnostic",
    unit_label: "job",
  },
  install: {
    item_type: "service",
    category: "Installation",
    unit_label: "job",
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
  };
}

export function applyFieldIntakeScopeDefaults(input: ScopeDefaultInput): ScopeDefaultShape {
  const defaults = resolveFieldIntakeScopeDefaults(input.title);

  return {
    item_type: String(input.item_type ?? "").trim() || defaults.item_type,
    category: String(input.category ?? "").trim() || defaults.category,
    unit_label: String(input.unit_label ?? "").trim() || defaults.unit_label,
  };
}
