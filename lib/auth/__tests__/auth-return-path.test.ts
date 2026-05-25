import { describe, expect, it } from "vitest";

import { normalizeAuthReturnPath, resolveSafeAuthReturnPath } from "@/lib/auth/auth-return-path";

describe("normalizeAuthReturnPath", () => {
  it("accepts local absolute paths", () => {
    expect(normalizeAuthReturnPath("/today")).toBe("/today");
    expect(normalizeAuthReturnPath("%2Fjobs%2Fabc")).toBe("/jobs/abc");
  });

  it("rejects auth and unsafe paths", () => {
    expect(normalizeAuthReturnPath("/login")).toBeNull();
    expect(normalizeAuthReturnPath("https://example.com")).toBeNull();
    expect(normalizeAuthReturnPath("//evil")).toBeNull();
  });
});

describe("resolveSafeAuthReturnPath", () => {
  it("uses fallback when candidate is missing", () => {
    expect(
      resolveSafeAuthReturnPath({
        actorKind: "internal",
        candidateNext: null,
        fallbackPath: "/today",
      }),
    ).toBe("/today");
  });

  it("blocks contractor portal paths for internal users", () => {
    expect(
      resolveSafeAuthReturnPath({
        actorKind: "internal",
        candidateNext: "/portal/jobs/1",
        fallbackPath: "/today",
      }),
    ).toBe("/today");
  });

  it("maps legacy /ops root return to /today during default-home migration", () => {
    expect(
      resolveSafeAuthReturnPath({
        actorKind: "internal",
        candidateNext: "/ops",
        fallbackPath: "/today",
      }),
    ).toBe("/today");

    expect(
      resolveSafeAuthReturnPath({
        actorKind: "internal",
        candidateNext: "/ops?bucket=pending_info",
        fallbackPath: "/today",
      }),
    ).toBe("/today");
  });

  it("preserves explicit internal deep links", () => {
    expect(
      resolveSafeAuthReturnPath({
        actorKind: "internal",
        candidateNext: "/ops/field",
        fallbackPath: "/today",
      }),
    ).toBe("/ops/field");
  });

  it("allows portal paths for contractors", () => {
    expect(
      resolveSafeAuthReturnPath({
        actorKind: "contractor",
        candidateNext: "/portal/jobs/1",
        fallbackPath: "/portal",
      }),
    ).toBe("/portal/jobs/1");
  });
});
