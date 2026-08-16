type MonotonicNow = () => number;

export function startOpsServerTimer(
  enabled: boolean,
  now: MonotonicNow = () => performance.now(),
) {
  const startedAt = enabled ? now() : null;

  return (label: string) => {
    if (startedAt === null) return;
    const elapsedMs = Math.max(0, Math.round(now() - startedAt));
    console.log(`[${label}] ${elapsedMs}ms`);
  };
}
