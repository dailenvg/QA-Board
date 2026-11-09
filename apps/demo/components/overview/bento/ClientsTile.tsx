"use client";

import Link from "next/link";
import { useId } from "react";
import type { ClientNews } from "@/lib/overview/activity";
import type { Visit } from "@/lib/overview/last-seen";
import { projectHref } from "@/lib/routes";
import { Skeleton } from "../../ui/Skeleton";
import { PauseToggle } from "../welcome/PauseToggle";
import { PinStory } from "../welcome/PinStory";
import { PIN_BEATS, STORY_COMMENTER } from "../welcome/story-script";
import type { StoryPlayback } from "../welcome/use-story-playback";
import { TileEmpty } from "./TileEmpty";
import { TileHeading } from "./TileHeading";
import { TILE_LIST, TILE_ROW, TILE_SURFACE } from "./tile-styles";
import { TileStory } from "./TileStory";
import { TimeAgo } from "./TimeAgo";

/** A client pins a comment: the welcome's Pin story, in the client's colour. */
const CLIENT_PINS = { tint: STORY_COMMENTER.hex, beats: PIN_BEATS, Scene: PinStory };

interface ClientsTileProps {
  /** Null until this look's last visit is known (just after the page shows). */
  news: ClientNews | null;
  visit: Visit | null;
  playback: StoryPlayback;
  now: number;
}

/** Client comments not pulled into the workspace yet: opening the project pulls them. */
function waitingLine(count: number): string {
  return count === 1
    ? "1 is still on its review link. Open the project to bring it in."
    : `${count} are still on review links. Open their projects to bring them in.`;
}

function sinceLabel(visit: Visit): string {
  return visit.firstVisit ? "in the last 7 days" : "since your last visit";
}

/**
 * Client comments since the last look, per project, each opening its project
 * (which also brings in any still waiting on its review link). Beside them,
 * once the tile has room, the welcome's Pin story plays while there's news.
 */
export function ClientsTile({ news, visit, playback, now }: ClientsTileProps) {
  const headingId = useId();
  const live = (news?.total ?? 0) > 0;
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
        tone="brand"
        aside={
          // Only beside the story it stops, and only while it's moving (WCAG 2.2.2).
          live && !playback.reduced ? (
            <span className="-my-1 -mr-3 hidden @[25rem]:block">
              <PauseToggle paused={playback.paused} onChange={playback.setPaused} />
            </span>
          ) : null
        }
      >
        New from clients
      </TileHeading>
      <div className="grid flex-1 gap-5 @[25rem]:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] @[36rem]:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
        <div className="hidden @[25rem]:block">
          <TileStory story={CLIENT_PINS} playback={playback} live={live} />
        </div>
        {news === null || visit === null ? (
          <div role="status" aria-busy="true" className="flex flex-col gap-3">
            <span className="sr-only">Loading client comments…</span>
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : news.total === 0 ? (
          <TileEmpty title="No new client comments">
            {`Nothing from clients ${sinceLabel(visit)}. Comments they leave on review links show up here.`}
          </TileEmpty>
        ) : (
          <div className="flex min-w-0 flex-col gap-3">
            <p className="flex flex-wrap items-end gap-x-3">
              <span data-testid="tile-count" className="text-display font-bold tabular-nums">
                {news.total}
              </span>
              <span className="pb-1 text-body text-muted">
                new {news.total === 1 ? "comment" : "comments"} {sinceLabel(visit)}
              </span>
            </p>
            {news.waiting > 0 ? (
              <p data-testid="clients-waiting" className="text-meta text-muted">
                {waitingLine(news.waiting)}
              </p>
            ) : null}
            <ol role="list" className={TILE_LIST}>
              {news.rows.map((row) => (
                <li key={row.projectId}>
                  <Link
                    href={projectHref(row.projectId)}
                    data-testid="client-row"
                    className={TILE_ROW}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate text-body font-semibold">
                        {row.projectName}
                      </span>
                      <span className="shrink-0 rounded-pill bg-brand-soft px-2 py-0.5 text-label font-semibold text-brand-text tabular-nums">
                        {row.count} new
                      </span>
                    </span>
                    <span className="text-meta text-muted">
                      Latest: <TimeAgo at={row.latestAt} now={now} />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
