import { Skeleton } from "../ui/Skeleton";

/** One list's stand-in: its label, its search field and a few rows. */
function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-11 w-full rounded-field" />
      <div className="flex flex-col gap-1 rounded-field bg-card p-1 ring-1 ring-line ring-inset">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </div>
    </div>
  );
}

/**
 * Send to ClickUp while the member's channels and people load: the form's
 * shape. Hidden from screen readers; the window's live line says it's loading.
 */
export function ClickUpSendSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-5" data-testid="clickup-send-loading">
      <ListSkeleton rows={4} />
      <div className="grid gap-5 sm:grid-cols-2">
        <ListSkeleton rows={2} />
        <ListSkeleton rows={2} />
      </div>
      <Skeleton className="h-24 w-full rounded-field" />
    </div>
  );
}
