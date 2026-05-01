import type {
  FirstOwnerProvisioningInput,
  FirstOwnerProvisioningResult,
} from "@/lib/business/first-owner-provisioning";
import type { FirstOwnerInviteResult } from "@/lib/business/first-owner-invite";

export type SelfServeFieldErrors = {
  email?: string;
  ownerDisplayName?: string;
  businessDisplayName?: string;
};

export type SelfServeOnboardingState = {
  status: "idle" | "invalid" | "submitted" | "error";
  message: string;
  fieldErrors?: SelfServeFieldErrors;
};

export const INITIAL_SELF_SERVE_ONBOARDING_STATE: SelfServeOnboardingState = {
  status: "idle",
  message: "",
};

export type SelfServeOnboardingDeps = {
  provision: (input: FirstOwnerProvisioningInput) => Promise<FirstOwnerProvisioningResult>;
  invite: (params: {
    apply: boolean;
    email: string;
    resendInvite: boolean;
    authUserId: string | null;
    accountOwnerUserId: string | null;
  }) => Promise<FirstOwnerInviteResult>;
  log: (message: string, details?: Record<string, unknown>) => void;
};
