import { isKnownTestType, type EccTestType } from "@/lib/ecc/test-registry";

type SuggestedTestLike = {
  testType?: string | null;
  required?: boolean | null;
};

export type EccReportScopeInput = {
  suggestedTests?: SuggestedTestLike[] | null;
  runTestTypes?: Array<string | null | undefined> | null;
  carriedForwardTestTypes?: Array<string | null | undefined> | null;
};

function normalizeKnownTestType(value: string | null | undefined): EccTestType | null {
  const testType = String(value ?? "").trim();
  return isKnownTestType(testType) ? testType : null;
}

export function getEccReportScopedTestTypes(input: EccReportScopeInput): EccTestType[] {
  const scoped = new Set<EccTestType>();

  for (const suggested of input.suggestedTests ?? []) {
    if (suggested?.required !== true) continue;
    const testType = normalizeKnownTestType(suggested.testType);
    if (testType) scoped.add(testType);
  }

  for (const rawTestType of input.runTestTypes ?? []) {
    const testType = normalizeKnownTestType(rawTestType);
    if (testType) scoped.add(testType);
  }

  for (const rawTestType of input.carriedForwardTestTypes ?? []) {
    const testType = normalizeKnownTestType(rawTestType);
    if (testType) scoped.add(testType);
  }

  return Array.from(scoped);
}

export function isEccTestInReportScope(
  scopedTestTypes: Iterable<EccTestType>,
  testType: EccTestType
): boolean {
  for (const scopedTestType of scopedTestTypes) {
    if (scopedTestType === testType) return true;
  }

  return false;
}
