"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import Link from "next/link";
import { useId, useState } from "react";
import type { PaletteEntry } from "@/lib/brand-palette";
import { duration, ease, hoverLift } from "@/lib/motion";
import type { BusiestFolder } from "@/lib/overview/activity";
import { folderHref } from "@/lib/routes";
import { Icon } from "../../ui/Icon";
import { FolderMascot } from "../FolderMascot";
import { TileEmpty } from "./TileEmpty";
import { TileHeading } from "./TileHeading";
import { TILE_SURFACE } from "./tile-styles";

const MotionLink = motion.create(Link);

function countLabel({ measure, count }: BusiestFolder): string {
  return measure === "comments"
    ? `${count} open ${count === 1 ? "comment" : "comments"}`
    : `${count} ${count === 1 ? "project" : "projects"}`;
}

function shareLabel({ measure, percent }: BusiestFolder): string {
  return measure === "comments"
    ? `${percent}% of all open comments`
    : `${percent}% of all projects`;
}

/**
 * The bar's fill grows to the folder's share once the track is on screen. The track
 * watches (the fill starts at no width, which nothing can see come into view).
 */
function barVariants(share: number, reduce: boolean): Variants {
  return {
    hidden: { scaleX: reduce ? share : 0 },
    visible: { scaleX: share, transition: { duration: duration.page, ease: ease.out } },
  };
}

interface BusiestTileProps {
  folder: BusiestFolder | null;
  /** The folder's colour, as its glass folder and mascot on Folders have it. */
  swatch: PaletteEntry | null;
}

/**
 * The folder with the most open comments (else the most projects), the
 * whole tile a link to it (named by what it shows), with a bar of its share
 * of the workspace's. Its Squiggy, magnifier in hand, perks up and looks
 * around while the tile is hovered or focused, as on the folder's card.
 */
export function BusiestTile({ folder, swatch }: BusiestTileProps) {
  const headingId = useId();
  const reduce = useReducedMotion() ?? false;
  const [engaged, setEngaged] = useState(false);
  if (!folder) {
    return (
      <section aria-labelledby={headingId} data-testid="tile-busiest" className={TILE_SURFACE}>
        <TileHeading id={headingId} icon="folder" tone="brand">
          Busiest folder
        </TileHeading>
        <TileEmpty title="No busy folders yet">
          The folder with the most going on shows up here.
        </TileEmpty>
      </section>
    );
  }
  return (
    <MotionLink
      href={folderHref(folder.id)}
      data-testid="tile-busiest"
      data-measure={folder.measure}
      data-count={folder.count}
      onHoverStart={() => setEngaged(true)}
      onHoverEnd={() => setEngaged(false)}
      onFocus={() => setEngaged(true)}
      onBlur={() => setEngaged(false)}
      {...(reduce ? {} : hoverLift)}
      // active:bg-hover: a pressed state that stays with reduced motion, which drops whileTap.
      className={`${TILE_SURFACE} group ring-2 ring-transparent transition-shadow hover:shadow-float hover:ring-brand-text active:bg-hover`}
    >
      <TileHeading id={headingId} icon="folder" tone="brand">
        Busiest folder
      </TileHeading>
      {/* The mascot takes the room the list tiles beside it fill; the name keeps the full width. */}
      <div className="-mt-2 -mb-4 flex flex-1 items-end justify-end">
        {swatch ? (
          <span aria-hidden="true" className="-mr-2">
            <FolderMascot swatch={swatch} active={engaged && !reduce} />
          </span>
        ) : null}
      </div>
      <p className="flex min-w-0 flex-col">
        <span className="truncate text-title font-bold">{folder.name}</span>
        <span className="text-body text-muted">{countLabel(folder)}</span>
      </p>
      <motion.span
        aria-hidden="true"
        className="block h-2 overflow-hidden rounded-pill bg-seg"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
      >
        <motion.span
          className="block h-full origin-left rounded-pill bg-brand"
          variants={barVariants(folder.share, reduce)}
        />
      </motion.span>
      <span className="-mt-2 flex items-center justify-between gap-2 text-meta text-muted">
        {shareLabel(folder)}
        <Icon
          name="chevronRight"
          className="size-4 transition-transform group-hover:translate-x-0.5"
        />
      </span>
    </MotionLink>
  );
}
