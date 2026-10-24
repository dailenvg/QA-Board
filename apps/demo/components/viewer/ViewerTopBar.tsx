"use client";

import type { ReactNode } from "react";
import type { ProjectStatus } from "@/lib/store/status";
import type { Project } from "@/lib/store/types";
import { ButtonLink } from "../ui/ButtonLink";
import { Icon } from "../ui/Icon";
import { Kbd } from "../ui/Kbd";
import { SegmentedControl } from "../ui/SegmentedControl";
import { StatusChip } from "../ui/StatusChip";
import type { ViewerMode } from "./types";

interface ViewerTopBarProps {
  project: Project;
  /** A way back (owner) or the logo (shared link). */
  leading: ReactNode;
  status: ProjectStatus;
  mode: ViewerMode;
  onMode: (mode: ViewerMode) => void;
  /** The live site behind this project, opened in a new tab. */
  originalUrl: string | null;
  /** Project-level actions next to the original-site link, such as Export. */
  actions: ReactNode;
}

/** Leading slot, project name and status, Browse/Comment toggle, actions, and the original site link. */
export function ViewerTopBar({
  project,
  leading,
  status,
  mode,
  onMode,
  originalUrl,
  actions,
}: ViewerTopBarProps) {
  return (
    // Its own layer, so the Export menu opens over the snapshot bar and pins below it.
    <header className="relative z-40 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-panel bg-panel p-2">
      {leading}
      <div className="flex min-w-40 flex-1 items-center gap-2">
        <h1 className="truncate text-heading font-bold">{project.name}</h1>
        <StatusChip status={status} />
      </div>
      <div className="flex items-center gap-2 max-sm:w-full">
        <SegmentedControl
          label="Mode"
          layoutId="viewer-mode-thumb"
          value={mode}
          onChange={onMode}
          className="max-sm:w-full max-sm:[&>button]:flex-1"
          options={[
            {
              value: "browse",
              label: "Browse",
              icon: "pointer",
              title: "Browse (C)",
              testId: "mode-browse",
            },
            {
              value: "comment",
              label: "Comment",
              icon: "messagePlus",
              title: "Comment (C)",
              testId: "mode-comment",
            },
          ]}
        />
        <Kbd className="hidden lg:inline">C</Kbd>
        {actions}
        {originalUrl ? (
          <ButtonLink
            href={originalUrl}
            external
            variant="secondary"
            size="icon"
            ariaLabel="Open the original site in a new tab"
          >
            <Icon name="external" className="size-5" />
          </ButtonLink>
        ) : null}
      </div>
    </header>
  );
}
