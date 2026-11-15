import { SettingsCardSkeleton } from "./SettingsCardSkeleton";
import { STORAGE_COPY } from "./storage-copy";

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
      <SettingsCardSkeleton rows={1} />
      <SettingsCardSkeleton rows={4} />
      <SettingsCardSkeleton rows={3} />
    </div>
  );
}
