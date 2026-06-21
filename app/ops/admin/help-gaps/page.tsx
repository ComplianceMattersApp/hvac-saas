import Link from "next/link";
import {
  listHelpGapReviewQueue,
  type HelpGapReviewFilterOptions,
  type HelpGapReviewItem,
  type HelpGapReviewSummary,
} from "@/lib/help-assistant/help-gap-review-read-model";

type SearchParams = Promise<{
  reviewStatus?: string;
  category?: string;
  eventType?: string;
  pageFamily?: string;
  roleCategory?: string;
  productMode?: string;
  recentDays?: string;
  limit?: string;
}>;

const pageClass = "mx-auto max-w-7xl space-y-6 p-4 text-gray-900 sm:p-6";
const panelClass =
  "rounded-lg border border-slate-200 bg-white p-5 shadow-[0_14px_34px_-28px_rgba(15,23,42,0.28)] sm:p-6";
const linkButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 transition-[background-color,border-color,transform] hover:border-slate-400 hover:bg-slate-50 active:translate-y-[0.5px]";
const selectClass =
  "min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

function titleize(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatOptional(value: string | null) {
  return value && value.trim() ? value : "None";
}

function StatCard({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-xs leading-5 text-slate-600">{helper}</div>
    </div>
  );
}

function topEntry(bucket: Record<string, number>) {
  return Object.entries(bucket).sort((a, b) => b[1] - a[1])[0] ?? null;
}

function BreakdownList({ title, values }: { title: string; values: Record<string, number> }) {
  const entries = Object.entries(values).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-semibold text-slate-500">{title}</div>
      {entries.length > 0 ? (
        <div className="mt-3 space-y-2">
          {entries.slice(0, 5).map(([key, count]) => (
            <div key={key} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-slate-700">{titleize(key)}</span>
              <span className="font-semibold text-slate-950">{count}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-sm text-slate-600">No data yet.</div>
      )}
    </div>
  );
}

function SummaryCards({ summary }: { summary: HelpGapReviewSummary }) {
  const topCategory = topEntry(summary.byCategory);
  const topPageFamily = topEntry(summary.byPageFamily);

  return (
    <section className={panelClass}>
      <div>
        <div className="text-xs font-semibold text-slate-500">Summary</div>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">Current help gap signals</h2>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="New" value={summary.totalNew} helper="Rows waiting for review." />
        <StatCard label="Unknown answers" value={summary.unknownAnswers} helper="Questions the assistant could not answer." />
        <StatCard label="Not helpful" value={summary.notHelpful} helper="Answers users marked as not helpful." />
        <StatCard label="Still need help" value={summary.stillNeedHelp} helper="Support intent signals, not support cases." />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <BreakdownList title="Top categories" values={summary.byCategory} />
        <BreakdownList title="Top page families" values={summary.byPageFamily} />
      </div>
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Top category: <span className="font-semibold text-slate-900">{topCategory ? titleize(topCategory[0]) : "None"}</span>.
        {" "}Top page family: <span className="font-semibold text-slate-900">{topPageFamily ? titleize(topPageFamily[0]) : "None"}</span>.
      </div>
    </section>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value?: string;
  options: string[];
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      <span className="block">{label}</span>
      <select name={name} defaultValue={value ?? ""} className={`${selectClass} mt-1 w-full`}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {titleize(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Filters({
  searchParams,
  availableFilters,
}: {
  searchParams: Awaited<SearchParams>;
  availableFilters: Awaited<ReturnType<typeof listHelpGapReviewQueue>>["availableFilters"];
}) {
  return (
    <section className={panelClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold text-slate-500">Filters</div>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Narrow the review queue</h2>
        </div>
        <Link href="/ops/admin/help-gaps" className={linkButtonClass}>
          Reset
        </Link>
      </div>
      <form action="/ops/admin/help-gaps" method="get" className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FilterSelect name="reviewStatus" label="Status" value={searchParams.reviewStatus} options={availableFilters.reviewStatuses} />
        <FilterSelect name="category" label="Category" value={searchParams.category} options={availableFilters.categories} />
        <FilterSelect name="eventType" label="Event type" value={searchParams.eventType} options={availableFilters.eventTypes} />
        <FilterSelect name="pageFamily" label="Page family" value={searchParams.pageFamily} options={availableFilters.pageFamilies} />
        <FilterSelect name="roleCategory" label="Role" value={searchParams.roleCategory} options={availableFilters.roleCategories} />
        <FilterSelect name="productMode" label="Product mode" value={searchParams.productMode} options={availableFilters.productModes} />
        <label className="text-sm font-semibold text-slate-700">
          <span className="block">Recent days</span>
          <input name="recentDays" defaultValue={searchParams.recentDays ?? ""} inputMode="numeric" className={`${selectClass} mt-1 w-full`} placeholder="30" />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          <span className="block">Limit</span>
          <input name="limit" defaultValue={searchParams.limit ?? ""} inputMode="numeric" className={`${selectClass} mt-1 w-full`} placeholder="50" />
        </label>
        <div className="sm:col-span-2 xl:col-span-4">
          <button
            type="submit"
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_-18px_rgba(15,23,42,0.5)] transition-[background-color,transform] hover:bg-slate-800 active:translate-y-[0.5px]"
          >
            Apply filters
          </button>
        </div>
      </form>
    </section>
  );
}

function HelpGapRow({ item }: { item: HelpGapReviewItem }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-500">{formatDateTime(item.createdAt)}</div>
          <h3 className="mt-1 text-base font-semibold text-slate-950">
            {titleize(item.eventType)} - {titleize(item.category)}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {item.questionTextSanitized || "No sanitized question text was stored."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">{titleize(item.reviewStatus)}</span>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">{titleize(item.pageFamily)}</span>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 border-t border-slate-200 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs font-semibold text-slate-500">Page path</dt>
          <dd className="mt-1 break-words text-slate-800">{item.pagePath}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-slate-500">Role</dt>
          <dd className="mt-1 text-slate-800">{item.roleLabel} ({titleize(item.roleCategory)})</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-slate-500">Product mode</dt>
          <dd className="mt-1 text-slate-800">{titleize(item.productMode)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-slate-500">Feedback</dt>
          <dd className="mt-1 text-slate-800">{formatOptional(item.feedbackValue)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-slate-500">Answer key</dt>
          <dd className="mt-1 break-words text-slate-800">{item.answerKey}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-slate-500">Fallback key</dt>
          <dd className="mt-1 break-words text-slate-800">{formatOptional(item.fallbackKey)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-slate-500">Setup step</dt>
          <dd className="mt-1 break-words text-slate-800">{formatOptional(item.setupStepKey)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-slate-500">Training mission</dt>
          <dd className="mt-1 break-words text-slate-800">{formatOptional(item.trainingMissionKey)}</dd>
        </div>
      </dl>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
        Support case link: {item.linkedSupportCaseId ? "Dormant reference present" : "None"}. No support case is created from this page.
      </div>
    </article>
  );
}

function StatePanel({ title, message }: { title: string; message: string }) {
  return (
    <div className={pageClass}>
      <section className={panelClass}>
        <div className="text-xs font-semibold text-slate-500">Help Gap Review</div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{message}</p>
        <div className="mt-4">
          <Link href="/ops/admin" className={linkButtonClass}>
            Admin Center
          </Link>
        </div>
      </section>
    </div>
  );
}

export default async function HelpGapReviewPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const filters: HelpGapReviewFilterOptions = {
    reviewStatus: sp.reviewStatus,
    category: sp.category,
    eventType: sp.eventType,
    pageFamily: sp.pageFamily,
    roleCategory: sp.roleCategory,
    productMode: sp.productMode,
    recentDays: sp.recentDays,
    limit: sp.limit,
  };

  const result = await listHelpGapReviewQueue(filters);

  if (!result.enabled) {
    return (
      <StatePanel
        title="Help Gap Review is unavailable"
        message="The review queue is not enabled. Help gap review remains hidden until ENABLE_HELP_GAP_REVIEW_QUEUE is explicitly enabled."
      />
    );
  }

  if (!result.authorized) {
    return (
      <StatePanel
        title="Admin access required"
        message="Help Gap Review is limited to owner/admin reviewers. This page does not grant Support Console access or tenant browsing."
      />
    );
  }

  if (result.reason === "read_failed") {
    return (
      <StatePanel
        title="Help gaps could not be loaded"
        message="The review queue could not be loaded. No raw server or database error is shown here."
      />
    );
  }

  return (
    <div className={pageClass}>
      <section className={panelClass}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500">Admin Center</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950 sm:text-3xl">Help Gap Review</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              See questions and feedback that show where setup, training, or support content needs improvement.
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Help gaps are product/support intelligence. They are not support cases. No support case is created from this page.
            </p>
          </div>
          <Link href="/ops/admin" className={linkButtonClass}>
            Admin Center
          </Link>
        </div>
      </section>

      <SummaryCards summary={result.summary} />
      <Filters searchParams={sp} availableFilters={result.availableFilters} />

      <section className={panelClass}>
        <div>
          <div className="text-xs font-semibold text-slate-500">Recent rows</div>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Sanitized help gaps</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            Rows appear when Ask Compliance Matters receives unknown answers, Not helpful feedback, or Still need help feedback while logging is enabled.
          </p>
        </div>

        {result.items.length > 0 ? (
          <div className="mt-5 space-y-4">
            {result.items.map((item) => (
              <HelpGapRow key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-700">
            <div className="font-semibold text-slate-950">No help gaps yet.</div>
            <p className="mt-1 leading-6">
              Rows appear when Ask Compliance Matters receives unknown answers, Not helpful feedback, or Still need help feedback while logging is enabled.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
