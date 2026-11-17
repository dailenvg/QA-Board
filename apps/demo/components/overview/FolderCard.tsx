"use client";

import { motion, useReducedMotion } from "motion/react";
import type { PaletteEntry } from "@/lib/brand-palette";
import { useRevealVariants } from "@/lib/motion";
import { folderHref } from "@/lib/routes";
import type { Folder } from "@/lib/store/types";
import type { Theme } from "@/lib/theme";
import { useElementWidth } from "@/lib/use-element-width";
import { useMediaQuery } from "@/lib/use-media-query";
import { Menu, type MenuItem } from "../ui/Menu";
import { GlassFolder, type FolderFile } from "./glass-folder/GlassFolder";
import { FOLDER_ASPECT, FOLDER_MAX_WIDTH, HEADROOM, W } from "./glass-folder/geometry";
import { folderArt } from "./glass-folder/recipes";

/** Folders assemble one after another along a row, then each as it scrolls in. */
const APPEAR_STAGGER_MS = 90;
const APPEAR_STAGGER_MAX = 4;
/**
 * The glass draws the chip (`.gf-actions`), so the trigger keeps only its 44px target: none of
 * the ghost trigger's gray hover, press and open fills to paint behind the chip.
 */
const CHIP_TRIGGER_CLASS = "grid size-11 place-items-center";

interface FolderCardProps {
  folder: Folder;
  files: readonly FolderFile[];
  /** What it holds, such as "5 projects in all" (subfolders included). */
  meta: string;
  index: number;
  /** The folder's color, for its art. */
  swatch: PaletteEntry;
  tone: Theme;
  actions: MenuItem[];
}

/**
 * One folder on the Overview, sized to its grid column. The whole folder
 * links to the folder's page; its newest projects fan out on hover or
 * keyboard focus, and the folder's actions sit in a frosted chip at the
 * bottom right of the glass. Their menu opens above the chip, over its own
 * folder rather than the row below (it drops below when the screen has no room
 * above). While hovered, focused or showing its menu, the card rises above its
 * neighbours so the fan can overlap them.
 */
export function FolderCard({ folder, files, meta, index, swatch, tone, actions }: FolderCardProps) {
  const [measure, width] = useElementWidth<HTMLDivElement>();
  const touch = useMediaQuery("(hover: none)");
  const reduce = useReducedMotion();
  const variants = useRevealVariants();
  const { recipe, seed } = folderArt(folder.id, swatch);

  return (
    <motion.li
      layout={reduce ? false : "position"}
      variants={variants}
      exit="exit"
      data-testid="folder-card"
      // Where nothing hovers the files never fan from a pointer, so the folder's empty
      // headroom (the top of its box) is pulled back and rows sit closer.
      style={{ maxWidth: FOLDER_MAX_WIDTH, marginTop: touch ? -(HEADROOM / W) * width : undefined }}
      className="relative w-full min-w-0 hover:z-10 focus-within:z-10 has-[[aria-expanded=true]]:z-20"
    >
      <div ref={measure} style={{ aspectRatio: FOLDER_ASPECT }}>
        {width > 0 ? (
          <GlassFolder
            label={folder.name}
            meta={meta}
            tone={tone}
            recipe={recipe}
            seed={seed}
            files={files}
            width={width}
            href={folderHref(folder.id)}
            linkLabel={`Open ${folder.name}, ${meta}`}
            actions={
              <Menu
                label={`Actions for ${folder.name}`}
                testId="folder-card-menu"
                items={actions}
                triggerClassName={CHIP_TRIGGER_CLASS}
                placement="above"
              />
            }
            appearDelay={Math.min(index, APPEAR_STAGGER_MAX) * APPEAR_STAGGER_MS}
          />
        ) : null}
      </div>
    </motion.li>
  );
}
