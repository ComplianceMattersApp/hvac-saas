import { describe, expect, it } from "vitest";
import { buildReviewAskLinks } from "@/lib/utils/review-ask-links";

const REVIEW_URL = "https://g.page/r/test-place-id/review";
const BUSINESS = "Compliance Matters";

function decodeParam(href: string, key: string): string {
  const match = new RegExp(`[?&]${key}=([^&]*)`).exec(href);
  if (!match) return "";
  return decodeURIComponent(match[1]);
}

describe("buildReviewAskLinks", () => {
  it("builds mailto and sms hrefs with encoded body for a full contact", () => {
    const { mailtoHref, smsHref } = buildReviewAskLinks({
      customerFirstName: "Jamie",
      customerEmail: "jamie@example.com",
      customerPhone: "(209) 555-1234",
      googleReviewUrl: REVIEW_URL,
      businessName: BUSINESS,
    });

    expect(mailtoHref).toBeTruthy();
    expect(smsHref).toBeTruthy();
    expect(mailtoHref!.startsWith("mailto:jamie@example.com?")).toBe(true);
    // digits-only phone in the sms scheme
    expect(smsHref!.startsWith("sms:2095551234?")).toBe(true);

    const emailBody = decodeParam(mailtoHref!, "body");
    const emailSubject = decodeParam(mailtoHref!, "subject");
    const smsBody = decodeParam(smsHref!, "body");

    expect(emailSubject).toContain(BUSINESS);
    expect(emailBody).toContain("Hi Jamie");
    expect(smsBody).toContain("Hi Jamie");
  });

  it("returns null mailtoHref when email is missing but keeps smsHref", () => {
    const { mailtoHref, smsHref } = buildReviewAskLinks({
      customerFirstName: "Jamie",
      customerEmail: null,
      customerPhone: "209-555-1234",
      googleReviewUrl: REVIEW_URL,
      businessName: BUSINESS,
    });

    expect(mailtoHref).toBeNull();
    expect(smsHref).toBeTruthy();
  });

  it("returns null smsHref when phone is missing but keeps mailtoHref", () => {
    const { mailtoHref, smsHref } = buildReviewAskLinks({
      customerFirstName: "Jamie",
      customerEmail: "jamie@example.com",
      customerPhone: null,
      googleReviewUrl: REVIEW_URL,
      businessName: BUSINESS,
    });

    expect(mailtoHref).toBeTruthy();
    expect(smsHref).toBeNull();
  });

  it("returns both null when email and phone are missing", () => {
    const { mailtoHref, smsHref } = buildReviewAskLinks({
      customerFirstName: "Jamie",
      customerEmail: null,
      customerPhone: null,
      googleReviewUrl: REVIEW_URL,
      businessName: BUSINESS,
    });

    expect(mailtoHref).toBeNull();
    expect(smsHref).toBeNull();
  });

  it("falls back to a generic greeting when first name is missing", () => {
    const { mailtoHref, smsHref } = buildReviewAskLinks({
      customerFirstName: null,
      customerEmail: "jamie@example.com",
      customerPhone: "2095551234",
      googleReviewUrl: REVIEW_URL,
      businessName: BUSINESS,
    });

    expect(decodeParam(mailtoHref!, "body")).toContain("Hi there");
    expect(decodeParam(smsHref!, "body")).toContain("Hi there");
  });

  it("returns null smsHref for a short/invalid phone with fewer than 10 digits", () => {
    const { smsHref } = buildReviewAskLinks({
      customerFirstName: "Jamie",
      customerEmail: "jamie@example.com",
      customerPhone: "555-1234",
      googleReviewUrl: REVIEW_URL,
      businessName: BUSINESS,
    });

    expect(smsHref).toBeNull();
  });

  it("includes the review URL and business name in both bodies", () => {
    const { mailtoHref, smsHref } = buildReviewAskLinks({
      customerFirstName: "Jamie",
      customerEmail: "jamie@example.com",
      customerPhone: "2095551234",
      googleReviewUrl: REVIEW_URL,
      businessName: BUSINESS,
    });

    const emailBody = decodeParam(mailtoHref!, "body");
    const smsBody = decodeParam(smsHref!, "body");

    expect(emailBody).toContain(REVIEW_URL);
    expect(emailBody).toContain(BUSINESS);
    expect(smsBody).toContain(REVIEW_URL);
    expect(smsBody).toContain(BUSINESS);
  });
});
