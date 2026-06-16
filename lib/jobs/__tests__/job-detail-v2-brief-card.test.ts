import { describe, expect, it } from "vitest";

import {
  buildV2PulseJobBriefContinuityLine,
  buildV2PulseJobBriefPrimaryLine,
} from "@/lib/jobs/job-detail-v2-brief-card";

describe("V2 Pulse job brief card display", () => {
  it("renders job reason and contractor inline while removing generated city suffix", () => {
    expect(
      buildV2PulseJobBriefPrimaryLine({
        reason: "ECC alteration — Stockton",
        contractorName: "Coaches HVAC",
        city: "Stockton",
      }),
    ).toBe("ECC Alteration for Coaches HVAC");
  });

  it("renders only the cleaned job reason when contractor is unavailable", () => {
    expect(
      buildV2PulseJobBriefPrimaryLine({
        reason: "ECC alteration — Stockton",
        contractorName: null,
        city: "Stockton",
      }),
    ).toBe("ECC Alteration");
  });

  it("shows meaningful prior-visit context when available", () => {
    expect(
      buildV2PulseJobBriefContinuityLine({
        serviceCaseVisitCount: 2,
        jobType: "ecc",
        opsStatus: "failed",
      }),
    ).toBe("Last visit had a failed test");

    expect(
      buildV2PulseJobBriefContinuityLine({
        serviceCaseVisitCount: 2,
        serviceVisitOutcome: "parts_needed",
      }),
    ).toBe("Last visit needed parts");

    expect(
      buildV2PulseJobBriefContinuityLine({
        serviceCaseVisitCount: 2,
        serviceVisitOutcome: "approval_needed",
      }),
    ).toBe("Last visit needed approval");

    expect(
      buildV2PulseJobBriefContinuityLine({
        serviceCaseVisitCount: 2,
      }),
    ).toBe("1 prior visit linked");
  });

  it("omits prior-visit context when no history exists", () => {
    expect(
      buildV2PulseJobBriefContinuityLine({
        serviceCaseVisitCount: 1,
        jobType: "ecc",
        opsStatus: "scheduled",
      }),
    ).toBeNull();
  });

  it("shows linked retest context when already derived by the route", () => {
    expect(
      buildV2PulseJobBriefContinuityLine({
        serviceCaseVisitCount: 1,
        hasLinkedRetestVisit: true,
      }),
    ).toBe("Linked retest visit exists");
  });
});
