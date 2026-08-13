import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const testsPage = read("app/jobs/[id]/tests/page.tsx");
const guard = read("components/jobs/FormDraftGuard.tsx");
const connectivity = read("components/jobs/FieldConnectivityBanner.tsx");

/** The forms whose loss means a rater re-climbs into an attic. */
const GUARDED_ACTIONS = [
  "saveDuctLeakageDataFromForm",
  "saveAirflowDataFromForm",
  "saveFanWattDrawDataFromForm",
  "saveAirFilterDeviceDataFromForm",
  "saveAhriVerificationDataFromForm",
  "saveLocalMechanicalExhaustDataFromForm",
  "saveQiiEnv22InsulationDataFromForm",
  "saveRefrigerantChargeDataFromForm",
  "saveAndCompleteCustomVerificationFromForm",
];

/** Deliberately unguarded: losing these costs a click, not a reading. */
const UNGUARDED_ACTIONS = [
  "deleteEccTestRunFromForm",
  "completeEccTestRunFromForm",
  "addEccTestRunFromForm",
  "markCertsCompleteFromForm",
];

describe("test-form draft wiring", () => {
  it("wraps every data-entry form", () => {
    for (const action of GUARDED_ACTIONS) {
      const index = testsPage.indexOf(`action={${action}}`);
      expect(index, `${action} is not on the page`).toBeGreaterThan(-1);
      // The guard opens within the ~10 lines preceding the form's action.
      const preceding = testsPage.slice(Math.max(0, index - 900), index);
      expect(preceding, `${action} is not wrapped`).toContain("<FormDraftGuard");
    }
    expect(testsPage.split("<FormDraftGuard").length - 1).toBe(GUARDED_ACTIONS.length);
    expect(testsPage.split("</FormDraftGuard>").length - 1).toBe(GUARDED_ACTIONS.length);
  });

  it("leaves status, advance, and delete forms alone", () => {
    // Scope discipline: the guard proves itself on readings before it spreads.
    for (const action of UNGUARDED_ACTIONS) {
      const index = testsPage.indexOf(`action={${action}}`);
      if (index < 0) continue;
      const preceding = testsPage.slice(Math.max(0, index - 200), index);
      expect(preceding, `${action} should not be guarded`).not.toContain("<FormDraftGuard");
    }
  });

  it("keys drafts by user and job, and tokens them by the run's updated_at", () => {
    expect(testsPage).toContain("const buildTestFormDraftKey =");
    expect(testsPage).toContain("internalUserId: String(internalUser?.user_id ?? \"\")");
    expect(testsPage).toContain("jobId: String(job.id ?? \"\")");
    expect(testsPage).toContain("serverStateToken={runDL?.updated_at ?? null}");
    expect(testsPage).toContain('buildTestFormDraftKey("custom-test", focusedCustomRun?.id)');
  });

  it("shows the offline notice on the tests page", () => {
    expect(testsPage).toContain("<FieldConnectivityBanner />");
    expect(connectivity).toContain('window.addEventListener("offline"');
    expect(connectivity).toContain("Save when signal returns.");
  });
});

describe("the guard never submits anything", () => {
  it("has no submit, fetch, or action machinery at all", () => {
    // v1 protects typed data. A queued auto-replay could overwrite newer office
    // edits or double-fire lifecycle actions, so there must be no path to one.
    for (const forbidden of [
      "requestSubmit",
      ".submit(",
      "fetch(",
      "XMLHttpRequest",
      "navigator.sendBeacon",
      "useFormState",
      "startTransition",
    ]) {
      expect(guard, `guard must not reference ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("restores only on an explicit click", () => {
    expect(guard).toContain("onClick={handleRestore}");
    expect(guard).toContain("onClick={handleDiscard}");
    // No effect may call the restore path.
    expect(guard).not.toMatch(/useEffect\([^)]*handleRestore/);
  });

  it("writes through the native value setter so live previews recompute", () => {
    expect(guard).toContain("Object.getOwnPropertyDescriptor(prototype, \"value\")");
    expect(guard).toContain('new Event("input", { bubbles: true })');
  });

  it("flags a draft taken before newer server data", () => {
    expect(guard).toContain("serverStateChangedSinceDraft");
    expect(guard).toContain("readings on file changed since this draft");
  });
});

describe("review follow-ups", () => {
  const storage = read("lib/field-drafts/form-draft-storage.ts");
  const pure = read("lib/field-drafts/form-drafts.ts");

  it("restores in two passes and keeps what it could not place", () => {
    expect(guard).toContain("SECOND_PASS_DELAY_MS");
    expect(guard).toContain("secondPassTimerRef.current = setTimeout(");
    expect(guard).toContain("couldn&rsquo;t be");
    // No pruning of the stored draft on restore: an unrestorable reading stays.
    expect(guard).not.toContain("delete remaining[name]");
  });

  it("flushes buffered values on hide, pagehide, and unmount", () => {
    expect(guard).toContain('document.addEventListener("visibilitychange"');
    expect(guard).toContain('window.addEventListener("pagehide"');
    expect(guard).toContain("if (writeTimerRef.current) flushWrite(container);");
  });

  it("excludes hidden inputs from capture and restore", () => {
    expect(pure).toContain("NON_DRAFTABLE_FIELD_TYPES");
    expect(pure).toContain('"hidden"');
    // Both the capture path and the restore path filter through it.
    expect(guard.split("isDraftableFieldType").length - 1).toBeGreaterThanOrEqual(2);
  });

  it("probes whether storage actually works before promising safety", () => {
    expect(storage).toContain("export function draftStorageWorks");
    expect(connectivity).toContain("draftStorageWorks()");
    expect(connectivity).toContain("Readings can&rsquo;t be saved on this device.");
  });

  it("preserves the token a draft was first captured against", () => {
    expect(storage).toContain("existing ? existing.serverStateToken : params.serverStateToken");
  });

  it("keeps eviction off the typing path", () => {
    expect(storage).toContain("export function pruneDrafts");
    expect(guard).toContain("pruneDrafts({ keepKey: draftKey })");
    // The steady-state write is a setItem, not a full-store scan.
    const writeBody = storage.slice(storage.indexOf("export function writeDraft"));
    expect(writeBody.slice(0, writeBody.indexOf("catch"))).not.toContain("selectDraftKeysToEvict");
  });
});
