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
 * ago", or with the replies kept to the team, "3 replies · 1 team only · Ben,
 * 5 minutes ago" (U20), which screen readers hear as "3 replies, 1 of them
 * team only". Selecting the card shows the thread itself.
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
        <span aria-hidden={summary.teamOnly > 0 || undefined} className="font-semibold text-ink-2">
          {summary.count}
        </span>
        {summary.teamOnly > 0 ? (
          <>
            <span className="sr-only">{summary.spoken}</span>
            <span aria-hidden="true" data-testid="reply-summary-team-only">
              {" · "}
              <Icon name="lock" className="inline size-3.5 align-[-0.125em]" /> {summary.teamOnly}{" "}
              team only
            </span>
          </>
        ) : null}
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
