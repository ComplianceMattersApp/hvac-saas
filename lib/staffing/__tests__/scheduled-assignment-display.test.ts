import { describe, expect, it } from "vitest";

import { summarizeScheduledAssignmentDisplay } from "@/lib/staffing/scheduled-assignment-display";

describe("summarizeScheduledAssignmentDisplay", () => {
  it("returns no-tech label when no assignments exist", () => {
    const result = summarizeScheduledAssignmentDisplay([]);

    expect(result).toEqual({
      text: "No tech assigned",
      isUnassigned: true,
    });
  });

  it("returns primary assigned tech label for one assignment", () => {
    const result = summarizeScheduledAssignmentDisplay([
      { display_name: "Eddie Smith", is_primary: true },
    ]);

    expect(result).toEqual({
      text: "Assigned: Eddie Smith",
      isUnassigned: false,
    });
  });

  it("returns compact summary for multiple assignments", () => {
    const result = summarizeScheduledAssignmentDisplay([
      { display_name: "Eddie Smith", is_primary: true },
      { display_name: "Alex Rivera", is_primary: false },
      { display_name: "Sam Lee", is_primary: false },
    ]);

    expect(result).toEqual({
      text: "Assigned: Eddie Smith + 2",
      isUnassigned: false,
    });
  });
});
