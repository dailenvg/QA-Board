"use client";

import { AnimatePresence, LayoutGroup } from "motion/react";
import type { AdminWorkspace } from "@/lib/admin/workspaces";
import { TileEmpty } from "../overview/bento/TileEmpty";
import { ADMIN_COPY } from "./admin-copy";
import type { PendingAction } from "./use-workspace-actions";
import { WORKSPACE_GRID } from "./workspace-grid";
import { WorkspaceItem, type WorkspaceHandlers } from "./WorkspaceItem";

const COLUMNS = ADMIN_COPY.workspaces.columns;

interface WorkspaceListProps {
  workspaces: readonly AdminWorkspace[];
  pending: ReadonlyMap<string, PendingAction>;
  /** The archived list: its date column is when each was archived. */
  archived?: boolean;
  empty: { title: string; body: string };
  testId: string;
  handlersFor: (workspace: AdminWorkspace) => WorkspaceHandlers;
}

/**
 * The column names over the rows, from md up. Hidden from screen readers:
 * each value carries its own name (`WorkspaceItem`'s cells).
 */
function HeaderRow({ archived }: { archived: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`hidden border-b border-line pb-2 text-label text-muted ${WORKSPACE_GRID}`}
    >
      <span>{COLUMNS.workspace}</span>
      <span>{COLUMNS.members}</span>
      <span>{COLUMNS.projects}</span>
      <span>{COLUMNS.storage}</span>
      <span>{archived ? ADMIN_COPY.workspaces.archived.title : COLUMNS.lastActivity}</span>
      <span className="sr-only">{COLUMNS.actions}</span>
    </div>
  );
}

/** A list of workspaces, or what it holds when it's empty. Rows glide in and out of it. */
export function WorkspaceList({
  workspaces,
  pending,
  archived = false,
  empty,
  testId,
  handlersFor,
}: WorkspaceListProps) {
  if (workspaces.length === 0) {
    return (
      <div data-testid={testId}>
        <TileEmpty title={empty.title} scene={archived ? "archive" : "workspace"}>
          {empty.body}
        </TileEmpty>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <HeaderRow archived={archived} />
      <LayoutGroup>
        <ul className="flex flex-col divide-y divide-line">
          <AnimatePresence>
            {workspaces.map((workspace, index) => (
              <WorkspaceItem
                key={workspace.id}
                workspace={workspace}
                order={index}
                pending={pending.get(workspace.id)}
                {...handlersFor(workspace)}
              />
            ))}
          </AnimatePresence>
        </ul>
      </LayoutGroup>
    </div>
  );
}
