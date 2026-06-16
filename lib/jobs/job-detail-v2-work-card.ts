import type { VisitScopeItem } from "@/lib/jobs/visit-scope";

const DEFAULT_EMPTY_WORK_SCOPE = "No work scope recorded.";

function cleanText(value?: string | null) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function truncateText(value: string, maxLength: number) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function buildV2PulseWorkToPerformCardModel({
  summary,
  items,
  maxItems = 3,
}: {
  summary?: string | null;
  items?: VisitScopeItem[];
  maxItems?: number;
}) {
  const safeItems = Array.isArray(items) ? items.filter((item) => cleanText(item.title)) : [];
  const primaryItems = safeItems.filter((item) => item.kind === "primary");
  const displayItems = primaryItems.length > 0 ? primaryItems : safeItems;
  const itemCount = displayItems.length;
  const previewItems = displayItems.slice(0, maxItems).map((item) => ({
    title: truncateText(item.title, 62),
    details: item.details ? truncateText(item.details, 92) : null,
    kind: item.kind,
  }));
  const remainingCount = Math.max(0, itemCount - previewItems.length);
  const summaryText = cleanText(summary);

  if (itemCount > 0) {
    return {
      mode: "items" as const,
      eyebrow: "Work to Perform",
      title: `${itemCount} work item${itemCount === 1 ? "" : "s"}`,
      body: summaryText || "Visit scope",
      previewItems,
      remainingCount,
      emptyText: null,
    };
  }

  if (summaryText) {
    return {
      mode: "summary" as const,
      eyebrow: "Work to Perform",
      title: "Visit scope",
      body: truncateText(summaryText, 180),
      previewItems: [],
      remainingCount: 0,
      emptyText: null,
    };
  }

  return {
    mode: "empty" as const,
    eyebrow: "Work to Perform",
    title: DEFAULT_EMPTY_WORK_SCOPE,
    body: "",
    previewItems: [],
    remainingCount: 0,
    emptyText: DEFAULT_EMPTY_WORK_SCOPE,
  };
}
