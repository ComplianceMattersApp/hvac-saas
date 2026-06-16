import { describe, expect, it } from "vitest";

import { buildV2PulseWorkToPerformCardModel } from "@/lib/jobs/job-detail-v2-work-card";

describe("V2 Pulse work to perform card display", () => {
  it("shows structured work item count and first three item labels", () => {
    const model = buildV2PulseWorkToPerformCardModel({
      summary: "Requested work",
      items: [
        { title: "Diagnose airflow issue", details: "Main hallway return", kind: "primary" },
        { title: "Inspect blower motor", details: null, kind: "primary" },
        { title: "Verify compressor amps", details: null, kind: "primary" },
        { title: "Replace filter", details: null, kind: "primary" },
      ],
    });

    expect(model.mode).toBe("items");
    expect(model.title).toBe("4 work items");
    expect(model.body).toBe("Requested work");
    expect(model.previewItems.map((item) => item.title)).toEqual([
      "Diagnose airflow issue",
      "Inspect blower motor",
      "Verify compressor amps",
    ]);
    expect(model.remainingCount).toBe(1);
  });

  it("uses a text-only visit scope summary when no structured work items exist", () => {
    const model = buildV2PulseWorkToPerformCardModel({
      summary: "Inspect existing unit and document required return work.",
      items: [],
    });

    expect(model.mode).toBe("summary");
    expect(model.title).toBe("Visit scope");
    expect(model.body).toBe("Inspect existing unit and document required return work.");
  });

  it("shows a neutral empty state when no scope exists", () => {
    const model = buildV2PulseWorkToPerformCardModel({
      summary: "",
      items: [],
    });

    expect(model.mode).toBe("empty");
    expect(model.title).toBe("No work scope recorded.");
    expect(model.emptyText).toBe("No work scope recorded.");
  });

  it("falls back to companion service items when no primary items exist", () => {
    const model = buildV2PulseWorkToPerformCardModel({
      summary: null,
      items: [
        { title: "Duct cleaning follow-up", details: null, kind: "companion_service" },
      ],
    });

    expect(model.mode).toBe("items");
    expect(model.title).toBe("1 work item");
    expect(model.previewItems[0]?.title).toBe("Duct cleaning follow-up");
  });
});
