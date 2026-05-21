"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Contractor = { id: string; name: string };

export default function ContractorFilter({
  contractors,
  selectedId,
}: {
  contractors: Contractor[];
  selectedId: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value || "";
    const params = new URLSearchParams(sp.toString());

    if (next) params.set("contractor", next);
    else params.delete("contractor");

    const qs = params.toString();
    router.push(qs ? `/ops/closeout-queue?${qs}` : "/ops/closeout-queue");
  };

  return (
    <div className="flex flex-wrap items-center gap-2 min-w-[14rem] shrink-0">
      <label className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500 sm:text-[10px] sm:tracking-[0.12em]">
        Contractor
      </label>
      <select
        className="h-8 min-w-[11rem] rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
        value={selectedId}
        onChange={handleChange}
      >
        <option value="">All Contractors</option>
        {contractors.map((contractor) => (
          <option key={contractor.id} value={contractor.id}>
            {contractor.name}
          </option>
        ))}
      </select>
    </div>
  );
}