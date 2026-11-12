"use client";

import { useId, type ReactNode } from "react";
import { LIST_ROWS, type ClientNews } from "@/lib/overview/activity";
import { FOLDERS_HREF, projectHref } from "@/lib/routes";
import { HIGHLIGHT_TAG } from "../../ui/highlight-tag";
import { Skeleton } from "../../ui/Skeleton";
import { AnimatedNumber } from "./AnimatedNumber";
import { MoreLink } from "./MoreLink";
import { ClientsScene } from "./scenes/ClientsScene";
import { SceneBox } from "./scenes/SceneBox";
import { useScene } from "./scenes/use-scene";
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

/**
 * Client comments since the last look: a client's cursor dropping their pins
 * onto a page while Squiggy listens (again on hover or focus), then
 * each project with news, opening the project (which also brings in any still
 * waiting on its review link), with how many are new. No per-project color: the
 * scene is in greys, so a colored dot would match nothing on screen.
 */
export function ClientsTile({ news, now, thumb }: ClientsTileProps) {
  const headingId = useId();
  const rows = news?.rows ?? [];
  const { ref, shown, more } = useFitRows(rows.length, LIST_ROWS.clients.natural);
  const [sceneRef, scene] = useScene();
  return (
    <section
      aria-labelledby={headingId}
      data-testid="tile-clients"
      data-count={news?.total}
      onPointerEnter={scene.replay}
      onFocus={scene.replay}
      className={`${TILE_SURFACE} @container`}
    >
      <TileHeading
        id={headingId}
        title="New from clients"
        tag={
          news ? (
            <TileTag>
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
        // Where the bento fits one screen the scene's column narrows, so its page (4:3) stays
        // within the tile's height.
        <div className="grid min-h-0 flex-1 gap-4 @[24rem]:grid-cols-[minmax(0,9rem)_minmax(0,1fr)] @[36rem]:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] bento-fit:@[24rem]:grid-cols-[minmax(0,7rem)_minmax(0,1fr)] bento-fit:@[36rem]:grid-cols-[minmax(0,7rem)_minmax(0,1fr)]">
          {/*
            aspect-[4/3]: the stage's own shape, so the box holds its room before the scene draws
            (on phones it would otherwise push the rows down as it's scrolled to).
          */}
          <SceneBox
            sceneRef={sceneRef}
            scene={scene}
            className="mx-auto aspect-[4/3] w-32 self-start @[24rem]:mx-0 @[24rem]:w-full"
          >
            <ClientsScene count={news.total} still={scene.still} />
          </SceneBox>
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
                      <span className={`${HIGHLIGHT_TAG} tabular-nums`}>{row.count} new</span>
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
