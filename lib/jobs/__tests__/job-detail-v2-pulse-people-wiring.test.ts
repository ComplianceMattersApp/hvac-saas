import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const jobPageSource = readFileSync(
  resolve(__dirname, "../../../app/jobs/[id]/page.tsx"),
  "utf8",
);
const peopleCardSourceModel = readFileSync(
  resolve(__dirname, "../job-detail-v2-people-card.ts"),
  "utf8",
);

describe("job detail V2 Pulse people card wiring", () => {
  it("uses the V2 Pulse people read model for the operational People card", () => {
    expect(jobPageSource).toContain('import { buildV2PulsePeopleCardModel } from "@/lib/jobs/job-detail-v2-people-card";');
    expect(jobPageSource).toContain("const pulsePeopleCardModel = buildV2PulsePeopleCardModel({");
    expect(jobPageSource).toContain("customerName: customerDisplayName,");
    expect(jobPageSource).toContain("roleContacts: allRoleContacts,");
    expect(jobPageSource).toContain("pulsePeopleCardContent={pulsePeopleCardContent}");
    expect(jobPageSource).toContain('data-v2-zone="pulse-people-card"');
  });

  it("removes mock people/contact copy and keeps the card read-only", () => {
    const peopleCardStart = jobPageSource.indexOf('data-v2-zone="pulse-people-card"');
    const workCardStart = jobPageSource.indexOf('data-v2-zone="pulse-work-to-perform-card"');
    const peopleCardSource = jobPageSource.slice(peopleCardStart, workCardStart);

    expect(jobPageSource).not.toContain("Jim Williams, Facilities Manager");
    expect(peopleCardSource).not.toContain("View all");
    expect(peopleCardSourceModel).toContain("No contacts recorded.");
    expect(peopleCardSource).not.toContain("Assigned Techs");
    expect(peopleCardSource).not.toContain("pulsePeopleCardModel.assignedTechs");
    expect(jobPageSource).not.toContain("Assigned Lead");
    expect(jobPageSource).not.toContain("Team Lead");
  });

  it("does not move assignment or contact logging actions into the Pulse people card", () => {
    const peopleCardStart = jobPageSource.indexOf('data-v2-zone="pulse-people-card"');
    const workCardStart = jobPageSource.indexOf('data-v2-zone="pulse-work-to-perform-card"');
    const peopleCardSource = jobPageSource.slice(peopleCardStart, workCardStart);

    expect(peopleCardSource).not.toContain("ContactLoggingQuickActions");
    expect(peopleCardSource).not.toContain("setPrimaryJobAssigneeFromForm");
    expect(peopleCardSource).not.toContain("removeJobAssigneeFromForm");
    expect(peopleCardSource).not.toContain("DeferredAddAssigneeForm");
    expect(peopleCardSource).not.toContain("<form");
  });
});
