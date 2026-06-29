"use client";

import { useMemo, useState } from "react";
import type { MaintenanceAgreementFrequency } from "@/lib/maintenance-agreements/read-model";

const CADENCE_FREQUENCIES: MaintenanceAgreementFrequency[] = [
  "annual",
  "semi_annual",
  "quarterly",
  "monthly",
  "custom",
];

const CADENCE_LABELS: Record<MaintenanceAgreementFrequency, string> = {
  annual: "1× per year",
  semi_annual: "2× per year",
  quarterly: "4× per year",
  monthly: "Monthly",
  custom: "Custom",
};

const CADENCE_INTERVAL_MONTHS: Record<MaintenanceAgreementFrequency, number> = {
  annual: 12,
  semi_annual: 6,
  quarterly: 3,
  monthly: 1,
  custom: 1,
};

function addMonthsToIsoDate(isoDate: string, months: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return "";
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

type Props = {
  initialFrequency: string;
  initialStartDate: string;
};

export function MaintenanceAgreementCadenceFields({ initialFrequency, initialStartDate }: Props) {
  const [frequency, setFrequency] = useState<MaintenanceAgreementFrequency>(
    CADENCE_FREQUENCIES.includes(initialFrequency as MaintenanceAgreementFrequency)
      ? (initialFrequency as MaintenanceAgreementFrequency)
      : "quarterly",
  );
  const [startDate, setStartDate] = useState(initialStartDate);

  const nextDueDate = useMemo(
    () => (startDate ? addMonthsToIsoDate(startDate, CADENCE_INTERVAL_MONTHS[frequency]) : ""),
    [startDate, frequency],
  );
  const renewalDate = useMemo(() => (startDate ? addMonthsToIsoDate(startDate, 12) : ""), [startDate]);

  return (
    <>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Cadence</label>
        <select
          name="frequency"
          value={frequency}
          onChange={(event) => setFrequency(event.target.value as MaintenanceAgreementFrequency)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        >
          {CADENCE_FREQUENCIES.map((value) => (
            <option key={value} value={value}>
              {CADENCE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Start Date</label>
        <input
          type="date"
          name="start_date"
          required
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Next Due Date (auto)</label>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {nextDueDate || "-"}
        </div>
        <input type="hidden" name="next_due_date" value={nextDueDate} />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Renewal Date (auto)</label>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {renewalDate || "-"}
        </div>
        <input type="hidden" name="renewal_date" value={renewalDate} />
      </div>
    </>
  );
}
