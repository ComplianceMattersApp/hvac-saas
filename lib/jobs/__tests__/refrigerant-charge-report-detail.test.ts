import { describe, expect, it } from "vitest";

import { hasMeaningfulRefrigerantChargeDetail } from "@/lib/jobs/refrigerant-charge-report-detail";

describe("refrigerant charge report detail predicate", () => {
  it("treats empty and placeholder-only refrigerant detail as not meaningful", () => {
    expect(
      hasMeaningfulRefrigerantChargeDetail({
        data: {
          lowest_return_air_db_f: null,
          condenser_air_entering_db_f: "",
          liquid_line_temp_f: "\u2014",
          liquid_line_pressure_psig: "-",
          outdoor_temp_f: "Unknown",
        },
        computed: {
          measured_subcool_f: "",
          measured_superheat_f: null,
        },
      }),
    ).toBe(false);
  });

  it("does not treat photo-only status as meaningful structured detail", () => {
    expect(
      hasMeaningfulRefrigerantChargeDetail({
        data: { verification_method: "photo_taken" },
        computed: { status: "photo_evidence" },
      }),
    ).toBe(false);
  });

  it("treats real structured refrigerant measurements as meaningful", () => {
    expect(
      hasMeaningfulRefrigerantChargeDetail({
        data: {
          lowest_return_air_db_f: 72,
          liquid_line_pressure_psig: "318",
        },
        computed: {
          measured_subcool_f: 9.5,
        },
      }),
    ).toBe(true);
  });

  it("treats exception and failure details as meaningful report detail", () => {
    expect(
      hasMeaningfulRefrigerantChargeDetail({
        data: { charge_exempt_reason: "conditions_not_met" },
        computed: {},
      }),
    ).toBe(true);

    expect(
      hasMeaningfulRefrigerantChargeDetail({
        data: {},
        computed: { failures: ["subcool outside allowed tolerance"] },
      }),
    ).toBe(true);
  });
});
