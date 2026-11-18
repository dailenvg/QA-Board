"use client";

import { useRef } from "react";
import {
  resetOwnerEmail,
  type AdminWorkspace,
  type AdminWorkspaces as Workspaces,
} from "@/lib/admin/workspaces";
import {
  createOwnerResetLink,
  setWorkspaceArchived,
  setWorkspaceQuota,
  setWorkspaceSuspended,
} from "@/lib/admin/workspaces-client";
import { useDialogState } from "@/lib/use-dialog-state";
import { SettingsCard } from "../account/SettingsCard";
import { ADMIN_COPY } from "./admin-copy";
import { QuotaDialog } from "./QuotaDialog";
import { ResetLinkDialog } from "./ResetLinkDialog";
import { useMovedRowFocus } from "./use-moved-row-focus";
import { useWorkspaceActions } from "./use-workspace-actions";
import { WorkspaceConfirmDialog, type ConfirmKind } from "./WorkspaceConfirmDialog";
import { WorkspaceList } from "./WorkspaceList";

const COPY = ADMIN_COPY.workspaces;

/** A dialog's workspace, and which opening it is, so each opening starts afresh. */
interface Opened {
  workspace: AdminWorkspace;
  opening: number;
}

/**
 * The Workspaces page: every open workspace with its owner, size, activity
 * and state, and what the admin can do to each; then the archived ones, each
 * with Unarchive. Suspending and archiving ask first; lifting a suspension
 * and unarchiving happen at once, and show so before the server answers.
 */
export function AdminWorkspaces({ workspaces }: { workspaces: Workspaces }) {
  const { active, archived, pending, run } = useWorkspaceActions(workspaces);
  const openings = useRef(0);
  const focusMoved = useMovedRowFocus();
  const quota = useDialogState<Opened>();
  const reset = useDialogState<Opened & { email: string }>();
  const confirm = useDialogState<Opened & { kind: ConfirmKind }>();
  const opened = (workspace: AdminWorkspace) => {
    openings.current += 1;
    return { workspace, opening: openings.current };
  };

  const unsuspend = (workspace: AdminWorkspace) =>
    void run(workspace, "unsuspend", () => setWorkspaceSuspended(workspace.id, false), {
      optimistic: (row) => ({
        ...row,
        suspendedAt: null,
        status: row.status === "deleting" ? "deleting" : "active",
      }),
      done: COPY.suspend.lifted,
      toastFailure: true,
    });

  const unarchive = async (workspace: AdminWorkspace) => {
    focusMoved({ workspaceId: workspace.id, control: "workspace-menu" });
    const error = await run(
      workspace,
      "unarchive",
      () => setWorkspaceArchived(workspace.id, false),
      {
        optimistic: (row) => ({ ...row, archivedAt: null }),
        done: COPY.archive.undone,
        toastFailure: true,
      },
    );
    // Back in Archived: its Unarchive again, to try once more.
    if (error) focusMoved({ workspaceId: workspace.id, control: "workspace-unarchive" });
  };

  const handlersFor = (workspace: AdminWorkspace) => ({
    onQuota: () => quota.show(opened(workspace)),
    onReset: () => {
      // Only offered for an active owner; nobody to make a link for otherwise.
      const email = resetOwnerEmail(workspace);
      if (email) reset.show({ ...opened(workspace), email });
    },
    onSuspend: () => confirm.show({ ...opened(workspace), kind: "suspend" }),
    onUnsuspend: () => unsuspend(workspace),
    onArchive: () => confirm.show({ ...opened(workspace), kind: "archive" }),
    onUnarchive: () => void unarchive(workspace),
  });

  const saveQuota = (workspace: AdminWorkspace) => async (quotaBytes: number) => {
    const error = await run(workspace, "quota", () => setWorkspaceQuota(workspace.id, quotaBytes), {
      done: COPY.quota.saved,
    });
    if (!error) quota.close();
    return error;
  };

  const confirmed = async ({ workspace, kind }: Opened & { kind: ConfirmKind }) => {
    const error =
      kind === "suspend"
        ? await run(workspace, "suspend", () => setWorkspaceSuspended(workspace.id, true), {
            done: COPY.suspend.done,
          })
        : await run(workspace, "archive", () => setWorkspaceArchived(workspace.id, true), {
            done: COPY.archive.done,
          });
    if (error) return error;
    confirm.close();
    if (kind === "archive") {
      focusMoved({ workspaceId: workspace.id, control: "workspace-unarchive" });
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-4" data-testid="admin-workspaces">
      <SettingsCard title={COPY.title} description={COPY.description} icon="layers">
        <WorkspaceList
          workspaces={active}
          pending={pending}
          empty={{ title: COPY.emptyTitle, body: COPY.emptyBody }}
          testId="workspaces-active"
          handlersFor={handlersFor}
        />
      </SettingsCard>
      <SettingsCard
        title={COPY.archived.title}
        description={COPY.archived.description}
        icon="archive"
        testId="workspaces-archived-card"
      >
        <WorkspaceList
          workspaces={archived}
          pending={pending}
          archived
          empty={{ title: COPY.archived.emptyTitle, body: COPY.archived.emptyBody }}
          testId="workspaces-archived"
          handlersFor={handlersFor}
        />
      </SettingsCard>
      {quota.payload ? (
        <QuotaDialog
          key={quota.payload.opening}
          open={quota.open}
          workspace={quota.payload.workspace}
          onSave={saveQuota(quota.payload.workspace)}
          onClose={quota.close}
        />
      ) : null}
      {reset.payload ? (
        <ResetLinkDialog
          key={reset.payload.opening}
          open={reset.open}
          email={reset.payload.email}
          onCreate={createOwnerResetLink.bind(null, reset.payload.workspace.id)}
          onClose={reset.close}
        />
      ) : null}
      {confirm.payload ? (
        <WorkspaceConfirmDialog
          key={confirm.payload.opening}
          open={confirm.open}
          kind={confirm.payload.kind}
          workspace={confirm.payload.workspace}
          onConfirm={confirmed.bind(null, confirm.payload)}
          onClose={confirm.close}
        />
      ) : null}
    </div>
  );
}
