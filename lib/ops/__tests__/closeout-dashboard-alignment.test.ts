import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const opsPageSource = readFileSync(
  resolve(__dirname, "../../../app/ops/page.tsx"),
  "utf-8",
);

describe("/ops closeout queue alignment", () => {
  it("uses canonical closeout helper for dashboard closeout panel list", () => {
    expect(opsPageSource).toContain("listCloseoutQueueJobs(closeoutSourceJobs ?? [], getCloseoutProjection)");
  });

  it("keeps dedicated ops queues closeout bucket filter path intact", () => {
    expect(opsPageSource).toContain('bucket === "closeout"');
    expect(opsPageSource).toContain('(bucketJobs ?? []).filter((j: any) => isInCloseoutQueue(getCloseoutProjection(j)))');
  });

  it("aligns closeout source query with queue semantics", () => {
    expect(opsPageSource).toContain('.eq("field_complete", true)');
    expect(opsPageSource).toContain('.neq("ops_status", "closed")');
    expect(opsPageSource).toContain('.order("created_at", { ascending: false })');
  });

  it("keeps active Closeout chip rows status-shaped with a narrow permit exception", () => {
    expect(opsPageSource).toContain('.in("ops_status", ["invoice_required", "paperwork_required"])');
    expect(opsPageSource).toContain('.in("ops_status", ["pending_info", "on_hold"])');
    expect(opsPageSource).toContain('.or("pending_info_reason.ilike.%permit%,on_hold_reason.ilike.%permit%")');
    expect(opsPageSource).not.toContain('queueQ = queueQ.neq("ops_status", "closed").eq("field_complete", true).limit(100);');
  });
});
