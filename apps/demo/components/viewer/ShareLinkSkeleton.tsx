"use client";

import { Skeleton } from "../ui/Skeleton";

/** A step's tile, as `ShareStep` draws it. */
const TILE = "flex flex-col gap-4 rounded-card bg-tile p-4 sm:p-5";

/** A step's lime badge and title. */
function StepTitle({ width }: { width: string }) {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="size-6 rounded-pill max-sm:hidden" />
      <Skeleton className={`h-5 ${width}`} />
    </div>
  );
}

/**
 * Stands in for the Share window's steps while opening it makes the link,
 * in their places: on wider screens both steps (who's reviewing, then
 * settings), on a phone the Invite and Settings tabs over the first. So the
 * window keeps its size when the steps fade in.
 */
export function ShareLinkSkeleton() {
  return (
    <div className="flex flex-col gap-4" data-testid="share-link-skeleton">
      <p role="status" className="sr-only">
        Creating the link…
      </p>
      <Skeleton className="h-12 rounded-pill sm:hidden" />
      <div className={TILE}>
        <StepTitle width="w-40" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-12 w-full rounded-field" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-12 w-full rounded-field" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-11 w-36 rounded-pill max-sm:w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-12 rounded-pill" />
          <Skeleton className="h-12 rounded-pill" />
        </div>
      </div>
      <div className={`${TILE} max-sm:hidden`}>
        <StepTitle width="w-24" />
        <Skeleton className="h-28 w-full rounded-tile" />
        <Skeleton className="h-16 w-full rounded-tile" />
      </div>
    </div>
  );
}
