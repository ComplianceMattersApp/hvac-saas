export function isActiveVisitLifecycle(status: unknown) {
  return ["on_the_way", "in_process", "in_progress"].includes(String(status ?? "").trim().toLowerCase());
}

export default function ActiveRescheduleWarning({ status }: { status: unknown }) {
  if (!isActiveVisitLifecycle(status)) return null;

  return (
    <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
      <input type="checkbox" name="confirm_active_reschedule" value="1" required className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <span className="block font-semibold">Restart field progress after this schedule change</span>
        <span className="mt-0.5 block text-xs leading-5 text-amber-900">
          This visit is already active. Saving a different appointment returns it to Scheduled so On the Way and Start Work can be completed again. Existing activity remains in history.
        </span>
      </span>
    </label>
  );
}
