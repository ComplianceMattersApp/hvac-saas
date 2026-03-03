"use client";

import * as React from "react";

type Item = {
  key: string;
  title: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export function AccordionCards({ items }: { items: Item[] }) {
  // If any item has defaultOpen, open the first one. Otherwise, start closed.
  const defaultKey = React.useMemo(() => {
    const firstOpen = items.find((i) => i.defaultOpen)?.key;
    return firstOpen ?? null;
  }, [items]);

  const [openKey, setOpenKey] = React.useState<string | null>(defaultKey);

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isOpen = openKey === item.key;

        return (
          <div
            key={item.key}
            className="rounded-xl border bg-white dark:bg-gray-900 shadow-sm"
          >
            <button
              type="button"
              onClick={() => setOpenKey(isOpen ? null : item.key)}
              className="w-full flex items-center justify-between gap-3 p-4"
              aria-expanded={isOpen}
            >
              <div className="text-sm font-semibold text-left">{item.title}</div>
              <div
                className={[
                  "text-gray-500 transition-transform select-none",
                  isOpen ? "rotate-180" : "rotate-0",
                ].join(" ")}
              >
                ▾
              </div>
            </button>

            {isOpen ? (
              <div className="px-4 pb-4">{item.children}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}