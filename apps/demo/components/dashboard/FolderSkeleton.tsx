import { Skeleton } from "../ui/Skeleton";

const CARDS = 6;

/** Folder page placeholder: header, filter and project cards. */
export function FolderSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Loading projects…</span>
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-6 w-32 rounded-pill" />
        </div>
        {/* Status filter, then sort (dropping below it, on the right, on narrow screens). */}
        <div className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-2">
          <Skeleton className="h-13 w-84 max-w-full rounded-pill" />
          <Skeleton className="ml-auto h-11 w-48 rounded-pill sm:w-72" />
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-4">
        {Array.from({ length: CARDS }, (_, index) => (
          <div key={index} className="flex flex-col gap-3 rounded-panel bg-tile p-3 pb-4">
            <Skeleton className="aspect-[16/10]" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
