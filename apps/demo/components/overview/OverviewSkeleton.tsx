import { Skeleton } from "../ui/Skeleton";
import { TILE_SURFACE } from "./bento/tile-styles";
import { HERO_MASCOT_SIZE } from "./OverviewHero";

/** A tile's placeholder: its heading (icon and name), then lines of content. */
function TileSkeleton({ lines, className = "" }: { lines: number; className?: string }) {
  return (
    <div className={`${TILE_SURFACE} ${className}`}>
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-pill" />
        <Skeleton className="h-5 w-32" />
      </div>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className="h-11 w-full" />
      ))}
    </div>
  );
}

/**
 * Overview placeholder, shaped like the bento it stands in for (OverviewBento):
 * the hero across two columns, Comments waiting two rows tall, the client news
 * two columns wide from xl. The hero has the tile's own padding and Squiggy's
 * size, so it doesn't jump when the page arrives. Most workspaces have
 * projects, so the bento is the likelier page; an empty one swaps it for the
 * welcome.
 */
export function OverviewSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      <span className="sr-only">Loading your overview…</span>
      <div
        className={`${TILE_SURFACE} items-center justify-center sm:flex-row sm:gap-8 md:col-span-2`}
      >
        <div className="aspect-square shrink-0" style={{ width: HERO_MASCOT_SIZE }}>
          <Skeleton className="size-full rounded-pill" />
        </div>
        <div className="flex w-full flex-col items-center gap-3 sm:items-start">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full max-w-sm" />
          {/* Squiggy's line: SquiggySpeechLine reserves a 44px bubble. */}
          <Skeleton className="h-11 w-full max-w-md rounded-card" />
        </div>
      </div>
      <TileSkeleton lines={2} />
      <TileSkeleton lines={4} className="md:row-span-2" />
      <TileSkeleton lines={2} className="xl:col-span-2" />
      <TileSkeleton lines={3} />
      <TileSkeleton lines={2} />
    </div>
  );
}
