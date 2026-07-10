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
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    realmId: token.realmId,
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
  };
}

export async function refreshQboTokens(
  refreshToken: string,
): Promise<Omit<QboTokenSet, "realmId">> {
  const client = createQboOAuthClient();
  client.setToken({ refresh_token: refreshToken });
  const response = await client.refresh();
  const token = response.getJson();
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
  };
}
