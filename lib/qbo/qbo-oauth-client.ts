import OAuthClient from "intuit-oauth";
import {
  requireQboClientId,
  requireQboClientSecret,
  requireQboRedirectUri,
  getQboEnvironment,
} from "./qbo-env";

/**
 * intuit-oauth wrapper. This is the ONLY QBO OAuth surface — token exchange and
 * refresh both go through here. No node-quickbooks / no other SDK.
 */

export function createQboOAuthClient(): OAuthClient {
  return new OAuthClient({
    clientId: requireQboClientId(),
    clientSecret: requireQboClientSecret(),
    environment: getQboEnvironment(),
    redirectUri: requireQboRedirectUri(),
  });
}

export function buildQboAuthorizationUrl(state: string): string {
  const client = createQboOAuthClient();
  return client.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state,
  });
}

export interface QboTokenSet {
  accessToken: string;
  refreshToken: string;
  realmId: string;
  expiresAt: Date;
}

export async function exchangeQboAuthCode(url: string): Promise<QboTokenSet> {
  const client = createQboOAuthClient();
  const response = await client.createToken(url);
  const token = response.getJson();
  // realmId is NOT in the token-endpoint response body — intuit-oauth overwrites
  // the token object with that body, dropping the realmId it parsed from the URL.
  // Read it from the callback URL (its only real source), with fallbacks.
  const realmId =
    new URL(url).searchParams.get("realmId") ?? client.getToken().realmId ?? token.realmId ?? "";
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    realmId,
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
  };
}

export async function refreshQboTokens(
  refreshToken: string,
): Promise<Omit<QboTokenSet, "realmId">> {
  const client = createQboOAuthClient();
  // `refresh()` validates expiry metadata on the SDK's in-memory Token object.
  // We intentionally persist only the encrypted token string, not the SDK's
  // `x_refresh_token_expires_in` metadata, so reconstructing a partial Token and
  // calling `refresh()` makes the SDK reject a valid token before contacting
  // Intuit. `refreshUsingToken()` is the supported path for a persisted token
  // string and sends it directly to Intuit's refresh endpoint.
  const response = await client.refreshUsingToken(refreshToken);
  const token = response.getJson();
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
  };
}
