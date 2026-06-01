type DeferredNarrativeSectionFailureProps = {
  message: string;
};

export default function DeferredNarrativeSectionFailure({
  message,
}: DeferredNarrativeSectionFailureProps) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
      <div className="font-semibold">Section temporarily unavailable</div>
      <div className="mt-1 leading-6">{message}</div>
    </div>
  );
}