import { MEMBERS_COPY } from "./members-copy";
import { SettingsCardSkeleton } from "./SettingsCardSkeleton";

/**
 * The Members page while it loads: the People card's shape only, so nobody
 * sees a card flash in that their view won't have.
 */
export function MembersSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-col gap-4"
      data-testid="members-skeleton"
    >
      <span className="sr-only">{MEMBERS_COPY.loading}</span>
      <SettingsCardSkeleton rows={3} variant="row" />
    </div>
  );
}
