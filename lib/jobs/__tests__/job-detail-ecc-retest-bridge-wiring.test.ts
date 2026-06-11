import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const jobDetailSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf-8",
);

const serviceChainSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/_components/DeferredServiceChainPanelBody.tsx"),
  "utf-8",
);

describe("job detail ECC retest bridge wiring", () => {
  it("wires confirmed Retest Ready before moving a linked retest to scheduling", () => {
    expect(jobDetailSource).toContain("confirmEccRetestReadyFromForm");
    expect(jobDetailSource).toContain("Confirm Retest Ready");
    expect(jobDetailSource).toContain("Retest Ready");
    expect(jobDetailSource).toContain("Creates a linked retest job and places it in the scheduling queue.");
    expect(jobDetailSource).toContain("Move to Needs Scheduling");
    expect(jobDetailSource).toContain('id="next-service-action"');
    expect(jobDetailSource).not.toContain(">Create Retest Job<");
  });

  it("shows continued parents as passive once a linked retest child exists", () => {
    expect(jobDetailSource).toContain("showLinkedRetestCreated");
    expect(jobDetailSource).toContain("Linked Retest Created");
    expect(jobDetailSource).toContain("Open Linked Retest");
    expect(serviceChainSource).toContain("retestParentIdsWithActiveChild");
    expect(serviceChainSource).toContain("Linked Retest Created");
  });
});
