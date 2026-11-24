import { absoluteTime } from "@/lib/relative-time";
import { Icon } from "../ui/Icon";
import type { ThreadSummary } from "./thread-summary";

interface ThreadSummaryLineProps {
  /** Referenced by the card's `aria-describedby`, so it's read after the comment. */
  id: string;
  summary: ThreadSummary;
}

/**
 * An unselected card's thread, in one line (U1): "2 replies · Ben, 5 minutes
 * ago". Selecting the card shows the thread itself.
 */
export function ThreadSummaryLine({ id, summary }: ThreadSummaryLineProps) {
  return (
    <p
      id={id}
      data-testid="reply-summary"
      className="flex min-w-0 items-center gap-2 px-4 pb-3 text-label text-muted"
    >
      <Icon name="message" className="size-4 shrink-0" />
      <span className="min-w-0 truncate">
        <span className="font-semibold text-ink-2">{summary.count}</span>
        <span aria-hidden="true"> · </span>
        <span className="sr-only">, latest by </span>
        {summary.author},{" "}
        <time dateTime={new Date(summary.at).toISOString()} title={absoluteTime(summary.at)}>
          {summary.when}
        </time>
      </span>
    </p>
  );
}
