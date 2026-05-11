import { describe, expect, it } from "vitest";

import {
  resolveEstimateNewInitialSelection,
  resolveEstimateNewPrefillQuery,
} from "@/lib/estimates/estimate-new-entry";

describe("resolveEstimateNewPrefillQuery", () => {
  it("accepts valid UUID query params", () => {
    const result = resolveEstimateNewPrefillQuery({
      customer_id: "11111111-1111-4111-8111-111111111111",
      location_id: "22222222-2222-4222-8222-222222222222",
      origin_job_id: "33333333-3333-4333-8333-333333333333",
      service_case_id: "44444444-4444-4444-8444-444444444444",
    });

    expect(result).toEqual({
      customerId: "11111111-1111-4111-8111-111111111111",
      locationId: "22222222-2222-4222-8222-222222222222",
      originJobId: "33333333-3333-4333-8333-333333333333",
      serviceCaseId: "44444444-4444-4444-8444-444444444444",
    });
  });

  it("fails closed for invalid, missing, or array params", () => {
    const result = resolveEstimateNewPrefillQuery({
      customer_id: "not-a-uuid",
      location_id: ["22222222-2222-4222-8222-222222222222"],
      origin_job_id: "",
      service_case_id: undefined,
    });

    expect(result).toEqual({
      customerId: "",
      locationId: "",
      originJobId: "",
      serviceCaseId: "",
    });
  });
});

describe("resolveEstimateNewInitialSelection", () => {
  const customers = [
    { id: "11111111-1111-4111-8111-111111111111" },
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  ];

  const locations = [
    {
      id: "22222222-2222-4222-8222-222222222222",
      customer_id: "11111111-1111-4111-8111-111111111111",
    },
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      customer_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    },
  ];

  it("keeps matching customer/location selection", () => {
    const result = resolveEstimateNewInitialSelection({
      requestedCustomerId: "11111111-1111-4111-8111-111111111111",
      requestedLocationId: "22222222-2222-4222-8222-222222222222",
      customers,
      locations,
    });

    expect(result).toEqual({
      initialCustomerId: "11111111-1111-4111-8111-111111111111",
      initialLocationId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("derives customer from location when customer is missing", () => {
    const result = resolveEstimateNewInitialSelection({
      requestedCustomerId: "",
      requestedLocationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      customers,
      locations,
    });

    expect(result).toEqual({
      initialCustomerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      initialLocationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
  });

  it("drops mismatched location safely", () => {
    const result = resolveEstimateNewInitialSelection({
      requestedCustomerId: "11111111-1111-4111-8111-111111111111",
      requestedLocationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      customers,
      locations,
    });

    expect(result).toEqual({
      initialCustomerId: "11111111-1111-4111-8111-111111111111",
      initialLocationId: "",
    });
  });
});
