"use client";

import type { StorageWorkspace } from "@/lib/admin/storage";
import { SettingsCard } from "../account/SettingsCard";
import { TileEmpty } from "../overview/bento/TileEmpty";
import { ADMIN_COPY } from "./admin-copy";
import { RevealItem } from "./RevealItem";
import { WorkspaceStorage } from "./WorkspaceStorage";

const COPY = ADMIN_COPY.storage.workspaces;

/** The workspaces storing the most, biggest first: name and owner, then used of quota as a bar. */
export function StorageWorkspaceList({ workspaces }: { workspaces: readonly StorageWorkspace[] }) {
  return (
    <SettingsCard
      title={COPY.title}
      description={COPY.description}
      icon="layers"
      testId="storage-workspaces"
    >
      {workspaces.length === 0 ? (
        <TileEmpty title={COPY.emptyTitle} scene="workspace">
          {COPY.emptyBody}
        </TileEmpty>
      ) : (
        <ol className="flex flex-col divide-y divide-line">
          {workspaces.map((workspace, index) => (
            <RevealItem
              key={workspace.id}
              order={index}
              testId="storage-workspace"
              className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] md:items-center md:gap-6 md:py-3"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="text-nav font-semibold text-ink wrap-break-word">
                  {workspace.name}
                </h3>
                <p className="text-meta text-muted wrap-anywhere">
                  <span className="sr-only">{COPY.owner}: </span>
                  {workspace.ownerEmail ?? ADMIN_COPY.workspaces.noOwner}
                </p>
              </div>
              <WorkspaceStorage usedBytes={workspace.usedBytes} quotaBytes={workspace.quotaBytes} />
            </RevealItem>
          ))}
        </ol>
      )}
    </SettingsCard>
  );
}
