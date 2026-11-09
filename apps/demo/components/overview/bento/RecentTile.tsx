"use client";

import { AnimatePresence } from "motion/react";
import Link from "next/link";
import { useId } from "react";
import type { RecentProject } from "@/lib/overview/activity";
import { projectHref } from "@/lib/routes";
import { NewMark } from "./NewMark";
import { TileEmpty } from "./TileEmpty";
import { TileHeading } from "./TileHeading";
import { TILE_LIST, TILE_ROW, TILE_SURFACE } from "./tile-styles";
import { TimeAgo } from "./TimeAgo";

interface RecentTileProps {
  projects: readonly RecentProject[];
  now: number;
}

function openLabel(open: number): string {
  if (open === 0) return "No open comments";
  return `${open} open ${open === 1 ? "comment" : "comments"}`;
}

/** The most recently updated projects, newest first, marking what changed since the last look. */
export function RecentTile({ projects, now }: RecentTileProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} data-testid="tile-recent" className={TILE_SURFACE}>
      <TileHeading id={headingId} icon="history" tone="ready">
        Recently updated
      </TileHeading>
      {projects.length === 0 ? (
        <TileEmpty title="No projects yet">Projects show up here as they change.</TileEmpty>
      ) : (
        <ol role="list" className={TILE_LIST}>
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={projectHref(project.id)}
                data-testid="recent-row"
                data-new={project.isNew || undefined}
                className={TILE_ROW}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate text-body font-semibold">{project.name}</span>
                  <AnimatePresence>{project.isNew ? <NewMark key="new" /> : null}</AnimatePresence>
                </span>
                <span className="text-meta text-muted">
                  {project.folderName ? `${project.folderName} · ` : ""}
                  {openLabel(project.open)} · <TimeAgo at={project.updatedAt} now={now} />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
