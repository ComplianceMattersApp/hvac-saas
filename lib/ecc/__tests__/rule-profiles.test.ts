import { describe, expect, it } from "vitest";

import { getThresholdRuleForTest, normalizeProjectTypeToRuleProfile } from "@/lib/ecc/rule-profiles";

describe("rule-profiles airflow threshold normalization", () => {
  it("maps airflow threshold to 350 CFM/ton for new-prescriptive aliases", () => {
    const aliases = ["all_new", "allnew", "new", "new_prescriptive"];

    for (const alias of aliases) {
      const profile = normalizeProjectTypeToRuleProfile(alias);
      const threshold = getThresholdRuleForTest(alias, "airflow");

      expect(profile).toBe("new_prescriptive");
      expect(threshold?.unit).toBe("cfm_per_ton");
      expect(threshold?.targetValue).toBe(350);
    }
  });

  it("keeps alteration airflow threshold at 300 CFM/ton", () => {
    const threshold = getThresholdRuleForTest("alteration", "airflow");

    expect(normalizeProjectTypeToRuleProfile("alteration")).toBe("alteration");
    expect(threshold?.unit).toBe("cfm_per_ton");
    expect(threshold?.targetValue).toBe(300);
  });
});
