export function CalendarLegend() {
  return (
    <div className="mb-6 rounded-lg border bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Legend</h3>
      <div className="flex gap-6">
        <div className="flex items-center gap-2">
          <div className="h-4 w-8 rounded bg-blue-100 border border-blue-200"></div>
          <span className="text-xs text-gray-600">Job</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-8 rounded bg-green-100 border border-green-200"></div>
          <span className="text-xs text-gray-600">Service</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-8 rounded bg-blue-50 border border-blue-200"></div>
          <span className="text-xs text-gray-600">Today</span>
        </div>
      </div>
    </div>
  );
}
