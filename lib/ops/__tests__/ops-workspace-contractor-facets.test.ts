import { describe, expect, it } from "vitest";

import {
  buildContractorFocusFacet,
  filterRowsByContractorFocus,
  INTERNAL_WORK_CONTRACTOR_FOCUS_ID,
  normalizeContractorFocusIds,
} from "@/lib/ops/ops-workspace-contractor-facets";

describe("Operations workspace contractor facets", () => {
  it("normalizes repeated query values into stable unique ids", () => {
    expect(normalizeContractorFocusIds([" contractor-1,contractor-2 ", "contractor-1"])).toEqual([
      "contractor-1",
      "contractor-2",
    ]);
  });

  it("filters camel-case, database, and internal rows through one predicate", () => {
    const rows = [
      { id: "permit-1", contractorId: "contractor-1" },
      { id: "job-1", contractor_id: "contractor-2", contractors: { name: "Second" } },
      { id: "job-2", contractor_id: null },
    ];

    expect(
      filterRowsByContractorFocus(
        rows,
        new Set(["contractor-2", INTERNAL_WORK_CONTRACTOR_FOCUS_ID]),
      ).map((row) => row.id),
    ).toEqual(["job-1", "job-2"]);
  });

  it("keeps active contractors and replaces a zero-count duplicate with the queued owner id", () => {
    const facet = buildContractorFocusFacet({
      rows: [
        { contractor_id: "queued-id", contractors: { name: "Top Rank" } },
        { contractor_id: "queued-id", contractors: { name: "Top Rank" } },
        { contractor_id: null },
      ],
      activeContractors: [
        { id: "active-duplicate-id", name: "Top Rank" },
        { id: "active-id", name: "Active Only" },
      ],
      selectedIds: new Set(["queued-id"]),
      enabled: true,
    });

    expect(facet).toEqual({
      allCount: 3,
      internalCount: 1,
      options: [
        { id: "queued-id", name: "Top Rank", count: 2, selected: true },
        { id: "active-id", name: "Active Only", count: 0, selected: false },
      ],
      showFilter: true,
    });
  });

  it("does not expose the facet in product modes where contractor focus is disabled", () => {
    const facet = buildContractorFocusFacet({
      rows: [{ contractor_id: null }],
      activeContractors: [],
      selectedIds: new Set(),
      enabled: false,
    });

    expect(facet.internalCount).toBe(1);
    expect(facet.showFilter).toBe(false);
  });
});
