import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deliverAttentionSnapshotEmail = vi.fn();
const inMock = vi.fn();
const createAdminClient = vi.fn(() => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        in: (...args: unknown[]) => inMock(...args),
      }),
    }),
  }),
}));

vi.mock("@/lib/reports/attention-email-delivery", () => ({
  deliverAttentionSnapshotEmail: (...args: unknown[]) => deliverAttentionSnapshotEmail(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: (...args: unknown[]) => createAdminClient(...args),
}));

async function getAttentionEmail(authHeader?: string) {
  const { GET } = await import("@/app/api/cron/attention-email/route");
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("authorization", authHeader);
  return GET(new Request("http://localhost/api/cron/attention-email", { headers }));
}

describe("GET /api/cron/attention-email — cron auth guard + owner fan-out", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "cron-secret-1");
    inMock.mockResolvedValue({ data: [], error: null });
    deliverAttentionSnapshotEmail.mockResolvedValue({ sent: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 and never enumerates accounts when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const res = await getAttentionEmail("Bearer cron-secret-1");

    expect(res.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(deliverAttentionSnapshotEmail).not.toHaveBeenCalled();
  });

  it("returns 401 when the Authorization header does not match the secret", async () => {
    const res = await getAttentionEmail("Bearer nope");

    expect(res.status).toBe(401);
    expect(deliverAttentionSnapshotEmail).not.toHaveBeenCalled();
  });

  it("returns 500 without sending when the account enumeration query fails", async () => {
    inMock.mockResolvedValue({ data: null, error: { message: "db down" } });

    const res = await getAttentionEmail("Bearer cron-secret-1");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/enumerate/i);
    expect(deliverAttentionSnapshotEmail).not.toHaveBeenCalled();
  });

  it("dedupes account owners, delivers one snapshot each, and counts only the sent ones", async () => {
    inMock.mockResolvedValue({
      data: [
        { account_owner_user_id: "owner-1" },
        { account_owner_user_id: "owner-1" }, // duplicate (e.g. two internal users on the same account)
        { account_owner_user_id: "owner-2" },
        { account_owner_user_id: "  " }, // blank -> filtered out
      ],
      error: null,
    });
    deliverAttentionSnapshotEmail
      .mockResolvedValueOnce({ sent: true }) // owner-1
      .mockResolvedValueOnce({ sent: false }); // owner-2 (e.g. nothing needing attention)

    const res = await getAttentionEmail("Bearer cron-secret-1");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checked).toBe(2);
    expect(body.sent).toBe(1);

    expect(deliverAttentionSnapshotEmail).toHaveBeenCalledTimes(2);
    const owners = deliverAttentionSnapshotEmail.mock.calls.map(
      ([arg]) => (arg as { accountOwnerUserId: string }).accountOwnerUserId,
    );
    expect(owners).toEqual(["owner-1", "owner-2"]);
  });
});
