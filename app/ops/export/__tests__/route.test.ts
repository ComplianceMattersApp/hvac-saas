import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getRequestActorContextMock = vi.fn();
const buildOpsQueueExportMock = vi.fn();

vi.mock("@/lib/auth/request-actor-context", () => ({
  getRequestActorContext: () => getRequestActorContextMock(),
}));

vi.mock("@/lib/ops/ops-queue-export", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ops/ops-queue-export")>("@/lib/ops/ops-queue-export");
  return {
    ...actual,
    buildOpsQueueExport: (...args: unknown[]) => buildOpsQueueExportMock(...args),
  };
});

function req(url: string) {
  return new NextRequest(url);
}

describe("ops export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildOpsQueueExportMock.mockResolvedValue({ ok: true, csv: "Queue\r\nNeeds Scheduling" });
  });

  it("redirects unauthenticated users to login", async () => {
    getRequestActorContextMock.mockResolvedValue({
      user: null,
      kind: "unauthenticated",
      internalUser: null,
      supabase: {},
    });

    const { GET } = await import("../route");
    const response = await GET(req("https://example.test/ops/export?queue=waiting"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.test/login");
    expect(buildOpsQueueExportMock).not.toHaveBeenCalled();
  });

  it("redirects contractor users to portal", async () => {
    getRequestActorContextMock.mockResolvedValue({
      user: { id: "user-1" },
      kind: "contractor",
      internalUser: null,
      supabase: {},
    });

    const { GET } = await import("../route");
    const response = await GET(req("https://example.test/ops/export?queue=waiting"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.test/portal");
    expect(buildOpsQueueExportMock).not.toHaveBeenCalled();
  });

  it("returns CSV for internal users with mirrored filters", async () => {
    const supabase = {};
    getRequestActorContextMock.mockResolvedValue({
      user: { id: "user-1" },
      kind: "internal",
      internalUser: { account_owner_user_id: "owner-1" },
      supabase,
    });

    const { GET } = await import("../route");
    const response = await GET(
      req("https://example.test/ops/export?bucket=waiting&contractor=contractor-1&reason=waiting_on_parts&sort=newest&mode=contractor_safe"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain("ops-waiting-pending-info-contractor-safe");
    expect(buildOpsQueueExportMock).toHaveBeenCalledWith({
      supabase,
      accountOwnerUserId: "owner-1",
      mode: "contractor_safe",
      queueKey: "waiting",
      contractorId: "contractor-1",
      reason: "waiting_on_parts",
      sort: "newest",
    });
  });
});
