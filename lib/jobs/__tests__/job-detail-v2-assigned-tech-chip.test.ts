import { describe, expect, it } from "vitest";

import { buildV2PulseAssignedTechChip } from "@/lib/jobs/job-detail-v2-assigned-tech-chip";

describe("V2 Pulse assigned tech hero chip", () => {
  it("shows one assigned user without +N or tooltip", () => {
    const chip = buildV2PulseAssignedTechChip([
      { job_id: "job-1", user_id: "user-1", display_name: "Ecc Account", is_primary: false, created_at: "" },
    ]);

    expect(chip).toEqual({
      label: "Assigned Techs",
      value: "Ecc Account",
      extraCount: undefined,
      tooltip: undefined,
    });
  });

  it("shows first assigned user plus +N and full assigned list tooltip", () => {
    const chip = buildV2PulseAssignedTechChip([
      { job_id: "job-1", user_id: "user-1", display_name: "Ecc Account", is_primary: false, created_at: "" },
      { job_id: "job-1", user_id: "user-2", display_name: "Jane Tech", is_primary: false, created_at: "" },
      { job_id: "job-1", user_id: "user-3", display_name: "Sam Field", is_primary: false, created_at: "" },
    ]);

    expect(chip.value).toBe("Ecc Account");
    expect(chip.extraCount).toBe(2);
    expect(chip.tooltip).toBe("Ecc Account, Jane Tech, Sam Field");
  });

  it("shows assignment fallback without +N or tooltip when nobody is assigned", () => {
    const chip = buildV2PulseAssignedTechChip([]);

    expect(chip).toEqual({
      label: "Assigned Techs",
      value: "Awaiting assignment",
      extraCount: undefined,
      tooltip: undefined,
    });
  });
});
