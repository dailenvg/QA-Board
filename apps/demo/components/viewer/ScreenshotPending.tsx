import { Icon } from "../ui/Icon";

/**
 * Where a comment's screenshot would be, on a comment posted without one. `id` lets the card's
 * button read it as part of its description, as it reads the page and breakpoint chips.
 */
export function ScreenshotPending({ id }: { id: string }) {
  return (
    // `relative` lifts the mark above the select button's card-wide ::after, as the thumbnail is.
    <div className="relative px-4 pb-2">
      <p
        id={id}
        data-testid="screenshot-pending"
        className="inline-flex items-center gap-2 rounded-pill bg-seg px-3 py-1 text-label font-semibold text-ink-2"
      >
        {/* A camera, not the page chip's picture: the two can sit on the same card. */}
        <Icon name="camera" className="size-3.5" />
        Screenshot pending
      </p>
    </div>
  );
}
