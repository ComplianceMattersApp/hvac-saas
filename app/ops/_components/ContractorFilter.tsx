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
    router.push(qs ? `/ops?${qs}` : "/ops");
  };

  return (
    <div className="grid gap-1">
      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Contractor</label>
      <select
        className="w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition-colors hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50"
        value={selectedId}
        onChange={handleChange}
      >
        <option value="">All Contractors</option>
        {contractors.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
