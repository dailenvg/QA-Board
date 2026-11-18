import { SettingsCardSkeleton } from "../account/SettingsCardSkeleton";
import { Skeleton } from "../ui/Skeleton";
import { ADMIN_COPY } from "./admin-copy";

/** The Overview while it loads: six count tiles and the activity card, in their places. */
export function AdminOverviewSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-col gap-6"
      data-testid="admin-overview-skeleton"
    >
      <span className="sr-only">{ADMIN_COPY.overview.loading}</span>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-seg sm:p-5"
          >
            <div className="flex items-center gap-2">
              <Skeleton className="size-8 shrink-0 rounded-pill" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-full max-w-40" />
          </div>
        ))}
      </div>
      <SettingsCardSkeleton rows={3} />
    </div>
  );
}
