import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const trainingPageSource = readFileSync(resolve(__dirname, "../../../app/training/page.tsx"), "utf8");

describe("training room page", () => {
  it("renders a static training route with the first job mission and role tracks", () => {
    expect(trainingPageSource).toContain("Training Room");
    expect(trainingPageSource).toContain("Run Your First Job");
    expect(trainingPageSource).toContain("visibility.primaryHeading");
    expect(trainingPageSource).toContain("visibility.primaryDescription");
    expect(trainingPageSource).toContain("Available if you help with this");
    expect(trainingPageSource).toContain("firstJobMissionSteps.map");
    expect(trainingPageSource).toContain("resolveTrainingRoomVisibility");
    expect(trainingPageSource).toContain("orderTracksForTrainingVisibility");
  });

  it("keeps internal access checks without adding durable training tracking", () => {
    expect(trainingPageSource).toContain("resolveDualContextAccess");
    expect(trainingPageSource).toContain('redirect("/login")');
    expect(trainingPageSource).toContain('redirect("/portal")');

    expect(trainingPageSource).not.toContain(".insert(");
    expect(trainingPageSource).not.toContain(".upsert(");
    expect(trainingPageSource).not.toContain(".update(");
    expect(trainingPageSource).not.toContain("service_role");
    expect(trainingPageSource).not.toContain("training_progress");
  });
});
