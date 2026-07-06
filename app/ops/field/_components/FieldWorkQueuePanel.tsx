"use client";

import * as React from "react";

import { FieldWorkCard, sectionVisualTone, type FieldWorkJob } from "@/components/ops/FieldWorkCard";

export type FieldWorkSection = {
  key: string;
  title: string;
  mobileTitle: string;
  subtitle: string;
  jobs: FieldWorkJob[];
};

type Props = {
  sections: FieldWorkSection[];
  internalBusinessDisplayName: string;
  todayLA: string;
};

function defaultActiveKey(sections: FieldWorkSection[]): string {
  const firstWithJobs = sections.find((section) => section.jobs.length > 0);
  return (firstWithJobs ?? sections[0])?.key ?? "";
}

export default function FieldWorkQueuePanel({ sections, internalBusinessDisplayName, todayLA }: Props) {
  const [activeKey, setActiveKey] = React.useState(() => defaultActiveKey(sections));
  const activeSection = sections.find((section) => section.key === activeKey) ?? sections[0];

  return (
    <div>
      <div className="hidden border-b border-slate-200 sm:flex" role="tablist" aria-label="My Work sections">
        {sections.map((section) => {
          const tone = sectionVisualTone(section.key);
          const isActive = section.key === activeSection?.key;
          return (
            <button
              key={section.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveKey(section.key)}
              className={`flex-1 border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${
                isActive ? `border-current ${tone.text}` : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                {section.title}
                <span className={isActive ? "" : "text-slate-400"}>{section.jobs.length}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-1 rounded-full bg-slate-100 p-1 sm:hidden" role="tablist" aria-label="My Work sections">
        {sections.map((section) => {
          const isActive = section.key === activeSection?.key;
          return (
            <button
              key={section.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveKey(section.key)}
              className={`flex-1 rounded-full px-2 py-2 text-center transition-colors ${
                isActive ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
              }`}
            >
              <div className="text-sm font-semibold">{section.jobs.length}</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.06em]">{section.mobileTitle}</div>
            </button>
          );
        })}
      </div>

      {activeSection ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm leading-6 text-slate-600">{activeSection.subtitle}</p>

          {activeSection.jobs.length > 0 ? (
            <div className="grid gap-3">
              {activeSection.jobs.map((job) => (
                <FieldWorkCard
                  key={job.id}
                  job={job}
                  internalBusinessDisplayName={internalBusinessDisplayName}
                  sectionKey={activeSection.key}
                  sectionTitle={activeSection.title}
                  todayLA={todayLA}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 px-4 py-5 text-sm text-slate-500">
              No jobs in this section.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
