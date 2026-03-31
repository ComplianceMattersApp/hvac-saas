"use client";

import { useState } from "react";

type DuctMethod = "cooling" | "heating";

type Props = {
  runId: string;
  defaultMethod: DuctMethod;
  forceHeatOnly?: boolean;
  defaultHeatingOutputBtu: number | string | null;
  defaultHeatingInputBtu: number | string | null;
  defaultHeatingEfficiencyPercent: number | string | null;
  defaultTonnage: number | string | null;
};

function normalizeMethod(value: string): DuctMethod {
  return value === "heating" ? "heating" : "cooling";
}

function toInputDefault(value: number | string | null): number | string {
  return value ?? "";
}

export default function DuctLeakageMethodFields({
  runId,
  defaultMethod,
  forceHeatOnly = false,
  defaultHeatingOutputBtu,
  defaultHeatingInputBtu,
  defaultHeatingEfficiencyPercent,
  defaultTonnage,
}: Props) {
  const [method, setMethod] = useState<DuctMethod>(forceHeatOnly ? "heating" : normalizeMethod(defaultMethod));

  return (
    <>
      <div className="grid gap-1 sm:col-span-2">
        <label className="text-sm font-medium" htmlFor={`dl-method-${runId}`}>
          Duct Leakage Method
        </label>
        <select
          id={`dl-method-${runId}`}
          name="airflow_method"
          className="w-full rounded-md border px-3 py-2"
          value={method}
          onChange={(event) => {
            if (forceHeatOnly) {
              setMethod("heating");
              return;
            }
            setMethod(normalizeMethod(event.target.value));
          }}
        >
          {!forceHeatOnly ? <option value="cooling">Cooling (tonnage x 400 CFM)</option> : null}
          <option value="heating">Heat-only (output kBtu x 21.7 CFM)</option>
        </select>
      </div>

      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor={`dl-heat-output-${runId}`}>
          Heating Output (BTU/h)
        </label>
        <input
          id={`dl-heat-output-${runId}`}
          name="heating_output_btu"
          type="number"
          step="1"
          className="w-full rounded-md border px-3 py-2 placeholder:text-slate-400"
          defaultValue={toInputDefault(defaultHeatingOutputBtu)}
          placeholder="Preferred if known"
        />
      </div>

      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor={`dl-heat-input-${runId}`}>
          Heating Input (BTU/h)
        </label>
        <input
          id={`dl-heat-input-${runId}`}
          name="heating_input_btu"
          type="number"
          step="1"
          className="w-full rounded-md border px-3 py-2 placeholder:text-slate-400"
          defaultValue={toInputDefault(defaultHeatingInputBtu)}
          placeholder="Use with efficiency"
        />
      </div>

      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor={`dl-heat-eff-${runId}`}>
          Heating Efficiency (%)
        </label>
        <input
          id={`dl-heat-eff-${runId}`}
          name="heating_efficiency_percent"
          type="number"
          step="0.1"
          min="0"
          max="100"
          className="w-full rounded-md border px-3 py-2 placeholder:text-slate-400"
          defaultValue={toInputDefault(defaultHeatingEfficiencyPercent)}
          placeholder="e.g. 80"
        />
      </div>

      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor={`dl-ton-${runId}`}>
          System Tonnage (cooling method)
        </label>
        <input
          id={`dl-ton-${runId}`}
          name="tonnage"
          type="number"
          step="0.1"
          className="w-full rounded-md border px-3 py-2 placeholder:text-slate-400"
          defaultValue={toInputDefault(defaultTonnage)}
          placeholder="Cooling method only"
        />
      </div>
    </>
  );
}
