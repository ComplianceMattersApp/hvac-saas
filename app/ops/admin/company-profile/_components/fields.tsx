import type { ReactNode } from "react";

/**
 * Field primitives for the Company Profile console. Field state is explicit
 * (design turn 14b): `*` required, muted "Optional", amber "Recommended".
 * Required is indicated BOTH visually (asterisk) and programmatically
 * (aria-required) — the old page marked it programmatically only.
 */
export type FieldRequirement = "required" | "optional" | "recommended";

const INPUT_CLASS =
  "w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm text-[#0f1f35] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200";

function RequirementCue({ requirement }: { requirement?: FieldRequirement }) {
  if (requirement === "required") {
    return (
      <span aria-hidden="true" className="text-blue-600">
        {" "}
        *
      </span>
    );
  }
  if (requirement === "optional") {
    return <span className="ml-1 text-xs font-normal text-slate-400">Optional</span>;
  }
  if (requirement === "recommended") {
    return <span className="ml-1 text-xs font-semibold text-amber-600">Recommended</span>;
  }
  return null;
}

function FieldLabel({
  htmlFor,
  label,
  requirement,
}: {
  htmlFor: string;
  label: ReactNode;
  requirement?: FieldRequirement;
}) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
      {label}
      <RequirementCue requirement={requirement} />
    </label>
  );
}

export function TextField({
  id,
  name,
  label,
  defaultValue,
  type = "text",
  placeholder,
  helper,
  requirement,
  inputMode,
  autoComplete,
  className = "",
}: {
  id: string;
  name: string;
  label: ReactNode;
  defaultValue?: string;
  type?: string;
  placeholder?: string;
  helper?: ReactNode;
  requirement?: FieldRequirement;
  inputMode?: "text" | "email" | "tel" | "url" | "numeric";
  autoComplete?: string;
  className?: string;
}) {
  const isRequired = requirement === "required";
  return (
    <div className={`space-y-1.5 ${className}`}>
      <FieldLabel htmlFor={id} label={label} requirement={requirement} />
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        required={isRequired}
        aria-required={isRequired || undefined}
        className={INPUT_CLASS}
      />
      {helper ? <p className="text-xs leading-5 text-slate-500">{helper}</p> : null}
    </div>
  );
}

export function SelectField({
  id,
  name,
  label,
  defaultValue,
  helper,
  requirement,
  children,
  className = "",
}: {
  id: string;
  name: string;
  label: ReactNode;
  defaultValue?: string;
  helper?: ReactNode;
  requirement?: FieldRequirement;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <FieldLabel htmlFor={id} label={label} requirement={requirement} />
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        className={INPUT_CLASS}
      >
        {children}
      </select>
      {helper ? <p className="text-xs leading-5 text-slate-500">{helper}</p> : null}
    </div>
  );
}
