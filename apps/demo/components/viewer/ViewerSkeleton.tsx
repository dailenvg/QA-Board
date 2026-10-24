import { Skeleton } from "../ui/Skeleton";

/** Placeholder viewer layout shown until browser storage has been read. */
export function ViewerSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex h-dvh flex-col gap-3 p-3 sm:gap-4 sm:p-4">
      <span className="sr-only">Loading project…</span>
      <div className="flex items-center gap-3 rounded-panel bg-panel p-2">
        <Skeleton className="h-11 w-28 rounded-pill" />
        <Skeleton className="h-6 flex-1" />
        <Skeleton className="h-13 w-56 rounded-pill" />
      </div>
      <div className="flex min-h-0 flex-1 gap-4">
        <Skeleton className="flex-1 rounded-panel" />
        <div className="hidden w-panel flex-col gap-3 rounded-panel bg-panel p-4 lg:flex">
          <Skeleton className="h-11" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    </div>
  );
}
