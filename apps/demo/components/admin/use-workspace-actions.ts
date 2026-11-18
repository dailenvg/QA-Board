"use client";

import { useState } from "react";
import type { AdminWorkspace, AdminWorkspaces } from "@/lib/admin/workspaces";
import type { AdminActionError, WorkspaceOutcome } from "@/lib/admin/workspaces-client";
import { useToast } from "../ui/ToastProvider";
import { ADMIN_COPY } from "./admin-copy";

const COPY = ADMIN_COPY.workspaces;

/** What's on its way for a workspace: its row reads busy until the answer. */
export type PendingAction = "quota" | "suspend" | "unsuspend" | "archive" | "unarchive";

interface RunOptions {
  /** Shown at once, before the answer, and taken back if it fails. */
  optimistic?: (workspace: AdminWorkspace) => AdminWorkspace;
  /** The toast once it worked. */
  done: (name: string) => string;
  /** On failure, a toast with Try again (for actions without a dialog to show it). */
  toastFailure?: boolean;
}

function byName(a: AdminWorkspace, b: AdminWorkspace): number {
  return a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.id.localeCompare(b.id);
}

function lists(rows: readonly AdminWorkspace[]): AdminWorkspaces {
  return {
    active: rows.filter((row) => row.archivedAt === null).sort(byName),
    archived: rows
      .filter((row) => row.archivedAt !== null)
      .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0)),
  };
}

/**
 * The Workspaces page's rows and the actions on them. Each action marks its
 * row busy at once (and, for lifting a suspension or unarchiving, shows the
 * result before the answer); the server's answer then replaces the row, or a
 * failure puts it back as it was. Fresh rows from the server (a refresh)
 * replace them all.
 */
export function useWorkspaceActions(initial: AdminWorkspaces) {
  const toast = useToast();
  const [source, setSource] = useState(initial);
  const [rows, setRows] = useState<AdminWorkspace[]>(() => [
    ...initial.active,
    ...initial.archived,
  ]);
  const [pending, setPending] = useState<ReadonlyMap<string, PendingAction>>(new Map());
  if (source !== initial) {
    setSource(initial);
    setRows([...initial.active, ...initial.archived]);
  }

  const put = (workspace: AdminWorkspace) =>
    setRows((current) => current.map((row) => (row.id === workspace.id ? workspace : row)));

  const mark = (id: string, action: PendingAction | null) =>
    setPending((current) => {
      const next = new Map(current);
      if (action) next.set(id, action);
      else next.delete(id);
      return next;
    });

  /** Runs `call` for `workspace`; resolves with the error, or null once it worked. */
  const run = async (
    workspace: AdminWorkspace,
    action: PendingAction,
    call: () => Promise<WorkspaceOutcome>,
    { optimistic, done, toastFailure = false }: RunOptions,
  ): Promise<AdminActionError | null> => {
    mark(workspace.id, action);
    if (optimistic) put(optimistic(workspace));
    const outcome = await call();
    mark(workspace.id, null);
    if (outcome.ok) {
      put(outcome.workspace);
      toast({ message: done(outcome.workspace.name) });
      return null;
    }
    put(workspace);
    if (toastFailure) {
      toast({
        message: COPY.errors[outcome.error],
        tone: "error",
        action: {
          label: COPY.retry,
          onAction: () => void run(workspace, action, call, { optimistic, done, toastFailure }),
        },
      });
    }
    return outcome.error;
  };

  return { ...lists(rows), pending, run };
}
