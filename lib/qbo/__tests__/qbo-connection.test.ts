import { beforeEach, describe, expect, it, vi } from "vitest";

const { refreshQboTokens } = vi.hoisted(() => ({ refreshQboTokens: vi.fn() }));
vi.mock("@/lib/qbo/qbo-oauth-client", () => ({ refreshQboTokens }));

import { decryptToken, encryptToken } from "@/lib/qbo/qbo-encryption";
import {
  getValidQboAccessToken,
  upsertQboConnection,
} from "@/lib/qbo/qbo-connection";

const KEY = "c".repeat(64);

function makeSupabase(row: any | null) {
  const captured: { upsert: any; update: any; updates: any[]; rpc: any } = { upsert: null, update: null, updates: [], rpc: null };
  const builder: any = {
    from: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
    upsert: vi.fn((payload: any) => {
      captured.upsert = payload;
      return Promise.resolve({ error: null });
    }),
    update: vi.fn((payload: any) => {
      captured.update = payload;
      captured.updates.push(payload);
      return builder;
    }),
    rpc: vi.fn(async (_name: string, payload: any) => {
      captured.rpc = payload;
      return { data: true, error: null };
    }),
    then: (resolve: (v: any) => void) => resolve({ data: row, error: null }),
  };
  return { builder, captured };
}

function activeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "1",
    account_owner_user_id: "acc",
    realm_id: "r1",
    access_token_encrypted: encryptToken("fresh-at"),
    refresh_token_encrypted: encryptToken("old-rt"),
    token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    environment: "sandbox",
    status: "active",
    connected_at: new Date().toISOString(),
    last_synced_at: null,
    last_sync_error: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.QBO_ENCRYPTION_KEY = KEY;
  refreshQboTokens.mockResolvedValue({
    accessToken: "new-at",
    refreshToken: "new-rt",
    expiresAt: new Date(Date.now() + 3600_000),
  });
});

describe("qbo-connection", () => {
  it("upsertQboConnection encrypts tokens before storage", async () => {
    const { builder, captured } = makeSupabase(null);
    await upsertQboConnection({
      supabase: builder,
      accountOwnerUserId: "acc",
      realmId: "r1",
      accessToken: "AT",
      refreshToken: "RT",
      expiresAt: new Date(),
      environment: "sandbox",
    });
    expect(captured.upsert.access_token_encrypted).not.toContain("AT");
    expect(captured.upsert.refresh_token_encrypted).not.toContain("RT");
    expect(decryptToken(captured.upsert.access_token_encrypted)).toBe("AT");
    expect(decryptToken(captured.upsert.refresh_token_encrypted)).toBe("RT");
    expect(captured.upsert.status).toBe("active");
  });

  it("upsertQboConnection preserves the original connected_at on reconnect", async () => {
    const original = "2026-07-14T05:25:52.000Z";
    // A prior (now disconnected) connection exists — re-authorizing must keep its
    // connected_at so the sync-start cutoff doesn't move and orphan invoices.
    const { builder, captured } = makeSupabase(activeRow({ connected_at: original, status: "disconnected" }));
    await upsertQboConnection({
      supabase: builder,
      accountOwnerUserId: "acc",
      realmId: "r1",
      accessToken: "AT2",
      refreshToken: "RT2",
      expiresAt: new Date(),
      environment: "production",
    });
    expect(captured.upsert.connected_at).toBe(original);
    expect(captured.upsert.status).toBe("active");
  });

  it("upsertQboConnection stamps connected_at on a first connect (no existing row)", async () => {
    const { builder, captured } = makeSupabase(null);
    await upsertQboConnection({
      supabase: builder,
      accountOwnerUserId: "acc",
      realmId: "r1",
      accessToken: "AT",
      refreshToken: "RT",
      expiresAt: new Date(),
      environment: "sandbox",
    });
    expect(typeof captured.upsert.connected_at).toBe("string");
    expect(captured.upsert.connected_at.length).toBeGreaterThan(0);
  });

  it("getValidQboAccessToken returns the stored token when not near expiry", async () => {
    const { builder } = makeSupabase(activeRow());
    const result = await getValidQboAccessToken({ supabase: builder, accountOwnerUserId: "acc" });
    expect(refreshQboTokens).not.toHaveBeenCalled();
    expect(result).toEqual({ accessToken: "fresh-at", realmId: "r1" });
  });

  it("getValidQboAccessToken refreshes and persists when within 5 minutes of expiry", async () => {
    const row = activeRow({
      access_token_encrypted: encryptToken("old-at"),
      token_expires_at: new Date(Date.now() + 120_000).toISOString(), // 2 min out
    });
    const { builder, captured } = makeSupabase(row);
    const result = await getValidQboAccessToken({ supabase: builder, accountOwnerUserId: "acc" });
    expect(refreshQboTokens).toHaveBeenCalledWith("old-rt");
    expect(result).toEqual({ accessToken: "new-at", realmId: "r1" });
    expect(captured.update.access_token_encrypted).toBeDefined();
    expect(decryptToken(captured.update.access_token_encrypted)).toBe("new-at");
    expect(decryptToken(captured.update.refresh_token_encrypted)).toBe("new-rt");
    expect(captured.rpc).toMatchObject({ p_account_owner_user_id: "acc", p_lease_seconds: 30 });
    expect(captured.update.refresh_lease_id).toBeNull();
  });

  it("marks the connection for reauthorization when Intuit rejects the refresh token", async () => {
    refreshQboTokens.mockRejectedValueOnce(new Error("The Refresh token is invalid, please Authorize again."));
    const { builder, captured } = makeSupabase(activeRow({
      token_expires_at: new Date(Date.now() + 120_000).toISOString(),
    }));
    await expect(getValidQboAccessToken({ supabase: builder, accountOwnerUserId: "acc" }))
      .rejects.toThrow("Authorize again");
    expect(captured.updates).toContainEqual(expect.objectContaining({
      status: "error",
      refresh_lease_id: null,
      last_sync_error: expect.stringContaining("Reconnect QuickBooks"),
    }));
  });

  it("does not reuse a refresh token when another request owns the refresh lease", async () => {
    const expired = activeRow({ token_expires_at: new Date(Date.now() + 120_000).toISOString() });
    const refreshed = activeRow({
      access_token_encrypted: encryptToken("other-request-at"),
      refresh_token_encrypted: encryptToken("other-request-rt"),
      token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
    let reads = 0;
    const builder: any = {
      from: vi.fn(() => builder), select: vi.fn(() => builder), eq: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({ data: reads++ === 0 ? expired : refreshed, error: null })),
      rpc: vi.fn(async () => ({ data: false, error: null })),
    };
    const result = await getValidQboAccessToken({ supabase: builder, accountOwnerUserId: "acc" });
    expect(result).toEqual({ accessToken: "other-request-at", realmId: "r1" });
    expect(refreshQboTokens).not.toHaveBeenCalled();
  });

  it("getValidQboAccessToken returns null when there is no active connection", async () => {
    const { builder } = makeSupabase(null);
    const result = await getValidQboAccessToken({ supabase: builder, accountOwnerUserId: "acc" });
    expect(result).toBeNull();
  });
});
