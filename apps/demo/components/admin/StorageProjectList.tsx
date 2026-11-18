"use client";

import { formatBytes } from "@/lib/account/storage-level";
import type { StorageProject } from "@/lib/admin/storage";
import { SettingsCard } from "../account/SettingsCard";
import { TileEmpty } from "../overview/bento/TileEmpty";
import { Icon } from "../ui/Icon";
import { BADGE_SHELL, NEUTRAL_BADGE } from "../ui/StatusChip";
import { ADMIN_COPY, fileCount } from "./admin-copy";
import { RevealItem } from "./RevealItem";

const COPY = ADMIN_COPY.storage.projects;

/**
 * The projects storing the most across every workspace, biggest first: each
 * with its workspace, whether it's in the trash, its size and file count.
 */
export function StorageProjectList({ projects }: { projects: readonly StorageProject[] }) {
  return (
    <SettingsCard
      title={COPY.title}
      description={COPY.description}
      icon="folder"
      testId="storage-projects"
    >
      {projects.length === 0 ? (
        <TileEmpty title={COPY.emptyTitle} scene="storage">
          {COPY.emptyBody}
        </TileEmpty>
      ) : (
        <ol className="flex flex-col divide-y divide-line">
          {projects.map((project, index) => (
            <RevealItem
              key={`${project.workspaceId}/${project.id}`}
              order={index}
              testId="storage-project"
              className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6 md:py-3"
            >
              <div className="flex min-w-0 flex-col items-start gap-1">
                <h3 className="max-w-full text-nav font-semibold text-ink wrap-break-word">
                  {project.name}
                </h3>
                <p className="max-w-full text-meta text-muted wrap-break-word">
                  {COPY.inWorkspace(project.workspaceName)}
                </p>
                {project.trashed ? (
                  <span className={`${BADGE_SHELL} ${NEUTRAL_BADGE} font-semibold`}>
                    <Icon name="trash" className="size-4 shrink-0" />
                    {COPY.trashed}
                  </span>
                ) : null}
              </div>
              <p className="flex shrink-0 items-baseline gap-2 tabular-nums sm:flex-col sm:items-end sm:gap-0">
                <span className="sr-only">{COPY.size}: </span>
                <span
                  className="text-body font-semibold text-ink"
                  data-testid="storage-project-bytes"
                >
                  {formatBytes(project.bytes)}
                </span>
                <span className="text-meta text-muted">{fileCount(project.files)}</span>
              </p>
            </RevealItem>
          ))}
        </ol>
      )}
    </SettingsCard>
  );
}
