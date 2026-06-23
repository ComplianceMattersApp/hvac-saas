import { describe, expect, it } from "vitest";
import {
  getSetPasswordInviteState,
  hasExpiredInviteOrRecoveryError,
  hasInviteSetPasswordIntent,
  isInviteOrRecoveryCallbackError,
  isInviteSetPasswordMode,
  parseAuthCallbackHashParams,
  shouldShowExpiredInviteRecovery,
} from "@/lib/auth/invite-link-recovery";

describe("invite link recovery routing", () => {
  it("recognizes invite set-password mode", () => {
    expect(isInviteSetPasswordMode("?mode=invite")).toBe(true);
    expect(isInviteSetPasswordMode("?mode=recovery")).toBe(false);
  });

  it("shows expired invite recovery for invalid, expired, or used invite states", () => {
    expect(getSetPasswordInviteState("?mode=invite&invite_state=expired")).toBe("expired");
    expect(shouldShowExpiredInviteRecovery("?mode=invite&invite_status=invalid")).toBe(true);
    expect(shouldShowExpiredInviteRecovery("?mode=invite&invite_state=used")).toBe(true);
    expect(shouldShowExpiredInviteRecovery("?mode=invite")).toBe(false);
  });

  it("routes expired Supabase invite callback errors to recovery instructions", () => {
    expect(
      isInviteOrRecoveryCallbackError(
        new URLSearchParams("type=invite&error=access_denied&error_code=otp_expired"),
      ),
    ).toBe(true);
  });

  it("recognizes expired invite errors from hash fragments", () => {
    const params = parseAuthCallbackHashParams("#error=access_denied#error_code=otp_expired");

    expect(params.get("error")).toBe("access_denied");
    expect(params.get("error_code")).toBe("otp_expired");
    expect(hasExpiredInviteOrRecoveryError(params)).toBe(true);
  });

  it("recognizes invite intent from set-password next paths", () => {
    expect(
      hasInviteSetPasswordIntent(
        new URLSearchParams("next=%2Fset-password%3Fmode%3Dinvite"),
      ),
    ).toBe(true);
  });

  it("routes no-code invite-intent callback fallbacks to invite recovery", () => {
    const params = new URLSearchParams("next=%2Fset-password%3Fmode%3Dinvite");

    expect(hasInviteSetPasswordIntent(params)).toBe(true);
    expect(params.has("code")).toBe(false);
  });

  it("does not classify generic auth callback errors without an invite or recovery type", () => {
    expect(
      isInviteOrRecoveryCallbackError(
        new URLSearchParams("error=access_denied&error_description=Email+link+is+invalid+or+has+expired"),
      ),
    ).toBe(false);
  });

  it("does not classify a normal callback as an invite recovery failure", () => {
    expect(isInviteOrRecoveryCallbackError(new URLSearchParams("code=abc123"))).toBe(false);
  });
});
