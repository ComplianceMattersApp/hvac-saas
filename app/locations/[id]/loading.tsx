export default function LocationDetailLoading() {
  return (
    <div className="p-6 space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className="h-3 w-32 animate-pulse rounded bg-gray-100" />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="h-7 w-56 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-3 w-40 animate-pulse rounded bg-gray-100" />
            <div className="mt-2 h-6 w-24 animate-pulse rounded-full bg-gray-100" />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="h-9 w-32 animate-pulse rounded-md bg-gray-100" />
            <div className="h-9 w-28 animate-pulse rounded-md bg-gray-100" />
          </div>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="h-3 w-20 animate-pulse rounded bg-gray-100" />
            <div className="mt-2 h-4 w-24 animate-pulse rounded bg-gray-200" />
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="h-5 w-44 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="h-3 w-20 animate-pulse rounded bg-gray-200" />
              <div className="mt-2 h-4 w-32 animate-pulse rounded bg-gray-200" />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="h-5 w-48 animate-pulse rounded bg-gray-200" />
        <div className="mt-1 h-3 w-72 max-w-full animate-pulse rounded bg-gray-100" />
        <div className="mt-1 h-3 w-80 max-w-full animate-pulse rounded bg-gray-100" />

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="space-y-1">
              <div className="h-3 w-20 animate-pulse rounded bg-gray-100" />
              <div className="h-9 w-full animate-pulse rounded-lg bg-gray-100" />
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-1">
          <div className="h-3 w-16 animate-pulse rounded bg-gray-100" />
          <div className="h-24 w-full animate-pulse rounded-lg bg-gray-100" />
        </div>
        <div className="mt-4 h-9 w-44 animate-pulse rounded-lg bg-gray-200" />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="h-5 w-44 animate-pulse rounded bg-gray-200" />
            <div className="mt-1 h-3 w-56 animate-pulse rounded bg-gray-100" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-9 w-28 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                {Array.from({ length: 6 }).map((_, index) => (
                  <th key={index} className="px-3 py-2 text-left">
                    <div className="h-3 w-12 animate-pulse rounded bg-gray-200" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {Array.from({ length: 5 }).map((_, rowIndex) => (
                <tr key={rowIndex}>
                  {Array.from({ length: 6 }).map((_, colIndex) => (
                    <td key={colIndex} className="px-3 py-3">
                      <div className="h-3 w-full max-w-[6rem] animate-pulse rounded bg-gray-100" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
