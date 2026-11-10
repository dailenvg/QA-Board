"use client";

import { useId, useMemo, type CSSProperties, type ReactNode } from "react";
import { commenterColor, type CommenterColor } from "@/lib/brand-palette";
import { LIST_ROWS, type ClientNews } from "@/lib/overview/activity";
import type { Visit } from "@/lib/overview/last-seen";
import { FOLDERS_HREF, projectHref } from "@/lib/routes";
import { Skeleton } from "../../ui/Skeleton";
import { AnimatedNumber } from "./AnimatedNumber";
import { MoreLink } from "./MoreLink";
import { BOARD_PINS, PinBoard } from "./PinBoard";
import { TileEmpty } from "./TileEmpty";
import { TileHeading } from "./TileHeading";
import { TILE_LIST, TILE_LIST_BOX, TILE_SURFACE } from "./tile-styles";
import { TileRow } from "./TileRow";
import { TileTag } from "./TileTag";
import { TimeAgo } from "./TimeAgo";
import { useFitRows } from "./use-fit-rows";

interface ClientsTileProps {
  /** Null until this look's last visit is known (just after the page shows). */
  news: ClientNews | null;
  visit: Visit | null;
  now: number;
  /** A project's thumbnail, by id. */
  thumb: (projectId: string) => ReactNode;
}

/** Client comments not pulled into the workspace yet: opening the project pulls them. */
function waitingLine(count: number): string {
  return count === 1
    ? "1 comment is still on its review link. Open the project to bring it in."
    : `${count} comments are still on review links. Open their projects to bring them in.`;
}

function sinceLabel(visit: Visit | null): string {
  if (!visit) return "Since last visit";
  return visit.firstVisit ? "Last 7 days" : "Since last visit";
}

/** Each project's color: its pins on the board, and the dot on its row. */
function projectColor(projectName: string): CommenterColor {
  return commenterColor(projectName);
}

/** The board's pins: each project's new comments in its color, busiest project first. */
function boardPins(news: ClientNews): CommenterColor[] {
  return news.rows
    .flatMap((row) => Array.from({ length: row.count }, () => projectColor(row.projectName)))
    .slice(0, BOARD_PINS);
}

/**
 * Client comments since the last look: their pins dropping onto a page, then
 * each project with news, opening the project (which also brings in any still
 * waiting on its review link). Each project's dot matches its pins.
 */
export function ClientsTile({ news, visit, now, thumb }: ClientsTileProps) {
  const headingId = useId();
  const rows = news?.rows ?? [];
  const { ref, shown, more } = useFitRows(rows.length, LIST_ROWS.clients.natural);
  const pins = useMemo(() => (news ? boardPins(news) : []), [news]);
  return (
    <section
      aria-labelledby={headingId}
      data-testid="tile-clients"
      data-count={news?.total}
      className={`${TILE_SURFACE} @container`}
    >
      <TileHeading
        id={headingId}
        icon="user"
        title="New from clients"
        subtitle={sinceLabel(visit)}
        tag={
          news ? (
            <TileTag tone="brand">
              <AnimatedNumber value={news.total} testId="tile-count" /> new
            </TileTag>
          ) : null
        }
      />
      {news === null ? (
        <div role="status" aria-busy="true" className="flex flex-col gap-3">
          <span className="sr-only">Loading client comments…</span>
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : news.total === 0 ? (
        <TileEmpty title="No new client comments">
          Comments clients leave on review links show up here.
        </TileEmpty>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 @[24rem]:grid-cols-[minmax(0,9rem)_minmax(0,1fr)] @[36rem]:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
          <div className="h-24 @[24rem]:h-auto @[24rem]:min-h-28">
            <PinBoard pins={pins} />
          </div>
          <div className="flex min-w-0 flex-col gap-1 bento-fit:min-h-0">
            {news.waiting > 0 ? (
              <p
                data-testid="clients-waiting"
                className="line-clamp-2 shrink-0 text-meta text-muted"
              >
                {waitingLine(news.waiting)}
              </p>
            ) : null}
            <div className={TILE_LIST_BOX}>
              <ol ref={ref} role="list" className={TILE_LIST}>
                {rows.slice(0, shown).map((row) => (
                  <TileRow
                    key={row.projectId}
                    href={projectHref(row.projectId)}
                    thumb={thumb(row.projectId)}
                    testId="client-row"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate text-body font-semibold">
                        {row.projectName}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-brand-soft px-2 py-0.5 text-label font-semibold text-brand-text tabular-nums">
                        <span
                          aria-hidden="true"
                          style={{ "--dot": projectColor(row.projectName).hex } as CSSProperties}
                          className="size-2 rounded-pill bg-(--dot)"
                        />
                        {row.count} new
                      </span>
                    </span>
                    <span className="text-meta text-muted">
                      <TimeAgo at={row.latestAt} now={now} />
                    </span>
                  </TileRow>
                ))}
              </ol>
              {more ? <MoreLink count={rows.length - shown} href={FOLDERS_HREF} /> : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
