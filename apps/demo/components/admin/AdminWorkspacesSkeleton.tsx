import { Skeleton } from "../ui/Skeleton";
import { ADMIN_COPY } from "./admin-copy";
import { WORKSPACE_GRID } from "./workspace-grid";

/** One card while it loads: its header, then a few rows in the list's columns. */
function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-5 rounded-card bg-card p-5 shadow-seg sm:p-6">
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 shrink-0 rounded-pill" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-full max-w-md" />
        </div>
      </div>
      {/* Laid out as `WorkspaceItem` is: on phones the name beside its menu, then the values. */}
      <div className="flex flex-col divide-y divide-line">
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className={`flex flex-col gap-3 py-4 first:pt-0 last:pb-0 md:py-3 ${WORKSPACE_GRID}`}
          >
            <div className="flex items-start gap-3 md:contents">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-40 max-w-full" />
                <Skeleton className="h-3 w-48 max-w-full" />
                <Skeleton className="h-6 w-20 rounded-pin" />
              </div>
              <Skeleton className="size-11 shrink-0 rounded-pill md:order-last md:justify-self-end" />
            </div>
            <div className="grid grid-cols-2 gap-3 md:contents">
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-8" />
              <Skeleton className="col-span-2 h-3 w-full" />
              <Skeleton className="col-span-2 h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The Workspaces page while it loads: the list's card, then the archived one, in their places. */
export function AdminWorkspacesSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-col gap-4"
      data-testid="admin-workspaces-skeleton"
    >
      <span className="sr-only">{ADMIN_COPY.workspaces.loading}</span>
      <CardSkeleton rows={4} />
      <CardSkeleton rows={1} />
    </div>
  );
}
