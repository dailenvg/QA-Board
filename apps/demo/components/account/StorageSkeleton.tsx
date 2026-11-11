import { Skeleton } from "../ui/Skeleton";
import { STORAGE_COPY } from "./storage-copy";

/** A card's placeholder: icon, title and description, then `rows` lines of content. */
function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-5 rounded-card bg-card p-5 shadow-seg sm:p-6">
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 shrink-0 rounded-pill" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-full max-w-sm" />
        </div>
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

/** The Storage page while its report loads: its three cards, in their places. */
export function StorageSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-col gap-4"
      data-testid="storage-skeleton"
    >
      <span className="sr-only">{STORAGE_COPY.loading}</span>
      <CardSkeleton rows={1} />
      <CardSkeleton rows={4} />
      <CardSkeleton rows={3} />
    </div>
  );
}
