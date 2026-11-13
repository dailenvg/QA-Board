import type { CSSProperties } from "react";
import { Skeleton } from "../ui/Skeleton";
import { BENTO_GRID } from "./bento/bento-grid";
import { TILE_SURFACE } from "./bento/tile-styles";
import { HERO_MASCOT_SIZE } from "./OverviewHero";

interface TileSkeletonProps {
  rows: number;
  /** The height of the tile's scene above its rows (a Tailwind `h-…` class), if it has one. */
  scene?: string;
  className?: string;
}

/**
 * A tile's placeholder: its heading (title and tag), its scene's room, then rows.
 */
function TileSkeleton({ rows, scene, className = "" }: TileSkeletonProps) {
  return (
    <div className={`${TILE_SURFACE} ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-6 w-16 rounded-pill" />
      </div>
      {scene ? <Skeleton className={`${scene} w-full shrink-0`} /> : null}
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-field" />
          <Skeleton className="h-10 flex-1" />
        </div>
      ))}
    </div>
  );
}

/**
 * Overview placeholder, on the bento's own grid (`BENTO_GRID`, fitting one
 * screen where the bento does): the hero across two columns, Comments waiting
 * two rows tall, the client news two columns wide from xl. The hero has the
 * tile's own padding and Squiggy's size (and its project page from md), so it doesn't jump when the page
 * arrives. Most workspaces have projects, so the bento is the likelier page;
 * an empty one swaps it for the welcome.
 */
export function OverviewSkeleton() {
  return (
    <div role="status" aria-busy="true" className={BENTO_GRID}>
      <span className="sr-only">Loading your overview…</span>
      <div
        className={`${TILE_SURFACE} items-center justify-center sm:flex-row sm:gap-8 md:col-span-2`}
      >
        <div
          className="aspect-square w-(--hero-mascot) shrink-0 [--hero-mascot:var(--hero-mascot-size)] bento-fit:[--hero-mascot:6rem]"
          style={{ "--hero-mascot-size": HERO_MASCOT_SIZE } as CSSProperties}
        >
          <Skeleton className="size-full rounded-pill" />
        </div>
        <div className="flex w-full flex-col items-center gap-3 sm:items-start">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full max-w-sm" />
          {/* Squiggy's line: SquiggySpeechLine reserves a 44px bubble. */}
          <Skeleton className="h-11 w-full max-w-md rounded-card" />
        </div>
        {/* HeroScene's project page, from md. */}
        <Skeleton className="ml-auto hidden aspect-[4/3] w-40 shrink-0 md:block" />
      </div>
      {/* Status, waiting, clients, recent, deleting soon, each with its scene's room if it has one. */}
      {/*
        Status: no rows, just the ring beside its counts and pin row (112px, 96px where the
        bento fits one screen). This tile sets the hero row's height there, so it matches
        exactly: a taller placeholder would make the rows below jump up when the page arrives.
      */}
      <TileSkeleton rows={0} scene="h-28 bento-fit:h-24" />
      {/* Comments waiting: its title on the pile's line art, 124px in all (104px fitting one screen). */}
      <TileSkeleton rows={3} scene="h-21 bento-fit:h-17" className="md:row-span-2" />
      <TileSkeleton rows={2} scene="h-24" className="xl:col-span-2" />
      <TileSkeleton rows={2} scene="h-12" />
      <TileSkeleton rows={2} />
    </div>
  );
}
