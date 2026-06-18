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

  it("does not limit active Closeout chip rows to closeout ops_status values before projection", () => {
    expect(opsPageSource).toContain('queueQ = queueQ.neq("ops_status", "closed").eq("field_complete", true).limit(100);');
    expect(opsPageSource).not.toContain('queueQ = queueQ.neq("ops_status", "closed").in("ops_status", ["invoice_required", "paperwork_required"])');
  });
});
