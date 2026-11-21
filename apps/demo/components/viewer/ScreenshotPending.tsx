import { Icon } from "../ui/Icon";

/** Where a comment's screenshot would be, on a comment posted without one. */
export function ScreenshotPending() {
  return (
    // `relative` lifts the mark above the select button's card-wide ::after, as the thumbnail is.
    <div className="relative px-4 pb-2">
      <p
        data-testid="screenshot-pending"
        className="inline-flex items-center gap-2 rounded-pill bg-seg px-3 py-1 text-label font-semibold text-ink-2"
      >
        <Icon name="image" className="size-3.5" />
        Screenshot pending
      </p>
    </div>
  );
}
