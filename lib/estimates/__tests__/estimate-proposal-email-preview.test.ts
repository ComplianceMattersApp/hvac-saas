import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isProposalEmailPreviewViewerEnabled,
  resolveProposalEmailPreviewUrl,
} from "@/lib/estimates/estimate-proposal-email-preview";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("estimate proposal email preview viewer helper", () => {
  it("enables preview viewer in local preview mode", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("EMAIL_DELIVERY_MODE", "preview");

    expect(isProposalEmailPreviewViewerEnabled()).toBe(true);
    expect(resolveProposalEmailPreviewUrl()).toBe("/dev/email-preview/proposal");
  });

  it("keeps preview viewer disabled when mode is not preview", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("EMAIL_DELIVERY_MODE", "provider");
    vi.stubEnv("ENABLE_EMAIL_PREVIEW_OUTBOX", "false");

    expect(isProposalEmailPreviewViewerEnabled()).toBe(false);
    expect(resolveProposalEmailPreviewUrl()).toBeNull();
  });

  it("fails closed in production runtime", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("EMAIL_DELIVERY_MODE", "preview");
    vi.stubEnv("ENABLE_EMAIL_PREVIEW_OUTBOX", "true");

    expect(isProposalEmailPreviewViewerEnabled()).toBe(false);
    expect(resolveProposalEmailPreviewUrl()).toBeNull();
  });
});
