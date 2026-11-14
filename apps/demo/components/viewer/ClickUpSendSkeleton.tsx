import { Skeleton } from "../ui/Skeleton";

/** One step's stand-in on its tile: its title, a field's label, its search field and a few rows. */
function StepSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-4 rounded-card bg-tile p-4 sm:p-5">
      <Skeleton className="h-6 w-44" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-11 w-full rounded-field" />
        <div className="flex flex-col gap-1 rounded-field bg-card p-1 ring-1 ring-line ring-inset">
          {Array.from({ length: rows }, (_, index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** The note step's stand-in: its title, the note field, and the message preview. */
function NoteSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-card bg-tile p-4 sm:p-5">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-24 w-full rounded-field" />
      <Skeleton className="h-64 w-full rounded-tile" />
    </div>
  );
}

/**
 * Send to ClickUp while the member's channels and people load: the form's
 * steps, laid out as they will be. Hidden from screen readers; the window's
 * live line says it's loading.
 */
export function ClickUpSendSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid gap-4 lg:grid-cols-2 lg:items-start"
      data-testid="clickup-send-loading"
    >
      <div className="flex flex-col gap-4">
        <StepSkeleton rows={4} />
        <StepSkeleton rows={2} />
      </div>
      <NoteSkeleton />
    </div>
  );
}
