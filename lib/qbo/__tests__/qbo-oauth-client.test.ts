import { beforeEach, describe, expect, it, vi } from "vitest";

const authorizeUri = vi.fn(
  () => "https://appcenter.intuit.com/connect/oauth2?scope=accounting&state=STATE123",
);
const createToken = vi.fn(async () => ({
  getJson: () => ({
    access_token: "at",
    refresh_token: "rt",
    realmId: "realm-1",
    expires_in: 3600,
  }),
}));
const refresh = vi.fn(async () => ({
  getJson: () => ({ access_token: "at2", refresh_token: "rt2", expires_in: 3600 }),
}));
const setToken = vi.fn();

class MockOAuthClient {
  authorizeUri = authorizeUri;
  createToken = createToken;
  refresh = refresh;
  setToken = setToken;
  static scopes = { Accounting: "com.intuit.quickbooks.accounting" };
  constructor(_config: unknown) {}
}

vi.mock("intuit-oauth", () => ({ default: MockOAuthClient }));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.QBO_CLIENT_ID = "cid";
  process.env.QBO_CLIENT_SECRET = "csecret";
  process.env.QBO_REDIRECT_URI = "https://app.example.com/api/qbo/callback";
  process.env.QBO_ENVIRONMENT = "sandbox";
});

describe("qbo-oauth-client", () => {
  it("buildQboAuthorizationUrl passes scope + state", async () => {
    const { buildQboAuthorizationUrl } = await import("@/lib/qbo/qbo-oauth-client");
    const url = buildQboAuthorizationUrl("STATE123");
    expect(authorizeUri).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "STATE123",
        scope: ["com.intuit.quickbooks.accounting"],
      }),
    );
    expect(url).toContain("state=STATE123");
  });

  it("exchangeQboAuthCode calls createToken and maps the token set", async () => {
    const { exchangeQboAuthCode } = await import("@/lib/qbo/qbo-oauth-client");
    const result = await exchangeQboAuthCode(
      "https://app.example.com/api/qbo/callback?code=abc&realmId=realm-1&state=STATE123",
    );
    expect(createToken).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ accessToken: "at", refreshToken: "rt", realmId: "realm-1" });
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("refreshQboTokens sets the stored refresh token then refreshes", async () => {
    const { refreshQboTokens } = await import("@/lib/qbo/qbo-oauth-client");
    const result = await refreshQboTokens("rt");
    expect(setToken).toHaveBeenCalledWith({ refresh_token: "rt" });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ accessToken: "at2", refreshToken: "rt2" });
  });
});
