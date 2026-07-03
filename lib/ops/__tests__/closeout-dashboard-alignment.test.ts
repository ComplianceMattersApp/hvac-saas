import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
  "utf-8",
);

describe("/ops closeout queue alignment", () => {
  it("aligns closeout source query with status-invariant queue semantics", () => {
    expect(opsPageSource).toContain('.eq("field_complete", true)');
    expect(opsPageSource).toContain('.order("created_at", { ascending: false })');
    expect(opsPageSource).toContain("Invoice-needed closeout is status-invariant.");
  });

  it("does not narrow Closeout chip rows to status-shaped or permit-only candidates", () => {
    expect(opsPageSource).not.toContain('.in("ops_status", ["invoice_required", "paperwork_required"])');
    expect(opsPageSource).not.toContain('.or("pending_info_reason.ilike.%permit%,on_hold_reason.ilike.%permit%")');
    expect(opsPageSource).toContain("listCloseoutQueueJobs(");
  });
});
