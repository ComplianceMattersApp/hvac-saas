import { describe, expect, it } from "vitest";

import {
  applyFieldIntakeScopeDefaults,
  resolveFieldIntakeScopeDefaults,
} from "@/lib/jobs/visit-scope-intake-defaults";

describe("visit-scope-intake-defaults", () => {
  it("Install quick-add maps to Installation/service/job", () => {
    expect(resolveFieldIntakeScopeDefaults("Install")).toEqual({
      item_type: "service",
      category: "Installation",
      unit_label: "job",
    });
  });

  it("Diagnostic quick-add maps to Diagnostic/service/job", () => {
    expect(resolveFieldIntakeScopeDefaults("Diagnostic")).toEqual({
      item_type: "service",
      category: "Diagnostic",
      unit_label: "job",
    });
  });

  it("Service Call quick-add maps to Service Call/service/job", () => {
    expect(resolveFieldIntakeScopeDefaults("Service Call")).toEqual({
      item_type: "service",
      category: "Service Call",
      unit_label: "job",
    });
  });

  it("custom typed scope receives General/service/job fallback", () => {
    expect(resolveFieldIntakeScopeDefaults("Custom repair scope")).toEqual({
      item_type: "service",
      category: "General",
      unit_label: "job",
    });
  });

  it("preserves provided defaults when candidate already includes values", () => {
    expect(
      applyFieldIntakeScopeDefaults({
        title: "Install",
        item_type: "service",
        category: "Custom Category",
        unit_label: "ea",
      }),
    ).toEqual({
      item_type: "service",
      category: "Custom Category",
      unit_label: "ea",
    });
  });
});
