"use client";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useState } from "react";
import type { AdminWorkspace } from "@/lib/admin/workspaces";
import { fadeOnly } from "@/lib/motion";
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

/**
 * The rows listed when the list first showed: they rise in one after another.
 * A row that arrives later (moved from the other list) rises in at once, not
 * after its place's stagger step: focus may already be on its way to it. A row
 * that leaves loses its place, so coming back it doesn't wait either.
 */
function useFirstRows(workspaces: readonly AdminWorkspace[]): ReadonlySet<string> {
  const [first, setFirst] = useState<ReadonlySet<string>>(
    () => new Set(workspaces.map((workspace) => workspace.id)),
  );
  const here = new Set(workspaces.map((workspace) => workspace.id));
  if ([...first].some((id) => !here.has(id))) {
    setFirst(new Set([...first].filter((id) => here.has(id))));
  }
  return first;
}

/**
 * A list of workspaces, or what it holds when it's empty. Rows glide in and
 * out of it; the list and its empty state fade into each other in place, so
 * the last row out, or the first row in, never pops.
 */
export function WorkspaceList({
  workspaces,
  pending,
  archived = false,
  empty,
  testId,
  handlersFor,
}: WorkspaceListProps) {
  const first = useFirstRows(workspaces);
  return (
    // popLayout, not wait: the arriving list is there at once, for focus to follow a row into it.
    <div className="relative" data-testid={testId}>
      <AnimatePresence mode="popLayout" initial={false}>
        {workspaces.length === 0 ? (
          <motion.div
            key="empty"
            variants={fadeOnly}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <TileEmpty title={empty.title} scene={archived ? "archive" : "workspace"}>
              {empty.body}
            </TileEmpty>
          </motion.div>
        ) : (
          <motion.div
            key="list"
            variants={fadeOnly}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-col gap-3"
          >
            <HeaderRow archived={archived} />
            <LayoutGroup>
              <ul className="flex flex-col divide-y divide-line">
                <AnimatePresence>
                  {workspaces.map((workspace, index) => (
                    <WorkspaceItem
                      key={workspace.id}
                      workspace={workspace}
                      order={first.has(workspace.id) ? index : 0}
                      pending={pending.get(workspace.id)}
                      {...handlersFor(workspace)}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            </LayoutGroup>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
