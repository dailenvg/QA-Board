"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import type { PaletteEntry } from "@/lib/brand-palette";
import { arrowNudge, cardLift } from "@/lib/motion";
import type { BusiestFolder } from "@/lib/overview/activity";
import { folderHref } from "@/lib/routes";
import { Icon } from "../../ui/Icon";
import { FolderMascot } from "../FolderMascot";
import { AnimatedNumber } from "./AnimatedNumber";
import { GrowBar } from "./GrowBar";
import { BusiestDrop } from "./scenes/BusiestDrop";
import { SceneBox } from "./scenes/SceneBox";
import { useScene } from "./scenes/use-scene";
import { TileEmpty } from "./TileEmpty";
import { TileHeading } from "./TileHeading";
import { TILE_SURFACE } from "./tile-styles";
import { TileTag } from "./TileTag";

const MotionLink = motion.create(Link);

/**
 * The mascot's width in the tile, smaller than on a folder card so the tile fits one screen:
 * at the fit threshold (1280×784) its row holds the whole card at 64px, not at 72.
 */
const MASCOT_SIZE = 64;

function unit({ measure, count }: BusiestFolder): string {
  if (measure === "comments") return count === 1 ? "open comment" : "open comments";
  return count === 1 ? "project" : "projects";
}

function shareLabel({ measure, percent }: BusiestFolder): string {
  return measure === "comments"
    ? `${percent}% of all open comments`
    : `${percent}% of all projects`;
}

interface BusiestTileProps {
  folder: BusiestFolder | null;
  /** The folder's newest projects' thumbnails, dropping into its mascot. */
  thumbs: readonly ReactNode[];
  /** The folder's colour, as its glass folder and mascot on Folders have it. */
  swatch: PaletteEntry | null;
}

/**
 * The folder with the most open comments (else the most projects), the
 * whole tile a link to it (named by what it shows): it lifts on hover or
 * focus and gives on press, its arrow nudges forward, and its Squiggy,
 * magnifier in hand, perks up and looks around, as on the folder's card.
 * A bar fills to the folder's share of the workspace's, as its projects pop
 * up and drop into the mascot (again on hover or focus).
 */
export function BusiestTile({ folder, swatch, thumbs }: BusiestTileProps) {
  const headingId = useId();
  const [sceneRef, scene] = useScene();
  const reduce = useReducedMotion() ?? false;
  const [engaged, setEngaged] = useState(false);
  if (!folder) {
    return (
      <section aria-labelledby={headingId} data-testid="tile-busiest" className={TILE_SURFACE}>
        <TileHeading id={headingId} icon="folder" title="Busiest folder" />
        <TileEmpty title="No busy folders yet">
          The folder with the most going on shows up here.
        </TileEmpty>
      </section>
    );
  }
  const motionProps = reduce
    ? {}
    : {
        variants: cardLift,
        initial: "rest",
        animate: "rest",
        whileHover: "hover",
        whileFocus: "hover",
        whileTap: "press",
      };
  return (
    <MotionLink
      href={folderHref(folder.id)}
      data-testid="tile-busiest"
      data-measure={folder.measure}
      data-count={folder.count}
      onHoverStart={() => {
        setEngaged(true);
        scene.replay();
      }}
      onHoverEnd={() => setEngaged(false)}
      onFocus={() => {
        setEngaged(true);
        scene.replay();
      }}
      onBlur={() => setEngaged(false)}
      {...motionProps}
      // active:bg-hover: a pressed state that stays with reduced motion, which drops the give.
      className={`${TILE_SURFACE} ring-2 ring-transparent transition-shadow hover:shadow-float hover:ring-brand-text active:bg-hover`}
    >
      <TileHeading
        id={headingId}
        icon="folder"
        title="Busiest folder"
        subtitle={folder.measure === "comments" ? "Most comments waiting" : "Most projects"}
        tag={
          <TileTag>
            <AnimatedNumber value={folder.count} />{" "}
            {folder.measure === "comments" ? "open" : "inside"}
          </TileTag>
        }
      />
      <div className="flex min-h-0 flex-1 items-end gap-3">
        <p className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-title font-bold">{folder.name}</span>
          <span className="truncate text-body text-muted">
            {folder.count} {unit(folder)}
          </span>
        </p>
        {swatch ? (
          <span aria-hidden="true" className="relative -mr-1 -mb-1 shrink-0">
            <FolderMascot swatch={swatch} active={engaged && !reduce} size={MASCOT_SIZE} />
            <SceneBox sceneRef={sceneRef} scene={scene} className="absolute! inset-0">
              <BusiestDrop thumbs={thumbs} />
            </SceneBox>
          </span>
        ) : null}
      </div>
      <GrowBar share={folder.share} fill="bg-brand" height="h-2" className="shrink-0" />
      <span className="flex shrink-0 items-center justify-between gap-2 text-meta text-muted">
        {shareLabel(folder)}
        <motion.span variants={reduce ? undefined : arrowNudge}>
          <Icon name="chevronRight" className="size-4" />
        </motion.span>
      </span>
    </MotionLink>
  );
}
