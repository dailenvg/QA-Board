import { SettingsCardSkeleton } from "../account/SettingsCardSkeleton";
import { Skeleton } from "../ui/Skeleton";
import { ADMIN_COPY } from "./admin-copy";

/** The Stored tile while it loads: its icon and name, its figure, and a line under it. */
function TileSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-seg sm:p-5">
      <div className="flex items-center gap-2">
        <Skeleton className="size-8 shrink-0 rounded-pill" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-8 w-28" />
      <Skeleton className="h-3 w-full max-w-48" />
    </div>
  );
}

/** The cleanup tile while it loads: its icon and name, two lines, then Run sweep. */
function SweepTileSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-card bg-card p-4 shadow-seg sm:p-5">
      <div className="flex items-center gap-2">
        <Skeleton className="size-8 shrink-0 rounded-pill" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-full max-w-40" />
        <Skeleton className="h-3 w-full max-w-56" />
      </div>
      <Skeleton className="h-11 w-full rounded-pill sm:w-36" />
    </div>
  );
}

/** The Storage page while it loads: its two tiles, then its three cards, in their places. */
export function AdminStorageSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-col gap-6"
      data-testid="admin-storage-skeleton"
    >
      <span className="sr-only">{ADMIN_COPY.storage.loading}</span>
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <TileSkeleton />
        <SweepTileSkeleton />
      </div>
      <SettingsCardSkeleton rows={1} />
      <SettingsCardSkeleton rows={3} />
      <SettingsCardSkeleton rows={3} />
    </div>
  );
}
