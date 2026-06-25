"use client";

import { createContext } from "react";

export type CalendarInspectorContextValue = {
  openInspector: () => void;
  closeInspector: () => void;
};

export const CalendarInspectorContext = createContext<CalendarInspectorContextValue | null>(null);
