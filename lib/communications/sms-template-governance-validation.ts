import { createHash } from "node:crypto";

export const ON_THE_WAY_TEMPLATE_POLICY_VERSION = "v1";

export const ON_THE_WAY_ALLOWED_TEMPLATE_TOKENS = [
  "recipient_first_name",
  "operator_or_tech_name",
  "company_name",
  "appointment_or_job_context",
] as const;

export const ON_THE_WAY_SAMPLE_TOKEN_VALUES: Record<(typeof ON_THE_WAY_ALLOWED_TEMPLATE_TOKENS)[number], string> = {
  recipient_first_name: "Taylor",
  operator_or_tech_name: "Alex",
  company_name: "Your company",
  appointment_or_job_context: "your service appointment",
};

export const ON_THE_WAY_PLANNING_DEFAULT_BODY =
  "Hi {{recipient_first_name}}, this is {{operator_or_tech_name}} with {{company_name}}. I am on the way to your service appointment. Reply STOP to opt out.";

export const ON_THE_WAY_PROHIBITED_CONTENT_PATTERNS = [
  { code: "discount", pattern: /\bdiscount\b/i },
  { code: "sale", pattern: /\bsale\b/i },
  { code: "promotion", pattern: /\bpromotion\b/i },
  { code: "special_offer", pattern: /\bspecial\s+offer\b/i },
  { code: "limited_time", pattern: /\blimited\s+time\b/i },
  { code: "act_now", pattern: /\bact\s+now\b/i },
  { code: "review_us", pattern: /\breview\s+us\b/i },
  { code: "leave_a_review", pattern: /\bleave\s+a\s+review\b/i },
  { code: "referral", pattern: /\breferral\b/i },
  { code: "refer_a_friend", pattern: /\brefer\s+a\s+friend\b/i },
  { code: "financing", pattern: /\bfinancing\b/i },
  { code: "pay_now", pattern: /\bpay\s+now\b/i },
  { code: "invoice_amount", pattern: /\binvoice\s+amount\b/i },
  { code: "click_to_pay", pattern: /\bclick\s+to\s+pay\b/i },
] as const;

const STOP_LANGUAGE_PATTERN = /reply\s+stop\s+to\s+opt\s+out[.!?]?/i;
const TOKEN_PATTERN = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
const ALLOWED_TOKEN_SET = new Set<string>(ON_THE_WAY_ALLOWED_TEMPLATE_TOKENS);

export type ValidateOnTheWayTemplateBodyResult = {
  normalizedBodyTemplate: string;
  bodyHash: string;
  detectedTokens: string[];
  unknownTokens: string[];
  stopLanguagePresent: boolean;
  prohibitedContentHits: string[];
  contentClassification: "operational";
  samplePreview: string;
  characterCount: number;
  estimatedSegments: number;
  canSaveDraft: boolean;
  canSubmitForReview: boolean;
  canApproveForSandbox: boolean;
  blockingReasons: string[];
  warnings: string[];
};

function normalizeBodyTemplate(bodyTemplate: string) {
  return String(bodyTemplate ?? "").replace(/\r\n?/g, "\n").trim();
}

function uniqueStable(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function detectTokens(bodyTemplate: string) {
  const tokens: string[] = [];
  let match = TOKEN_PATTERN.exec(bodyTemplate);

  while (match) {
    tokens.push(match[1] ?? "");
    match = TOKEN_PATTERN.exec(bodyTemplate);
  }

  TOKEN_PATTERN.lastIndex = 0;
  return uniqueStable(tokens);
}

function renderSamplePreview(bodyTemplate: string) {
  return bodyTemplate.replace(TOKEN_PATTERN, (_full, tokenName: string) => {
    const normalizedToken = String(tokenName ?? "").trim().toLowerCase();
    TOKEN_PATTERN.lastIndex = 0;
    return ON_THE_WAY_SAMPLE_TOKEN_VALUES[normalizedToken as keyof typeof ON_THE_WAY_SAMPLE_TOKEN_VALUES] ??
      `{{${normalizedToken}}}`;
  });
}

function estimateSegments(characterCount: number) {
  if (characterCount <= 160) return 1;
  return Math.ceil(characterCount / 153);
}

function getProhibitedContentHits(bodyTemplate: string) {
  return uniqueStable(
    ON_THE_WAY_PROHIBITED_CONTENT_PATTERNS.filter(({ pattern }) => pattern.test(bodyTemplate)).map(({ code }) => code),
  );
}

export function validateOnTheWayTemplateBody(bodyTemplate: string): ValidateOnTheWayTemplateBodyResult {
  const normalizedBodyTemplate = normalizeBodyTemplate(bodyTemplate);
  const bodyHash = createHash("sha256").update(normalizedBodyTemplate).digest("hex");
  const detectedTokens = detectTokens(normalizedBodyTemplate);
  const unknownTokens = detectedTokens.filter((token) => !ALLOWED_TOKEN_SET.has(token));
  const stopLanguagePresent = STOP_LANGUAGE_PATTERN.test(normalizedBodyTemplate);
  const prohibitedContentHits = getProhibitedContentHits(normalizedBodyTemplate);
  const samplePreview = renderSamplePreview(normalizedBodyTemplate);
  const characterCount = samplePreview.length;
  const estimatedSegments = estimateSegments(characterCount);
  const canSaveDraft = normalizedBodyTemplate.length > 0;

  const blockingReasons: string[] = [];
  const warnings: string[] = [];

  if (!canSaveDraft) {
    blockingReasons.push("body_blank");
  }

  if (unknownTokens.length > 0) {
    blockingReasons.push("unknown_tokens");
    warnings.push("unknown_tokens_present");
  }

  if (!stopLanguagePresent) {
    blockingReasons.push("stop_language_missing");
    warnings.push("stop_language_missing");
  }

  if (prohibitedContentHits.length > 0) {
    blockingReasons.push("prohibited_content");
    warnings.push("prohibited_content_present");
  }

  if (estimatedSegments > 1) {
    warnings.push("message_multiple_segments");
  }

  if (estimatedSegments > 2) {
    blockingReasons.push("message_too_long_for_review");
  }

  const canSubmitForReview =
    canSaveDraft &&
    unknownTokens.length === 0 &&
    stopLanguagePresent &&
    prohibitedContentHits.length === 0 &&
    estimatedSegments <= 2;

  return {
    normalizedBodyTemplate,
    bodyHash,
    detectedTokens,
    unknownTokens,
    stopLanguagePresent,
    prohibitedContentHits,
    contentClassification: "operational",
    samplePreview,
    characterCount,
    estimatedSegments,
    canSaveDraft,
    canSubmitForReview,
    canApproveForSandbox: canSubmitForReview,
    blockingReasons: uniqueStable(blockingReasons),
    warnings: uniqueStable(warnings),
  };
}