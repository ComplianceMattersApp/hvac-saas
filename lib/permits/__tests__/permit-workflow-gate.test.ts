import { afterEach, describe, expect, it } from "vitest";
import {
  isPermitWorkflowEnabledForAccountOwner,
  parsePermitWorkflowEnabledAccountOwnerIds,
} from "../permit-workflow-gate";

const ORIGINAL_ALLOWLIST = process.env.ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS;

describe("permit workflow account-owner gate", () => {
  afterEach(() => {
    if (typeof ORIGINAL_ALLOWLIST === "string") {
      process.env.ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS = ORIGINAL_ALLOWLIST;
    } else {
      delete process.env.ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS;
    }
  });

  it("is disabled when env is missing", () => {
    delete process.env.ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS;
    expect(isPermitWorkflowEnabledForAccountOwner("owner-1")).toBe(false);
  });

  it("is disabled when env is empty", () => {
    process.env.ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS = "   ";
    expect(isPermitWorkflowEnabledForAccountOwner("owner-1")).toBe(false);
  });

  it("enables when account owner id is allowlisted", () => {
    process.env.ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS = "owner-1, owner-2";
    expect(isPermitWorkflowEnabledForAccountOwner("owner-1")).toBe(true);
  });

  it("disables when account owner id is not allowlisted", () => {
    process.env.ENABLE_PERMIT_WORKFLOW_ACCOUNT_OWNER_IDS = "owner-2,owner-3";
    expect(isPermitWorkflowEnabledForAccountOwner("owner-1")).toBe(false);
  });

  it("tolerates whitespace and empty segments in allowlist", () => {
    const ids = parsePermitWorkflowEnabledAccountOwnerIds(" owner-1, ,  owner-2 ,, ");
    expect(Array.from(ids)).toEqual(["owner-1", "owner-2"]);
  });
});