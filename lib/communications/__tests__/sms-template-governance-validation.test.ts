import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  ON_THE_WAY_ALLOWED_TEMPLATE_TOKENS,
  ON_THE_WAY_PLANNING_DEFAULT_BODY,
  ON_THE_WAY_PROHIBITED_CONTENT_PATTERNS,
  ON_THE_WAY_SAMPLE_TOKEN_VALUES,
  ON_THE_WAY_TEMPLATE_POLICY_VERSION,
  validateOnTheWayTemplateBody,
} from "@/lib/communications/sms-template-governance-validation";

describe("sms template governance validation helper", () => {
  it("validates the planning default body for draft, review, and sandbox approval", () => {
    const result = validateOnTheWayTemplateBody(ON_THE_WAY_PLANNING_DEFAULT_BODY);

    expect(result.normalizedBodyTemplate).toBe(ON_THE_WAY_PLANNING_DEFAULT_BODY);
    expect(result.canSaveDraft).toBe(true);
    expect(result.canSubmitForReview).toBe(true);
    expect(result.canApproveForSandbox).toBe(true);
    expect(result.blockingReasons).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("blocks blank body for save, submit, and sandbox approval", () => {
    const result = validateOnTheWayTemplateBody("  \r\n  ");

    expect(result.normalizedBodyTemplate).toBe("");
    expect(result.canSaveDraft).toBe(false);
    expect(result.canSubmitForReview).toBe(false);
    expect(result.canApproveForSandbox).toBe(false);
    expect(result.blockingReasons).toContain("body_blank");
  });

  it("calculates deterministic SHA-256 from normalized body", () => {
    const input = `\r\n ${ON_THE_WAY_PLANNING_DEFAULT_BODY}\r\n`;
    const normalized = ON_THE_WAY_PLANNING_DEFAULT_BODY;

    const result = validateOnTheWayTemplateBody(input);

    expect(result.bodyHash).toBe(createHash("sha256").update(normalized).digest("hex"));
  });

  it("normalizes windows line endings consistently", () => {
    const body = "Hi {{recipient_first_name}},\r\nReply STOP to opt out.";

    const result = validateOnTheWayTemplateBody(body);

    expect(result.normalizedBodyTemplate).toBe("Hi {{recipient_first_name}},\nReply STOP to opt out.");
  });

  it("detects allowed tokens and dedupes duplicates in stable order", () => {
    const result = validateOnTheWayTemplateBody(
      "Hi {{recipient_first_name}} from {{company_name}} and {{recipient_first_name}}. Reply STOP to opt out.",
    );

    expect(result.detectedTokens).toEqual(["recipient_first_name", "company_name"]);
    expect(result.unknownTokens).toEqual([]);
  });

  it("detects unknown tokens and blocks submit and sandbox approval while allowing draft save", () => {
    const result = validateOnTheWayTemplateBody(
      "Hi {{recipient_first_name}}, {{unsafe_customer_note}}. Reply STOP to opt out.",
    );

    expect(result.canSaveDraft).toBe(true);
    expect(result.canSubmitForReview).toBe(false);
    expect(result.canApproveForSandbox).toBe(false);
    expect(result.detectedTokens).toEqual(["recipient_first_name", "unsafe_customer_note"]);
    expect(result.unknownTokens).toEqual(["unsafe_customer_note"]);
    expect(result.blockingReasons).toContain("unknown_tokens");
    expect(result.warnings).toContain("unknown_tokens_present");
  });

  it("allows draft save without STOP language but blocks submit and sandbox approval", () => {
    const result = validateOnTheWayTemplateBody("Hi {{recipient_first_name}}, this is {{company_name}}.");

    expect(result.canSaveDraft).toBe(true);
    expect(result.canSubmitForReview).toBe(false);
    expect(result.canApproveForSandbox).toBe(false);
    expect(result.stopLanguagePresent).toBe(false);
    expect(result.blockingReasons).toContain("stop_language_missing");
    expect(result.warnings).toContain("stop_language_missing");
  });

  it("detects STOP language case-insensitively and tolerates trailing punctuation", () => {
    const result = validateOnTheWayTemplateBody(
      "Hi {{recipient_first_name}}. reply stop to opt out!",
    );

    expect(result.stopLanguagePresent).toBe(true);
    expect(result.blockingReasons).not.toContain("stop_language_missing");
  });

  it("blocks promotional wording for submit and sandbox approval while allowing draft save", () => {
    const result = validateOnTheWayTemplateBody(
      "Hi {{recipient_first_name}}, limited time discount available now. Reply STOP to opt out.",
    );

    expect(result.canSaveDraft).toBe(true);
    expect(result.canSubmitForReview).toBe(false);
    expect(result.canApproveForSandbox).toBe(false);
    expect(result.prohibitedContentHits).toEqual(["discount", "limited_time"]);
    expect(result.blockingReasons).toContain("prohibited_content");
    expect(result.warnings).toContain("prohibited_content_present");
  });

  it("replaces allowed tokens with sample values in preview", () => {
    const result = validateOnTheWayTemplateBody(
      "Hi {{recipient_first_name}}, this is {{operator_or_tech_name}} with {{company_name}} about {{appointment_or_job_context}}. Reply STOP to opt out.",
    );

    expect(result.samplePreview).toContain(ON_THE_WAY_SAMPLE_TOKEN_VALUES.recipient_first_name);
    expect(result.samplePreview).toContain(ON_THE_WAY_SAMPLE_TOKEN_VALUES.operator_or_tech_name);
    expect(result.samplePreview).toContain(ON_THE_WAY_SAMPLE_TOKEN_VALUES.company_name);
    expect(result.samplePreview).toContain(ON_THE_WAY_SAMPLE_TOKEN_VALUES.appointment_or_job_context);
  });

  it("does not require real customer or job data for sample preview", () => {
    const result = validateOnTheWayTemplateBody(ON_THE_WAY_PLANNING_DEFAULT_BODY);

    expect(result.samplePreview).toBe(
      "Hi Taylor, this is Alex with Your company. I am on the way to your service appointment. Reply STOP to opt out.",
    );
    expect(result.samplePreview).not.toContain("job_id");
    expect(result.samplePreview).not.toContain("customer");
  });

  it("keeps unknown tokens visibly bracketed in sample preview", () => {
    const result = validateOnTheWayTemplateBody(
      "Hi {{recipient_first_name}}, use {{unsafe_customer_note}}. Reply STOP to opt out.",
    );

    expect(result.samplePreview).toContain("Taylor");
    expect(result.samplePreview).toContain("{{unsafe_customer_note}}");
  });

  it("estimates one segment for short sample previews", () => {
    const result = validateOnTheWayTemplateBody("Hi {{recipient_first_name}}. Reply STOP to opt out.");

    expect(result.characterCount).toBe(result.samplePreview.length);
    expect(result.estimatedSegments).toBe(1);
    expect(result.warnings).not.toContain("message_multiple_segments");
  });

  it("warns on multi-segment content above one segment", () => {
    const body =
      "Hi {{recipient_first_name}}, this is {{operator_or_tech_name}} with {{company_name}}. " +
      "I am on the way to {{appointment_or_job_context}} and wanted to share an extra detailed update about timing and arrival preparation. " +
      "Reply STOP to opt out.";

    const result = validateOnTheWayTemplateBody(body);

    expect(result.estimatedSegments).toBeGreaterThan(1);
    expect(result.warnings).toContain("message_multiple_segments");
  });

  it("blocks review and sandbox approval when message exceeds two estimated segments", () => {
    const body =
      "Hi {{recipient_first_name}}, this is {{operator_or_tech_name}} with {{company_name}}. ".repeat(8) +
      "Reply STOP to opt out.";

    const result = validateOnTheWayTemplateBody(body);

    expect(result.estimatedSegments).toBeGreaterThan(2);
    expect(result.canSaveDraft).toBe(true);
    expect(result.canSubmitForReview).toBe(false);
    expect(result.canApproveForSandbox).toBe(false);
    expect(result.blockingReasons).toContain("message_too_long_for_review");
  });

  it("does not include canSend or sms enabled flags in the return shape", () => {
    const result = validateOnTheWayTemplateBody(ON_THE_WAY_PLANNING_DEFAULT_BODY);

    expect(result).not.toHaveProperty("canSend");
    expect(result).not.toHaveProperty("smsEnabled");
    expect(result).not.toHaveProperty("liveSendsEnabled");
  });

  it("always classifies content as operational", () => {
    const result = validateOnTheWayTemplateBody(ON_THE_WAY_PLANNING_DEFAULT_BODY);

    expect(result.contentClassification).toBe("operational");
  });

  it("returns deterministic token arrays across repeated calls", () => {
    const body = "Hi {{recipient_first_name}} {{unsafe_customer_note}} {{company_name}}. Reply STOP to opt out.";

    const first = validateOnTheWayTemplateBody(body);
    const second = validateOnTheWayTemplateBody(body);

    expect(first.detectedTokens).toEqual(["recipient_first_name", "unsafe_customer_note", "company_name"]);
    expect(first.unknownTokens).toEqual(["unsafe_customer_note"]);
    expect(second.detectedTokens).toEqual(first.detectedTokens);
    expect(second.unknownTokens).toEqual(first.unknownTokens);
  });

  it("exports the locked token, policy, and prohibited-content constants", () => {
    expect(ON_THE_WAY_ALLOWED_TEMPLATE_TOKENS).toEqual([
      "recipient_first_name",
      "operator_or_tech_name",
      "company_name",
      "appointment_or_job_context",
    ]);
    expect(ON_THE_WAY_TEMPLATE_POLICY_VERSION).toBe("v1");
    expect(ON_THE_WAY_PROHIBITED_CONTENT_PATTERNS.map((entry) => entry.code)).toContain("click_to_pay");
  });
});