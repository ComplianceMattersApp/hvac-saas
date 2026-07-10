import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireInternalRole = vi.fn(async () => ({
  userId: "u1",
  internalUser: { account_owner_user_id: "acc", role: "admin" },
}));
vi.mock("@/lib/auth/internal-user", () => ({ requireInternalRole }));

const createClient = vi.fn(async () => ({}));
const createAdminClient = vi.fn(() => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient, createAdminClient }));

const exchangeQboAuthCode = vi.fn(async () => ({
  accessToken: "at",
  refreshToken: "rt",
  realmId: "realm-1",
  expiresAt: new Date(Date.now() + 3600_000),
}));
vi.mock("@/lib/qbo/qbo-oauth-client", () => ({ exchangeQboAuthCode }));

const upsertQboConnection = vi.fn(async () => {});
vi.mock("@/lib/qbo/qbo-connection", () => ({ upsertQboConnection }));

function makeRequest(params: { code?: string; state?: string; cookieState?: string }) {
  const url = new URL("https://app.example.com/api/qbo/callback");
  if (params.code) url.searchParams.set("code", params.code);
  if (params.state) url.searchParams.set("state", params.state);
  url.searchParams.set("realmId", "realm-1");
  const headers: Record<string, string> = {};
  if (params.cookieState) headers.cookie = `qbo_oauth_state=${params.cookieState}`;
  return new NextRequest(url, { headers });
}

async function callGet(request: NextRequest) {
  const { GET } = await import("@/app/api/qbo/callback/route");
  return GET(request);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/qbo/callback", () => {
  it("exchanges the code and upserts the connection on a valid callback", async () => {
    const response = await callGet(
      makeRequest({ code: "abc", state: "STATE123", cookieState: "STATE123" }),
    );
    expect(exchangeQboAuthCode).toHaveBeenCalledTimes(1);
    expect(upsertQboConnection).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerUserId: "acc", realmId: "realm-1" }),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("notice=qbo_connected");
  });

  it("redirects to failure when the state does not match the cookie", async () => {
    const response = await callGet(
      makeRequest({ code: "abc", state: "STATE123", cookieState: "OTHER" }),
    );
    expect(upsertQboConnection).not.toHaveBeenCalled();
    expect(exchangeQboAuthCode).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("notice=qbo_connect_failed");
  });

  it("redirects to failure when the code is missing", async () => {
    const response = await callGet(
      makeRequest({ state: "STATE123", cookieState: "STATE123" }),
    );
    expect(exchangeQboAuthCode).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("notice=qbo_connect_failed");
  });

  it("clears the state cookie on the response", async () => {
    const response = await callGet(
      makeRequest({ code: "abc", state: "STATE123", cookieState: "STATE123" }),
    );
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("qbo_oauth_state=");
  });
});
