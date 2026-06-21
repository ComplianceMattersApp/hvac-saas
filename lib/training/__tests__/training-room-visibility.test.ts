import { describe, expect, it } from "vitest";
import { roleTrainingTracks } from "../training-room-content";
import {
  orderTracksForTrainingVisibility,
  resolveTrainingRoomVisibility,
} from "../training-room-visibility";

describe("training room visibility", () => {
  it("defaults tech users to field-owned training", () => {
    const visibility = resolveTrainingRoomVisibility({
      internalRole: "tech",
      productMode: "hvac_service",
      canViewFinancialRegister: false,
    });

    expect(visibility.audienceLabel).toBe("Technician / Field User");
    expect(visibility.primaryTrackIds).toEqual(["technician-field"]);
    expect(visibility.crossTrainingTrackIds).toContain("billing-ar");
    expect(visibility.crossTrainingTrackIds).toContain("owner-admin");
    expect(visibility.showRoleSelector).toBe(false);
  });

  it("defaults billing users to billing, invoice, and payment training", () => {
    const visibility = resolveTrainingRoomVisibility({
      internalRole: "billing",
      productMode: "hvac_service",
      canViewFinancialRegister: true,
    });

    expect(visibility.audienceLabel).toBe("Billing / AR");
    expect(visibility.primaryTrackIds).toEqual(["billing-ar"]);
    expect(visibility.crossTrainingTrackIds[0]).toBe("owner-admin");
  });

  it("defaults office users to office rhythm training", () => {
    const visibility = resolveTrainingRoomVisibility({
      internalRole: "office",
      productMode: "hvac_service",
      canViewFinancialRegister: false,
    });

    expect(visibility.audienceLabel).toBe("Dispatcher / Office");
    expect(visibility.primaryTrackIds).toEqual(["dispatcher-office"]);
    expect(visibility.primaryDescription).toContain("intake, scheduling, waiting follow-up, and closeout handoff");
  });

  it("lets admin and owner users browse all tracks while seeing launch and operations first", () => {
    const visibility = resolveTrainingRoomVisibility({
      internalRole: "admin",
      isAccountOwner: true,
      productMode: "hybrid",
      canViewFinancialRegister: true,
    });

    expect(visibility.audienceLabel).toBe("Owner / Admin");
    expect(visibility.primaryTrackIds).toEqual([
      "owner-admin",
      "dispatcher-office",
      "billing-ar",
      "ecc-hers",
    ]);
    expect([...visibility.primaryTrackIds, ...visibility.crossTrainingTrackIds].sort()).toEqual([
      "billing-ar",
      "dispatcher-office",
      "ecc-hers",
      "owner-admin",
      "technician-field",
    ]);
  });

  it("defaults ECC/HERS product-mode tech users to ECC/HERS training", () => {
    const visibility = resolveTrainingRoomVisibility({
      internalRole: "tech",
      productMode: "ecc_hers",
      canViewFinancialRegister: false,
    });

    expect(visibility.audienceLabel).toBe("ECC / HERS Rater");
    expect(visibility.primaryTrackIds).toEqual(["ecc-hers"]);
    expect(visibility.primaryDescription).toContain("ECC job rhythm");
  });

  it("keeps hybrid tech users on field-owned training until an ECC role signal exists", () => {
    const visibility = resolveTrainingRoomVisibility({
      internalRole: "tech",
      productMode: "hybrid",
      canViewFinancialRegister: false,
    });

    expect(visibility.audienceLabel).toBe("Technician / Field User");
    expect(visibility.primaryTrackIds).toEqual(["technician-field"]);
    expect(visibility.crossTrainingTrackIds).toContain("ecc-hers");
  });

  it("falls back safely to a role selector for ambiguous roles", () => {
    const visibility = resolveTrainingRoomVisibility({
      internalRole: null,
      productMode: "hvac_service",
      canViewFinancialRegister: false,
    });

    expect(visibility.audienceLabel).toBe("Choose your role");
    expect(visibility.primaryTrackIds).toEqual([]);
    expect(visibility.crossTrainingTrackIds).toEqual([
      "owner-admin",
      "dispatcher-office",
      "technician-field",
      "billing-ar",
      "ecc-hers",
    ]);
    expect(visibility.showRoleSelector).toBe(true);
  });

  it("keeps static cross-training tracks available for ordered rendering", () => {
    const visibility = resolveTrainingRoomVisibility({
      internalRole: "tech",
      productMode: "hvac_service",
      canViewFinancialRegister: false,
    });
    const crossTrainingTitles = orderTracksForTrainingVisibility(
      roleTrainingTracks,
      visibility.crossTrainingTrackIds,
    ).map((track) => track.title);

    expect(crossTrainingTitles).toEqual([
      "Owner / Admin",
      "Dispatcher / Office",
      "Billing / AR",
      "ECC / HERS Rater",
    ]);
  });
});
