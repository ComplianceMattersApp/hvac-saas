import Link from "next/link";

export function Sidebar() {
  return (
    <aside className="hidden md:block md:w-64 border-r bg-white p-4">
      <div className="mb-6">
        <div className="text-lg font-bold">Compliance Matters</div>
        <div className="text-sm text-gray-500">Booking Software</div>
      </div>

      <nav className="space-y-2 text-sm">
        <Link className="block rounded px-3 py-2 hover:bg-gray-100" href="/">
          Home
        </Link>
        <Link className="block rounded px-3 py-2 hover:bg-gray-100" href="/calendar">
          Calendar
        </Link>
      </nav>
    </aside>
  );
}
