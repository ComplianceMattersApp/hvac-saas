import { describe, expect, it } from "vitest";

import { buildEstimateDraftCreatePayload } from "@/lib/estimates/estimate-new-entry";

describe("buildEstimateDraftCreatePayload", () => {
  it("passes required fields and optional origin context", () => {
    const payload = buildEstimateDraftCreatePayload({
      customerId: "11111111-1111-4111-8111-111111111111",
      locationId: "22222222-2222-4222-8222-222222222222",
      title: "Job-context estimate",
      notes: "Testing",
      originJobId: "33333333-3333-4333-8333-333333333333",
      serviceCaseId: "44444444-4444-4444-8444-444444444444",
    });

    expect(payload).toEqual({
      customerId: "11111111-1111-4111-8111-111111111111",
      locationId: "22222222-2222-4222-8222-222222222222",
      title: "Job-context estimate",
      notes: "Testing",
      originJobId: "33333333-3333-4333-8333-333333333333",
      serviceCaseId: "44444444-4444-4444-8444-444444444444",
    });
  });

  it("normalizes empty optional origin fields to null", () => {
    const payload = buildEstimateDraftCreatePayload({
      customerId: "11111111-1111-4111-8111-111111111111",
      locationId: "22222222-2222-4222-8222-222222222222",
      title: "Job-context estimate",
      notes: null,
      originJobId: "  ",
      serviceCaseId: "",
    });

    expect(payload.originJobId).toBeNull();
    expect(payload.serviceCaseId).toBeNull();
  });
});
