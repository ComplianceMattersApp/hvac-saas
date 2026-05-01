const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export function isSupportConsoleEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = String(env.ENABLE_SUPPORT_CONSOLE ?? "").trim().toLowerCase();
  if (!raw) return false;
  return ENABLED_VALUES.has(raw);
}
