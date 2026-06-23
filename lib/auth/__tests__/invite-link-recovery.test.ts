import { describe, expect, it } from "vitest";
import {
  getSetPasswordInviteState,
  isInviteOrRecoveryCallbackError,
  isInviteSetPasswordMode,
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
