"use client";

import { motion, useReducedMotion } from "motion/react";
import type { PaletteEntry } from "@/lib/brand-palette";
import { useRevealVariants } from "@/lib/motion";
import { folderHref } from "@/lib/routes";
import type { Folder } from "@/lib/store/types";
import type { Theme } from "@/lib/theme";
import { useElementWidth } from "@/lib/use-element-width";
import { useEngagement } from "@/lib/use-engagement";
import { useMediaQuery } from "@/lib/use-media-query";
import { Menu, type MenuItem } from "../ui/Menu";
import { FolderMascot } from "./FolderMascot";
import { GlassFolder, type FolderFile } from "./glass-folder/GlassFolder";
import { FOLDER_ASPECT, FOLDER_MAX_WIDTH, HEADROOM, W } from "./glass-folder/geometry";
import { folderArt } from "./glass-folder/recipes";

/** Folders assemble one after another along a row, then each as it scrolls in. */
const APPEAR_STAGGER_MS = 90;
const APPEAR_STAGGER_MAX = 4;

interface FolderCardProps {
  folder: Folder;
  files: readonly FolderFile[];
  /** What it holds, such as "5 projects in 3 folders". */
  meta: string;
  index: number;
  /** The folder's color, shared by its art and its mascot. */
  swatch: PaletteEntry;
  tone: Theme;
  actions: MenuItem[];
}

/**
 * One folder on the Overview, sized to its grid column. The whole folder
 * links to the folder's page; its newest projects fan out on hover or
 * keyboard focus, and the folder's actions sit in its top-right corner.
 * While hovered, focused or showing its menu, the card rises above its
 * neighbours so the fan can overlap them.
 */
export function FolderCard({ folder, files, meta, index, swatch, tone, actions }: FolderCardProps) {
  const [measure, width] = useElementWidth<HTMLDivElement>();
  const [engaged, engagement] = useEngagement();
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
      {...engagement}
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
            keycap={<FolderMascot swatch={swatch} active={engaged} />}
            corner={
              <Menu
                label={`Actions for ${folder.name}`}
                testId="folder-card-menu"
                items={actions}
              />
            }
            appearDelay={Math.min(index, APPEAR_STAGGER_MAX) * APPEAR_STAGGER_MS}
          />
        ) : null}
      </div>
    </motion.li>
  );
}
