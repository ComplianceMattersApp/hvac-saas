import type { EstimateReadResult } from "@/lib/estimates/estimate-read";

export type EstimateCoachSuggestionKind =
  | "readiness_issue"
  | "wording_suggestion"
  | "pricebook_or_manual_line_suggestion"
  | "option_package_suggestion"
  | "conversion_guidance";

export type EstimateCoachSuggestion = {
  id: string;
  kind: EstimateCoachSuggestionKind;
  severity: "attention" | "guidance";
  title: string;
  detail: string;
};

export type EstimateCoachReport = {
  attentionCount: number;
  suggestions: EstimateCoachSuggestion[];
};

type EstimateCoachInput = {
  estimate: Pick<
    EstimateReadResult,
    "customer_id" | "location_id" | "title" | "notes" | "total_cents" | "proposalMode" | "line_items" | "options"
  >;
  customerEmail: string | null;
};

function hasText(value: string | null | undefined): boolean {
  return Boolean(String(value ?? "").trim());
}

function isLikelyEmail(value: string | null | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());
}

export function buildEstimateCoachReport(input: EstimateCoachInput): EstimateCoachReport {
  const { estimate } = input;
  const suggestions: EstimateCoachSuggestion[] = [];

  const addAttention = (
    id: string,
    title: string,
    detail: string,
    kind: EstimateCoachSuggestionKind = "readiness_issue"
  ) => suggestions.push({ id, kind, severity: "attention", title, detail });

  if (!hasText(estimate.customer_id)) {
    addAttention(
      "missing_customer",
      "Add a customer",
      "A customer is needed to anchor proposal context and account-scoped workflow."
    );
  }
  if (!hasText(estimate.location_id)) {
    addAttention(
      "missing_location",
      "Add a service location",
      "A location helps the operator and customer understand where the proposed scope applies."
    );
  }
  if (!hasText(estimate.title)) {
    addAttention(
      "missing_title",
      "Add a clear estimate title",
      "Use a short title that identifies the proposed outcome or system being quoted."
    );
  }
  if (!hasText(estimate.notes)) {
    addAttention(
      "missing_scope_notes",
      "Add scope notes",
      "Summarize the proposed result, important assumptions, and exclusions before customer delivery.",
      "wording_suggestion"
    );
  }
  if (!isLikelyEmail(input.customerEmail)) {
    addAttention(
      "missing_recipient_email",
      "Add a valid recipient email",
      "No valid customer email is on file. An operator can still enter a reviewed recipient during delivery."
    );
  }

  if (estimate.proposalMode === "multi_option_packages") {
    const options = estimate.options ?? [];
    const populatedOptions = options.filter((option) => option.line_items.length > 0);
    if (populatedOptions.length < 2) {
      addAttention(
        "missing_options",
        "Add at least two complete options",
        "A comparison proposal needs at least two options with line items. A third option is optional.",
        "option_package_suggestion"
      );
    }
    for (const [index, option] of populatedOptions.entries()) {
      const optionName = hasText(option.label) ? option.label.trim() : `Option ${index + 1}`;
      if (!hasText(option.label)) {
        addAttention(`option_${option.id}_label`, `Name ${optionName}`, "Each option needs a customer-readable label; stored order remains separate from its label.", "option_package_suggestion");
      }
      if (option.total_cents <= 0) {
        addAttention(`option_${option.id}_total`, `Review the ${optionName} total`, "This option totals $0. Confirm pricing and quantities before delivery.", "option_package_suggestion");
      }
    }
  } else {
    if (estimate.line_items.length === 0) {
      addAttention("missing_lines", "Add an estimate line", "Use a Pricebook item or a reviewed manual line to describe proposed commercial scope.", "pricebook_or_manual_line_suggestion");
    }
    if (estimate.total_cents <= 0) {
      addAttention("zero_total", "Review the estimate total", "The estimate totals $0. Confirm pricing and quantities before delivery.");
    }
  }

  suggestions.push({
    id: "commercial_scope_boundary",
    kind: "conversion_guidance",
    severity: "guidance",
    title: "Keep scope boundaries clear",
    detail: "Estimate lines are proposed commercial scope—not Work Items, Invoice Charges, approval truth, or permission to convert.",
  });

  return {
    attentionCount: suggestions.filter((suggestion) => suggestion.severity === "attention").length,
    suggestions,
  };
}
