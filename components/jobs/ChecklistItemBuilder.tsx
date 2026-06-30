"use client";

import { useState } from "react";

export type ChecklistDraftItem = {
  id: string;
  item_label: string;
  default_guidance: string;
};

type Props = {
  initialItems?: ChecklistDraftItem[];
  itemsName?: string;
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

const CHECKLIST_ITEM_LIMIT = 30;

export default function ChecklistItemBuilder({
  initialItems = [],
  itemsName = "checklist_items_json",
}: Props) {
  const [items, setItems] = useState<ChecklistDraftItem[]>(() =>
    initialItems.map((item) => ({
      id: item.id || uid(),
      item_label: String(item.item_label ?? "").trim(),
      default_guidance: String(item.default_guidance ?? "").trim(),
    })),
  );
  const [labelDraft, setLabelDraft] = useState("");
  const [guidanceDraft, setGuidanceDraft] = useState("");

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  function addItem() {
    const label = labelDraft.trim();
    if (!label) return;
    if (items.length >= CHECKLIST_ITEM_LIMIT) return;
    setItems((prev) => [
      ...prev,
      { id: uid(), item_label: label, default_guidance: guidanceDraft.trim() },
    ]);
    setLabelDraft("");
    setGuidanceDraft("");
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function moveItem(id: string, direction: "up" | "down") {
    setItems((prev) => {
      const idx = prev.findIndex((item) => item.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  }

  const serialized = JSON.stringify(
    items.map((item, index) => ({
      item_label: item.item_label,
      default_guidance: item.default_guidance || null,
      sort_order: index,
    })),
  );

  return (
    <div className="space-y-3">
      <input type="hidden" name={itemsName} value={serialized} />

      {items.length > 0 ? (
        <div className="space-y-1.5">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
            >
              <div className="flex shrink-0 flex-col gap-0.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => moveItem(item.id, "up")}
                  disabled={index === 0}
                  className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:text-slate-600 disabled:opacity-25"
                  aria-label="Move up"
                >
                  ▴
                </button>
                <button
                  type="button"
                  onClick={() => moveItem(item.id, "down")}
                  disabled={index === items.length - 1}
                  className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:text-slate-600 disabled:opacity-25"
                  aria-label="Move down"
                >
                  ▾
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900">{item.item_label}</div>
                {item.default_guidance ? (
                  <div className="mt-0.5 text-xs text-slate-500">{item.default_guidance}</div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="shrink-0 rounded px-1 py-1 text-xs text-slate-400 hover:text-red-600"
                aria-label="Remove item"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {items.length < CHECKLIST_ITEM_LIMIT ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-3 space-y-2">
          <input
            type="text"
            placeholder="Item label (e.g. Checked capacitor)"
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
            className={inputClass}
            maxLength={200}
          />
          <input
            type="text"
            placeholder="Guidance for tech — optional (e.g. Record µF reading)"
            value={guidanceDraft}
            onChange={(e) => setGuidanceDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
            className={inputClass}
            maxLength={500}
          />
          <button
            type="button"
            onClick={addItem}
            disabled={!labelDraft.trim()}
            className="inline-flex min-h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add item
          </button>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Maximum {CHECKLIST_ITEM_LIMIT} items reached.</p>
      )}
    </div>
  );
}
