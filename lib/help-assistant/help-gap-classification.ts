export type HelpGapCategory =
  | "guidance_training"
  | "setup_data_issue"
  | "ux_confusion"
  | "possible_product_bug"
  | "future_feature_request"
  | "missing_help_article"
  | "unknown";

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

export function classifyHelpGapQuestion(questionText: string | null | undefined): HelpGapCategory {
  const question = String(questionText ?? "").trim().toLowerCase();
  if (!question) return "unknown";

  if (
    includesAny(question, [
      "bug",
      "broken",
      "crash",
      "error",
      "failed",
      "failure",
      "not loading",
      "not showing",
      "not working",
      "something went wrong",
      "wrong result",
    ])
  ) {
    return "possible_product_bug";
  }

  if (
    includesAny(question, [
      "feature",
      "future",
      "integration",
      "roadmap",
      "add a",
      "add an",
      "can it",
      "can we",
      "could it",
      "could we",
      "when will",
      "would be nice",
    ])
  ) {
    return "future_feature_request";
  }

  if (
    includesAny(question, [
      "payment setup",
      "online invoice",
      "online payment",
      "accept payments",
      "billing mode",
      "invoice mode",
      "company profile",
      "team access",
      "invite",
      "setup",
      "set up",
      "account state",
      "readiness",
    ])
  ) {
    return "setup_data_issue";
  }

  if (
    includesAny(question, [
      "training",
      "mission",
      "role",
      "responsible",
      "first job",
      "start my day",
      "run the day",
      "how do i",
      "what should i do",
      "workflow",
    ])
  ) {
    return "guidance_training";
  }

  if (
    includesAny(question, [
      "confusing",
      "confused",
      "unclear",
      "where do i",
      "where is",
      "what does this mean",
      "why do i see",
      "i cannot find",
      "can't find",
    ])
  ) {
    return "ux_confusion";
  }

  if (
    includesAny(question, [
      "article",
      "documentation",
      "docs",
      "help article",
      "help page",
      "missing help",
      "unknown answer",
    ])
  ) {
    return "missing_help_article";
  }

  return "unknown";
}
