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
      <label className="text-xs text-gray-600">Contractor</label>
      <select
        className="w-full rounded border px-2 py-2 text-sm"
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
