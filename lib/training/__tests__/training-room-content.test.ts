import { describe, expect, it } from "vitest";
import { firstJobMissionSteps, roleTrainingTracks } from "../training-room-content";

describe("training room content", () => {
  it("defines the first job mission in workflow order", () => {
    expect(firstJobMissionSteps.map((step) => step.step)).toEqual([
      "Today: Understand Your Day",
      "Intake & Schedule",
      "Field Work",
      "Finish Outcome",
      "Closeout Operations",
      "Tomorrow's Ops Review",
    ]);

    expect(firstJobMissionSteps.find((step) => step.step === "Finish Outcome")?.description).toContain(
      "Work Completed, Materials/Parts Needed, Approval Needed, or Unable to Complete",
    );
  });

  it("uses honest first job mission links and record-context references", () => {
    const today = firstJobMissionSteps.find((step) => step.step === "Today: Understand Your Day");
    const intake = firstJobMissionSteps.find((step) => step.step === "Intake & Schedule");
    const fieldWork = firstJobMissionSteps.find((step) => step.step === "Field Work");
    const finish = firstJobMissionSteps.find((step) => step.step === "Finish Outcome");
    const closeout = firstJobMissionSteps.find((step) => step.step === "Closeout Operations");
    const tomorrow = firstJobMissionSteps.find((step) => step.step === "Tomorrow's Ops Review");

    expect(today?.hrefs).toEqual([{ label: "Open Today", href: "/today" }]);
    expect(today?.description).toContain("before the day begins");

    expect(intake?.hrefs).toEqual([{ label: "Start job intake", href: "/jobs/new" }]);
    expect(intake?.note).toContain("add a customer separately");

    expect(fieldWork?.hrefs).toEqual([
      { label: "Open My Work", href: "/ops/field" },
      { label: "Open Ops Queue", href: "/ops" },
    ]);
    expect(fieldWork?.whereThisHappens).toBe("Inside the job page after the job exists.");

    expect(finish?.hrefs).toEqual([]);
    expect(finish?.whereThisHappens).toBe("Inside the active job page.");

    expect(closeout?.hrefs).toEqual([{ label: "Open Operations", href: "/ops" }]);
    expect(closeout?.description).toContain("billing handoff");
    expect(closeout?.whereThisHappens).toContain("invoice/payment work");

    expect(tomorrow?.hrefs).toEqual([
      { label: "Open Today", href: "/today" },
      { label: "Open Operations", href: "/ops" },
    ]);

    const allHrefs = firstJobMissionSteps.flatMap((step) => step.hrefs.map((link) => link.href));
    expect(allHrefs).not.toContain("/jobs/[id]");
    expect(allHrefs).not.toContain("/jobs/[id]/invoice");
  });

  it("organizes training by responsibility instead of feature module", () => {
    expect(roleTrainingTracks.map((track) => track.title)).toEqual([
      "Owner / Admin",
      "Dispatcher / Office",
      "Technician / Field User",
      "Billing / AR",
      "ECC / HERS Rater",
    ]);

    for (const track of roleTrainingTracks) {
      expect(track.whatYouDo.length).toBeGreaterThan(0);
      expect(track.whatToUnderstand.length).toBeGreaterThan(0);
      expect(track.notYourResponsibility.length).toBeGreaterThan(0);
    }
  });

  it("keeps technician, billing, and ECC responsibilities separate", () => {
    const technician = roleTrainingTracks.find((track) => track.id === "technician-field");
    const billing = roleTrainingTracks.find((track) => track.id === "billing-ar");
    const ecc = roleTrainingTracks.find((track) => track.id === "ecc-hers");

    expect(technician?.missions).not.toContain("Payment Review");
    expect(technician?.notYourResponsibility.join(" ")).toContain("online payment setup");
    expect(technician?.notYourResponsibility.join(" ")).toContain("team permissions");
    expect(technician?.notYourResponsibility.join(" ")).toContain("financial registers");

    expect(billing?.missions).toContain("Payment Review");
    expect(billing?.whatToUnderstand.join(" ")).toContain("separate from field visit completion");

    expect(ecc?.missions).toContain("ECC/HERS Rhythm");
    expect(ecc?.missions).toContain("Cert Closeout");
    expect(ecc?.whatToUnderstand.join(" ")).toContain("ECC test truth");
    expect(ecc?.whatToUnderstand.join(" ")).toContain("Invoice payment does not clear ECC");
  });
});
