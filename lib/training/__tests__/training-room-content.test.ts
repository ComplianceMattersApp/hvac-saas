import { describe, expect, it } from "vitest";
import { firstJobMissionSteps, roleTrainingTracks } from "../training-room-content";

describe("training room content", () => {
  it("defines the first job mission in workflow order", () => {
    expect(firstJobMissionSteps.map((step) => step.step)).toEqual([
      "Create first customer",
      "Create first job",
      "Schedule and assign",
      "Open job",
      "Capture notes/photos/context",
      "Finish outcome",
      "Closeout",
      "Invoice",
      "Tomorrow's Ops Review",
    ]);

    expect(firstJobMissionSteps.find((step) => step.step === "Finish outcome")?.description).toContain(
      "Work Completed, Materials Needed, Approval Needed, or Other",
    );
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
