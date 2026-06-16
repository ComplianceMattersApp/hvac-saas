import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const jobPageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf8",
);

function sourceBetween(start: string, end: string) {
  const startIndex = jobPageSource.indexOf(start);
  const endIndex = jobPageSource.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return jobPageSource.slice(startIndex, endIndex);
}

describe("job detail V2 Pulse duplicate display cleanup", () => {
  it("keeps assigned techs in the hero chip row and removes field status", () => {
    const heroChipSource = sourceBetween("const pulseHeroChips: PulseHeroChip[] = [", "const pulseHeroContent");

    expect(heroChipSource).toContain("label: pulseAssignedTechChip.label");
    expect(heroChipSource).toContain("value: pulseAssignedTechChip.value");
    expect(heroChipSource).toContain("extraCount: pulseAssignedTechChip.extraCount");
    expect(heroChipSource).toContain("tooltip: pulseAssignedTechChip.tooltip");
    expect(heroChipSource).not.toContain('label: "Field Status"');
    expect(heroChipSource).not.toContain('value: isFieldComplete ? "Field Complete" : formatStatus(job.status)');
  });

  it("keeps assignment visible in the top strip and removes the People card assigned-tech block", () => {
    const statusStripSource = sourceBetween("const pulseStatusStripItems: PulseStatusItem[] = [", "const pulseStageState");
    const peopleCardSource = sourceBetween('data-v2-zone="pulse-people-card"', "const pulseWorkToPerformModel");

    expect(statusStripSource).toContain('label: "Assigned Team"');
    expect(statusStripSource).toContain("value: pulseAssignedTeamValue");
    expect(peopleCardSource).not.toContain("Assigned Techs");
    expect(peopleCardSource).not.toContain("pulsePeopleCardModel.assignedTechs");
  });
});
