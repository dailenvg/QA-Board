import { SettingsCardSkeleton } from "../account/SettingsCardSkeleton";
import { ADMIN_COPY } from "./admin-copy";

/** The System page while it loads: its three cards, in their places. */
export function AdminSystemSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-col gap-6"
      data-testid="admin-system-skeleton"
    >
      <span className="sr-only">{ADMIN_COPY.system.loading}</span>
      <SettingsCardSkeleton rows={4} />
      <SettingsCardSkeleton rows={3} />
      <SettingsCardSkeleton rows={4} />
    </div>
  );
}
